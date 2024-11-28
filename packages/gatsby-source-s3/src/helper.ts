
import AWS_S3, {
    GetObjectCommand,
    ListObjectsCommand,
    S3Client,
    S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const isImage = (key: string): boolean => /\.(jpe?g|png|gif|webp|tiff?)$/i.test(key);
const isHTML = key => /\.(html?)$/i.test(key);

// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
import {DOMParser, parseHTML} from 'linkedom';

type ObjectType = AWS_S3._Object & { Bucket: string };


// get objects
const getS3ListObjects = async (parameters: { Bucket: string; Marker?: string, }, s3: any) => {
    const command = new ListObjectsCommand(parameters);
    return await s3.send(command);
};


export async function listAllS3Objects(s3, reporter, bucket: string) {
    const allS3Objects: ObjectType[] = [];

    try {
        const data = await getS3ListObjects({ Bucket: bucket }, s3);

        if (data && data.Contents) {
            for (const object of data.Contents) {
                allS3Objects.push({ ...object, Bucket: bucket });
            }
        } else {
            reporter.error(
                `Error processing objects from bucket "${bucket}". Is it empty?`,
                new Error("No object in Bucket"),
                "gatsby-source-s3",
            );
        }

        let nextToken = data && data.IsTruncated && data.NextMarker;

        while (nextToken) {
            const data = await getS3ListObjects({
                Bucket: bucket,
                Marker: nextToken,
            });

            if (data && data.Contents) {
                for (const object of data.Contents) {
                    allS3Objects.push({ ...object, Bucket: bucket });
                }
            }
            nextToken = data && data.IsTruncated && data.NextMarker;
        }
    } catch (error: unknown) {
        reporter.panicOnBuild(`Error listing S3 objects on bucket "${bucket}"`, error as Error);
    }

    return allS3Objects;
};

export async function processBucketObjects(s3, expiration, objects, createNode, createNodeId, createContentDigest) {

    let versions: string[] = [];
    for (const object of objects) {
      const {
        //Bucket,
        Key
      } = object;

      if(Key && isHTML(Key)) {
        let tmpPath = "";
        if (Key.indexOf("production/") === 0) {
          tmpPath = Key.substr(10);
        } else {
          if (Key.indexOf("development/") === 0) {
            tmpPath = Key.substr(11);
          }
        }
        const indexOfVersions = tmpPath.indexOf('/versions/');

        if(indexOfVersions !== -1) {
          let basePath = tmpPath.substring(0, indexOfVersions);
          let version = tmpPath.substring(indexOfVersions + ('/versions/'.length));
          version = version.substring(0, version.indexOf('/'));
          console.log(basePath + ' ->' + tmpPath + ' is version')
          console.log(version);

          if(basePath) {
            if(!versions[basePath]) {
              versions[basePath] = [{path: '', title: 'latest'}];
            }   
            versions[basePath].push({path: '/'+version, title: version});
          }
        } 
      }
    }

    // create file nodes
    for (const object of objects) {
      const { Bucket, Key } = object;
      // get pre-signed URL
      const command = new GetObjectCommand({
        Bucket,
        Key,
      });
      const response = await s3.send(command);
      const bodyString = await response?.Body?.transformToString();

      const url = await getSignedUrl(s3, command, { expiresIn: expiration });

      if (isHTML(Key)) {
        let tmpPath = "";
        if (Key.indexOf("production/") === 0) {
          tmpPath = Key.substr(10);
        } else {
          if (Key.indexOf("development/") === 0) {
            tmpPath = Key.substr(11);
          }
        }

        if (tmpPath.lastIndexOf("/") !== tmpPath.indexOf("/")) {
          tmpPath = tmpPath.substring(0, tmpPath.lastIndexOf("/"));
        }
        let basePath = tmpPath;

        const indexOfVersions = basePath.indexOf('/versions/');
        const isVersion = indexOfVersions !== -1;
        let basePathWithVersion = basePath;
        let versionPath = '';

        if(isVersion ===  true) {
          basePath = basePath.replace('/versions', '');
          basePathWithVersion = basePath;
          versionPath = basePath.substring(basePath.lastIndexOf('/'));
          basePath = basePath.substring(0, basePath.lastIndexOf("/"));
        }

        // console.log(bodyString);
        const {
            // note, these are *not* globals
            window, document, customElements,
            HTMLElement,
            Event, CustomEvent
            // other exports ..
          } = parseHTML(bodyString);
        // const dom = new JSDOM(bodyString);
        // let document = dom.window.document;
        const headerLinks = document.querySelectorAll("a.headerlink");
        for (var i = 0; i < headerLinks.length; i++) {
          headerLinks[i].remove();
        }
        const sections = document.querySelectorAll("body > section"); // "Hello world"
        // console.log(dom.window.document.body);
        //console.log(sections);
        let sitemap = {
          id: "",
          level: 0,
          path: "index.html",
          title: document.title? document.title: Key,
          subsections: [],
          basePath: basePath,
          isVersion: isVersion,
          versions: versions[basePath]
        }

        for (var i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionId = section.id;
          let headline = section.querySelector("h1");
          // console.log(headline.innerText);
          // console.log(headline.innerHTML);

          sitemap.subsections.push(
            {
              section: {
                id: "",
                level: 0,
                path: `${i + 1}-${sectionId}`,
                title: headline.innerHTML
              },
              subsections: []
            }
          )
        }

        //Create sitemap object
        createNode({
          // ...object,
          // url,
          // // node meta
          Key: object.Key + '.sitemap',
          id: createNodeId(`s3-sitemap-${Key}`),
          parent: undefined,
          // slug: `${basePath}/${sectionIdToPath[sectionId]}`,
          // children: [],
          // body: sectionHtml,
          basePath: basePath,
          basePathWithVersion: basePathWithVersion,
          versionPath: versionPath,
          sitemap: sitemap,
          // pageNav: pageNav,
          internal: {
            type: "S3Sitemap",
            content: JSON.stringify(object),
            contentDigest: createContentDigest({
              ...object,
              bodyString
            })
          }
        });

        for (var i = 0; i < sections.length; i++) {
          //console.log(i);
          const section = sections[i];
          const sectionId = section.id;
          const sectionHtml = section.outerHTML;
          const sectionHeadline = section.querySelector("h1");

          //console.log(sectionId);
          const subSections = section.querySelectorAll("section");
          let pageNav = [];
          for (var subSectionIndex = 0; subSectionIndex < subSections.length; subSectionIndex++) {
            const cSubSection = subSections[subSectionIndex];
            let subHeadline = cSubSection.querySelector("h2");
            if(subHeadline) {
              //console.log(subHeadline.innerHTML);
              pageNav.push({
                section: {
                  id: "",
                  level: 0,
                  path: `#${cSubSection.id}`,
                  title: subHeadline.innerHTML
                }
              });
            }
          }

          createNode({
            ...object,
            url,
            // node meta
            id: createNodeId(`s3-object-${Key}-${sectionId}`),
            parent: undefined,
            slug: `${basePathWithVersion}/${i + 1}-${sectionId}`,
            children: [],
            body: sectionHtml,
            basePath: basePath,
            basePathWithVersion: basePathWithVersion,
            versionPath: versionPath,
            sitemap: sitemap,
            pageNav: pageNav,
            title: sectionHeadline?.innerHTML,
            internal: {
              type: "S3Object",
              content: JSON.stringify(object),
              contentDigest: createContentDigest({
                ...object,
                sectionHtml
              })
            }
          });
        }
      }
      else {
        if(isImage(Key)) {
          createNode({
            ...object,
            url,
            // node meta
            id: createNodeId(`s3-image-${Key}`),
            parent: undefined,
            children: [],
            internal: {
              type: "S3Image",
              content: JSON.stringify(object),
              contentDigest: createContentDigest({
                ...object
              })
            }
          });
        }
      }
    }
}
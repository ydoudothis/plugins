import { createRemoteFileNode } from "gatsby-source-filesystem";

import AWS_S3, {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { CreateNodeArgs, GatsbyNode, PluginOptions } from "gatsby";
import { listAllS3Objects } from "./helper";

const isImage = (key: string): boolean => /\.(jpe?g|png|gif|webp|tiff?)$/i.test(key);
const isHTML = key => /\.(html?)$/i.test(key);
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

interface PluginOptionsType extends PluginOptions {
  aws: S3ClientConfig;
  buckets: string[];
  expiration: number;
}

type ObjectType = AWS_S3._Object & { Bucket: string };

type NodeType = ObjectType & { url: string;[key: string]: string };

// source all objects from s3
export const sourceNodes: GatsbyNode["sourceNodes"] = async function (
  { actions: { createNode }, createNodeId, createContentDigest, reporter },
  pluginOptions: PluginOptionsType,
) {
  const { aws: awsConfig, buckets, expiration = 900 } = pluginOptions;

  // configure aws
  const s3 = new S3Client(awsConfig);

  reporter.verbose(`AWS S3 Config: ${JSON.stringify(s3.config, undefined, 2)}`);


  try {
    const allBucketsObjects: ObjectType[][] = await Promise.all(
      buckets.map((bucket) => listAllS3Objects(s3, reporter, bucket)),
    );

    // flatten objects
    const objects = allBucketsObjects.flat();

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
        const dom = new JSDOM(bodyString);
        let document = dom.window.document;
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
  } catch (error) {
    reporter.error(`Error sourcing nodes: ${error}`);
  }
};

export const onCreateNode: GatsbyNode["onCreateNode"] = async function ({
  node,
  actions: { createNode, createNodeField },
  cache,
  reporter,
  createNodeId,
}: CreateNodeArgs<NodeType>) {
  if (node.internal.type === "S3Image" && node.Key) {
    try {
      // download image file and save as node
      const imageFile = await createRemoteFileNode({
        url: node.url,
        parentNodeId: node.id,
        cache,
        createNode,
        createNodeId,
      });

      if (imageFile) {
        // add local image file to s3 object node
        createNodeField({ node, name: "localFile", value: imageFile.id });
      }
    } catch (error) {
      reporter.error(`Error creating file node for S3 image key "${node.Key}": ${error}`);
    }
  }
};

export const createSchemaCustomization: GatsbyNode["createSchemaCustomization"] = async function ({
  actions,
}) {
  actions.createTypes(`
    type S3Image implements Node {
      Key: String!
      Bucket: String!
      LastModified: Date! @dateformat
      Size: Int!
      localFile: File @link(from: "fields.localFile")
    }
  `);
};

export {listAllS3Objects} from "./helper";

exports.default = "gatsby-source-s3-hyperdrive"; 
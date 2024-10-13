import { createRemoteFileNode } from "gatsby-source-filesystem";

import AWS_S3, {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { CreateNodeArgs, GatsbyNode, PluginOptions } from "gatsby";

const isImage = (key: string): boolean => /\.(jpe?g|png|webp|tiff?)$/i.test(key);
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

  // get objects
  const getS3ListObjects = async (parameters: { Bucket: string; Marker?: string }) => {
    const command = new ListObjectsCommand(parameters);
    return await s3.send(command);
  };

  const listAllS3Objects = async (bucket: string) => {
    const allS3Objects: ObjectType[] = [];

    try {
      const data = await getS3ListObjects({ Bucket: bucket });

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

  try {
    const allBucketsObjects: ObjectType[][] = await Promise.all(
      buckets.map((bucket) => listAllS3Objects(bucket)),
    );

    // flatten objects
    const objects = allBucketsObjects.flat();

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
        const basePath = tmpPath;

        // console.log(bodyString);
        const dom = new JSDOM(bodyString);
        let document = dom.window.document;
        const headerLinks = document.querySelectorAll("a.headerlink");
        for (var i = 0; i < headerLinks.length; i++) {
          headerLinks[i].remove();
        }
        const sections = document.querySelectorAll("body > section"); // "Hello world"
        // console.log(dom.window.document.body);
        console.log(sections);
        let sitemap = {
          id: "",
          level: 0,
          path: "index.html",
          title: document.title? document.title: Key,
          subsections: [],
          basePath: basePath
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
          console.log(i);
          const section = sections[i];
          const sectionId = section.id;
          const sectionHtml = section.outerHTML;

          console.log(sectionId);
          const subSections = section.querySelectorAll("section");
          let pageNav = [];
          for (var subSectionIndex = 0; subSectionIndex < subSections.length; subSectionIndex++) {
            const cSubSection = subSections[subSectionIndex];
            let subHeadline = cSubSection.querySelector("h2");
            if(subHeadline) {
              console.log(subHeadline.innerHTML);
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
            slug: `${basePath}/${i + 1}-${sectionId}`,
            children: [],
            body: sectionHtml,
            basePath: basePath,
            sitemap: sitemap,
            pageNav: pageNav,
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
  if (node.internal.type === "S3Object" && node.Key) {
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
      reporter.error(`Error creating file node for S3 object key "${node.Key}": ${error}`);
    }
  }
};

export const createSchemaCustomization: GatsbyNode["createSchemaCustomization"] = async function ({
  actions,
}) {
  actions.createTypes(`
    type S3Object implements Node {
      Key: String!
      Bucket: String!
      LastModified: Date! @dateformat
      Size: Int!
      localFile: File @link(from: "fields.localFile")
    }
  `);
};

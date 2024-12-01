import { createRemoteFileNode } from "gatsby-source-filesystem";

import AWS_S3, {
  // GetObjectCommand,
  // ListObjectsCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { CreateNodeArgs, GatsbyNode, PluginOptions } from "gatsby";
import { listAllS3Objects, processBucketObjectsVersions, processBucketObjects, loadBucketObjectsBody } from "./helper";


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
      buckets.map((bucket) => listAllS3Objects(s3, reporter, bucket, 'production/')),
    );

    // flatten objects
    const objects = allBucketsObjects.flat();

    const versions = processBucketObjectsVersions(objects);
    const updatedObjects = await loadBucketObjectsBody(s3, objects, expiration);

    processBucketObjects(updatedObjects, versions, createNode, createNodeId, createContentDigest);
    
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

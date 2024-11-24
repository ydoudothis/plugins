
import AWS_S3, {
    GetObjectCommand,
    ListObjectsCommand,
    S3Client,
    S3ClientConfig,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
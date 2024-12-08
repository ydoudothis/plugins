
import AWS_S3, {
    // GetObjectCommand,
    // ListObjectsCommand,
    S3Client,
    S3ClientConfig,
} from "@aws-sdk/client-s3";
import { processBucketObjectsVersions, processBucketObjects } from "../../src/helper";




test('processBucketObjectsVersions - no versions', () => {

    const objects = [
        {
            Key: 'production/rst-examples/index.html',
            LastModified: "2024-11-13T15:45:36.000Z",
            ETag: '"aae5464e2472f123971016697b6686d9"',
            Size: 2398,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test'
        }
    ];

    let versions = processBucketObjectsVersions(objects);
    // console.log(versions);
    expect(versions).toEqual([]);
});


test('processBucketObjectsVersions - with versions', () => {

    const objects = [
        {
            Key: 'production/documentation/setupGuide.html',
            LastModified: "2024 - 11 - 26T14: 28: 48.000Z",
            ETag: '"73b108ab2d4b1a3acec8233299840e65"',
            Size: 19199,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test-two'
        },
        {
            Key: 'production/documentation/versions/version-1.0.0/setupGuide.html',
            LastModified: "2024 - 11 - 26T14: 28: 50.000Z",
            ETag: '"1f1f183dedf870b97cdad530a747c582"',
            Size: 580,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test-two'
        },
        {
            Key: 'production/documentation/versions/version-1.1.0/setupGuide.html',
            LastModified: "2024 - 11 - 26T14: 28: 51.000Z",
            ETag: '"5a78d30090ad361d05c410cdc347378a"',
            Size: 662,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test-two'
        }
    ];

    let versions = processBucketObjectsVersions(objects);
    // console.log(versions);

    let expectedVersions = [];
    expectedVersions['/documentation'] = [
        { path: '', title: 'latest' },
        { path: '/version-1.0.0', title: 'version-1.0.0' },
        { path: '/version-1.1.0', title: 'version-1.1.0' }
    ];
    expect(versions).toEqual(expectedVersions);
});




function createNodeId(str) { return str }

function createContentDigest(obj) { return JSON.stringify(obj); }

test('processBucketObjects - no html', () => {

    const objects = [
        {
            Key: 'production/rst-examples/index.html',
            LastModified: "2024-11-13T15:45:36.000Z",
            ETag: '"aae5464e2472f123971016697b6686d9"',
            Size: 2398,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test',
            url: 'https://www.u-blox.com/en/documentation/test-1',
            bodyString: null,
        }
    ];

    let versions = processBucketObjectsVersions(objects);

    let nodes = [];
    function createNode(node) {
        nodes.push(node);
    }

    processBucketObjects(objects, versions, createNode, createNodeId, createContentDigest);
    // console.log(nodes);
    expect(nodes).toEqual([]);
});


//TODO add test without html, head and body tags

test('processBucketObjects - one section', () => {

    const objects = [
        {
            Key: 'production/rst-examples/index.html',
            LastModified: "2024-11-13T15:45:36.000Z",
            ETag: '"aae5464e2472f123971016697b6686d9"',
            Size: 2398,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test',
            url: 'https://www.u-blox.com/en/documentation/test-1',
            bodyString: "<html><head></head><body><section id='headline-1'><h1>headline</h1><div>Lorem Ipsum</div></section></body>",
        }
    ];

    let versions = processBucketObjectsVersions(objects);

    let nodes = [];
    function createNode(node) {
        nodes.push(node);
    }

    processBucketObjects(objects, versions, createNode, createNodeId, createContentDigest);
    // console.log(nodes);
    expect(nodes.length).toEqual(2);
    const siteMapNode = nodes[0];
    const contentNode = nodes[1];
    expect(siteMapNode.Key).toEqual("production/rst-examples/index.html.sitemap");
    expect(siteMapNode.basePath).toEqual("/rst-examples");
    expect(siteMapNode.basePathWithVersion).toEqual("/rst-examples");
    expect(siteMapNode.versionPath).toEqual("");
    expect(siteMapNode.sitemap.basePath).toEqual("/rst-examples");
    expect(siteMapNode.sitemap.isVersion).toEqual(false);
    expect(siteMapNode.sitemap.title).toEqual("production/rst-examples/index.html");
    expect(siteMapNode.sitemap.subsections.length).toEqual(1);
    expect(siteMapNode.sitemap.subsections[0].section.title).toEqual("headline");
    expect(siteMapNode.sitemap.subsections[0].section.path).toEqual("1-headline-1");
    // expect(siteMapNode.sitemap.).toEqual("");

    expect(contentNode.Key).toEqual("production/rst-examples/index.html");
    expect(contentNode.body).toEqual('<section id="headline-1"><h1>headline</h1><div>Lorem Ipsum</div></section>');
    expect(contentNode.title).toEqual("headline");

});

test('processBucketObjects - one section with meta tags', () => {

    const objects = [
        {
            Key: 'production/rst-examples/index.html',
            LastModified: "2024-11-13T15:45:36.000Z",
            ETag: '"aae5464e2472f123971016697b6686d9"',
            Size: 2398,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test',
            url: 'https://www.u-blox.com/en/documentation/test-1',
            bodyString: "<!DOCTYPE html><head><title>documentation title</title></head><body><section id='headline-1'><h1>headline</h1><div>Lorem Ipsum</div></section></body></html>",
        }
    ];

    let versions = processBucketObjectsVersions(objects);

    let nodes = [];
    function createNode(node) {
        nodes.push(node);
    }

    processBucketObjects(objects, versions, createNode, createNodeId, createContentDigest);
    // console.log(nodes);
    expect(nodes.length).toEqual(2);
    const siteMapNode = nodes[0];
    const contentNode = nodes[1];
    expect(siteMapNode.Key).toEqual("production/rst-examples/index.html.sitemap");
    expect(siteMapNode.basePath).toEqual("/rst-examples");
    expect(siteMapNode.basePathWithVersion).toEqual("/rst-examples");
    expect(siteMapNode.versionPath).toEqual("");
    expect(siteMapNode.sitemap.basePath).toEqual("/rst-examples");
    expect(siteMapNode.sitemap.isVersion).toEqual(false);
    expect(siteMapNode.sitemap.title).toEqual("documentation title");
    expect(siteMapNode.sitemap.subsections.length).toEqual(1);
    expect(siteMapNode.sitemap.subsections[0].section.title).toEqual("headline");
    expect(siteMapNode.sitemap.subsections[0].section.path).toEqual("1-headline-1");
    // expect(siteMapNode.sitemap.).toEqual("");

    expect(contentNode.Key).toEqual("production/rst-examples/index.html");
    expect(contentNode.body).toEqual('<section id="headline-1"><h1>headline</h1><div>Lorem Ipsum</div></section>');
    expect(contentNode.title).toEqual("headline");
});


test('processBucketObjects - multiple sections with meta tags', () => {

    const objects = [
        {
            Key: 'production/rst-examples/index.html',
            LastModified: "2024-11-13T15:45:36.000Z",
            ETag: '"aae5464e2472f123971016697b6686d9"',
            Size: 2398,
            StorageClass: 'STANDARD',
            Owner: {
                ID: '3a91561c00229f793242f6265cd823cf27fa49dc46f9d6e81dd14671c857b623'
            },
            Bucket: 'ublox-documentation-test',
            url: 'https://www.u-blox.com/en/documentation/test-1',
            bodyString: "<html><head><title>documentation title</title></head><body><section id='headline-1'><h1>headline</h1><div>Lorem Ipsum</div><section id='headline2'><h2>subheadline</h2>test</section></section><section id='headline3'><h1>headline3</h1><div>lorem ipsum 2</div></section><section id='headline4'><h1>headline 4</h1><div>lorem ipsum 3</div></section></body></html>",
        }
    ];

    let versions = processBucketObjectsVersions(objects);

    let nodes = [];
    function createNode(node) {
        nodes.push(node);
    }

    processBucketObjects(objects, versions, createNode, createNodeId, createContentDigest);
    // console.log(nodes);
    expect(nodes.length).toEqual(4);
    const siteMapNode = nodes[0];
    const contentNode = nodes[1];
    const contentNode2 = nodes[2];
    const contentNode3 = nodes[3];
    expect(siteMapNode.Key).toEqual("production/rst-examples/index.html.sitemap");
    expect(siteMapNode.basePath).toEqual("/rst-examples");
    expect(siteMapNode.basePathWithVersion).toEqual("/rst-examples");
    expect(siteMapNode.versionPath).toEqual("");
    expect(siteMapNode.sitemap.basePath).toEqual("/rst-examples");
    expect(siteMapNode.sitemap.isVersion).toEqual(false);
    expect(siteMapNode.sitemap.title).toEqual("documentation title");
    expect(siteMapNode.sitemap.subsections.length).toEqual(3);
    expect(siteMapNode.sitemap.subsections[0].section.title).toEqual("headline");
    expect(siteMapNode.sitemap.subsections[0].section.path).toEqual("1-headline-1");
    // expect(siteMapNode.sitemap.).toEqual("");

    expect(contentNode.Key).toEqual("production/rst-examples/index.html");
    expect(contentNode.body).toEqual('<section id="headline-1"><h1>headline</h1><div>Lorem Ipsum</div><section id=\"headline2\"><h2>subheadline</h2>test</section></section>');
    expect(contentNode.title).toEqual("headline");

    expect(contentNode2.Key).toEqual("production/rst-examples/index.html");
    expect(contentNode2.body).toEqual('<section id="headline3"><h1>headline3</h1><div>lorem ipsum 2</div></section>');
    expect(contentNode2.title).toEqual("headline3");

    expect(contentNode3.Key).toEqual("production/rst-examples/index.html");
    expect(contentNode3.body).toEqual('<section id="headline4"><h1>headline 4</h1><div>lorem ipsum 3</div></section>');
    expect(contentNode3.title).toEqual("headline 4");
});

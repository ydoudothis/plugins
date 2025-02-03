
import AWS_S3, {
  GetObjectCommand,
  ListObjectsCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const isImage = (key: string): boolean => /\.(jpe?g|png|gif|webp|tiff?)$/i.test(key);
const isHTML = key => /\.(html?)$/i.test(key);
import sanitizeHtml from "sanitize-html";

// const jsdom = require("jsdom");
// const { JSDOM } = jsdom;
import { DOMParser, parseHTML } from 'linkedom/cached';

type ObjectType = AWS_S3._Object & { Bucket: string };


// get objects
const getS3ListObjects = async (parameters: { Bucket: string; Prefix: string; Marker?: string, }, s3: any) => {
  const command = new ListObjectsCommand(parameters);
  return await s3.send(command);
};


export async function listAllS3Objects(s3, reporter, bucket: string, prefix: string) {
  const allS3Objects: ObjectType[] = [];

  try {
    const data = await getS3ListObjects({ Bucket: bucket, Prefix: prefix }, s3);

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


export function processBucketObjectsVersions(objects) {

  let versions: string[] = [];
  for (const object of objects) {
    const {
      //Bucket,
      Key
    } = object;

    if (Key && isHTML(Key)) {
      // console.log('isHTML')
      let tmpPath = "";
      if (Key.indexOf("production/") === 0) {
        tmpPath = Key.substr(10);
      } else {
        if (Key.indexOf("preview/") === 0) {
          tmpPath = Key.substr(7);
        }
      }
      const indexOfVersions = tmpPath.indexOf('/versions/');

      if (indexOfVersions !== -1) {
        // console.log('isVersions')
        let basePath = tmpPath.substring(0, indexOfVersions);
        let version = tmpPath.substring(indexOfVersions + ('/versions/'.length));
        version = version.substring(0, version.indexOf('/'));
        // console.log(basePath + ' ->' + tmpPath + ' is version')
        // console.log(version);

        if (basePath) {
          if (!versions[basePath]) {
            versions[basePath] = [{ path: '', title: 'latest' }];
          }
          versions[basePath].push({ path: '/' + version, title: version });
        }
      }
    }
  }

  return versions;
}

export async function loadBucketObjectsBody(s3, objects, expiration) {

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
    object.bodyString = bodyString;
    const url = await getSignedUrl(s3, command, { expiresIn: expiration });
    object.url = url;
  }

  return objects;
}

/** 
 * fixes internal links within the document by updating it to correct page.
 */
export function fixInternalLinks(document, sections, basePathWithVersion: string) {
  if (document) {
    const allLinks = document.querySelectorAll("a");
    let idToSectionHref = [];

    for (let i = 0; i < allLinks.length; i++) {
      let currentLink = allLinks[i];
      let currentHref = currentLink.getAttribute('href');
      let currentHrefAsSelector = currentHref

      if (currentHref && currentHref.startsWith('#')) {
        if(currentHrefAsSelector.indexOf('.') !== -1) {
          currentHrefAsSelector = currentHrefAsSelector.replaceAll('.', '\\.');
        }
        const currentId = currentHref.substr(1);
        // const elementWithId = document.querySelector(currentHref);
        // console.log(currentHref);

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
          const section = sections[sectionIndex];
          const sectionId = section.id;

          if (section && !section.contains(currentLink)) {
            if (idToSectionHref[currentId]) {
              currentLink.href = idToSectionHref[currentId] + currentHref;
              break;
            } else {
              if (sectionId == currentId || section.querySelector(currentHrefAsSelector))  {
                currentLink.href = (sectionIndex + 1) + '-' + sectionId + currentHref;
                idToSectionHref[currentId] = (sectionIndex + 1) + '-' + sectionId;
                // currentLink.href = "/en/documentation/" + basePathWithVersion + '/' + (sectionIndex + 1) + '-' + sectionId + currentHref;
                // console.log(currentLink.href);
                break;
              }
            }
          }
        }
      }
    }
  }
}


export function fixBase64SvgXmlImages(htmlString: string) {
  let updatedHTML = htmlString;
  updatedHTML = updatedHTML.replace(/\!\[(.+?)\]\((data:image\/svg\+xml;base64,.+?)\)/g, "<img src='$2' alt='$1' />");
  return updatedHTML;
}

const sanitizeOptions = {
  allowedTags: [
    "address",
    "article",
    "aside",
    "button",
    "footer",
    "header",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hgroup",
    "main",
    "nav",
    "section",
    "blockquote",
    "dd",
    "div",
    "dl",
    "dt",
    "figcaption",
    "figure",
    "hr",
    "li",
    "main",
    "ol",
    "p",
    "pre",
    "ul",
    "a",
    "abbr",
    "b",
    "bdi",
    "bdo",
    "br",
    "cite",
    "code",
    "data",
    "dfn",
    "em",
    "i",
    "kbd",
    "mark",
    "q",
    "rb",
    "rp",
    "rt",
    "rtc",
    "ruby",
    "s",
    "samp",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "time",
    "u",
    "var",
    "wbr",
    "caption",
    "col",
    "colgroup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "img",
    // "iframe",
    // "style",
    "video",
    "source",
    "picture",
    "html",
    "head",
    "body",
    "meta",
    "title"
  ],
  disallowedTagsMode: "discard",
  allowedAttributes: {
    a: ["href", "name", "target", "class", "className", "id"],
    img: [
      "src",
      "srcset",
      "alt",
      "title",
      "width",
      "height",
      "loading",
      "class",
      "className",
      "id"
    ],
    table: ["class", "cellpadding", "cellspacing", "id"],
    th: ["class", "scope", "rowspan", "colspan", "id"],
    tr: ["class", "id"],
    td: ["class", "rowspan", "colspan", "id"],
    div: [
      "class",
      "style",
      "id",
      "className",
      "portalid",
      "formid",
      "goToWebinarWebinarKey",
      "gotowebinarwebinarkey",
    ],
    span: ["style", "class", "className", "id"],
    p: ["style", "class", "className", "id"],
    article: ["class", "className", "id"],
    h1: ["className", "class", "id"],
    h2: ["className", "class", "id"],
    h3: ["className", "class", "id"],
    h4: ["className", "class", "id"],
    h5: ["className", "class", "id"],
    iframe: [
      "frameborder",
      "height",
      "scrolling",
      "src",
      "width",
      "allow",
      "allowfullscreen",
      "class",
      "className",
      "id"
    ],
    meta: [
      "content",
      "name"
    ],
    video: ["controls", "height", "width", "id"],
    source: ["src", "type", "srcset", "alt", "media", "id"],
    section: ["id"],
    button: ["id", "name", "role", "tabindex", "aria-controls", "aria-selected", "class"],
  },
  // Lots of these won't come up by default because we don't allow them
  selfClosing: [
    "img",
    "br",
    "hr",
    "area",
    "base",
    "basefont",
    "input",
    "link",
    "meta",
  ],
  // URL schemes we permit
  allowedSchemes: ["http", "https", "ftp", "mailto", "tel"],
  allowedSchemesByTag: { img: ["data", "https", "http"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  allowProtocolRelative: true,
  enforceHtmlBoundary: false,
  allowVulnerableTags: true,
};

export function sanitizeText(htmlString: string) {
  const sanitizedText = sanitizeHtml(htmlString, sanitizeOptions);
  return sanitizedText;
}

export async function processBucketObjects(objects, versions, createNode, createNodeId, createContentDigest) {

  // create file nodes
  for (const object of objects) {
    const { Bucket, Key } = object;
    console.log('--------------------------------');
    console.log(Key);

    // console.log('#/: '+ (Key.match(/\//g) || []).length);
    if((Key.match(/\//g) || []).length <= 1) { // if path has no folders
      console.log('skip - the path is too short');
      continue;
    }
    // // get pre-signed URL
    // const command = new GetObjectCommand({
    //   Bucket,
    //   Key,
    // });
    // const response = await s3.send(command);
    // const bodyString = await response?.Body?.transformToString();

    // const url = await getSignedUrl(s3, command, { expiresIn: expiration });

    if (isHTML(Key)) {
      console.log('isHTML');
      let tmpPath = "";
      if (Key.indexOf("production/") === 0) {
        tmpPath = Key.substr(10);
      } else {
        if (Key.indexOf("preview/") === 0) {
          tmpPath = Key.substr(7);
        }
      }

      if (tmpPath.lastIndexOf("/") !== tmpPath.indexOf("/")) {
        tmpPath = tmpPath.substring(0, tmpPath.lastIndexOf("/"));
      }
      let basePath = tmpPath;
      console.log(basePath);

      const indexOfVersions = basePath.indexOf('/versions/');
      const isVersion = indexOfVersions !== -1;
      let basePathWithVersion = basePath;
      let versionPath = '';

      if (isVersion === true) {
        console.log('isVersion');
        basePath = basePath.replace('/versions', '');
        basePathWithVersion = basePath;
        versionPath = basePath.substring(basePath.lastIndexOf('/'));
        basePath = basePath.substring(0, basePath.lastIndexOf("/"));
      }

      if (object.bodyString) {
        // console.log(object.bodyString);

        let bodyString = object.bodyString;
        bodyString = fixBase64SvgXmlImages(bodyString);
        bodyString = sanitizeText(bodyString)
        // console.log('........................')
        // console.log(sanitizeText(bodyString));
        // console.log(bodyString);
        if (bodyString.indexOf('<html') === -1) {
          let indexDocType = bodyString.indexOf('<!DOCTYPE html>');
          if (indexDocType === 0) {
            bodyString = '<!DOCTYPE html><html>' + bodyString.substr(15);
          } else {
            if (indexDocType === -1) {
              bodyString = '<html>' + bodyString;
            }
          }
        }
        const {
          document
        } = parseHTML(bodyString);
        // const dom = new JSDOM(object.bodyString);
        // let document = dom.window.document;
        const headerLinks = document.querySelectorAll("a.headerlink");
        for (let i = 0; i < headerLinks.length; i++) {
          headerLinks[i].remove();
        }
        const sections = document.querySelectorAll("body > section");

        fixInternalLinks(document, sections, basePathWithVersion);

        // console.log(dom.window.document.body);
        let titleNode = document.head.querySelector("title");
        console.log(titleNode?.innerHTML);
        let sitemap = {
          id: "",
          level: 0,
          path: "index.html",
          title: document.title ? document.title : Key,
          subsections: [],
          basePath: basePath,
          isVersion: isVersion,
          versions: versions[basePath]
        }

        for (let i = 0; i < sections.length; i++) {
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

        if (sitemap?.subsections?.length > 0) {

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
                ...object
              })
            }
          });
        }

        for (let i = 0; i < sections.length; i++) {
          //console.log(i);
          const section = sections[i];
          const sectionId = section.id;
          const sectionHtml = section.outerHTML;
          const sectionHeadline = section.querySelector("h1");

          //console.log(sectionId);
          const subSections = section.querySelectorAll("section");
          let pageNav = [];
          for (let subSectionIndex = 0; subSectionIndex < subSections.length; subSectionIndex++) {
            const cSubSection = subSections[subSectionIndex];
            let subHeadline = cSubSection.querySelector("h2");
            if (subHeadline) {
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
            // ...object,
            Key: object.Key,
            LastModified: object.LastModified,
            url: object.url,
            Bucket: object.Bucket,
            ETag: object.ETag,
            Size: object.Size,
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
    }
    else {
      if (isImage(Key)) {
        console.log('isImage');
        createNode({
          ...object,
          url: object.url,
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
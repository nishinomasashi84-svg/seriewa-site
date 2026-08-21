import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());
const payload = JSON.parse(process.env.SERIEWA_BLOG_PAYLOAD || "{}");
const cloudinaryResultFile = process.env.SERIEWA_CLOUDINARY_RESULT_FILE;
const updateResultFile = process.env.SERIEWA_UPDATE_RESULT_FILE;

function fail(message) {
  throw new Error(message);
}

function optionalText(value, max = 300) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") fail("Text input must be a string");
  const result = value.trim();
  if (result.length > max) fail("Text input is too long");
  return result;
}

function requiredText(value, field, max = 300) {
  const result = optionalText(value, max);
  if (!result) fail(`${field} is required`);
  return result;
}

function normalizeArticlePath() {
  let target = requiredText(payload.target_path || payload.article_path || (payload.slug ? `blog/${payload.slug}/` : ""), "target_path", 160);
  target = target.replace(/^\/+/, "");
  const match = target.match(/^blog\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|\/index\.html)$/);
  if (!match) fail("target_path must be blog/<slug>/ or blog/<slug>/index.html");
  return { slug: match[1], articlePath: `blog/${match[1]}/index.html` };
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function write(relativePath, content) {
  const outputPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}

function cloudinaryDeliveryUrl(url, transformation) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.includes("/image/upload/")) {
    fail("replacement image must use an HTTPS Cloudinary image delivery URL");
  }
  return url.replace("/upload/", `/upload/${transformation}/`);
}

function loadSingleImage() {
  if (!cloudinaryResultFile) fail("SERIEWA_CLOUDINARY_RESULT_FILE is required");
  const absolute = path.resolve(cloudinaryResultFile);
  if (!fs.existsSync(absolute)) fail("Cloudinary result file was not found");
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const images = Array.isArray(parsed) ? parsed : parsed.images;
  if (!Array.isArray(images) || images.length !== 1) fail("existing article image replacement requires exactly one uploaded image");
  const item = images[0] || {};
  const secureUrl = requiredText(item.secure_url || item.url, "secure_url", 1000);
  cloudinaryDeliveryUrl(secureUrl, "f_auto,q_auto,c_limit,w_1200");
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  return {
    secureUrl,
    width: Number.isInteger(width) && width > 0 ? width : null,
    height: Number.isInteger(height) && height > 0 ? height : null,
  };
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : "";
}

function setAttribute(tag, name, value) {
  const attributePattern = new RegExp(`(\\b${name}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, (_match, prefix, quote) => `${prefix}${quote}${value}${quote}`);
  }
  return tag.replace(/\s*\/>$|>$/, (ending) => ` ${name}="${value}"${ending}`);
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function findMetaTag(html, identityName, identityValue) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)];
  const matches = tags.filter(({ 0: tag }) => getAttribute(tag, identityName).toLowerCase() === identityValue.toLowerCase());
  if (matches.length > 1) fail(`multiple ${identityValue} meta tags were found`);
  return matches[0] || null;
}

function replaceMetaContent(html, identityName, identityValue, content, { insertAfter } = {}) {
  const match = findMetaTag(html, identityName, identityValue);
  const escaped = escapeAttribute(content);
  if (match) {
    const tag = match[0];
    const updatedTag = setAttribute(tag, "content", escaped);
    return {
      html: html.slice(0, match.index) + updatedTag + html.slice(match.index + tag.length),
      previous: getAttribute(tag, "content"),
      inserted: false,
    };
  }

  if (!insertAfter) fail(`${identityValue} meta tag was not found`);
  const anchor = findMetaTag(html, insertAfter.name, insertAfter.value);
  if (!anchor) fail(`could not insert ${identityValue} meta tag because its anchor was not found`);
  const newTag = `\n<meta ${identityName}="${identityValue}" content="${escaped}">`;
  const insertAt = anchor.index + anchor[0].length;
  return {
    html: html.slice(0, insertAt) + newTag + html.slice(insertAt),
    previous: "",
    inserted: true,
  };
}

function replacePrimaryArticleImage(html, bodyImageUrl, image, altText) {
  const articleStartMatch = html.match(/<article\b[^>]*class\s*=\s*(["'])[^"']*\bblog-article\b[^"']*\1[^>]*>/i);
  if (!articleStartMatch) fail("blog article container was not found");
  const articleStart = articleStartMatch.index + articleStartMatch[0].length;
  const articleEnd = html.indexOf("</article>", articleStart);
  if (articleEnd < 0) fail("blog article closing tag was not found");
  const bodyStart = html.indexOf('<div class="blog-body"', articleStart);
  const searchEnd = bodyStart >= 0 && bodyStart < articleEnd ? bodyStart : articleEnd;
  const preBody = html.slice(articleStart, searchEnd);
  const imageMatch = preBody.match(/<img\b[^>]*>/i);
  if (!imageMatch) fail("the target article has no replaceable primary article image");

  const absoluteIndex = articleStart + imageMatch.index;
  const oldTag = imageMatch[0];
  const previousSrc = getAttribute(oldTag, "src");
  if (!previousSrc) fail("the target article image has no src attribute");

  let newTag = setAttribute(oldTag, "src", escapeAttribute(bodyImageUrl));
  if (altText) newTag = setAttribute(newTag, "alt", escapeAttribute(altText));
  if (image.width) newTag = setAttribute(newTag, "width", String(image.width));
  if (image.height) newTag = setAttribute(newTag, "height", String(image.height));

  return {
    html: html.slice(0, absoluteIndex) + newTag + html.slice(absoluteIndex + oldTag.length),
    previousSrc,
    previousAlt: getAttribute(oldTag, "alt"),
  };
}

const { slug, articlePath } = normalizeArticlePath();
const absoluteArticle = path.join(repoRoot, articlePath);
if (!fs.existsSync(absoluteArticle)) fail(`existing article was not found: ${articlePath}`);
if (!fs.statSync(absoluteArticle).isFile()) fail(`article path is not a file: ${articlePath}`);

const requestId = requiredText(payload.request_id, "request_id", 80);
if (!/^[A-Za-z0-9._-]+$/.test(requestId)) fail("request_id may contain only letters, numbers, dot, underscore, and hyphen");
const altText = optionalText(payload.image_alt, 180);
const image = loadSingleImage();
const bodyImageUrl = cloudinaryDeliveryUrl(image.secureUrl, "f_auto,q_auto,c_limit,w_1200");
const socialImageUrl = cloudinaryDeliveryUrl(image.secureUrl, "f_jpg,q_auto,c_fill,g_auto,w_1200,h_630");

const originalHtml = read(articlePath);
let html = originalHtml;
const ogResult = replaceMetaContent(html, "property", "og:image", socialImageUrl, {
  insertAfter: { name: "property", value: "og:type" },
});
html = ogResult.html;
const twitterResult = replaceMetaContent(html, "name", "twitter:image", socialImageUrl, {
  insertAfter: { name: "name", value: "twitter:card" },
});
html = twitterResult.html;
const articleImageResult = replacePrimaryArticleImage(html, bodyImageUrl, image, altText);
html = articleImageResult.html;

if (html === originalHtml) fail("replacement produced no article change");
write(articlePath, html);

const result = {
  operation: "replace_article_image",
  request_id: requestId,
  slug,
  article_path: articlePath,
  public_url: `https://seriew.com/blog/${slug}/`,
  secure_url: image.secureUrl,
  body_image_url: bodyImageUrl,
  social_image_url: socialImageUrl,
  previous: {
    body_image_url: articleImageResult.previousSrc,
    og_image_url: ogResult.previous,
    twitter_image_url: twitterResult.previous,
  },
  status: "ready_to_publish",
};

if (updateResultFile) {
  fs.mkdirSync(path.dirname(path.resolve(updateResultFile)), { recursive: true });
  fs.writeFileSync(path.resolve(updateResultFile), JSON.stringify(result, null, 2) + "\n", "utf8");
}
console.log(JSON.stringify(result, null, 2));

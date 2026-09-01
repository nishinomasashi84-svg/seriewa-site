import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());
const payload = JSON.parse(process.env.SERIEWA_BLOG_PAYLOAD || "{}");
const resultFile = process.env.SERIEWA_UPDATE_RESULT_FILE;

function fail(message) { throw new Error(message); }
function read(relativePath) { return fs.readFileSync(path.join(repoRoot, relativePath), "utf8"); }
function write(relativePath, content) {
  const output = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content, "utf8");
}
function requiredText(value, field, max = 300) {
  if (typeof value !== "string" || !value.trim()) fail(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > max) fail(`${field} is too long`);
  return normalized;
}
function optionalText(value, field, max = 300) {
  if (value == null) return null;
  return requiredText(value, field, max);
}
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function decodeHtml(value) {
  return String(value)
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
function plainText(value) {
  return decodeHtml(String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function replaceOne(html, pattern, replacement, field) {
  const matches = [...html.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) fail(`${field} update expected one match, found ${matches.length}`);
  return html.replace(pattern, replacement);
}
function replaceMeta(html, identityAttribute, identityValue, content) {
  const pattern = new RegExp(`(<meta\\b[^>]*\\b${identityAttribute}=["']${identityValue}["'][^>]*\\bcontent=["'])([^"']*)(["'][^>]*>)`, "i");
  if (!pattern.test(html)) fail(`${identityValue} meta tag was not found`);
  return html.replace(pattern, `$1${escapeHtml(content)}$3`);
}
function cloudinaryUrl(url, transformation) {
  let parsed;
  try { parsed = new URL(url); } catch { fail("images[].secure_url must be a valid URL"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com" || !parsed.pathname.includes("/image/upload/")) {
    fail("images[].secure_url must be an HTTPS Cloudinary image URL");
  }
  return url.replace("/upload/", `/upload/${transformation}/`);
}
function renderFigure(image, index) {
  const bodyUrl = cloudinaryUrl(image.secure_url, "f_auto,q_auto,c_limit,w_1200");
  const caption = image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : "";
  return `<figure class="blog-media"><img src="${escapeHtml(bodyUrl)}" alt="${escapeHtml(image.alt)}" loading="${index === 0 ? "eager" : "lazy"}" fetchpriority="${index === 0 ? "high" : "auto"}" decoding="async">${caption}</figure>`;
}
function sectionMatches(html) {
  const bodyMatch = html.match(/<div class="blog-body"[^>]*>([\s\S]*?)<div class="blog-cta"/i);
  if (!bodyMatch) fail("blog body or CTA boundary was not found");
  const bodyStart = bodyMatch.index + bodyMatch[0].indexOf(bodyMatch[1]);
  const body = bodyMatch[1];
  const headings = [...body.matchAll(/<h2>\s*<span>([^<]+)<\/span>([\s\S]*?)<\/h2>/gi)];
  return headings.map((match, index) => ({
    index,
    number: match[1],
    heading: plainText(match[2]),
    start: bodyStart + match.index,
    headingEnd: bodyStart + match.index + match[0].length,
    end: index + 1 < headings.length ? bodyStart + headings[index + 1].index : bodyStart + body.length,
    tag: match[0]
  }));
}
function findSection(html, selector, field) {
  const sections = sectionMatches(html);
  let matches = [];
  if (Number.isInteger(selector?.index)) matches = sections.filter((section) => section.index === selector.index);
  else if (typeof selector?.heading === "string" && selector.heading.trim()) matches = sections.filter((section) => section.heading === selector.heading.trim());
  else fail(`${field} requires selector.index or selector.heading`);
  if (matches.length !== 1) fail(`${field} matched ${matches.length} sections`);
  return matches[0];
}
function applySectionUpdates(html, updates) {
  for (let updateIndex = 0; updateIndex < updates.length; updateIndex += 1) {
    const update = updates[updateIndex] || {};
    const field = `content.sections[${updateIndex}]`;
    const section = findSection(html, update.selector, field);
    let block = html.slice(section.start, section.end);
    if (update.heading != null) {
      const heading = requiredText(update.heading, `${field}.heading`, 80);
      block = block.replace(section.tag, `<h2><span>${escapeHtml(section.number)}</span>${escapeHtml(heading)}</h2>`);
    }
    if (update.paragraphs != null) {
      if (!Array.isArray(update.paragraphs) || update.paragraphs.length < 1 || update.paragraphs.length > 5) fail(`${field}.paragraphs must contain 1 to 5 items`);
      const paragraphs = update.paragraphs.map((value, index) => `<p>${escapeHtml(requiredText(value, `${field}.paragraphs[${index}]`, 700))}</p>`).join("\n      ");
      const headingEnd = block.indexOf("</h2>") + 5;
      const afterHeading = block.slice(headingEnd);
      const firstContent = afterHeading.search(/<(?:p|ul)\b/i);
      if (firstContent < 0) fail(`${field} has no replaceable content`);
      const contentStart = headingEnd + firstContent;
      const trailingStart = block.slice(contentStart).search(/<ul\b/i);
      const contentEnd = trailingStart >= 0 ? contentStart + trailingStart : block.length;
      block = block.slice(0, contentStart) + paragraphs + "\n      " + block.slice(contentEnd);
    }
    if (update.bullets != null) {
      if (!Array.isArray(update.bullets) || update.bullets.length > 8) fail(`${field}.bullets must be an array with at most 8 items`);
      const list = update.bullets.length
        ? `<ul class="fit-list">${update.bullets.map((value, index) => `<li>${escapeHtml(requiredText(value, `${field}.bullets[${index}]`, 180))}</li>`).join("")}</ul>`
        : "";
      if (/<ul\b[^>]*class=["'][^"']*\bfit-list\b[^"']*["'][^>]*>[\s\S]*?<\/ul>/i.test(block)) {
        block = block.replace(/<ul\b[^>]*class=["'][^"']*\bfit-list\b[^"']*["'][^>]*>[\s\S]*?<\/ul>/i, list);
      } else if (list) {
        block += `\n      ${list}`;
      }
    }
    html = html.slice(0, section.start) + block + html.slice(section.end);
  }
  return html;
}
function updateListing(html, slug, listing) {
  const cardPattern = new RegExp(`(<a class="blog-card" href="${slug}/">)([\\s\\S]*?)(</a>)`, "i");
  const match = html.match(cardPattern);
  if (!match) fail(`blog listing card was not found for ${slug}`);
  let card = match[0];
  if (listing.list_label != null) card = replaceOne(card, /(<small>)([\s\S]*?)(<\/small>)/i, `$1${escapeHtml(requiredText(listing.list_label, "listing.list_label", 40))}$3`, "listing.list_label");
  if (listing.list_title != null) card = replaceOne(card, /(<h2>)([\s\S]*?)(<\/h2>)/i, `$1${escapeHtml(requiredText(listing.list_title, "listing.list_title", 100))}$3`, "listing.list_title");
  if (listing.list_description != null) card = replaceOne(card, /(<p>)([\s\S]*?)(<\/p>)/i, `$1${escapeHtml(requiredText(listing.list_description, "listing.list_description", 180))}$3`, "listing.list_description");
  return html.replace(cardPattern, card);
}
function updateTopic(html, slug, listing) {
  const topicPattern = new RegExp(`(<a class="topic" href="blog/${slug}/">)([\\s\\S]*?)(</a>)`, "i");
  const match = html.match(topicPattern);
  if (!match) fail(`homepage topic was not found for ${slug}`);
  let topic = match[0];
  if (listing.list_label != null) topic = replaceOne(topic, /(<small>)([\s\S]*?)(<\/small>)/i, `$1${escapeHtml(requiredText(listing.list_label, "listing.list_label", 40))}$3`, "listing.list_label");
  if (listing.topic_title != null) topic = replaceOne(topic, /(<strong>)([\s\S]*?)(<\/strong>)/i, `$1${escapeHtml(requiredText(listing.topic_title, "listing.topic_title", 100))}$3`, "listing.topic_title");
  return html.replace(topicPattern, topic);
}

const confirmation = payload.confirmation || {};
const requestId = requiredText(confirmation.request_id || payload.request_id, "confirmation.request_id", 80);
if (!/^[A-Za-z0-9._-]+$/.test(requestId)) fail("request_id contains unsupported characters");
const slug = requiredText(confirmation.slug || payload.slug, "confirmation.slug", 80);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail("slug must use lowercase letters, numbers, and hyphens");
const expectedTitle = requiredText(confirmation.expected_title, "confirmation.expected_title", 120);
const articlePath = `blog/${slug}/index.html`;
const absoluteArticle = path.join(repoRoot, articlePath);
if (!fs.existsSync(absoluteArticle) || !fs.statSync(absoluteArticle).isFile()) fail(`existing article was not found: ${articlePath}`);

const originalArticle = read(articlePath);
const titleMatch = originalArticle.match(/<title>([\s\S]*?)<\/title>/i);
if (!titleMatch) fail("current article title was not found");
const currentTitle = plainText(titleMatch[1]);
if (currentTitle !== expectedTitle) fail(`article title changed since confirmation: expected "${expectedTitle}", found "${currentTitle}"`);

let article = originalArticle;
const metadata = payload.metadata || {};
const content = payload.content || {};
const listing = payload.listing || {};
const cta = payload.cta || {};
const images = Array.isArray(payload.images) ? payload.images : [];

if (metadata.page_title != null) {
  const value = requiredText(metadata.page_title, "metadata.page_title", 120);
  article = replaceOne(article, /(<title>)([\s\S]*?)(<\/title>)/i, `$1${escapeHtml(value)}$3`, "metadata.page_title");
  article = replaceMeta(article, "property", "og:title", value);
  article = replaceMeta(article, "name", "twitter:title", value);
}
if (metadata.meta_description != null) {
  const value = requiredText(metadata.meta_description, "metadata.meta_description", 180);
  article = replaceMeta(article, "name", "description", value);
}
if (metadata.og_description != null) {
  const value = requiredText(metadata.og_description, "metadata.og_description", 180);
  article = replaceMeta(article, "property", "og:description", value);
  article = replaceMeta(article, "name", "twitter:description", value);
}
if (metadata.category_label != null) {
  const value = requiredText(metadata.category_label, "metadata.category_label", 40);
  article = replaceOne(article, /(<p class="blog-category">BLOG \/ )([\s\S]*?)(<\/p>)/i, `$1${escapeHtml(value)}$3`, "metadata.category_label");
}
if (content.intro != null) article = replaceOne(article, /(<p class="blog-intro">)([\s\S]*?)(<\/p>)/i, `$1${escapeHtml(requiredText(content.intro, "content.intro", 300))}$3`, "content.intro");
if (content.lead != null) article = replaceOne(article, /(<p class="blog-lead">)([\s\S]*?)(<\/p>)/i, `$1${escapeHtml(requiredText(content.lead, "content.lead", 700))}$3`, "content.lead");
if (content.headline_lines != null) {
  if (!Array.isArray(content.headline_lines) || content.headline_lines.length < 1 || content.headline_lines.length > 3) fail("content.headline_lines must contain 1 to 3 items");
  const value = content.headline_lines.map((line, index) => escapeHtml(requiredText(line, `content.headline_lines[${index}]`, 80))).join("<br>");
  article = replaceOne(article, /(<div class="blog-hero">[\s\S]*?<h1>)([\s\S]*?)(<\/h1>)/i, `$1${value}$3`, "content.headline_lines");
}
if (content.tags != null) {
  if (!Array.isArray(content.tags) || content.tags.length < 1 || content.tags.length > 8) fail("content.tags must contain 1 to 8 items");
  const value = content.tags.map((tag, index) => `<span>#${escapeHtml(requiredText(tag, `content.tags[${index}]`, 30).replace(/^#/, ""))}</span>`).join("");
  article = replaceOne(article, /(<div class="blog-tags">)([\s\S]*?)(<\/div>)/i, `$1${value}$3`, "content.tags");
}
if (content.sections != null) {
  if (!Array.isArray(content.sections) || content.sections.length < 1 || content.sections.length > 10) fail("content.sections must contain 1 to 10 updates");
  article = applySectionUpdates(article, content.sections);
}
if (content.related_link != null) {
  const href = requiredText(content.related_link.href, "content.related_link.href", 500);
  const label = requiredText(content.related_link.label, "content.related_link.label", 160);
  if (!/^https:\/\//.test(href) && !/^\.\.\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(href)) fail("content.related_link.href must be HTTPS or a sibling blog link");
  const markup = `<p class="blog-related-link">参考：<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></p>`;
  if (/<p class="blog-related-link">[\s\S]*?<\/p>/i.test(article)) article = article.replace(/<p class="blog-related-link">[\s\S]*?<\/p>/i, markup);
  else article = replaceOne(article, /(\n\s*<div class="blog-cta">)/i, `\n      ${markup}$1`, "content.related_link");
}
if (cta.cta_eyebrow != null) article = replaceOne(article, /(<div class="blog-cta">[\s\S]*?<small>)([\s\S]*?)(<\/small>)/i, `$1${escapeHtml(requiredText(cta.cta_eyebrow, "cta.cta_eyebrow", 60))}$3`, "cta.cta_eyebrow");
if (cta.cta_title_lines != null) {
  if (!Array.isArray(cta.cta_title_lines) || cta.cta_title_lines.length < 1 || cta.cta_title_lines.length > 3) fail("cta.cta_title_lines must contain 1 to 3 items");
  const value = cta.cta_title_lines.map((line, index) => escapeHtml(requiredText(line, `cta.cta_title_lines[${index}]`, 70))).join("<br>");
  article = replaceOne(article, /(<div class="blog-cta">[\s\S]*?<h2>)([\s\S]*?)(<\/h2>)/i, `$1${value}$3`, "cta.cta_title_lines");
}
if (cta.cta_text != null) article = replaceOne(article, /(<div class="blog-cta">[\s\S]*?<p>)([\s\S]*?)(<\/p>)/i, `$1${escapeHtml(requiredText(cta.cta_text, "cta.cta_text", 240))}$3`, "cta.cta_text");

if (images.length > 8) fail("images must contain at most 8 items");
const bodyImageUrls = [];
let socialImageUrl = "";
for (let index = 0; index < images.length; index += 1) {
  const image = images[index] || {};
  image.secure_url = requiredText(image.secure_url, `images[${index}].secure_url`, 1000);
  image.alt = requiredText(image.alt, `images[${index}].alt`, 180);
  image.caption = optionalText(image.caption, `images[${index}].caption`, 300) || "";
  const figure = renderFigure(image, index);
  const bodyUrl = cloudinaryUrl(image.secure_url, "f_auto,q_auto,c_limit,w_1200");
  bodyImageUrls.push(bodyUrl);
  if (index === 0 || image.use_for_social === true) socialImageUrl = cloudinaryUrl(image.secure_url, "f_jpg,q_auto,c_fill,g_auto,w_1200,h_630");
  const placement = image.placement || {};
  const position = placement.position || "article_start";
  if (position === "article_start") {
    article = replaceOne(article, /(\n\s*<div class="blog-body">)/i, `\n    <div class="blog-media-grid">${figure}</div>$1`, `images[${index}].placement`);
  } else if (position === "article_end") {
    article = replaceOne(article, /(\n\s*<div class="blog-cta">)/i, `\n      ${figure}$1`, `images[${index}].placement`);
  } else if (position === "before_section" || position === "after_section") {
    const section = findSection(article, placement, `images[${index}].placement`);
    const insertAt = position === "before_section" ? section.start : section.end;
    article = article.slice(0, insertAt) + `\n      ${figure}\n      ` + article.slice(insertAt);
  } else fail(`images[${index}].placement.position is invalid`);
}
if (socialImageUrl) {
  article = replaceMeta(article, "property", "og:image", socialImageUrl);
  article = replaceMeta(article, "name", "twitter:image", socialImageUrl);
}

const changedFiles = [];
if (article !== originalArticle) {
  write(articlePath, article);
  changedFiles.push(articlePath);
}
if (Object.keys(listing).length) {
  const blogIndexPath = "blog/index.html";
  const originalBlogIndex = read(blogIndexPath);
  const updatedBlogIndex = updateListing(originalBlogIndex, slug, listing);
  if (updatedBlogIndex !== originalBlogIndex) { write(blogIndexPath, updatedBlogIndex); changedFiles.push(blogIndexPath); }
  if (listing.list_label != null || listing.topic_title != null) {
    const homepagePath = "index.html";
    const originalHomepage = read(homepagePath);
    const updatedHomepage = updateTopic(originalHomepage, slug, listing);
    if (updatedHomepage !== originalHomepage) { write(homepagePath, updatedHomepage); changedFiles.push(homepagePath); }
  }
}
if (!changedFiles.length) fail("update request produced no changes");

const result = {
  operation: "update_article",
  request_id: requestId,
  slug,
  current_title: currentTitle,
  article_path: articlePath,
  changed_files: changedFiles,
  public_url: `https://seriew.com/blog/${slug}/`,
  secure_url: images[0]?.secure_url || "",
  secure_urls: images.map((image) => image.secure_url),
  body_image_url: bodyImageUrls[0] || "",
  body_image_urls: bodyImageUrls,
  social_image_url: socialImageUrl || (article.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)?.[1] || ""),
  status: "ready_to_publish"
};
if (resultFile) {
  fs.mkdirSync(path.dirname(path.resolve(resultFile)), { recursive: true });
  fs.writeFileSync(path.resolve(resultFile), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(result, null, 2));

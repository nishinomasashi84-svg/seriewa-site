import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());
const payload = JSON.parse(process.env.SERIEWA_BLOG_PAYLOAD || "{}");

function fail(message) {
  throw new Error(message);
}

function text(value, field, max = 300) {
  if (typeof value !== "string" || !value.trim()) fail(`${field} is required`);
  const result = value.trim();
  if (result.length > max) fail(`${field} is too long`);
  return result;
}

function optionalText(value, field, max = 300) {
  if (value == null || value === "") return "";
  return text(value, field, max);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function write(relativePath, content) {
  const outputPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}

const slug = text(payload.slug, "slug", 80);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail("slug must use lowercase letters, numbers, and hyphens");

const articleRelativePath = `blog/${slug}/index.html`;
if (fs.existsSync(path.join(repoRoot, articleRelativePath))) fail(`article already exists: ${slug}`);

const pageTitle = text(payload.page_title, "page_title", 80);
const metaDescription = text(payload.meta_description, "meta_description", 160);
const ogDescription = optionalText(payload.og_description, "og_description", 160) || metaDescription;
const categoryLabel = text(payload.category_label, "category_label", 40).toUpperCase();
const listLabel = text(payload.list_label, "list_label", 40).toUpperCase();
const intro = text(payload.intro, "intro", 240);
const lead = text(payload.lead, "lead", 500);
const listTitle = text(payload.list_title, "list_title", 100);
const listDescription = text(payload.list_description, "list_description", 180);
const topicTitle = text(payload.topic_title, "topic_title", 100);
const ctaEyebrow = text(payload.cta_eyebrow, "cta_eyebrow", 60).toUpperCase();
const ctaTitleLines = Array.isArray(payload.cta_title_lines) ? payload.cta_title_lines.map((value, index) => text(value, `cta_title_lines[${index}]`, 60)) : [];
const ctaText = text(payload.cta_text, "cta_text", 180);

const headlineLines = Array.isArray(payload.headline_lines) ? payload.headline_lines.map((value, index) => text(value, `headline_lines[${index}]`, 70)) : [];
if (headlineLines.length < 1 || headlineLines.length > 3) fail("headline_lines must contain 1 to 3 lines");
if (ctaTitleLines.length < 1 || ctaTitleLines.length > 3) fail("cta_title_lines must contain 1 to 3 lines");

const tags = Array.isArray(payload.tags) ? payload.tags.map((value, index) => text(value, `tags[${index}]`, 30).replace(/^#/, "")) : [];
if (tags.length < 1 || tags.length > 4) fail("tags must contain 1 to 4 items");

const sections = Array.isArray(payload.sections) ? payload.sections : [];
if (sections.length < 2 || sections.length > 10) fail("sections must contain 2 to 10 items");

const normalizedSections = sections.map((section, sectionIndex) => {
  const heading = text(section?.heading, `sections[${sectionIndex}].heading`, 80);
  const paragraphs = Array.isArray(section?.paragraphs)
    ? section.paragraphs.map((value, paragraphIndex) => text(value, `sections[${sectionIndex}].paragraphs[${paragraphIndex}]`, 700))
    : [];
  const bullets = Array.isArray(section?.bullets)
    ? section.bullets.map((value, bulletIndex) => text(value, `sections[${sectionIndex}].bullets[${bulletIndex}]`, 180))
    : [];
  if (paragraphs.length < 1 || paragraphs.length > 5) fail(`sections[${sectionIndex}].paragraphs must contain 1 to 5 items`);
  if (bullets.length > 8) fail(`sections[${sectionIndex}].bullets must contain at most 8 items`);
  return { heading, paragraphs, bullets };
});

let relatedLink = "";
if (payload.related_link) {
  const href = text(payload.related_link.href, "related_link.href", 100);
  const label = text(payload.related_link.label, "related_link.label", 100);
  if (!/^\.\.\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(href)) fail("related_link.href must point to an existing sibling blog path");
  const relatedSlug = href.slice(3, -1);
  if (!fs.existsSync(path.join(repoRoot, "blog", relatedSlug, "index.html"))) fail(`related article does not exist: ${relatedSlug}`);
  relatedLink = `<p>関連する内容は、<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>でも詳しく紹介しています。</p>`;
}

const blogIndex = read("blog/index.html");
const existingNumbers = [...blogIndex.matchAll(/blog-card-number">(\d+)</g)].map((match) => Number(match[1]));
const articleNumber = String(Math.max(0, ...existingNumbers) + 1).padStart(2, "0");

const dateParts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]),
);
const displayDate = `${dateParts.year}.${dateParts.month}.${dateParts.day}`;

const tagsHtml = tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("");
const headlineHtml = headlineLines.map(escapeHtml).join("<br>");
const ctaTitleHtml = ctaTitleLines.map(escapeHtml).join("<br>");
const sectionsHtml = normalizedSections.map((section, index) => {
  const number = String(index + 1).padStart(2, "0");
  const paragraphsHtml = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n      ");
  const bulletsHtml = section.bullets.length
    ? `\n      <ul class="fit-list">${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
    : "";
  const linkHtml = index === 0 && relatedLink ? `\n      ${relatedLink}` : "";
  return `      <h2><span>${number}</span>${escapeHtml(section.heading)}</h2>\n      ${paragraphsHtml}${bulletsHtml}${linkHtml}`;
}).join("\n\n");

const articleHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(metaDescription)}">
<link rel="canonical" href="https://seriew.com/blog/${slug}">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(ogDescription)}">
<meta property="og:type" content="article">
<meta property="og:image" content="https://seriew.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(pageTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogDescription)}">
<link rel="stylesheet" href="../../css/style.css">
</head>
<body>
<main class="blog-page">
  <header class="blog-header">
    <a class="wordmark" href="../../#top" aria-label="SERIE W トップへ"><span>SERIE</span><b>W</b></a>
    <a class="blog-back" href="../../blog/">ブログ一覧へ<span>↗</span></a>
  </header>
  <article class="blog-article">
    <div class="blog-hero">
      <p class="blog-category">BLOG / ${escapeHtml(categoryLabel)}</p>
      <h1>${headlineHtml}</h1>
      <p class="blog-intro">${escapeHtml(intro)}</p>
      <div class="blog-tags">${tagsHtml}</div>
    </div>
    <div class="blog-body">
      <p class="blog-lead">${escapeHtml(lead)}</p>

${sectionsHtml}

      <div class="blog-cta">
        <small>${escapeHtml(ctaEyebrow)}</small>
        <h2>${ctaTitleHtml}</h2>
        <p>${escapeHtml(ctaText)}</p>
        <a href="https://lin.ee/b8IfUOO" target="_blank" rel="noreferrer">LINEで参加・問い合わせ <span>↗</span></a>
      </div>
    </div>
  </article>
</main>
  <footer class="blog-footer">
    <a href="../../#top">SERIE W</a>
    <span>INDIVIDUAL FUTSAL COMMUNITY / IZUMISANO</span>
  </footer>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B78ZTV9596"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-B78ZTV9596');
</script>
</body>
</html>
`;

const listCard = `
    <a class="blog-card" href="${slug}/">
      <div class="blog-card-number">${articleNumber}</div>
      <div class="blog-card-copy">
        <small>${escapeHtml(listLabel)}</small>
        <h2>${escapeHtml(listTitle)}</h2>
        <p>${escapeHtml(listDescription)}</p>
        <div>${tags.slice(0, 2).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <b>↗</b>
    </a>`;

const updatedBlogIndex = blogIndex.replace(
  '<section class="blog-list">',
  `<section class="blog-list">${listCard}`,
);
if (updatedBlogIndex === blogIndex) fail("blog list insertion point was not found");

const homepage = read("index.html");
const topicListPattern = /(<div class="r-topic-list">)([\s\S]*?)(\n\s*<\/div>\n\s*<\/section>)/;
const topicListMatch = homepage.match(topicListPattern);
if (!topicListMatch) fail("homepage topic list was not found");
const existingTopics = [...topicListMatch[2].matchAll(/\s*<a class="topic"[\s\S]*?<\/a>/g)].map((match) => match[0].trim());
const newTopic = `<a class="topic" href="blog/${slug}/">\n        <time>${displayDate}</time><small>${escapeHtml(listLabel)}</small><strong>${escapeHtml(topicTitle)}</strong><b>↗</b>\n      </a>`;
const topicMarkup = [newTopic, ...existingTopics].slice(0, 3).map((topic) => `\n      ${topic}`).join("");
const updatedHomepage = homepage.replace(topicListPattern, `$1${topicMarkup}$3`);

const sitemap = read("sitemap.xml");
const sitemapEntry = `  <url><loc>https://seriew.com/blog/${slug}/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
const sitemapAnchor = /(<url><loc>https:\/\/seriew\.com\/blog\/<\/loc><changefreq>weekly<\/changefreq><priority>0\.8<\/priority><\/url>)/;
if (!sitemapAnchor.test(sitemap)) fail("sitemap insertion point was not found");
const updatedSitemap = sitemap.replace(sitemapAnchor, `$1\n${sitemapEntry}`);

write(articleRelativePath, articleHtml);
write("blog/index.html", updatedBlogIndex);
write("index.html", updatedHomepage);
write("sitemap.xml", updatedSitemap);

console.log(JSON.stringify({ slug, articleNumber, displayDate, articlePath: articleRelativePath }));

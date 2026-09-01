import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());
const checkOnly = process.argv.includes("--check");
const marker = "data-seriewa-structured-data";
const organizationId = "https://seriew.com/#organization";
const websiteId = "https://seriew.com/#website";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function fail(message) { throw new Error(message); }
function read(relativePath) { return fs.readFileSync(path.join(repoRoot, relativePath), "utf8"); }
function write(relativePath, content) { fs.writeFileSync(path.join(repoRoot, relativePath), content, "utf8"); }
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
  return decodeHtml(String(value).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";
}
function titleFrom(html) {
  const value = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!value) fail("title was not found");
  return plainText(value);
}
function metaContent(html, identityName, identityValue) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const match = tags.find((tag) => attribute(tag, identityName).toLowerCase() === identityValue.toLowerCase());
  return match ? decodeHtml(attribute(match, "content")) : "";
}
function canonicalFrom(html) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const match = tags.find((tag) => attribute(tag, "rel").toLowerCase() === "canonical");
  const canonical = match ? attribute(match, "href") : "";
  if (!/^https:\/\/seriew\.com\//.test(canonical)) fail(`invalid or missing canonical URL: ${canonical}`);
  return canonical;
}
function hasGitRepository() {
  return fs.existsSync(path.join(repoRoot, ".git"));
}
function gitOutput(args) {
  if (!hasGitRepository()) return "";
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function isDirty(relativePath) {
  return Boolean(gitOutput(["status", "--porcelain", "--", relativePath]));
}
function gitDates(relativePath) {
  const history = gitOutput(["log", "--follow", "--format=%aI", "--", relativePath])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    published: history.length ? history.at(-1).slice(0, 10) : today,
    modified: history.length ? history[0].slice(0, 10) : today,
  };
}
function existingArticleDates(html) {
  const match = html.match(new RegExp(`<script\\b[^>]*\\b${marker}\\b[^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  if (!match) return {};
  try {
    const data = JSON.parse(match[1]);
    const article = data["@graph"]?.find((item) => item["@type"] === "BlogPosting");
    return {
      published: /^\d{4}-\d{2}-\d{2}$/.test(article?.datePublished || "") ? article.datePublished : undefined,
      modified: /^\d{4}-\d{2}-\d{2}$/.test(article?.dateModified || "") ? article.dateModified : undefined,
    };
  } catch {
    return {};
  }
}
function organization() {
  return {
    "@type": "Organization",
    "@id": organizationId,
    name: "SERIE W",
    alternateName: "セリエワー",
    url: "https://seriew.com/",
    logo: {
      "@type": "ImageObject",
      url: "https://seriew.com/serie-w-crest.jpeg",
    },
    sameAs: [
      "https://instagram.com/seriewaa",
      "https://youtube.com/@seriewaa",
    ],
  };
}
function website() {
  return {
    "@type": "WebSite",
    "@id": websiteId,
    url: "https://seriew.com/",
    name: "SERIE W",
    alternateName: "セリエワー",
    publisher: { "@id": organizationId },
    inLanguage: "ja",
  };
}
function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}
function pageData(relativePath, html, articleDates) {
  const title = titleFrom(html);
  const description = metaContent(html, "name", "description");
  const canonical = canonicalFrom(html);

  if (relativePath === "index.html") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization(),
        website(),
        {
          "@type": "WebPage",
          "@id": "https://seriew.com/#webpage",
          url: canonical,
          name: title,
          description,
          isPartOf: { "@id": websiteId },
          about: { "@id": organizationId },
          inLanguage: "ja",
        },
      ],
    };
  }

  if (relativePath === "blog/index.html") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization(),
        website(),
        {
          "@type": "CollectionPage",
          "@id": `${canonical}#webpage`,
          url: canonical,
          name: title,
          description,
          isPartOf: { "@id": websiteId },
          about: { "@id": organizationId },
          inLanguage: "ja",
        },
        breadcrumb([
          { name: "SERIE W", item: "https://seriew.com/" },
          { name: "ブログ", item: canonical },
        ]),
      ],
    };
  }

  if (relativePath === "schedule/index.html") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization(),
        website(),
        {
          "@type": "WebPage",
          "@id": `${canonical}#webpage`,
          url: canonical,
          name: title,
          description,
          isPartOf: { "@id": websiteId },
          about: { "@id": organizationId },
          inLanguage: "ja",
        },
        breadcrumb([
          { name: "SERIE W", item: "https://seriew.com/" },
          { name: "開催日程", item: canonical },
        ]),
      ],
    };
  }

  const dates = articleDates || gitDates(relativePath);
  const image = metaContent(html, "property", "og:image") || "https://seriew.com/og.png";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${canonical}#article`,
        headline: title,
        description,
        image: [image],
        datePublished: dates.published,
        dateModified: dates.modified,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        author: { "@id": organizationId },
        publisher: { "@id": organizationId },
        inLanguage: "ja",
      },
      organization(),
      website(),
      breadcrumb([
        { name: "SERIE W", item: "https://seriew.com/" },
        { name: "ブログ", item: "https://seriew.com/blog" },
        { name: title, item: canonical },
      ]),
    ],
  };
}
function serialize(data) {
  return JSON.stringify(data, null, 2).replaceAll("<", "\\u003c");
}
function structuredBlock(data) {
  return `<script type="application/ld+json" ${marker}>\n${serialize(data)}\n</script>`;
}
function replaceStructuredData(html, block) {
  const pattern = new RegExp(`<script\\b[^>]*\\b${marker}\\b[^>]*>[\\s\\S]*?<\\/script>`, "i");
  if (pattern.test(html)) return html.replace(pattern, block);
  if (!/<\/head>/i.test(html)) fail("head closing tag was not found");
  return html.replace(/\n?<\/head>/i, `\n${block}\n</head>`);
}
function validateData(data, relativePath) {
  const serialized = serialize(data);
  const parsed = JSON.parse(serialized);
  if (parsed["@context"] !== "https://schema.org" || !Array.isArray(parsed["@graph"])) fail(`${relativePath}: invalid JSON-LD graph`);
  const types = parsed["@graph"].flatMap((item) => Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]);
  if (relativePath === "index.html" && !types.includes("Organization")) fail("homepage Organization data is missing");
  if (relativePath === "blog/index.html" && !types.includes("CollectionPage")) fail("blog CollectionPage data is missing");
  if (relativePath === "schedule/index.html" && (!types.includes("WebPage") || !types.includes("BreadcrumbList"))) fail("schedule page data is missing");
  if (relativePath.startsWith("blog/") && relativePath !== "blog/index.html" && !types.includes("BlogPosting")) fail(`${relativePath}: BlogPosting data is missing`);
}

const articlePaths = fs.readdirSync(path.join(repoRoot, "blog"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(repoRoot, "blog", entry.name, "index.html")))
  .map((entry) => `blog/${entry.name}/index.html`)
  .sort();
const paths = ["index.html", "schedule/index.html", "blog/index.html", ...articlePaths];
const changed = [];

for (const relativePath of paths) {
  const html = read(relativePath);
  const isArticle = relativePath.startsWith("blog/") && relativePath !== "blog/index.html";
  const historyDates = isArticle ? gitDates(relativePath) : null;
  const savedDates = isArticle ? existingArticleDates(html) : {};
  const articleDates = isArticle ? {
    published: savedDates.published || historyDates.published,
    modified: isDirty(relativePath) ? today : (savedDates.modified || historyDates.modified),
  } : null;
  const data = pageData(relativePath, html, articleDates);
  const updated = replaceStructuredData(html, structuredBlock(data));
  validateData(data, relativePath);

  if (updated !== html) {
    changed.push(relativePath);
    if (!checkOnly) write(relativePath, updated);
  }
}

if (checkOnly && changed.length) fail(`structured data is missing or stale: ${changed.join(", ")}`);
console.log(JSON.stringify({ checked: paths.length, articles: articlePaths.length, changed, status: checkOnly ? "valid" : "generated" }, null, 2));

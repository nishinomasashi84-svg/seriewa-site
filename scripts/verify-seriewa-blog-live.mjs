import fs from "node:fs";
import path from "node:path";

const updateResultFile = process.env.SERIEWA_UPDATE_RESULT_FILE;
const resultDir = process.env.SERIEWA_RESULT_DIR || ".seriewa/blog-results";
const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());

if (!updateResultFile) throw new Error("SERIEWA_UPDATE_RESULT_FILE is required");
const resultPath = path.resolve(updateResultFile);
if (!fs.existsSync(resultPath)) throw new Error("SERIEWA update result file was not found");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
if (!result.public_url || !result.social_image_url || !result.request_id) {
  throw new Error("SERIEWA update result file is incomplete");
}
if (!/^[A-Za-z0-9._-]+$/.test(result.request_id)) throw new Error("Invalid request_id in update result");

const attempts = Number(process.env.SERIEWA_VERIFY_ATTEMPTS || 24);
const delayMs = Number(process.env.SERIEWA_VERIFY_DELAY_MS || 10000);
let lastError = "";

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const url = new URL(result.public_url);
    url.searchParams.set("seriewa_verify", `${Date.now()}-${attempt}`);
    const response = await fetch(url, {
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "SERIE-W-Publish-Verification/1.0",
      },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const expectedBodyImages = Array.isArray(result.body_image_urls) && result.body_image_urls.length
      ? result.body_image_urls
      : result.body_image_url ? [result.body_image_url] : [];
    const bodyOk = expectedBodyImages.every((imageUrl) => html.includes(imageUrl));
    const ogOk = html.includes(`property="og:image" content="${result.social_image_url}"`) || html.includes(`content="${result.social_image_url}" property="og:image"`);
    const twitterOk = html.includes(`name="twitter:image" content="${result.social_image_url}"`) || html.includes(`content="${result.social_image_url}" name="twitter:image"`);
    if (bodyOk && ogOk && twitterOk) {
      result.status = "live_verified";
      result.verified_at = new Date().toISOString();
      const persistPath = path.join(repoRoot, resultDir, `${result.request_id}.json`);
      fs.mkdirSync(path.dirname(persistPath), { recursive: true });
      fs.writeFileSync(persistPath, JSON.stringify(result, null, 2) + "\n", "utf8");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
    lastError = `attempt ${attempt}: expected article content or image URLs were not all present yet`;
  } catch (error) {
    lastError = `attempt ${attempt}: ${error?.message || error}`;
  }

  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

throw new Error(`SERIE W live verification failed: ${lastError}`);

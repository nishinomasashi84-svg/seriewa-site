import fs from "node:fs";
import path from "node:path";
import { Blob } from "node:buffer";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
const outputFile = process.env.SERIEWA_CLOUDINARY_RESULT_FILE;
const repoRoot = path.resolve(process.env.SERIEWA_REPO_ROOT || process.cwd());
const payload = JSON.parse(process.env.SERIEWA_BLOG_PAYLOAD || "{}");

const explicitImages = Array.isArray(payload.image_sources)
  ? payload.image_sources
  : payload.image_source
    ? [payload.image_source]
    : [];
const openAIFileRefs = Array.isArray(payload.openaiFileIdRefs) ? payload.openaiFileIdRefs : [];

const rawImages = explicitImages.length
  ? explicitImages
  : openAIFileRefs.map((item, index) => {
      if (!item || typeof item !== "object" || typeof item.download_link !== "string") {
        throw new Error(`openaiFileIdRefs[${index}] did not contain a downloadable file reference`);
      }
      return {
        source: item.download_link,
        filename: item.name,
        mime_type: item.mime_type,
        alt: payload.image_alt,
        caption: payload.image_caption,
        openai_file_ref: true,
      };
    });

if (rawImages.length > 8) throw new Error("image sources must contain at most 8 images");

if (rawImages.length > 0) {
  if (!cloudName) throw new Error("CLOUDINARY_CLOUD_NAME is required");
  if (!uploadPreset) throw new Error("CLOUDINARY_UPLOAD_PRESET is required");
  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) throw new Error("Invalid Cloudinary cloud name");
  if (!/^[a-zA-Z0-9_-]+$/.test(uploadPreset)) throw new Error("Invalid Cloudinary upload preset");
}

function safeLocalPath(relativePath) {
  const absolute = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Local image path must stay inside the repository");
  }
  return absolute;
}

function mimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] || "";
}

function normalizedMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : "";
}

function extensionForMime(mime) {
  return mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
}

function decodeEmbeddedBase64(spec, index) {
  const raw = spec?.base64 || spec?.data_base64;
  if (typeof raw !== "string" || !raw.trim()) return null;

  let encoded = raw.trim();
  let mime = normalizedMime(spec.mime_type || spec.content_type);
  const dataUriMatch = encoded.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is);
  if (dataUriMatch) {
    mime = normalizedMime(dataUriMatch[1]);
    encoded = dataUriMatch[2];
  }
  if (!mime) mime = mimeFromName(spec.filename || "");
  if (!mime) throw new Error(`image_sources[${index}] requires mime_type for embedded base64 data`);

  encoded = encoded.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error(`image_sources[${index}] contains invalid base64 data`);
  }

  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error(`image_sources[${index}] decoded to an empty image`);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB workflow limit");
  const filename = spec.filename || `seriewa-blog-${index + 1}.${extensionForMime(mime)}`;
  return { bytes, contentType: mime, filename, alt: spec.alt, caption: spec.caption };
}

function validateOpenAIFileUrl(source) {
  const parsed = new URL(source);
  if (parsed.protocol !== "https:") throw new Error("ChatGPT attachment download URL must use HTTPS");
  if (parsed.hostname !== "files.oaiusercontent.com" && !parsed.hostname.endsWith(".oaiusercontent.com")) {
    throw new Error("ChatGPT attachment download URL must use an OpenAI file host");
  }
}

async function readSource(item, index) {
  const spec = typeof item === "string" ? { source: item } : item;

  const embedded = decodeEmbeddedBase64(spec, index);
  if (embedded) return embedded;

  const source = spec?.source || spec?.path || spec?.url;
  if (typeof source !== "string" || !source.trim()) {
    throw new Error(`image_sources[${index}].source or base64 is required`);
  }

  if (/^https:\/\//i.test(source)) {
    if (spec.openai_file_ref) validateOpenAIFileUrl(source);
    const declaredMime = normalizedMime(spec.mime_type || spec.content_type);
    const response = await fetch(source, { redirect: "follow" });
    if (!response.ok) throw new Error(`Could not download image ${index + 1}: HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB workflow limit");
    const responseMime = normalizedMime(response.headers.get("content-type"));
    const contentType = responseMime || declaredMime || mimeFromName(spec.filename || "");
    if (!contentType) throw new Error("Unsupported remote image type");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) throw new Error(`Image ${index + 1} downloaded as an empty file`);
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB workflow limit");
    const filename = spec.filename || `seriewa-blog-${index + 1}.${extensionForMime(contentType)}`;
    return { bytes, contentType, filename, alt: spec.alt, caption: spec.caption };
  }

  const absolute = safeLocalPath(source);
  const contentType = mimeFromName(absolute);
  if (!contentType) throw new Error("Local images must be JPEG, PNG, or WebP");
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error(`Image source is not a file: ${source}`);
  if (stat.size > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MB workflow limit");
  return {
    bytes: fs.readFileSync(absolute),
    contentType,
    filename: spec.filename || path.basename(absolute),
    alt: spec.alt,
    caption: spec.caption,
  };
}

async function uploadImage(item, index) {
  const source = await readSource(item, index);
  const form = new FormData();
  form.set("upload_preset", uploadPreset);
  form.set("file", new Blob([source.bytes], { type: source.contentType }), source.filename);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    { method: "POST", body: form },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.secure_url) {
    throw new Error(`Cloudinary upload failed for image ${index + 1}: ${body.error?.message || response.status}`);
  }

  return {
    secure_url: body.secure_url,
    public_id: body.public_id,
    width: body.width,
    height: body.height,
    format: body.format,
    bytes: body.bytes,
    alt: source.alt || payload.image_alt || payload.page_title || "",
    caption: source.caption || "",
  };
}

const images = [];
for (let index = 0; index < rawImages.length; index += 1) {
  images.push(await uploadImage(rawImages[index], index));
}

const result = { images };
const serialized = JSON.stringify(result, null, 2);
if (outputFile) {
  fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
  fs.writeFileSync(path.resolve(outputFile), serialized + "\n", "utf8");
}
console.log(serialized);

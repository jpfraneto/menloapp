export const PRESENTATION_PATH = "menloapp/app.json";
export const MAX_PRESENTATION_BYTES = 16 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function text(value, field, maximum, required = false) {
  if (typeof value !== "string" || value.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || required && !value.trim()) {
    throw new Error(`menloapp/app.json: ${field} must be ${required ? "nonempty " : ""}text of at most ${maximum} characters.`);
  }
  return value.trim();
}

export function mediaPath(value, video = false) {
  if (typeof value !== "string" || value.length > 240 || !/^menloapp\/[A-Za-z0-9_./-]+$/.test(value) || value.split("/").some(part => !part || part === "." || part === "..") || !(video ? /\.mp4$/ : /\.(png|jpe?g)$/).test(value)) {
    throw new Error(`Use a path inside menloapp/ ending in ${video ? ".mp4" : ".png or .jpg"}; URLs and parent paths are not supported.`);
  }
  return value;
}

/** Public presentation is deliberately small; build and identity are derived elsewhere. */
export function validatePresentation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) throw new Error("menloapp/app.json requires version: 1.");
  for (const key of Object.keys(value)) if (!["version", "name", "subtitle", "description", "icon", "screenshots", "preview"].includes(key)) throw new Error(`Unknown menloapp/app.json field: ${key}`);
  const name = text(value.name, "name", 100, true);
  const subtitle = text(value.subtitle ?? "", "subtitle", 160);
  const description = text(value.description ?? "", "description", 4000);
  const icon = value.icon == null ? null : mediaPath(value.icon);
  const screenshots = value.screenshots ?? [];
  if (!Array.isArray(screenshots) || screenshots.length > 3 || new Set(screenshots).size !== screenshots.length) throw new Error("Choose up to three distinct screenshots in menloapp/app.json.");
  let preview = null;
  if (value.preview != null) {
    const item = value.preview;
    if (typeof item !== "object" || Array.isArray(item) || !["simulator", "device", "screen-recording"].includes(item.kind) || Object.keys(item).some(key => !["path", "kind", "source_commit"].includes(key))) throw new Error("Preview needs a path and kind: simulator, device, or screen-recording.");
    if (item.source_commit != null && !/^[a-f0-9]{40}$/.test(item.source_commit)) throw new Error("Preview source_commit must be a full Git commit.");
    preview = { path: mediaPath(item.path, true), kind: item.kind, ...(item.source_commit ? { source_commit: item.source_commit } : {}) };
  }
  return { version: 1, name, subtitle, description, icon, screenshots: screenshots.map(item => mediaPath(item)), preview };
}

export function presentationFiles(value) {
  return [...(value.icon ? [value.icon] : []), ...value.screenshots, ...(value.preview ? [value.preview.path] : [])];
}

export function mediaType(file) {
  return file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".png") ? "image/png" : "image/jpeg";
}

export function validateMediaBytes(file, bytes) {
  const type = mediaType(file);
  const maximum = type === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!bytes.length || bytes.length > maximum) throw new Error(`${file} exceeds the ${maximum / 1024 / 1024} MiB limit or is empty.`);
  const valid = type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (!valid) throw new Error(`${file} is not a supported ${type} file. Commit the actual media bytes, not a Git LFS pointer.`);
  return type;
}

import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export const escapeHTML = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export interface SocialMetadata {
  title: string;
  description: string;
  url: string;
  image: string;
  imageType?: string;
  generated?: boolean;
}

/** Present in the initial HTML: link crawlers do not need to run JavaScript. */
export function socialMetadata(value: SocialMetadata): string {
  const title = escapeHTML(value.title);
  const description = escapeHTML(value.description);
  const url = escapeHTML(value.url);
  const image = escapeHTML(value.image);
  return `<meta property="og:type" content="website"><meta property="og:site_name" content="MENLO"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}">${value.imageType ? `<meta property="og:image:type" content="${escapeHTML(value.imageType)}">` : ""}${value.generated ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ""}<meta property="og:image:alt" content="${title} — ${description}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${image}"><meta name="twitter:image:alt" content="${title} — ${description}"><link rel="canonical" href="${url}">`;
}

const font = {
  loadSystemFonts: false,
  fontFiles: ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"].map(name => fileURLToPath(new URL(`../assets/social/${name}`, import.meta.url))),
  defaultFontFamily: "Noto Sans",
};
const svg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">${content}</svg>`;
function text(value: string, x: number, y: number, size: number, bold = false, color = "#242820") {
  return `<text x="${x}" y="${y}" font-family="Noto Sans" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${color}">${escapeHTML(value)}</text>`;
}

/** Measure with the bundled font so long names and unbroken words stay in bounds. */
function lines(value: string, width: number, size: number, maximum: number, bold = false): string[] {
  const fits = (value: string) => (new Resvg(svg(text(value, 0, 100, size, bold)), { font }).innerBBox()?.width ?? 0) <= width;
  let rest = Array.from(value.replace(/\s+/g, " ").trim());
  const result: string[] = [];
  while (rest.length && result.length < maximum) {
    if (fits(rest.join(""))) { result.push(rest.join("")); break; }
    const last = result.length === maximum - 1;
    let low = 1, high = rest.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(rest.slice(0, mid).join("") + (last ? "…" : ""))) low = mid;
      else high = mid - 1;
    }
    const space = rest.slice(0, low + 1).lastIndexOf(" ");
    const end = space > low / 2 ? space : low;
    result.push(rest.slice(0, end).join("").trimEnd() + (last ? "…" : ""));
    rest = rest.slice(end);
    while (rest[0] === " ") rest.shift();
  }
  return result;
}

// The Menlo wordmark, drawn in the night palette used by the homepage card.
const wordmark = readFileSync(fileURLToPath(new URL("../public/menlo/wordmark.svg", import.meta.url)), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "").replace(/<style>[\s\S]*?<\/style>/, "").replaceAll("#202720", "#F2F0E6");
// Placeholder tiles when an app has no icon; each name always maps to the same one.
const TILES = [["#2f6b45", "#173823"], ["#8a4a2e", "#3d2016"], ["#4d4a86", "#211f42"], ["#7a6a26", "#352d0e"]] as const;
const image = (x: number, y: number, width: number, height: number, clip: string, value: { bytes: Buffer; type: string }, fit = "xMidYMid meet") =>
  `<image x="${x}" y="${y}" width="${width}" height="${height}" clip-path="url(#${clip})" preserveAspectRatio="${fit}" xlink:href="data:${value.type};base64,${value.bytes.toString("base64")}"/>`;

export interface SocialCardInput {
  title: string;
  description: string;
  url: string;
  maker?: string;
  icon?: { bytes: Buffer; type: string };
  screenshot?: { bytes: Buffer; type: string };
}

/**
 * An app's share card: who made it, what it is, and the link that gets it.
 * The visual is the app's own screenshot when it has one, otherwise its icon.
 */
export function renderSocialCard(value: SocialCardInput): Buffer {
  if (value.icon) validateIconDimensions(value.icon.bytes, value.icon.type);
  if (value.screenshot) validateIconDimensions(value.screenshot.bytes, value.screenshot.type);
  const phone = !!value.screenshot;
  const ink = "#F2F0E6", muted = "#AAB3A4", accent = "#20F4C4";
  let hash = 0;
  for (const character of value.title) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  const [tileLight, tileDark] = TILES[hash % TILES.length]!;
  const initial = escapeHTML(Array.from(value.title.trim())[0]?.toUpperCase() || "M");

  // Left column: identity and words. Right column: the app itself.
  const columnWidth = phone ? 640 : 620;
  let y: number, iconMarkup = "";
  if (phone) {
    // Small icon above the name; the phone carries the visual.
    iconMarkup = value.icon
      ? `<rect x="80" y="130" width="112" height="112" rx="26" fill="#1B241D"/>${image(80, 130, 112, 112, "small-icon", value.icon)}<rect x="80.5" y="130.5" width="111" height="111" rx="25.5" fill="none" stroke="#F2F0E6" stroke-opacity=".14"/>`
      : `<rect x="80" y="130" width="112" height="112" rx="26" fill="url(#tile)"/><text x="136" y="208" text-anchor="middle" font-family="Noto Sans" font-size="56" font-weight="700" fill="${ink}">${initial}</text>`;
    y = 318;
  } else y = 238;
  const titleSize = 68;
  const title = lines(value.title, columnWidth, titleSize, 2, true);
  const titleMarkup = title.map((line, i) => text(line, 80, y + i * 80, titleSize, true, ink)).join("");
  y += (title.length - 1) * 80 + 62;
  const descriptionLines = Math.max(1, Math.min(3, Math.floor((450 - y) / 44) + 1));
  const description = value.description.trim() ? lines(value.description, columnWidth, 30, descriptionLines) : [];
  const descriptionMarkup = description.map((line, i) => text(line, 80, y + i * 44, 30, false, muted)).join("");

  const visual = phone
    ? `<rect x="846" y="34" width="276" height="562" rx="44" fill="#0A0E0B" stroke="#334336" stroke-width="2"/>${image(858, 46, 252, 538, "screen", value.screenshot!, "xMidYMid slice")}`
    : value.icon
      ? `<rect x="800" y="115" width="300" height="300" rx="67" fill="#1B241D"/>${image(800, 115, 300, 300, "big-icon", value.icon)}<rect x="801" y="116" width="298" height="298" rx="66" fill="none" stroke="#F2F0E6" stroke-opacity=".14" stroke-width="2"/>`
      : `<rect x="800" y="115" width="300" height="300" rx="67" fill="url(#tile)"/><text x="950" y="322" text-anchor="middle" font-family="Noto Sans" font-size="168" font-weight="700" fill="${ink}">${initial}</text>`;

  const ruleEnd = phone ? 790 : 1120;
  const address = value.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const addressLine = lines(address, phone ? 440 : 620, 28, 1, true)[0] ?? "";
  const maker = value.maker ? lines(`by @${value.maker}`, phone ? 250 : 380, 24, 1)[0] ?? "" : "";
  const footer = `<path d="M80 500H${ruleEnd}" stroke="#334336" stroke-width="2"/>${text(addressLine, 80, 556, 28, true, ink)}${maker ? `<text x="${ruleEnd}" y="555" text-anchor="end" font-family="Noto Sans" font-size="24" fill="${muted}">${escapeHTML(maker)}</text>` : ""}`;

  return new Resvg(svg(`<defs>
<radialGradient id="glow"><stop stop-color="#26573B" stop-opacity=".75"/><stop offset="1" stop-color="#101612" stop-opacity="0"/></radialGradient>
<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${tileLight}"/><stop offset="1" stop-color="${tileDark}"/></linearGradient>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#F2F0E6" opacity=".09"/></pattern>
<clipPath id="small-icon"><rect x="80" y="130" width="112" height="112" rx="26"/></clipPath>
<clipPath id="big-icon"><rect x="800" y="115" width="300" height="300" rx="67"/></clipPath>
<clipPath id="screen"><rect x="858" y="46" width="252" height="538" rx="34"/></clipPath>
</defs>
<rect width="1200" height="630" fill="#101612"/>
<ellipse cx="${phone ? 984 : 950}" cy="${phone ? 300 : 265}" rx="420" ry="380" fill="url(#glow)"/>
<rect width="1200" height="630" fill="url(#dots)"/>
<g transform="translate(80 66) scale(.04)">${wordmark}</g>
<text x="${80 + 3140 * 0.04 + 18}" y="91" font-family="Noto Sans" font-size="22" fill="${accent}">Bypass the AppStore.</text>
${iconMarkup}${titleMarkup}${descriptionMarkup}${visual}${footer}`), { font }).render().asPng();
}

// Bound decoded pixels as well as download bytes before handing an icon to the renderer.
function validateIconDimensions(bytes: Buffer, type: string) {
  let width = 0, height = 0;
  if (type === "image/png" && bytes.length >= 24 && bytes.toString("ascii", 12, 16) === "IHDR") {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xda || marker === 0xd9) break;
      const size = bytes.readUInt16BE(offset + 2);
      if (size < 2 || offset + 2 + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
        height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); break;
      }
      offset += 2 + size;
    }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_777_216) throw new Error("Share-card icons must be valid PNG/JPEG images of at most 16 megapixels");
}

// Bounded, process-local cache; keys include the exact app content and card revision.
const cards = new Map<string, Promise<Buffer>>();
export async function socialCardResponse(request: Request, key: string, render: () => Promise<Buffer>): Promise<Response> {
  let value = cards.get(key);
  if (!value) {
    if (cards.size >= 32) cards.delete(cards.keys().next().value!);
    value = render();
    cards.set(key, value);
    value.catch(() => { if (cards.get(key) === value) cards.delete(key); });
  }
  const bytes = await value;
  const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
  const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", "ETag": etag, "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Length": String(bytes.length) } });
}

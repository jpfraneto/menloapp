import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

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

export function renderSocialCard(value: { title: string; description: string; url: string; icon?: { bytes: Buffer; type: string } }): Buffer {
  if (value.icon) validateIconDimensions(value.icon.bytes, value.icon.type);
  const title = lines(value.title, 860, 58, 2, true);
  const description = lines(value.description, 1040, 34, 3);
  const address = lines(value.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), 1040, 30, 1)[0] ?? "";
  const icon = value.icon
    ? `<image x="80" y="80" width="132" height="132" clip-path="url(#icon)" preserveAspectRatio="xMidYMid meet" xlink:href="data:${value.icon.type};base64,${value.icon.bytes.toString("base64")}"/>`
    : `<rect x="80" y="80" width="132" height="132" rx="28" fill="#e1e8d8"/>${text(Array.from(value.title)[0]?.toUpperCase() || "M", 116, 167, 64, true, "#315b3b")}`;
  return new Resvg(svg(`<defs><clipPath id="icon"><rect x="80" y="80" width="132" height="132" rx="28"/></clipPath></defs><rect width="1200" height="630" fill="#f6f3ea"/>${icon}${title.map((line, i) => text(line, 252, title.length === 1 ? 165 : 132 + i * 76, 58, true)).join("")}${description.map((line, i) => text(line, 80, 316 + i * 50, 34, false, "#616457")).join("")}<path d="M80 498H1120" stroke="#d6d5c9" stroke-width="2"/>${text(address, 80, 561, 30, false, "#315b3b")}`), { font }).render().asPng();
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

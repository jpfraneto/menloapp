import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Render the share artwork from Menlo's canonical identity and bundled fonts.
// Run from the repository root: bun website/apps/site/scripts/render-menlo-og.ts
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const artwork = (relative: string) => readFileSync(path(relative), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")
  .replace(/<style>[\s\S]*?<\/style>/, "").replaceAll('#202720', '#F2F0E6');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <radialGradient id="light"><stop stop-color="#26573b" stop-opacity=".6"/><stop offset="1" stop-color="#101612" stop-opacity="0"/></radialGradient>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#f2f0e6" opacity=".10"/></pattern>
</defs>
<rect width="1200" height="630" fill="#101612"/>
<ellipse cx="960" cy="270" rx="480" ry="430" fill="url(#light)"/>
<rect width="1200" height="630" fill="url(#dots)"/>
<g transform="translate(72 74) scale(.072)">${artwork("../../../../brand/menlo/wordmark.svg")}</g>
<g fill="none" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
  <path d="M800 -40V112L864 176H1100L1164 112H1240" stroke="#38a148"/>
  <path d="M1260 368H1136L1056 448H880L816 512V690" stroke="#d8b955"/>
  <path d="M952 -40V64L1024 136V344L944 424V690" stroke="#cb714b"/>
  <path d="M1260 256H1144L1072 328H784" stroke="#9a8dbd"/>
</g>
<g fill="#101612" stroke="#f2f0e6" stroke-width="5">
  <rect x="786" y="98" width="28" height="28" rx="8"/>
  <rect x="930" y="410" width="28" height="28" rx="8"/>
  <rect x="1122" y="354" width="28" height="28" rx="8"/>
</g>
<rect x="750" y="170" width="342" height="318" rx="48" fill="#121c15" stroke="#334336"/>
<g transform="translate(782 315) scale(.30)">${artwork("../../../../brand/menlo/mark.svg")}</g>
<text x="72" y="248" font-family="MenloApp" font-size="76" font-weight="700" fill="#f2f0e6">SOFTWARE IS</text>
<text x="72" y="342" font-family="MenloApp" font-size="76" font-weight="700" fill="#f2f0e6">INFINITE.</text>
<text x="72" y="408" font-family="MenloApp" font-size="36" font-weight="700" fill="#20f4c4">Menlo gives it rails.</text>
<path d="M72 502H1128" stroke="#334336"/>
<text x="72" y="558" font-family="Noto Sans" font-size="22" font-weight="700" letter-spacing="2" fill="#f2f0e6">OPEN SOURCE. DIRECT TO IPHONE.</text>
<text x="1128" y="558" text-anchor="end" font-family="Noto Sans" font-size="22" fill="#aab3a4">menloapp.lol</text>
</svg>`;

const bytes = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: [
  path("../../../../macos/Tohseno/Sources/TohsenoMacCore/Resources/MenloApp-Bold.ttf"),
  path("../assets/social/NotoSans-Bold.ttf"),
  path("../assets/social/NotoSans-Regular.ttf"),
] } }).render().asPng();
writeFileSync(path("../public/menlo/og.png"), bytes);
console.log(`Rendered Menlo share card: 1200 × 630, ${bytes.length} bytes`);

import { escapeHTML as escape } from "./social-cards.ts";
import { macDownload } from "./menlo-shell.ts";

export const homeTitle = "Bypass the AppStore.";
export const homeDescription = "Discover and share open-source iPhone apps. Publish from GitHub, send a link, and build on your own Mac with your own Apple identity.";

// The map is a fixed drawing. Stations are filled, most recent first, only
// with apps that are really in the directory; the rest stay visibly open.
const RAILS = [
  ["a", "M-20 160H200L280 240H520L600 160H820"],
  ["b", "M120 -20V360L200 440H560L640 520V660"],
  ["c", "M-20 600H240L400 440V80L440 40H820"],
  ["d", "M640 160V380L700 440H820"],
] as const;
const STATIONS = [
  { x: 400, y: 240, lx: 424, ly: 284, anchor: "start" },
  { x: 120, y: 160, lx: 144, ly: 130, anchor: "start" },
  { x: 400, y: 440, lx: 376, ly: 416, anchor: "end" },
  { x: 640, y: 160, lx: 640, ly: 122, anchor: "middle" },
  { x: 640, y: 340, lx: 614, ly: 348, anchor: "end" },
  { x: 120, y: 320, lx: 146, ly: 328, anchor: "start" },
  { x: 640, y: 560, lx: 614, ly: 568, anchor: "end" },
  { x: 600, y: 40, lx: 600, ly: 88, anchor: "middle" },
  { x: 120, y: 600, lx: 120, ly: 566, anchor: "middle" },
] as const;

function stationName(name: string): string {
  const characters = Array.from(name.trim());
  return characters.length > 15 ? `${characters.slice(0, 14).join("").trimEnd()}…` : characters.join("");
}

function railMap(apps: { slug: string; name: string }[]): string {
  const glyph = (x: number, y: number) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="8"/>`;
  const stations = STATIONS.map((slot, index) => {
    const app = apps[index];
    const label = (text: string) => `<text x="${slot.lx}" y="${slot.ly}" text-anchor="${slot.anchor}">${escape(text)}</text>`;
    if (app) return `<a class="ml-station" href="/${app.slug}">${glyph(slot.x, slot.y)}${label(stationName(app.name))}</a>`;
    if (index === apps.length) return `<a class="ml-station ml-station-yours" href="#deploy" data-open-sheet="deploy">${glyph(slot.x, slot.y)}${label("+ your app")}</a>`;
    return `<g class="ml-station ml-station-open" aria-hidden="true">${glyph(slot.x, slot.y)}</g>`;
  }).join("");
  const count = Math.min(apps.length, STATIONS.length);
  return `<figure class="ml-map"><svg class="ml-rails" viewBox="0 0 800 640" aria-labelledby="rail-map-title"><title id="rail-map-title">Map of apps on the Menlo network</title>${RAILS.map(([line, d]) => `<path class="ml-rail ml-rail-${line}" d="${d}" pathLength="1000"/><path class="ml-rail-pulse ml-rail-pulse-${line}" d="${d}" pathLength="1000" aria-hidden="true"/>`).join("")}${stations}</svg><figcaption>${apps.length === 0 ? "No apps on the network yet." : `${apps.length} ${apps.length === 1 ? "app" : "apps"} on the network${apps.length > count ? `, ${count} shown` : ""}.`} Open stations are waiting.</figcaption></figure>`;
}

export function landingHero(apps: { slug: string; name: string }[]): string {
  return `<section class="ml-hero" aria-labelledby="hero-title"><div class="ml-container ml-hero-grid"><div class="ml-hero-copy"><p class="ml-eyebrow">The open-source iPhone app network</p><h1 id="hero-title">SOFTWARE IS INFINITE.</h1><p class="ml-hero-rails">Menlo gives it rails.</p><p class="ml-hero-lede">Ship a native iPhone app from your GitHub repository straight to another person. No store, no review queue, no one to ask. They read the source, build it on their own Mac, and run it on their iPhone.</p><div class="ml-term"><span class="ml-term-prompt" aria-hidden="true">$</span><code id="hero-commands">npm i -g menloapp &amp;&amp; menloapp deploy</code><button class="ml-term-copy" type="button" data-copy="hero-commands">Copy</button><div class="ml-copy-status" role="status" aria-live="polite"></div></div><div class="ml-hero-actions">${macDownload("hero-download-detail")}<a class="ml-hero-explore" href="#apps">Explore the network <span aria-hidden="true">↓</span></a></div></div>${railMap(apps)}</div><ul class="ml-container ml-facts" aria-label="How Menlo distributes an app"><li>Public source on GitHub</li><li>One exact commit per link</li><li>Built on their Mac</li><li>Signed with their Apple identity</li><li>Updates by choice</li></ul></section>`;
}

export function landingDirectoryHeading(): string {
  return `<header class="ml-section-heading"><p class="ml-eyebrow">On the network now</p><h2>Open a link. Read the source. Run it.</h2><p>Every app here is a public repository you can read before you build it.</p></header>`;
}

export function landingStory(): string {
  return `<section class="ml-section" aria-labelledby="line-title"><div class="ml-container"><header class="ml-section-heading"><p class="ml-eyebrow">How an app travels</p><h2 id="line-title">Four stops. No gatekeeper.</h2></header><ol class="ml-line">
<li><span class="ml-line-stop">01 · Build</span><h3>Make the thing.</h3><p>Describe the app you want. A coding agent on your Mac writes it, Xcode builds it, and it lands on your iPhone. Or bring an Xcode project you already have.</p></li>
<li><span class="ml-line-stop">02 · Push</span><h3>Put the source in the open.</h3><p>Commit it to a public GitHub repository. That repository is the app’s identity: your account, your source, readable by anyone.</p></li>
<li><span class="ml-line-stop">03 · Deploy</span><h3>Get a link.</h3><p>Run <code>menloapp deploy</code>. Menlo checks that you can push to the repository and returns a link to the exact commit.</p></li>
<li><span class="ml-line-stop">04 · Hand off</span><h3>They run it.</h3><p>They open the link, read the source, and approve a build on their own Mac. It is signed with their Apple identity and installed on their iPhone.</p></li>
</ol><p class="ml-line-loop">Then you push a change, and they choose whether to take it.</p></div></section>
<section class="ml-section ml-section-paper" aria-labelledby="principles-title"><div class="ml-container"><header class="ml-section-heading"><p class="ml-eyebrow">What the rails are made of</p><h2 id="principles-title">Software belongs to its builders.</h2></header><div class="ml-principles">
<article><h3>The repository is the app.</h3><p>There is no binary to upload and no listing that floats free of its source. What a person builds is what is in the repository.</p></article>
<article><h3>A link is one exact version.</h3><p>Every version link pins a full commit. Nothing changes underneath the person you sent it to.</p></article>
<article><h3>Nobody signs for them.</h3><p>The recipient’s Mac builds the app and their Apple identity signs it. Menlo never signs or ships a binary on their behalf.</p></article>
<article><h3>Updates are an offer.</h3><p>Push to GitHub and a newer version becomes available. They decide whether and when to install it.</p></article>
</div><aside class="ml-honest"><h3>What a Menlo link does not tell you</h3><p>It tells you who published an app, which repository it comes from, and the exact commit. It does not tell you the app is safe. That judgment stays with the person who reads the source and chooses to build.</p></aside></div></section>`;
}

export function landingCloser(): string {
  return `<section class="ml-closer" aria-labelledby="closer-title"><div class="ml-container"><h2 id="closer-title">Build something. Share it with someone. They can run it.</h2><div class="ml-closer-actions"><a class="ml-button" href="#deploy" data-open-sheet="deploy">Put your app on the network</a><a class="ml-button ml-button-secondary" href="/docs">Read the docs</a></div></div></section>`;
}

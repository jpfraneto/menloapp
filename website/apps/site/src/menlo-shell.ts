import { escapeHTML as escape, socialMetadata, type SocialMetadata } from "./social-cards.ts";

const closeIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>`;
const macIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20M9 16l-1 4m7-4 1 4"/></svg>`;
const downloadIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg>`;

export const discoveryDescription = "Bypass the app stores. Get real people using your apps, honest feedback, and a better shot at winning.";
export function macDownload(id: string): string {
  return `<div class="ml-mac-download"><a class="ml-button ml-download-button" href="/download/macos" aria-describedby="${id}">${macIcon}<span>Download for Mac</span>${downloadIcon}</a><span class="ml-download-detail" id="${id}">Release candidate · macOS 14+</span></div>`;
}

export function discoveryHeading(): string {
  return `<div class="ml-discovery-heading"><h1>BYPASS THE APP STORES.</h1><p>Get real people using your apps.<br>Get honest feedback. Build something that wins.</p>${macDownload("hero-download-detail")}</div>`;
}

export function commandBlock(id: string, command: string, label = "Copy commands"): string {
  return `<div class="ml-command"><pre><code id="${id}">${escape(command)}</code></pre><button class="ml-button ml-button-secondary" type="button" data-copy="${id}">${label}</button><div class="ml-copy-status" role="status" aria-live="polite"></div></div>`;
}

export function sheet(id: string, label: string, title: string, content: string, trigger = "ml-button ml-button-secondary"): string {
  return `<details class="ml-sheet" id="${id}" data-sheet><summary class="${trigger}">${label}</summary><section class="ml-sheet-panel" aria-labelledby="${id}-title"><div class="ml-sheet-heading"><h2 id="${id}-title" tabindex="-1">${escape(title)}</h2><button type="button" class="ml-close" data-close-sheet aria-label="Close" hidden>${closeIcon}</button></div>${content}</section></details>`;
}

const SOURCE_URL = "https://github.com/jpfraneto/menloapp";

export function menloPage(title: string, description: string, url: string, body: string, social?: SocialMetadata): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>${escape(title)} — Menlo</title><meta name="description" content="${escape(description)}">${social ? socialMetadata(social) : `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escape(url)}">`}<link rel="icon" href="/menlo/favicon.svg?v=2"><link rel="preload" href="/fonts/MenloApp-Bold.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/menlo/tokens.css?v=2"><link rel="stylesheet" href="/menlo/home.css?v=14"><script src="/menlo/home.js?v=5" defer></script></head><body class="menlo-landing ml-store"><a class="ml-skip" href="#main">Skip to content</a><header class="ml-container ml-header"><a class="ml-wordmark" href="/" aria-label="Menlo home"><img src="/menlo/wordmark.svg" width="148" height="41" alt="Menlo"></a><nav aria-label="Primary"><a href="/docs">Docs</a><a href="${SOURCE_URL}" rel="noreferrer">GitHub</a><a class="ml-nav-llms" href="/llms.txt">llms.txt</a></nav></header>${body}<footer class="ml-container ml-footer"><p class="ml-brand-statement">Software belongs to its builders.</p><nav class="ml-footer-links" aria-label="Footer"><a href="/docs">Docs</a><a href="${SOURCE_URL}" rel="noreferrer">GitHub</a><a href="/download/macos">Download for Mac</a><a href="/privacy">Privacy</a></nav></footer></body></html>`;
}

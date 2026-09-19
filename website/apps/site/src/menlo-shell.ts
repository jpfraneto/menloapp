import { escapeHTML as escape, socialMetadata, type SocialMetadata } from "./social-cards.ts";

const closeIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>`;

export function commandBlock(id: string, command: string, label = "Copy commands"): string {
  return `<div class="ml-command"><pre><code id="${id}">${escape(command)}</code></pre><button class="ml-button ml-button-secondary" type="button" data-copy="${id}">${label}</button><div class="ml-copy-status" role="status" aria-live="polite"></div></div>`;
}

export function sheet(id: string, label: string, title: string, content: string, primary = false): string {
  return `<details class="ml-sheet" id="${id}" data-sheet><summary class="ml-button ${primary ? "ml-get-button" : "ml-button-secondary"}">${label}</summary><section class="ml-sheet-panel" aria-labelledby="${id}-title"><div class="ml-sheet-heading"><h2 id="${id}-title" tabindex="-1">${escape(title)}</h2><button type="button" class="ml-close" data-close-sheet aria-label="Close" hidden>${closeIcon}</button></div>${content}</section></details>`;
}

function sharing(): string {
  return sheet("deploy", "Share your app", "Share your app.", `<p>Turn your public GitHub app into a link.</p><ol><li>Open Terminal in your app’s project folder.</li><li>Install Menlo, then publish your app.${commandBlock("share-commands", "npm i -g menloapp\nmenloapp deploy")}</li><li>Share the link Menlo returns.</li></ol><p class="ml-muted">Your app’s source must be in a public GitHub repository. The command publishes your app’s listing and any preview it generates.</p>`);
}

export function menloPage(title: string, description: string, url: string, body: string, social?: SocialMetadata): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} — Menlo</title><meta name="description" content="${escape(description)}">${social ? socialMetadata(social) : `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escape(url)}">`}<link rel="icon" href="/menlo/favicon.svg?v=2"><link rel="preload" href="/fonts/MenloApp-Bold.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/menlo/tokens.css?v=2"><link rel="stylesheet" href="/menlo/home.css?v=7"><script src="/menlo/home.js?v=2" defer></script></head><body class="menlo-landing ml-store"><a class="ml-skip" href="#main">Skip to content</a><header class="ml-container ml-header"><a class="ml-wordmark" href="/" aria-label="Menlo home"><img src="/menlo/wordmark.svg" width="148" height="41" alt="Menlo"></a><nav aria-label="Primary"><a href="/apps"${title === "Discover apps" ? ' aria-current="page"' : ""}>Discover</a>${sharing()}</nav></header>${body}<footer class="ml-container ml-footer"><p class="ml-brand-statement">Personal computing, person to person.</p><a href="/download/macos">Menlo for Mac · Release candidate</a></footer></body></html>`;
}

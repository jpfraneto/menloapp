import type { GitHubApp } from "./github-apps.ts";
import { socialMetadata, type SocialMetadata } from "./social-cards.ts";
import { mediaType } from "../../../../packages/cli/src/presentation.js";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export interface AppListing extends GitHubApp {
  subtitle: string;
  website: string | null;
  tokenAddress: string | null;
  head_commit: string;
  open_url: string;
  presentation: {
    icon: string | null;
    ogImage: string | null;
    screenshots: string[];
    preview: { path: string; kind: string; source_commit?: string } | null;
  } | null;
}
export interface AppActivity {
  id: string;
  kind: "published";
  occurred_at: string;
  app: GitHubApp;
  actor: { id: number; login: string } | null;
}
export interface AppDirectory {
  apps: (GitHubApp & { listing?: AppListing })[];
  events: AppActivity[];
  listings_unavailable: boolean;
}
const githubMark = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 .1 1.49 2.35 3.28 1.25.1-.72.4-1.22.71-1.5-2.51-.28-5.15-1.25-5.15-5.58 0-1.24.44-2.25 1.16-3.04-.12-.28-.5-1.44.11-3 0 0 .95-.3 3.08 1.16a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.16 3.08-1.16.62 1.56.23 2.72.12 3 .72.79 1.15 1.8 1.15 3.04 0 4.34-2.65 5.3-5.17 5.58.41.35.77 1.03.77 2.08v3.78c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>`;
function avatar(actor: { id: number; login: string }) {
  return `<img class="ml-avatar" src="https://avatars.githubusercontent.com/u/${actor.id}?s=80&amp;v=4" width="28" height="28" alt="" loading="lazy">`;
}
function asset(baseUrl: string, app: GitHubApp, commit: string, path: string) {
  return escape(`${baseUrl}/api/menlo/v1/apps/${app.slug}/media/${commit}/${path}`);
}
function icon(baseUrl: string, record: GitHubApp, app?: AppListing) {
  const name = app?.name ?? record.name;
  return app?.presentation?.icon
    ? `<img class="ml-app-icon" src="${asset(baseUrl, record, app.head_commit, app.presentation.icon)}" width="128" height="128" alt="${escape(name)} app icon">`
    : `<span class="ml-app-icon ml-icon-placeholder" role="img" aria-label="${escape(name)} app icon placeholder">${escape(Array.from(name.trim())[0]?.toUpperCase() || "M")}</span>`;
}
function header() {
  return `<a class="ml-skip" href="#main">Skip to content</a><header class="ml-container ml-header"><a class="ml-wordmark" href="/" aria-label="Menlo home">menlo</a><nav aria-label="Primary"><a class="ml-button ml-discover-button" href="/apps">DISCOVER OTHER APPS <span aria-hidden="true">↗</span></a></nav></header>`;
}
function getApp(app: AppListing) {
  return `<details class="ml-install-options"><summary class="ml-button ml-get-button">Get app</summary><section class="ml-install-panel" aria-label="Install ${escape(app.name)}"><h2>Get ${escape(app.name)} on your iPhone</h2><p>MENLO uses your Mac and Xcode to prepare the app for your connected iPhone.</p><a class="ml-button ml-open-app" href="${escape(app.open_url)}">Open MENLO</a><p class="ml-install-help">Nothing opened? <a href="/download/macos">Install or update MENLO for Mac</a>, open it from Applications, then try again.</p><details class="ml-terminal-option"><summary>Use Terminal instead</summary><p>With the npm command installed, run:</p><pre><code>menloapp try https://menloapp.lol/${app.slug}</code></pre><p>Need the command? <code>npm i -g menloapp</code></p></details></section></details><span class="ml-get-help">Requires a Mac and Xcode</span>`;
}
function page(title: string, description: string, url: string, body: string, social?: SocialMetadata) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — MENLO</title><meta name="description" content="${escape(description)}">${social ? socialMetadata(social) : `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escape(url)}">`}<link rel="icon" href="/menlo/favicon.svg?v=1"><link rel="stylesheet" href="/menlo/tokens.css?v=1"><link rel="stylesheet" href="/menlo/home.css?v=6"></head><body class="menlo-landing ml-store">${header()}${body}</body></html>`;
}
export function renderAppListing(baseUrl: string, record: GitHubApp, app?: AppListing) {
  const name = app?.name ?? record.name;
  const description = app?.description ?? record.description;
  const media = app?.presentation;
  const creator = record.publisher;
  const profile = `https://github.com/${encodeURIComponent(creator.login)}`;
  const repository = `https://github.com/${record.repository}`;
  const previewLabel = media?.preview?.kind === "simulator" ? "Simulator preview" : media?.preview?.kind === "device" ? "Device preview · by the maker" : "Screen recording · by the maker";
  const preview = media?.preview ? `<li class="ml-gallery-item ml-gallery-preview"><video controls playsinline preload="metadata" aria-label="${escape(name)} recorded preview"${media.screenshots[0] ? ` poster="${asset(baseUrl, record, app!.head_commit, media.screenshots[0])}"` : ""}><source src="${asset(baseUrl, record, app!.head_commit, media.preview.path)}" type="video/mp4">Your browser cannot play this recording.</video><p class="ml-media-caption">${media.preview.source_commit ? `<a href="${escape(repository)}/commit/${media.preview.source_commit}" title="View the source used for this recording">${previewLabel}</a>` : previewLabel}</p></li>` : "";
  const screenshots = media?.screenshots.map((file, index) => `<li class="ml-gallery-item"><img src="${asset(baseUrl, record, app!.head_commit, file)}" alt="${escape(name)} screenshot ${index + 1}" loading="lazy" width="300" height="650"></li>`).join("") ?? "";
  return page(`${name} by ${creator.login}`, description, `${baseUrl}/${record.slug}`, `<main id="main" class="ml-container ml-listing">
<section class="ml-app-heading" aria-label="App details">${icon(baseUrl, record, app)}<div class="ml-app-identity"><h1>${escape(name)}</h1>${app?.subtitle ? `<p class="ml-app-subtitle">${escape(app.subtitle)}</p>` : ""}<div class="ml-creator"><a class="ml-creator-profile" href="${profile}">${avatar(creator)}<span>@${escape(creator.login)}</span></a><span class="ml-creator-divider" aria-hidden="true"></span><a class="ml-github-link" href="${escape(repository)}">${githubMark} GitHub <span aria-hidden="true">↗</span></a></div></div><div class="ml-get-app">${app ? getApp(app) : `<p class="ml-unavailable" role="status">Installation is paused while this app’s source is unavailable.</p>`}</div></section>
${preview || screenshots ? `<section class="ml-media-section" aria-label="App preview and screenshots"><ul class="ml-gallery" aria-label="Preview gallery" tabindex="0">${preview}${screenshots}</ul></section>` : ""}
${description ? `<section class="ml-description" aria-label="App description"><h2>About this app</h2><p>${escape(description)}</p></section>` : ""}
${app?.website || app?.tokenAddress ? `<div class="ml-app-links">${app.website ? `<a href="${escape(app.website)}" rel="noopener noreferrer">Website ↗</a>` : ""}${app.tokenAddress ? `<span>Token <code>${escape(app.tokenAddress)}</code></span>` : ""}</div>` : ""}
</main>`, { title: name, description, url: `${baseUrl}/${record.slug}`,
    image: media?.ogImage ? `${baseUrl}/api/menlo/v1/apps/${record.slug}/media/${app!.head_commit}/${media.ogImage}` : `${baseUrl}/api/menlo/v1/apps/${record.slug}/og.png?v=1${app ? `&commit=${app.head_commit}` : ""}`,
    imageType: media?.ogImage ? mediaType(media.ogImage) : "image/png", generated: !media?.ogImage });
}
export function renderAppDirectory(baseUrl: string, directory: AppDirectory) {
  const appCard = (record: AppDirectory["apps"][number]) => {
    const app = record.listing;
    return `<a class="ml-app ml-discover-app" href="/${record.slug}">${icon(baseUrl, record, app)}<h2>${escape(app?.name ?? record.name)}</h2><p>${escape(app?.subtitle || app?.description || record.description)}</p><span class="ml-author">By @${escape(record.publisher.login)}</span><span class="ml-discover-action">View app ↗</span></a>`;
  };
  return page("Discover apps", "Find your next favorite iPhone app, made by independent makers on MENLO.", baseUrl, `<main id="main" class="ml-container ml-discovery"><div class="ml-discovery-heading"><div><h1>Discover apps.</h1><p>Meet your next favorite.</p></div><details class="ml-deploy-instructions" id="deploy"><summary>Share your app ↗</summary><pre class="ml-code">npm i -g menloapp
menloapp deploy</pre><p>Run in your app’s public GitHub repository. Share the link.</p></details></div><section aria-label="Discover apps">${directory.listings_unavailable ? `<p class="ml-feed-notice" role="status">Some app details are temporarily unavailable.</p>` : ""}<div class="ml-app-grid">${directory.apps.length ? directory.apps.map(appCard).join("") : `<div class="ml-empty"><h2>Your next favorite is on its way.</h2><p>The first apps will appear here.</p><a class="ml-button" href="/#deploy">Share the first app</a></div>`}</div></section></main>`);
}

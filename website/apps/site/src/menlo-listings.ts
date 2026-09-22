import type { GitHubApp } from "./github-apps.ts";
import { commandBlock, discoveryDescription, discoveryHeading, menloPage, sheet } from "./menlo-shell.ts";
import { menloInterview } from "./menlo-interview.ts";
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
function getApp(baseUrl: string, app: AppListing) {
  const url = `${baseUrl}/${app.slug}`;
  return sheet("get-app", "Get app", `Get ${app.name} on your iPhone`, `
<div data-device="mac"><p>Menlo uses your Mac and Xcode to build this app for your intended iPhone.</p><p class="ml-muted">You’ll need Xcode, an Apple Account for signing, and your iPhone. Menlo asks you to review the source before building.</p><div class="ml-sheet-actions"><a class="ml-button ml-open-app" href="${escape(app.open_url)}">Open in Menlo</a><a class="ml-button ml-button-secondary" href="/download/macos">Set up Menlo</a></div><p class="ml-small">Menlo for Mac is a release candidate. First time? Install it, open it from Applications, then return here and choose Open in Menlo.</p></div>
<div data-device="other" hidden><p><strong>Continue on your Mac.</strong></p><p>Installing ${escape(app.name)} requires a Mac, Xcode, an Apple Account, and your iPhone. Copy this link and open it on your Mac to continue.</p></div>
<label class="ml-small" for="app-link">App link</label><input class="ml-link-field" id="app-link" value="${escape(url)}" readonly><button class="ml-button ml-button-secondary" type="button" data-copy="app-link">Copy app link</button><div class="ml-copy-status" role="status" aria-live="polite"></div>
<details class="ml-terminal-option" data-device="mac"><summary>Use Terminal instead</summary><p>With the Menlo command installed, run:</p>${commandBlock("try-command", `menloapp try ${url}`, "Copy command")}<p>Need the command? <code>npm i -g menloapp</code></p></details>`, true) + `<span class="ml-get-help">Requires a Mac, Xcode, and your iPhone</span>`;
}
export function renderAppListing(baseUrl: string, record: GitHubApp, app?: AppListing) {
  const name = app?.name ?? record.name;
  const description = app?.description ?? record.description;
  const media = app?.presentation;
  const creator = record.publisher;
  const profile = `https://github.com/${encodeURIComponent(creator.login)}`;
  const repository = `https://github.com/${record.repository}`;
  const previewLabel = media?.preview?.kind === "simulator" ? "Simulator preview" : media?.preview?.kind === "device" ? "Device preview · by the maker" : "Screen recording · by the maker";
  const preview = media?.preview ? `<figure class="ml-gallery-primary"><video controls playsinline preload="metadata" aria-label="${escape(name)} recorded preview"${media.screenshots[0] ? ` poster="${asset(baseUrl, record, app!.head_commit, media.screenshots[0])}"` : ""}><source src="${asset(baseUrl, record, app!.head_commit, media.preview.path)}" type="video/mp4">Your browser cannot play this recording.</video><figcaption class="ml-media-caption">${media.preview.source_commit ? `<a href="${escape(repository)}/commit/${media.preview.source_commit}" title="View the source used for this recording">${previewLabel}</a>` : previewLabel}</figcaption></figure>` : "";
  const images = media?.screenshots ?? [];
  const screenshot = !preview && images[0] ? `<figure class="ml-gallery-primary"><img src="${asset(baseUrl, record, app!.head_commit, images[0])}" alt="${escape(name)} screenshot 1" width="300" height="650"><figcaption class="ml-media-caption">Screenshot by the maker</figcaption></figure>` : "";
  const thumbnails = images.map((file, index) => !preview && index === 0 ? "" : `<li><a href="${asset(baseUrl, record, app!.head_commit, file)}" data-preview-image aria-label="Enlarge ${escape(name)} screenshot ${index + 1}"><img src="${asset(baseUrl, record, app!.head_commit, file)}" alt="${escape(name)} screenshot ${index + 1}" loading="lazy" width="64" height="138"></a></li>`).join("");
  return menloPage(`${name} by ${creator.login}`, description, `${baseUrl}/${record.slug}`, `<main id="main" class="ml-container ml-listing">
<section class="ml-app-heading" aria-label="App details">${icon(baseUrl, record, app)}<div class="ml-app-identity"><h1>${escape(name)}</h1>${app?.subtitle ? `<p class="ml-app-subtitle">${escape(app.subtitle)}</p>` : ""}<div class="ml-creator"><a class="ml-creator-profile" href="${profile}">${avatar(creator)}<span>@${escape(creator.login)}</span></a><span class="ml-creator-divider" aria-hidden="true"></span><a class="ml-github-link" href="${escape(repository)}">${githubMark} GitHub <span aria-hidden="true">↗</span></a></div></div><div class="ml-get-app">${app ? getApp(baseUrl, app) : `<p class="ml-unavailable" role="status">Installation is paused while this app’s source is unavailable.</p>`}</div></section>
${preview || screenshot ? `<section class="ml-media-section" aria-label="App preview and screenshots"><div class="ml-gallery">${preview || screenshot}${thumbnails ? `<ul class="ml-thumbnails" aria-label="More screenshots">${thumbnails}</ul>` : ""}</div></section>` : `<p class="ml-preview-missing">${app ? "The maker hasn’t shared a preview yet." : "The preview is temporarily unavailable."}</p>`}
${description ? `<section class="ml-description" aria-label="App description"><h2>About this app</h2><p>${escape(description)}</p></section>` : ""}
${app?.website || app?.tokenAddress ? `<div class="ml-app-links">${app.website ? `<a href="${escape(app.website)}" rel="noopener noreferrer">Website ↗</a>` : ""}${app.tokenAddress ? `<span>Token <code>${escape(app.tokenAddress)}</code></span>` : ""}</div>` : ""}
${app ? `<details class="ml-technical"><summary>Technical details</summary><p>Platform: iPhone · Built on your Mac with Xcode.</p><a href="${escape(repository)}/tree/${app.head_commit}">View source at <code>${app.head_commit.slice(0, 7)}</code> ↗</a><p>Public source is available to inspect. It does not establish a security review or permission to reuse it.</p></details>` : ""}
</main>`, { title: name, description, url: `${baseUrl}/${record.slug}`,
    image: media?.ogImage ? `${baseUrl}/api/menlo/v1/apps/${record.slug}/media/${app!.head_commit}/${media.ogImage}` : `${baseUrl}/api/menlo/v1/apps/${record.slug}/og.png?v=1${app ? `&commit=${app.head_commit}` : ""}`,
    imageType: media?.ogImage ? mediaType(media.ogImage) : "image/png", generated: !media?.ogImage });
}
export function renderAppDirectory(baseUrl: string, directory: AppDirectory) {
  const appCard = (record: AppDirectory["apps"][number]) => {
    const app = record.listing;
    return `<a class="ml-app" href="/${record.slug}">${icon(baseUrl, record, app)}<div class="ml-app-copy"><h2>${escape(app?.name ?? record.name)}</h2><p>${escape(app?.subtitle || app?.description || record.description)}</p><span class="ml-author">${avatar(record.publisher)}By @${escape(record.publisher.login)}</span></div><span class="ml-discover-action" aria-hidden="true">→</span></a>`;
  };
  return menloPage("Discover apps", discoveryDescription, baseUrl, `<main id="main" class="ml-container ml-discovery">${discoveryHeading()}<section aria-label="Discover apps"><div class="ml-install-note"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="3" width="14" height="10" rx="1"/><path d="M1 16h18M8 13v3m4-3v3"/></svg><span>Installing an app requires a Mac, Xcode, and your iPhone.</span></div>${directory.listings_unavailable ? `<p class="ml-feed-notice" role="status">Some app details are temporarily unavailable. <a href="/apps">Try again</a></p>` : ""}<div class="ml-app-grid">${directory.apps.length ? directory.apps.map(appCard).join("") : `<div class="ml-empty"><h2>The first apps will appear here.</h2><p>Have something to share? Turn your public GitHub app into a link.</p><a class="ml-button" href="#deploy" data-open-sheet="deploy">Share your app</a></div>`}</div></section>${menloInterview()}</main>`);
}

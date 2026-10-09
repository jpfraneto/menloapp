import type { GitHubApp } from "./github-apps.ts";
import { commandBlock, menloPage, sheet } from "./menlo-shell.ts";
import { mediaType } from "../../../../packages/cli/src/presentation.js";
import { REVIEW_STATEMENT, type GitHubSourceReview } from "./github-reviews.ts";
import { REVIEW_POLICY, REVIEW_SCOPES } from "../../../../packages/cli/src/review-policy.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Give crawlers a new image URL whenever the homepage artwork changes.
const homeImageRevision = createHash("sha256")
  .update(readFileSync(new URL("../public/menlo/og.png", import.meta.url)))
  .digest("hex").slice(0, 12);

export const homeTitle = "Bypass the AppStore.";
export const homeDescription = "Discover and share open-source iPhone apps. Publish from GitHub, send a link, and build on your own Mac with your own Apple identity.";
const DEPLOY_COMMAND = "npm i -g menloapp && menloapp deploy";
const FEED_PAGE = 20;

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export interface AppListing extends GitHubApp {
  subtitle: string;
  website: string | null;
  tokenAddress: string | null;
  head_commit: string;
  open_url: string;
  latest_commit?: string;
  version_pinned?: boolean;
  count?: number;
  reviews?: GitHubSourceReview[];
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
function avatar(actor: { id: number; login: string }) {
  return `<img class="ml-avatar" src="https://avatars.githubusercontent.com/u/${actor.id}?s=80&amp;v=4" width="28" height="28" alt="" loading="lazy">`;
}
function asset(baseUrl: string, app: GitHubApp, commit: string, path: string) {
  return escape(`${baseUrl}/api/menlo/v1/apps/${app.slug}/media/${commit}/${path}`);
}
function icon(baseUrl: string, record: GitHubApp, app: AppListing | undefined, size: number) {
  const name = app?.name ?? record.name;
  return app?.presentation?.icon
    ? `<img class="ml-app-icon" src="${asset(baseUrl, record, app.head_commit, app.presentation.icon)}" width="${size}" height="${size}" alt="${escape(name)} app icon" loading="lazy">`
    : `<span class="ml-app-icon ml-icon-placeholder" role="img" aria-label="${escape(name)} app icon placeholder">${escape(Array.from(name.trim())[0]?.toUpperCase() || "M")}</span>`;
}
// Makers do not choose a color; each app name always maps to the same one.
function tint(name: string) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return `ml-tint-${hash % 4}`;
}
function ago(timestamp: string, now: number) {
  const seconds = (now - Date.parse(timestamp)) / 1000;
  if (!Number.isFinite(seconds)) return "";
  const elapsed = Math.max(60, seconds);
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  if (elapsed < 604800) return `${Math.floor(elapsed / 86400)}d`;
  if (elapsed < 31536000) return `${Math.floor(elapsed / 604800)}w`;
  return `${Math.floor(elapsed / 31536000)}y`;
}
function phone(content: string) { return `<span class="ml-phone">${content}</span>`; }
function previewVideo(baseUrl: string, record: GitHubApp, app: AppListing, name: string) {
  const media = app.presentation!;
  return `<video muted loop playsinline preload="none" data-play-in-view aria-label="${escape(name)} recorded preview"${media.screenshots[0] ? ` poster="${asset(baseUrl, record, app.head_commit, media.screenshots[0])}"` : ""}><source src="${asset(baseUrl, record, app.head_commit, media.preview!.path)}" type="video/mp4"></video>`;
}
function getApp(baseUrl: string, app: AppListing) {
  // The ordinary link follows the latest version; only a shared version keeps its commit.
  const url = app.version_pinned ? versionURL(baseUrl, app) : `${baseUrl}/${app.slug}`;
  return sheet("get-app", "Get app", `Get ${app.name} on your iPhone`, `
<div data-device="mac"><p>Menlo is a Mac app that builds ${escape(app.name)} and installs it on your iPhone.</p><ol class="ml-install-steps"><li><a href="/download/macos" data-remember-app>Download Menlo</a> and open it. Already have it? Skip this.</li><li>Press Open in Menlo. It walks you through the rest.</li></ol><div class="ml-sheet-actions"><a class="ml-button ml-open-app" href="${escape(app.open_url)}">Open in Menlo</a><a class="ml-button ml-button-secondary" href="/download/macos" data-remember-app>Download Menlo</a></div><p class="ml-small">Needs Xcode and your iPhone. Menlo for Mac is a release candidate · macOS 14+.</p></div>
<div data-device="other" hidden><p><strong>Open this link on your Mac.</strong></p><p>Your Mac builds ${escape(app.name)} and installs it on your iPhone.</p><button class="ml-button" type="button" data-share-url="${escape(url)}#get-app" data-share-title="${escape(app.name)}" hidden>Send to your Mac</button><label class="ml-small" for="app-link">App link</label><input class="ml-link-field" id="app-link" value="${escape(url)}" readonly><button class="ml-button ml-button-secondary" type="button" data-copy="app-link">Copy app link</button><div class="ml-copy-status" role="status" aria-live="polite"></div></div>
<details class="ml-terminal-option" data-device="mac"><summary>Use Terminal instead</summary>${commandBlock("try-command", `npx menloapp@1.6.0 try '${url}'`, "Copy command")}</details>`, "ml-button ml-pill ml-get-button");
}
function versionURL(baseUrl: string, app: AppListing) {
  return `${baseUrl}/${app.slug}?commit=${app.head_commit}&repository=${app.repository_id}`;
}
function sharingApp(baseUrl: string, record: GitHubApp, app: AppListing) {
  const pinned = versionURL(baseUrl, app), url = app.version_pinned ? pinned : `${baseUrl}/${record.slug}`;
  const post = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `${app.name}${app.subtitle ? ` — ${app.subtitle}` : ""}`, url })}`;
  return sheet("share-app", "Share", `Share ${app.name}`, `<p>A link to the app, with its icon and preview.</p><div class="ml-sheet-actions"><button class="ml-button" type="button" data-share-url="${escape(url)}" data-share-title="${escape(app.name)}" hidden>Share app</button><a class="ml-button ml-button-secondary" href="${escape(post)}" target="_blank" rel="noopener noreferrer">Share on X ↗</a></div><label for="share-link" class="ml-small">${app.version_pinned ? "This exact version" : "App link · follows the latest version"}</label><input class="ml-link-field" id="share-link" readonly value="${escape(url)}"><button class="ml-button ml-button-secondary" type="button" data-copy="share-link" data-copy-message="App link copied.">Copy link</button><div class="ml-copy-status" role="status" aria-live="polite"></div><details class="ml-terminal-option"><summary>Share this exact version</summary><p>Use this link when recommending code you reviewed. It keeps the same source version through installation.</p><input aria-label="Exact version link" class="ml-link-field" id="version-link" readonly value="${escape(pinned)}"><button class="ml-button ml-button-secondary" type="button" data-copy="version-link" data-copy-message="Exact version link copied.">Copy version link</button><div class="ml-copy-status" role="status" aria-live="polite"></div></details>`, "ml-button ml-button-secondary ml-pill");
}
function sourceReviews(baseUrl: string, record: GitHubApp, app: AppListing) {
  const reviews = app.reviews ?? [], count = app.count ?? 0;
  const items = reviews.map(review => `<li class="ml-review"><div class="ml-creator"><img class="ml-avatar" src="https://avatars.githubusercontent.com/u/${review.reviewer.id}?s=80&amp;v=4" width="28" height="28" alt="" loading="lazy"><span>@${escape(review.reviewer.login)}${review.reviewer.id === record.publisher.id ? " · maker" : ""}</span><time datetime="${escape(review.created_at)}">${escape(review.created_at.slice(0, 10))}</time></div><p>Recommends this version after reviewing ${review.scopes.map(escape).join(", ")}.</p>${review.notes ? `<p class="ml-review-notes">${escape(review.notes)}</p>` : ""}<span class="ml-small">GitHub account #${review.reviewer.id}</span></li>`).join("");
  const url = versionURL(baseUrl, app);
  const form = `<form class="ml-review-form" data-review-form data-slug="${app.slug}" data-commit="${app.head_commit}" data-repository="${app.repository_id}" data-project="${escape(app.project)}" data-scheme="${escape(app.scheme)}" data-policy="${REVIEW_POLICY}" data-statement="${escape(REVIEW_STATEMENT)}" data-version-url="${escape(url)}" hidden>
<div data-review-auth><button class="ml-button ml-button-secondary" type="button" data-review-signin>Sign in with GitHub</button><p class="ml-small" data-review-account></p><div data-review-login hidden><p>Enter this code on GitHub:</p><code class="ml-login-code" data-review-code></code><p><a class="ml-button ml-button-secondary" href="https://github.com/login/device" target="_blank" rel="noopener noreferrer">Continue on GitHub ↗</a></p><p class="ml-small">Return here after approving. This page keeps your selected version.</p></div></div>
<fieldset><legend>What did you examine?</legend>${REVIEW_SCOPES.map(scope => `<label class="ml-review-choice"><input type="checkbox" name="scope" value="${scope}"${scope === "source" ? " checked disabled" : ""}> ${scope}</label>`).join("")}</fieldset>
<label for="review-notes">Findings or caveats <span class="ml-muted">(optional, public)</span></label><textarea class="ml-link-field" id="review-notes" name="notes" rows="3" maxlength="2000"></textarea>
<label class="ml-review-choice"><input type="checkbox" name="confirm" required> ${escape(REVIEW_STATEMENT)}</label><div class="ml-sheet-actions"><button class="ml-button" type="submit" data-review-submit disabled>Publish recommendation</button><button class="ml-button ml-button-secondary" type="button" data-review-withdraw hidden>Withdraw my review</button><button class="ml-button ml-button-secondary" type="button" data-review-signout hidden>Sign out</button></div><p class="ml-copy-status" data-review-status role="status" aria-live="polite"></p></form>`;
  const content = `<p>Personally examine <a href="https://github.com/${escape(app.repository)}/tree/${app.head_commit}" target="_blank" rel="noopener noreferrer">this exact source version ↗</a>, including the parts that matter to your recommendation.</p><p>Your recommendation names your GitHub account and the scopes you reviewed. You can add findings or withdraw it later.</p>${form}<details class="ml-terminal-option"><summary>Review from Terminal</summary><blockquote>${escape(REVIEW_STATEMENT)}</blockquote>${commandBlock("review-command", `npx menloapp@1.6.0 review '${url}'`, "Copy review command")}<p class="ml-small">The command shows the statement and asks for confirmation before publishing. Use --scope dependencies or --notes to explain your review.</p></details>`;
  const review = sheet("review-app", count ? "Add your review" : "Read it and say what you found", `Review ${app.name}`, content, "ml-text-link");
  return `<div class="ml-row" id="reviews"><dt>Reviews</dt><dd>${items ? `<ul class="ml-review-list">${items}</ul>` : `<span>None for this version yet.</span> `}${review}<p class="ml-small">Reviews say what someone examined. They are not a safety guarantee.</p></dd></div>`;
}
export function renderAppListing(baseUrl: string, record: GitHubApp, app?: AppListing) {
  const name = app?.name ?? record.name;
  const description = app?.description || app?.subtitle || record.description;
  const media = app?.presentation;
  const creator = record.publisher;
  const profile = `https://github.com/${encodeURIComponent(creator.login)}`;
  const repository = `https://github.com/${record.repository}`;
  const source = app ? `${repository}/tree/${app.head_commit}` : repository;
  const frames = [
    ...(media?.preview ? [phone(previewVideo(baseUrl, record, app!, name))] : []),
    ...(media?.screenshots ?? []).map((file, index) => `<a href="${asset(baseUrl, record, app!.head_commit, file)}" data-preview-image aria-label="Enlarge ${escape(name)} screenshot ${index + 1}">${phone(`<img src="${asset(baseUrl, record, app!.head_commit, file)}" alt="${escape(name)} screenshot ${index + 1}" loading="lazy">`)}</a>`),
  ];
  const pinnedPage = !!app && app.latest_commit !== undefined && app.latest_commit !== app.head_commit;
  const canonical = app?.version_pinned ? versionURL(baseUrl, app) : `${baseUrl}/${record.slug}`;
  const from = `<div class="ml-row"><dt>From</dt><dd><a href="${escape(repository)}"><code>${escape(record.repository)}</code></a>${app ? ` at <a href="${escape(repository)}/commit/${app.head_commit}"><code>${app.head_commit.slice(0, 7)}</code></a>, the exact code you’d build` : ""}</dd></div>`;
  const website = app?.website ? `<div class="ml-row"><dt>Website</dt><dd><a href="${escape(app.website)}" rel="noopener noreferrer">${escape(new URL(app.website).hostname)} ↗</a></dd></div>` : "";
  const token = app?.tokenAddress ? `<div class="ml-row"><dt>Token</dt><dd><code>${escape(app.tokenAddress)}</code></dd></div>` : "";
  return menloPage(`${name} by ${creator.login}`, description, canonical, `<main id="main" class="ml-container ml-listing-page"${app ? ` data-app-version-url="${escape(versionURL(baseUrl, app))}"` : ""}>
${pinnedPage ? `<p class="ml-version-notice">You’re viewing a shared version. <a href="/${record.slug}">See the latest version</a>. Its source reviews may be different.</p>` : ""}
<section class="ml-app-top" aria-label="App details">${icon(baseUrl, record, app, 88)}<h1>${escape(name)}</h1><p class="ml-byline">by <a href="${profile}">@${escape(creator.login)}</a></p>${description ? `<p class="ml-app-description">${escape(description)}</p>` : ""}</section>
${frames.length ? `<section class="ml-tile ml-tile-shelf ${tint(name)}" aria-label="Preview"><ul>${frames.map(frame => `<li>${frame}</li>`).join("")}</ul></section>` : ""}
<section class="ml-app-actions" aria-label="Get this app">${app ? `<div class="ml-actions">${getApp(baseUrl, app)}<a class="ml-text-link" href="${escape(source)}" rel="noopener noreferrer">Read the source ↗</a>${sharingApp(baseUrl, record, app)}</div><p class="ml-small">Your Mac builds it with Xcode and signs it with your Apple ID. Then it’s on your iPhone.</p>` : `<p class="ml-unavailable" role="status">Installation is paused while this app’s source is unavailable.</p>`}</section>
<dl class="ml-rows">${from}${app ? sourceReviews(baseUrl, record, app) : ""}${website}${token}</dl>
</main>`, { title: name, description, url: canonical,
    image: media?.ogImage ? `${baseUrl}/api/menlo/v1/apps/${record.slug}/media/${app!.head_commit}/${media.ogImage}` : `${baseUrl}/api/menlo/v1/apps/${record.slug}/og.png?v=2${app ? `&commit=${app.head_commit}` : ""}`,
    imageType: media?.ogImage ? mediaType(media.ogImage) : "image/png", generated: !media?.ogImage });
}
export function renderAppDirectory(baseUrl: string, directory: AppDirectory, now = Date.now()) {
  // One post per app, newest first. A post never waits on details that failed to load.
  const records = [...directory.apps].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const post = (record: AppDirectory["apps"][number]) => {
    const app = record.listing, name = app?.name ?? record.name, media = app?.presentation;
    const description = app?.description || app?.subtitle || record.description;
    const link = `${baseUrl}/${record.slug}`, repository = `https://github.com/${record.repository}`;
    const time = ago(record.created_at, now);
    const shown = media?.preview ? phone(previewVideo(baseUrl, record, app!, name))
      : media?.screenshots[0] ? phone(`<img src="${asset(baseUrl, record, app!.head_commit, media.screenshots[0])}" alt="${escape(name)} screenshot" loading="lazy">`)
      : icon(baseUrl, record, app, 120);
    return `<li class="ml-post"><article aria-labelledby="post-${record.slug}"><p class="ml-byline">${avatar(record.publisher)}<a href="https://github.com/${encodeURIComponent(record.publisher.login)}">@${escape(record.publisher.login)}</a>${time ? `<time datetime="${escape(record.created_at)}">${time}</time>` : ""}</p><a class="ml-tile ${tint(name)}" href="/${record.slug}" aria-label="Open ${escape(name)}">${shown}</a><div class="ml-post-app">${icon(baseUrl, record, app, 44)}<div><h2 id="post-${record.slug}">${escape(name)}</h2>${description ? `<p>${escape(description)}</p>` : ""}</div></div><div class="ml-actions"><a class="ml-button ml-pill" href="/${record.slug}">Get app</a><button class="ml-button ml-button-secondary ml-pill" type="button" data-flash-copy="${escape(link)}" data-flash-label="Link copied">Copy link</button><a class="ml-text-link" href="${escape(app ? `${repository}/tree/${app.head_commit}` : repository)}" rel="noopener noreferrer">Source ↗</a></div></article></li>`;
  };
  return menloPage(homeTitle, homeDescription, baseUrl, `<main id="main" class="ml-container ml-home"><header class="ml-home-title"><h1>Shipped on Menlo</h1><p>Open-source iPhone apps, straight from the people who built them.</p></header>
<section class="ml-compose" id="compose" aria-labelledby="compose-title"><h2 id="compose-title">What did you build?</h2><div class="ml-term"><div class="ml-term-line"><span aria-hidden="true">$ </span><code id="deploy-command">${escape(DEPLOY_COMMAND)}</code></div><button class="ml-button ml-button-secondary ml-pill" type="button" data-flash-copy="${escape(DEPLOY_COMMAND)}" data-flash-label="Copied">Copy</button></div><p>Run it in your app’s public repo. You get a link to send, and your app shows up here.</p></section>
<ol class="ml-feed" data-feed="${FEED_PAGE}" aria-label="Apps shipped on Menlo">${records.map(post).join("")}</ol>
<p class="ml-feed-end">${records.length ? "That’s everything shipped so far." : "Nothing shipped yet."} <a href="#compose">Ship yours</a></p></main>`, {
    title: `Menlo — ${homeTitle}`,
    description: homeDescription,
    url: new URL("/", baseUrl).href,
    image: new URL(`/menlo/og.png?v=${homeImageRevision}`, baseUrl).href,
    imageType: "image/png", generated: true,
  });
}

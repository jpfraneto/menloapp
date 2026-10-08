import type { GitHubApp } from "./github-apps.ts";
import { commandBlock, menloPage, sheet } from "./menlo-shell.ts";
import { menloInterview } from "./menlo-interview.ts";
import { homeDescription, homeTitle, landingCloser, landingDirectoryHeading, landingHero, landingStory } from "./menlo-landing.ts";
import { mediaType } from "../../../../packages/cli/src/presentation.js";
import { REVIEW_STATEMENT, type GitHubSourceReview } from "./github-reviews.ts";
import { REVIEW_POLICY, REVIEW_SCOPES } from "../../../../packages/cli/src/review-policy.js";

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
  const url = versionURL(baseUrl, app);
  return sheet("get-app", "Get app", `Get ${app.name} on your iPhone`, `
<div data-device="mac"><p>Menlo builds this version on your Mac and installs it on your iPhone.</p><ol class="ml-install-steps"><li>Open Menlo. First time? <a href="/download/macos" data-remember-app>Download for Mac</a>, drag it into Applications, and open it.</li><li>Choose Open in Menlo below, review the source, and select Build for my iPhone.</li><li>Menlo guides you through Xcode, Apple signing, and connecting your intended iPhone.</li></ol><div class="ml-sheet-actions"><a class="ml-button ml-open-app" href="${escape(app.open_url)}">Open in Menlo</a><a class="ml-button ml-button-secondary" href="/download/macos" data-remember-app>Set up Menlo</a></div><p class="ml-small">Mac download: release candidate · macOS 14+. Keep this page open while you set up Menlo.</p></div>
<div data-device="other" hidden><p><strong>Send this app to your Mac.</strong></p><p>Your Mac builds ${escape(app.name)} with Xcode and your Apple Account, then installs it on your iPhone. Send this exact version using AirDrop or your preferred app, and open the link on your Mac.</p><button class="ml-button" type="button" data-share-url="${escape(url)}#get-app" data-share-title="${escape(app.name)}" hidden>Send to your Mac</button><p class="ml-small">You’ll finish the source review and installation there. Your selected version stays the same.</p></div>
<label class="ml-small" for="app-link">App link</label><input class="ml-link-field" id="app-link" value="${escape(url)}" readonly><button class="ml-button ml-button-secondary" type="button" data-copy="app-link">Copy app link</button><div class="ml-copy-status" role="status" aria-live="polite"></div>
<details class="ml-terminal-option" data-device="mac"><summary>Use Terminal instead</summary><p>Install the command, then try this version:</p>${commandBlock("try-command", `npx menloapp@1.6.0 try '${url}'`, "Copy command")}</details>`, true) + `<span class="ml-get-help">Requires a Mac, Xcode, and your iPhone</span><a class="ml-review-summary" href="#reviews">${app.count ? `${app.count} source review${app.count === 1 ? "" : "s"} of this version` : "No source reviews yet"}</a>`;
}
function versionURL(baseUrl: string, app: AppListing) {
  return `${baseUrl}/${app.slug}?commit=${app.head_commit}&repository=${app.repository_id}`;
}
function sharingApp(baseUrl: string, record: GitHubApp, app: AppListing) {
  const pinned = versionURL(baseUrl, app), url = app.version_pinned ? pinned : `${baseUrl}/${record.slug}`;
  const post = `https://twitter.com/intent/tweet?${new URLSearchParams({ text: `${app.name}${app.subtitle ? ` — ${app.subtitle}` : ""}`, url })}`;
  return sheet("share-app", "Share app", `Share ${app.name}`, `<p>A link to the app, with its icon and preview.</p><div class="ml-sheet-actions"><button class="ml-button" type="button" data-share-url="${escape(url)}" data-share-title="${escape(app.name)}" hidden>Share app</button><a class="ml-button ml-button-secondary" href="${escape(post)}" target="_blank" rel="noopener noreferrer">Share on X ↗</a></div><label for="share-link" class="ml-small">${app.version_pinned ? "This exact version" : "App link · follows the latest version"}</label><input class="ml-link-field" id="share-link" readonly value="${escape(url)}"><button class="ml-button ml-button-secondary" type="button" data-copy="share-link" data-copy-message="App link copied.">Copy link</button><div class="ml-copy-status" role="status" aria-live="polite"></div><details class="ml-terminal-option"><summary>Share this exact version</summary><p>Use this link when recommending code you reviewed. It keeps the same source version through installation.</p><input aria-label="Exact version link" class="ml-link-field" id="version-link" readonly value="${escape(pinned)}"><button class="ml-button ml-button-secondary" type="button" data-copy="version-link" data-copy-message="Exact version link copied.">Copy version link</button><div class="ml-copy-status" role="status" aria-live="polite"></div></details>`);
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
  return `<section class="ml-reviews" id="reviews" aria-labelledby="reviews-title"><div class="ml-review-heading"><h2 id="reviews-title">Source reviews <span class="ml-muted">${count}</span></h2>${sheet("review-app", "Review this version", `Review ${app.name}`, content)}</div><p class="ml-muted ml-small">Human recommendations of version <a href="https://github.com/${escape(app.repository)}/commit/${app.head_commit}"><code>${app.head_commit.slice(0, 7)}</code></a>. Reviews describe what people examined; they are not a safety guarantee. Each new version starts with no reviews.</p>${items ? `<ul class="ml-review-list">${items}</ul>` : '<p class="ml-review-empty">This version has no source reviews yet.</p>'}</section>`;
}
export function renderAppListing(baseUrl: string, record: GitHubApp, app?: AppListing) {
  const name = app?.name ?? record.name;
  const description = app?.description ?? record.description;
  const media = app?.presentation;
  const creator = record.publisher;
  const profile = `https://github.com/${encodeURIComponent(creator.login)}`;
  const repository = `https://github.com/${record.repository}`;
  const previewLabel = media?.preview?.kind === "simulator" ? "Simulator preview" : media?.preview?.kind === "device" ? "Device preview · by the maker" : "Screen recording · by the maker";
  const preview = media?.preview ? `<li><figure class="ml-shot"><video controls playsinline preload="metadata" aria-label="${escape(name)} recorded preview"${media.screenshots[0] ? ` poster="${asset(baseUrl, record, app!.head_commit, media.screenshots[0])}"` : ""}><source src="${asset(baseUrl, record, app!.head_commit, media.preview.path)}" type="video/mp4">Your browser cannot play this recording.</video><figcaption class="ml-media-caption">${media.preview.source_commit ? `<a href="${escape(repository)}/commit/${media.preview.source_commit}" title="View the source used for this recording">${previewLabel}</a>` : previewLabel}</figcaption></figure></li>` : "";
  const images = media?.screenshots ?? [];
  const screenshots = images.map((file, index) => `<li><a class="ml-shot" href="${asset(baseUrl, record, app!.head_commit, file)}" data-preview-image aria-label="Enlarge ${escape(name)} screenshot ${index + 1}"><img src="${asset(baseUrl, record, app!.head_commit, file)}" alt="${escape(name)} screenshot ${index + 1}"${index ? ' loading="lazy"' : ""}></a></li>`).join("");
  const commit = app ? `<a href="${escape(repository)}/tree/${app.head_commit}"><code>${app.head_commit.slice(0, 7)}</code></a>` : "";
  // The ribbon repeats only facts the page already establishes for this version.
  const fact = (label: string, value: string, detail: string) => `<div><dt>${label}</dt><dd>${value}<span>${detail}</span></dd></div>`;
  const facts = `<dl class="ml-app-facts">${fact("Source", "Public", "on GitHub")}${app ? fact("Version", commit, "exact commit") + fact("Source reviews", `<a href="#reviews">${app.count ?? 0}</a>`, "of this version") : ""}${fact("Platform", "iPhone", "native app")}${fact("Requires", "Mac", "with Xcode")}${fact("Signed by", "You", "your Apple identity")}</dl>`;
  const row = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const information = `<section class="ml-information" aria-labelledby="information-title"><h2 id="information-title">Information</h2><dl>${row("Maker", `<a href="${profile}">@${escape(creator.login)}</a>`)}${row("Source", `<a href="${escape(repository)}">${escape(record.repository)} <span aria-hidden="true">↗</span></a>`)}${app ? row("Version", `<a href="${escape(repository)}/tree/${app.head_commit}">View source at <code>${app.head_commit.slice(0, 7)}</code> ↗</a>`) : ""}${row("Platform", "iPhone")}${row("Build", "On your Mac, with Xcode")}${row("Signing", "Your own Apple identity")}${app?.website ? row("Website", `<a href="${escape(app.website)}" rel="noopener noreferrer">${escape(new URL(app.website).hostname)} ↗</a>`) : ""}${app?.tokenAddress ? row("Token", `<code>${escape(app.tokenAddress)}</code>`) : ""}</dl><p class="ml-small">Public source is available to inspect. It does not establish a security review or permission to reuse it.</p><p class="ml-small">The maker sets this page’s name, description, icon, screenshots, and preview in <code>menloapp/app.json</code>. <a href="https://docs.menloapp.lol/guide/product/app-listing/">How listings work ↗</a></p></section>`;
  const pinnedPage = !!app && app.latest_commit !== undefined && app.latest_commit !== app.head_commit;
  const canonical = app?.version_pinned ? versionURL(baseUrl, app) : `${baseUrl}/${record.slug}`;
  return menloPage(`${name} by ${creator.login}`, description, canonical, `<main id="main" class="ml-listing-page"${app ? ` data-app-version-url="${escape(versionURL(baseUrl, app))}"` : ""}>
<div class="ml-store-hero"><div class="ml-container">${pinnedPage ? `<p class="ml-version-notice">You’re viewing a shared version. <a href="/${record.slug}">See the latest version</a>. Its source reviews may be different.</p>` : ""}
<section class="ml-app-heading" aria-label="App details">${icon(baseUrl, record, app)}<div class="ml-app-identity"><p class="ml-eyebrow">Open-source iPhone app</p><h1>${escape(name)}</h1>${app?.subtitle ? `<p class="ml-app-subtitle">${escape(app.subtitle)}</p>` : ""}<div class="ml-creator"><a class="ml-creator-profile" href="${profile}">${avatar(creator)}<span>@${escape(creator.login)}</span></a><span class="ml-creator-divider" aria-hidden="true"></span><a class="ml-github-link" href="${escape(repository)}">${githubMark} GitHub <span aria-hidden="true">↗</span></a></div></div><div class="ml-get-app">${app ? getApp(baseUrl, app) + sharingApp(baseUrl, record, app) : `<p class="ml-unavailable" role="status">Installation is paused while this app’s source is unavailable.</p>`}</div></section>
${facts}</div></div>
<div class="ml-container ml-listing ml-listing-body">
${preview || screenshots ? `<section class="ml-media-section" aria-labelledby="preview-title"><h2 id="preview-title">Preview</h2><ul class="ml-shelf">${preview}${screenshots}</ul>${screenshots ? `<p class="ml-media-caption">Screenshots by the maker</p>` : ""}</section>` : `<p class="ml-preview-missing">${app ? "The maker hasn’t shared a preview yet." : "The preview is temporarily unavailable."}</p>`}
${description ? `<section class="ml-description" aria-label="App description"><h2>About this app</h2><p>${escape(description)}</p></section>` : ""}
${app ? sourceReviews(baseUrl, record, app) : ""}
${information}
</div>
</main>`, { title: name, description, url: canonical,
    image: media?.ogImage ? `${baseUrl}/api/menlo/v1/apps/${record.slug}/media/${app!.head_commit}/${media.ogImage}` : `${baseUrl}/api/menlo/v1/apps/${record.slug}/og.png?v=2${app ? `&commit=${app.head_commit}` : ""}`,
    imageType: media?.ogImage ? mediaType(media.ogImage) : "image/png", generated: !media?.ogImage });
}
export function renderAppDirectory(baseUrl: string, directory: AppDirectory) {
  const appCard = (record: AppDirectory["apps"][number]) => {
    const app = record.listing;
    return `<a class="ml-app" href="/${record.slug}">${icon(baseUrl, record, app)}<div class="ml-app-copy"><h2>${escape(app?.name ?? record.name)}</h2><p>${escape(app?.subtitle || app?.description || record.description)}</p><span class="ml-author">${avatar(record.publisher)}By @${escape(record.publisher.login)}</span></div><span class="ml-discover-action" aria-hidden="true">→</span></a>`;
  };
  return menloPage(homeTitle, homeDescription, baseUrl, `<main id="main" class="ml-home">${landingHero(directory.apps.map(record => ({ slug: record.slug, name: record.listing?.name ?? record.name })))}<section class="ml-section" id="apps" aria-label="Discover apps"><div class="ml-container">${landingDirectoryHeading()}<div class="ml-install-note"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="3" width="14" height="10" rx="1"/><path d="M1 16h18M8 13v3m4-3v3"/></svg><span>Installing an app requires a Mac, Xcode, and your iPhone.</span></div>${directory.listings_unavailable ? `<p class="ml-feed-notice" role="status">Some app details are temporarily unavailable. <a href="/apps">Try again</a></p>` : ""}<div class="ml-app-grid">${directory.apps.length ? directory.apps.map(appCard).join("") : `<div class="ml-empty"><h2>The first apps will appear here.</h2><p>Have something to share? Turn your public GitHub app into a link.</p><a class="ml-button" href="#deploy" data-open-sheet="deploy">Share your app</a></div>`}</div></div></section>${landingStory()}<div class="ml-container ml-home-interview">${menloInterview()}</div>${landingCloser()}</main>`);
}

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HttpError } from "./security.ts";
import { renderSocialCard, socialCardResponse } from "./social-cards.ts";
import { renderAppListing, renderAppDirectory, type AppDirectory, type AppActivity } from "./menlo-listings.ts";
import { PRESENTATION_PATH, MAX_PRESENTATION_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, validatePresentation, presentationFiles, mediaType, validateMediaBytes } from "../../../../packages/cli/src/presentation.js";

export interface GitHubAppsConfig {
  root?: string;
  clientId?: string;
  readToken?: string;
  baseUrl: string;
}

export interface GitHubApp {
  schema: "menlo.github-app/1";
  id: string;
  slug: string;
  repository_id: number;
  owner_id: number;
  repository: string;
  publisher: { id: number; login: string };
  name: string;
  description: string;
  project: string;
  scheme: string;
  created_at: string;
  updated_at: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
const SHA = /^[a-f0-9]{40}$/;
const RESERVED = new Set(["api", "auth", "apps", "claims", "docs", "download", "healthz", "install", "privacy", "registry", "releases", "s", "buy", "menlo", "login", "logout"]);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
async function boundedBytes(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new HttpError(413, "Response or request exceeded the supported size"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
async function boundedText(body: ReadableStream<Uint8Array> | null, maximum: number) {
  return (await boundedBytes(body, maximum)).toString("utf8");
}
function bounded(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return value.trim();
}
export function validateRecipe(project: unknown, scheme: unknown) {
  const path = bounded(project, "Xcode project path", 512);
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some(p => !p || p === "." || p === ".." || p.startsWith("-")) || !/\.(xcodeproj|xcworkspace)$/.test(path)) throw new HttpError(400, "Use a repository-relative Xcode project or workspace path");
  const selectedScheme = bounded(scheme, "Xcode scheme", 128);
  if (selectedScheme.startsWith("-")) throw new HttpError(400, "Invalid Xcode scheme");
  return { project: path, scheme: selectedScheme };
}

/** The public service stores only app metadata and audit events, never source or user tokens. */
export function createGitHubApps(config: GitHubAppsConfig, options: {
  fetch?: typeof fetch;
  legacySlugExists?: (slug: string) => Promise<boolean>;
} = {}) {
  const remote = options.fetch ?? fetch;
  let db: Database | undefined;
  if (config.root) {
    mkdirSync(config.root, { recursive: true, mode: 0o700 });
    db = new Database(join(config.root, "github-apps.sqlite"), { create: true });
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS apps (slug TEXT PRIMARY KEY, repository_id INTEGER NOT NULL UNIQUE, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS registration_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL, actor_id INTEGER NOT NULL, kind TEXT NOT NULL, record TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_registration_updates BEFORE UPDATE ON registration_events BEGIN SELECT RAISE(ABORT, 'registration ledger is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_registration_deletes BEFORE DELETE ON registration_events BEGIN SELECT RAISE(ABORT, 'registration ledger is append-only'); END;`);
  }
  const cache = new Map<string, { until: number; value: Promise<any> }>();
  let directoryCache: { until: number; value: Promise<AppDirectory> } | undefined;
  let rateWindow = Date.now(), reads = 0, writes = 0;
  function rateLimit(write: boolean) {
    if (Date.now() - rateWindow >= 60_000) { rateWindow = Date.now(); reads = 0; writes = 0; }
    if ((write ? ++writes > 30 : ++reads > 600)) throw new HttpError(429, "MENLO is receiving too many requests. Try again in a minute.");
  }
  async function github(path: string, token?: string, cached = false): Promise<any> {
    const key = path;
    const hit = cached && cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = (async () => {
      const response = await remote(`https://api.github.com${path}`, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "menlo-distribution", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new HttpError(response.status === 404 ? 404 : response.status === 401 ? 401 : 503,
        response.status === 404 ? "This public GitHub repository or commit is unavailable" : response.status === 401 ? "Sign in to GitHub again" : "GitHub is temporarily unavailable or rate limited. Try again shortly.");
      const body = await boundedText(response.body, 4 * 1024 * 1024);
      return JSON.parse(body);
    })();
    if (cached) {
      if (cache.size >= 512) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 60_000, value });
      value.catch(() => { if (cache.get(key)?.value === value) cache.delete(key); });
    }
    return value;
  }
  function find(slug: string): GitHubApp | undefined {
    const row = db?.query("SELECT record FROM apps WHERE slug = ?").get(slug) as { record: string } | null;
    return row ? JSON.parse(row.record) : undefined;
  }
  function requireApp(slug: string) {
    const app = find(slug);
    if (!app) throw new HttpError(404, "This app has not been deployed on MENLO");
    return app;
  }
  async function current(app: GitHubApp) {
    const repo = await github(`/repos/${app.repository}`, config.readToken, true);
    // Transfers, private repos, deletion/recreation, and renamed routes require explicit redeployment.
    if (repo.id !== app.repository_id || repo.owner?.id !== app.owner_id || repo.private !== false || repo.full_name?.toLowerCase() !== app.repository.toLowerCase()) throw new HttpError(409, "The repository identity changed. Its owner must deploy again.");
    const branch = bounded(repo.default_branch, "GitHub branch", 256);
    const commit = await github(`/repos/${app.repository}/commits/${encodeURIComponent(branch)}`, config.readToken, true);
    if (!SHA.test(commit.sha)) throw new HttpError(502, "GitHub returned an invalid commit");
    return { ...app, repository: repo.full_name as string, branch, head_commit: commit.sha as string,
      github_url: `https://github.com/${repo.full_name}`, profile_url: `https://github.com/${repo.owner.login}`,
      public_url: `${config.baseUrl}/${app.slug}`, open_url: `menlo://app/${app.slug}?commit=${commit.sha}&repository=${app.repository_id}`,
      checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") };
  }
  async function fileInfo(repository: string, commit: string, file: string, token = config.readToken, cached = true) {
    const parts = file.split("/");
    let treeID = commit;
    // Contents API follows symlinks. Walk the pinned Git tree so a selected
    // asset cannot secretly refer to another file outside the public folder.
    for (let index = 0; index < parts.length; index++) {
      const tree = await github(`/repos/${repository}/git/trees/${treeID}`, token, cached);
      if (tree.truncated || !Array.isArray(tree.tree)) throw new HttpError(422, "The public app folder could not be read completely");
      const entry = tree.tree.find((item: any) => item.path === parts[index]);
      if (!entry) throw new HttpError(404, "The selected app presentation file is not committed");
      if (!SHA.test(entry.sha)) throw new HttpError(502, "GitHub returned an invalid file identity");
      if (index < parts.length - 1) {
        if (entry.type !== "tree" || entry.mode !== "040000") throw new HttpError(422, "Public app folders cannot contain symbolic links");
        treeID = entry.sha;
      } else {
        if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new HttpError(422, "Public app assets must be regular Git files");
        return { type: "file", size: entry.size, sha: entry.sha };
      }
    }
    throw new HttpError(404, "Public app file not found");
  }
  function regularFile(info: any, maximum: number) {
    if (info.type !== "file" || info.target || info.submodule_git_url || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > maximum || !SHA.test(info.sha)) throw new HttpError(422, "Public app assets must be bounded regular Git files, not links or Git LFS pointers");
  }
  function verifyBlob(info: any, bytes: Buffer) {
    if (info.size !== bytes.length || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== info.sha) throw new HttpError(502, "GitHub media bytes do not match the committed file");
  }
  async function presentation(repository: string, commit: string, token = config.readToken, cached = true) {
    let info;
    try { info = await fileInfo(repository, commit, PRESENTATION_PATH, token, cached); }
    catch (error) { if (error instanceof HttpError && error.status === 404) return null; throw error; }
    regularFile(info, MAX_PRESENTATION_BYTES);
    const blob = await github(`/repos/${repository}/git/blobs/${info.sha}`, token, cached);
    if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.content.length > MAX_PRESENTATION_BYTES * 2) throw new HttpError(422, "Commit menloapp/app.json as a small JSON file");
    const bytes = Buffer.from(blob.content, "base64");
    verifyBlob(info, bytes);
    try { return validatePresentation(JSON.parse(bytes.toString("utf8"))); }
    catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid menloapp/app.json"); }
  }
  async function presented(app: Awaited<ReturnType<typeof current>>) {
    const media = await presentation(app.repository, app.head_commit);
    return { ...app, name: media?.name ?? app.name, description: media?.description ?? app.description, subtitle: media?.subtitle ?? "",
      website: media?.website ?? null, tokenAddress: media?.tokenAddress ?? null, githubRepo: app.github_url, menloLink: app.public_url,
      presentation: media ? { ...media, githubRepo: app.github_url, menloLink: app.public_url } : null };
  }
  function mediaURL(app: GitHubApp, commit: string, file: string) {
    return `${config.baseUrl}/api/menlo/v1/apps/${app.slug}/media/${commit}/${file}`;
  }
  async function mediaResponse(request: Request, slug: string, commit: string, file: string) {
    const app = await current(requireApp(slug));
    const selected = await presentation(app.repository, commit);
    if (!selected || !presentationFiles(selected).includes(file)) throw new HttpError(404, "This file is not selected for this app's public presentation");
    const maximum = file.endsWith(".mp4") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const info = await fileInfo(app.repository, commit, file);
    regularFile(info, maximum);
    const headers = new Headers({ "Content-Type": mediaType(file), "Content-Length": String(info.size), "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes", "ETag": `"${info.sha}"`, "X-Content-Type-Options": "nosniff" });
    const range = request.headers.get("range");
    let start = 0, end = info.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || !match[1] && !match[2]) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
      headers.set("Content-Length", String(end - start + 1));
    }
    // Resolve a fixed public GitHub URL ourselves; never follow supplied URLs or
    // forward a GitHub credential to an asset host.
    const response = await remote(`https://raw.githubusercontent.com/${app.repository}/${commit}/${file}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 503, "GitHub media is temporarily unavailable");
    const bytes = await boundedBytes(response.body, maximum);
    verifyBlob(info, bytes);
    try { validateMediaBytes(file, bytes); } catch (error) { throw new HttpError(422, (error as Error).message); }
    return new Response(request.method === "HEAD" ? null : Uint8Array.from(bytes.subarray(start, end + 1)).buffer, { status: range ? 206 : 200, headers });
  }
  async function shareImage(request: Request, slug: string) {
    const record = requireApp(slug);
    const commit = new URL(request.url).searchParams.get("commit");
    if (commit !== null && !SHA.test(commit)) throw new HttpError(400, "Share images require a full Git commit");
    // A page without current GitHub evidence still has its registered title and description.
    // The usual URL pins the metadata and icon to the commit displayed on the page.
    const app = commit ? await current(record) : undefined;
    const selected = app && commit ? await presentation(app.repository, commit) : null;
    return socialCardResponse(request, `github:${config.baseUrl}:${record.id}:${commit ?? record.updated_at}:v1`, async () => {
      let icon;
      if (selected?.icon && commit) {
        const response = await mediaResponse(new Request(mediaURL(record, commit, selected.icon)), slug, commit, selected.icon);
        icon = { bytes: Buffer.from(await response.arrayBuffer()), type: mediaType(selected.icon) };
      }
      return renderSocialCard({ title: selected?.name ?? record.name, description: selected?.description ?? record.description, url: `${config.baseUrl}/${slug}`, icon });
    });
  }
  async function directory(): Promise<AppDirectory> {
    if (directoryCache && directoryCache.until > Date.now()) return directoryCache.value;
    const value = (async () => {
      const records = (db?.query("SELECT record FROM apps ORDER BY rowid DESC").all() as { record: string }[] ?? []).map(row => JSON.parse(row.record) as GitHubApp);
      const rows = db?.query("SELECT sequence, record, occurred_at FROM registration_events WHERE kind = 'registered' ORDER BY occurred_at DESC, sequence DESC LIMIT 50").all() as { sequence: number; record: string; occurred_at: string }[] ?? [];
      const events: AppActivity[] = rows.map(row => {
        const app = JSON.parse(row.record) as GitHubApp;
        return { id: `deployment-${row.sequence}`, kind: "published", occurred_at: row.occurred_at, app, actor: app.publisher };
      });
      const apps: AppDirectory["apps"] = [];
      let listings_unavailable = false;
      // Share the normal GitHub cache, with at most four repositories loading at
      // once. Public discovery lists apps. Installed-app comparisons belong to
      // the recipient's private library, never a public commit/update feed.
      for (let offset = 0; offset < records.length; offset += 4) {
        const batch = records.slice(offset, offset + 4);
        const results = await Promise.allSettled(batch.map(async record => {
          const app = await current(record);
          return { ...record, listing: await presented(app) };
        }));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") apps.push(result.value);
          else { listings_unavailable = true; apps.push(batch[index]!); }
        });
      }
      events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.id.localeCompare(a.id));
      return { apps, events: events.slice(0, 50), listings_unavailable };
    })();
    directoryCache = { until: Date.now() + 60_000, value };
    value.catch(() => { if (directoryCache?.value === value) directoryCache = undefined; });
    return value;
  }
  async function register(request: Request) {
    if (!db) throw new HttpError(503, "MENLO's app directory is not configured yet");
    const authorization = request.headers.get("Authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9_]+$/.test(authorization) || authorization.length > 1024) throw new HttpError(401, "Sign in with GitHub to deploy");
    if (Number(request.headers.get("Content-Length") ?? 0) > 8192) throw new HttpError(413, "Deployment metadata is too large");
    const text = await boundedText(request.body, 8192);
    let body: any;
    try { body = JSON.parse(text); } catch { throw new HttpError(400, "Invalid deployment metadata"); }
    if (!body || typeof body !== "object") throw new HttpError(400, "Invalid deployment metadata");
    const repository = bounded(body.repository, "GitHub repository", 140);
    if (!REPOSITORY.test(repository) || repository.endsWith("/.") || repository.endsWith("/..")) throw new HttpError(400, "Use a github.com owner/repository");
    const slug = bounded(body.slug, "app slug", 64);
    if (slug.length < 2 || !SLUG.test(slug) || RESERVED.has(slug)) throw new HttpError(400, "Choose an app slug with 2–64 lowercase letters, numbers, and single hyphens");
    const recipe = validateRecipe(body.project, body.scheme);
    if (typeof body.commit !== "string" || !SHA.test(body.commit)) throw new HttpError(400, "Deploy requires the exact pushed Git commit");
    const token = authorization.slice(7);
    const [user, repo] = await Promise.all([github("/user", token), github(`/repos/${repository}`, token)]);
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !Number.isSafeInteger(repo.id) || !Number.isSafeInteger(repo.owner?.id)) throw new HttpError(502, "GitHub identity is unavailable");
    if (repo.private !== false || repo.visibility !== "public") throw new HttpError(400, "MENLO currently distributes public GitHub repositories. Your private source has not been published.");
    if (repo.permissions?.push !== true) {
      // A read-only GitHub App token may omit permission flags. Ask GitHub for
      // the user's role; never infer write authority from a username or repo URL.
      const permission = await github(`/repos/${repository}/collaborators/${encodeURIComponent(user.login)}/permission`, token);
      if (!["admin", "write"].includes(permission.permission) || permission.user?.id !== user.id) throw new HttpError(403, "Deploy requires write access to this GitHub repository");
    }
    if (repo.archived || repo.disabled) throw new HttpError(409, "This GitHub repository is archived or disabled");
    const commit = await github(`/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`, token);
    if (!SHA.test(commit.sha)) throw new HttpError(502, "GitHub returned an invalid commit");
    if (commit.sha !== body.commit) throw new HttpError(409, "GitHub's default branch changed. Pull the latest code and deploy again.");
    const projectFile = `${recipe.project}/${recipe.project.endsWith(".xcodeproj") ? "project.pbxproj" : "contents.xcworkspacedata"}`;
    const source = await github(`/repos/${repository}/contents/${projectFile.split("/").map(encodeURIComponent).join("/")}?ref=${commit.sha}`, token);
    if (source.type !== "file") throw new HttpError(400, "Push the Xcode project to GitHub before deploying");
    const media = await presentation(repository, commit.sha, token, false);
    if (media) for (const file of presentationFiles(media)) regularFile(await fileInfo(repository, commit.sha, file, token, false), file.endsWith(".mp4") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
    const name = media?.name ?? bounded(body.name, "app name", 100);
    const description = media?.description ?? (body.description ? bounded(body.description, "description", 500) : "");
    if (!find(slug) && await options.legacySlugExists?.(slug)) throw new HttpError(409, "That app link is already in use. Choose --app-slug with another name.");
    const result = db.transaction(() => {
      const existing = find(slug);
      const byRepo = db!.query("SELECT slug FROM apps WHERE repository_id = ?").get(repo.id) as { slug: string } | null;
      if (existing && existing.repository_id !== repo.id) throw new HttpError(409, "That app link belongs to another repository. Choose --app-slug with another name.");
      if (byRepo && byRepo.slug !== slug) throw new HttpError(409, `This repository already has a link: ${config.baseUrl}/${byRepo.slug}. Use --app-slug ${byRepo.slug}.`);
      if (existing && existing.owner_id !== repo.owner.id) throw new HttpError(409, "Repository transfers require operator review before this app link can be reused");
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const app: GitHubApp = { schema: "menlo.github-app/1", id: existing?.id ?? crypto.randomUUID(), slug,
        repository_id: repo.id, owner_id: repo.owner.id, repository: repo.full_name,
        publisher: { id: user.id, login: user.login }, name, description, ...recipe,
        created_at: existing?.created_at ?? now, updated_at: now };
      db!.query("INSERT INTO apps VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET record=excluded.record").run(slug, repo.id, JSON.stringify(app));
      db!.query("INSERT INTO registration_events(app_id, actor_id, kind, record, occurred_at) VALUES (?, ?, ?, ?, ?)").run(app.id, user.id, existing ? "recipe_updated" : "registered", JSON.stringify(app), now);
      return app;
    })();
    cache.clear();
    directoryCache = undefined;
    return json({ ...result, head_commit: commit.sha, public_url: `${config.baseUrl}/${slug}` }, 201);
  }
  return {
    find,
    close: () => db?.close(),
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/menlo/v1/")) return undefined;
      try {
        rateLimit(request.method === "POST");
        if (url.pathname === "/api/menlo/v1/status" && request.method === "GET") return json({ schema: "menlo.status/1", available: !!db, github_client_id: config.clientId ?? null, source: "github", ledger: "offchain", visibility: "public" });
        if (url.pathname === "/api/menlo/v1/apps" && request.method === "POST") return await register(request);
        const asset = /^\/api\/menlo\/v1\/apps\/([a-z0-9-]+)\/media\/([a-f0-9]{40})\/(menloapp\/[A-Za-z0-9_./-]+)$/.exec(url.pathname);
        if (asset && ["GET", "HEAD"].includes(request.method)) return await mediaResponse(request, asset[1]!, asset[2]!, asset[3]!);
        const share = /^\/api\/menlo\/v1\/apps\/([a-z0-9-]+)\/og\.png$/.exec(url.pathname);
        if (share && ["GET", "HEAD"].includes(request.method)) return await shareImage(request, share[1]!);
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        if (url.pathname === "/api/menlo/v1/activity") return json(await directory());
        if (url.pathname === "/api/menlo/v1/apps") return json({ apps: (db?.query("SELECT record FROM apps ORDER BY rowid DESC LIMIT 100").all() as { record: string }[] ?? []).map(row => JSON.parse(row.record)) });
        const match = /^\/api\/menlo\/v1\/apps\/([a-z0-9-]+)(\/compare)?$/.exec(url.pathname);
        if (!match) throw new HttpError(404, "Not found");
        const app = await current(requireApp(match[1]!));
        if (!match[2]) return json(await presented(app));
        const base = url.searchParams.get("base") ?? "";
        if (!SHA.test(base)) throw new HttpError(400, "Comparison requires the full installed commit");
        const comparison = await github(`/repos/${app.repository}/compare/${base}...${app.head_commit}?per_page=1`, config.readToken, true);
        const linear = comparison.status === "ahead" || comparison.status === "identical";
        return json({ schema: "menlo.github-comparison/1", slug: app.slug, repository_id: app.repository_id, base_commit: base,
          head_commit: app.head_commit, status: comparison.status, commits_behind: linear && Number.isSafeInteger(comparison.ahead_by) && comparison.ahead_by >= 0 ? comparison.ahead_by : null,
          checked_at: app.checked_at, compare_url: `https://github.com/${app.repository}/compare/${base}...${app.head_commit}` });
      } catch (error) {
        return json({ error: error instanceof HttpError ? error.message : "MENLO could not reach GitHub. Try again shortly." }, error instanceof HttpError ? error.status : 503);
      }
    },
    async render(slug: string): Promise<string | undefined> {
      const record = find(slug);
      if (!record) return undefined;
      let app: Awaited<ReturnType<typeof presented>> | undefined;
      try { app = await presented(await current(record)); } catch { /* No stale install button when GitHub identity cannot be checked. */ }
      return renderAppListing(config.baseUrl, record, app);
    },
    async renderIndex(): Promise<string> {
      return renderAppDirectory(config.baseUrl, await directory());
    },
    cards(): string {
      const apps = (db?.query("SELECT record FROM apps ORDER BY rowid DESC LIMIT 6").all() as { record: string }[] ?? []).map(row => JSON.parse(row.record) as GitHubApp);
      return apps.length ? apps.map(app => `<a class="ml-app" href="/${app.slug}"><h3>${escape(app.name)}</h3><p>${escape(app.description || app.repository)}</p><span>GitHub · ${escape(app.repository)}</span></a>`).join("") : `<div class="ml-empty"><p>Your next tester is a link away. Deploy a public GitHub app to start.</p></div>`;
    },
  };
}

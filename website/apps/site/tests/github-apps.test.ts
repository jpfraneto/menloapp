import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { createGitHubApps, validateRecipe } from "../src/github-apps.ts";
import { REVIEW_POLICY, REVIEW_STATEMENT } from "../../../../packages/cli/src/review-policy.js";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const run of cleanup.splice(0)) await run(); });
const sha = "a".repeat(40), next = "b".repeat(40);
const metadata = { repository: "maker/TestApp", slug: "test-app", name: "Test App", commit: sha, project: "App.xcodeproj", scheme: "App" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "menlo-github-"));
  const files = new Map<string, Buffer>();
  const requests: string[] = [];
  const state = { now: 0, oauthRequests: 0, id: 12, owner: 4, user: 4, authFail: false, badCommit: false, push: true, omitPermissions: false, private: false, head: sha, commits: [] as any[], status: "ahead", ahead: 3, fail: false, fileMode: "100644", folderMode: "040000" };
  const hash = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.origin === "https://github.com") {
      if (url.pathname === "/login/device/code") return Response.json({ device_code: "private-device-code", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 600, interval: 5 });
      state.oauthRequests++;
      return Response.json({ access_token: "ghp_browsercredential" });
    }
    if (url.origin === "https://raw.githubusercontent.com") {
      expect(init?.headers).toBeUndefined();
      const file = files.get(url.pathname.split("/").slice(4).join("/"));
      return file ? new Response(Uint8Array.from(file).buffer) : new Response(null, { status: 404 });
    }
    expect(url.origin).toBe("https://api.github.com");
    if (state.fail) return Response.json({}, { status: 503 });
    if (url.pathname === "/user") return state.authFail ? Response.json({}, { status: 401 }) : Response.json({ id: state.user, login: state.user === 4 ? "maker" : "reviewer" });
    if (url.pathname.includes("/collaborators/")) return Response.json({ permission: state.push ? "write" : "read", user: { id: 4 } });
    if (url.pathname.includes("/compare/")) return Response.json({ status: state.status, ahead_by: state.ahead });
    if (url.pathname.endsWith("/commits")) return Response.json(state.commits);
    if (url.pathname.includes("/commits/")) return Response.json({ sha: state.badCommit ? next : /^[a-f0-9]{40}$/.test(url.pathname.split("/").at(-1)!) ? url.pathname.split("/").at(-1) : state.head });
    if (url.pathname.includes("/git/trees/")) {
      const folder = "c".repeat(40);
      const tree = url.pathname.endsWith(folder) ? [...files].map(([file, bytes]) => ({ path: file.slice(9), type: "blob", mode: state.fileMode, size: bytes.length, sha: hash(bytes) })) : files.size ? [{ path: "menloapp", type: "tree", mode: state.folderMode, sha: folder }] : [];
      return Response.json({ tree, truncated: false });
    }
    if (url.pathname.includes("/git/blobs/")) {
      const bytes = [...files.values()].find(bytes => url.pathname.endsWith(hash(bytes)));
      return bytes ? Response.json({ encoding: "base64", content: bytes.toString("base64") }) : Response.json({}, { status: 404 });
    }
    if (url.pathname.includes("/contents/")) {
      const file = decodeURIComponent(url.pathname.split("/contents/")[1]!);
      if (!file.startsWith("menloapp/")) return Response.json({ type: "file" });
      const bytes = files.get(file);
      return bytes ? Response.json({ type: "file", size: bytes.length, sha: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"), encoding: "base64", content: bytes.toString("base64") }) : Response.json({}, { status: 404 });
    }
    return Response.json({ id: state.id, owner: { id: state.owner, login: "maker" }, full_name: "maker/TestApp", private: state.private, visibility: state.private ? "private" : "public", permissions: state.omitPermissions ? undefined : { push: state.push }, default_branch: "main" });
  };
  const create = () => createGitHubApps({ root, baseUrl: "https://tohseno.com", clientId: "public-client" }, { fetch: fetcher as typeof fetch, now: () => state.now });
  let router = create();
  const request = (method: string, route: string, body?: unknown, auth = true, cookie = "") => router.fetch(new Request(`https://tohseno.com/api/menlo/v1/${route}`, {
    method, headers: { "Content-Type": "application/json", Origin: "https://tohseno.com", ...(auth ? { Authorization: "Bearer ghp_testcredential" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  cleanup.push(async () => { router.close(); await rm(root, { recursive: true, force: true }); });
  return { root, state, files, requests, request, get router() { return router; }, restart() { router.close(); router = create(); } };
}

test("deploy proves GitHub authority and persists one stable app link without credentials", async () => {
  const f = await fixture();
  expect((await f.request("POST", "apps", metadata, false))!.status).toBe(401);
  f.state.push = false;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(403);
  f.state.push = true;
  f.state.private = true;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(400);
  f.state.private = false;
  const deployed = await (await f.request("POST", "apps", metadata))!.json();
  expect(deployed.public_url).toBe("https://tohseno.com/test-app");
  f.restart();
  const resolved = await (await f.request("GET", "apps/test-app"))!.json();
  expect(resolved.id).toBe(deployed.id);
  expect(resolved.head_commit).toBe(sha);
  expect(resolved.open_url).toContain(`commit=${sha}&repository=12`);
  expect((await readFile(join(f.root, "github-apps.sqlite"))).includes(Buffer.from("ghp_testcredential"))).toBe(false);
});
test("an ordinary GitHub push becomes an update without another registration", async () => {
  const f = await fixture();
  await f.request("POST", "apps", metadata);
  f.state.head = next;
  const comparison = await (await f.request("GET", `apps/test-app/compare?base=${sha}`))!.json();
  expect(comparison.head_commit).toBe(next);
  expect(comparison.commits_behind).toBe(3);
  expect(comparison.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const db = new Database(join(f.root, "github-apps.sqlite"));
  expect((db.query("SELECT count(*) n FROM registration_events").get() as any).n).toBe(1);
  expect(() => db.exec("DELETE FROM registration_events")).toThrow("append-only");
  db.close();
});
test("rewritten history never fabricates a commits-behind count", async () => {
  const f = await fixture();
  await f.request("POST", "apps", metadata);
  f.state.status = "diverged";
  const value = await (await f.request("GET", `apps/test-app/compare?base=${sha}`))!.json();
  expect(value.commits_behind).toBeNull();
  expect(value.status).toBe("diverged");
});
test("repository replacement and transfer cannot inherit an existing app identity", async () => {
  const f = await fixture();
  await f.request("POST", "apps", metadata);
  f.state.id = 99;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(409);
  expect((await f.request("GET", "apps/test-app"))!.status).toBe(409);
  f.state.id = 12; f.state.owner = 99;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(409);
});
test("unavailable identity removes the actionable download link and HTML is escaped", async () => {
  const f = await fixture();
  await f.request("POST", "apps", { ...metadata, name: "<script>oops</script>" });
  f.state.fail = true;
  const page = (await f.router.render("test-app"))!;
  expect(page).toContain("&lt;script&gt;");
  expect(page).not.toContain("href=\"menlo:");
  expect(page).toContain("Installation is paused");
});
test("build recipes reject path traversal and argument injection", () => {
  for (const project of ["../a.xcodeproj", "/a.xcodeproj", "a/../b.xcodeproj", "-a.xcodeproj", "a\\b.xcodeproj"]) expect(() => validateRecipe(project, "App")).toThrow();
  expect(() => validateRecipe("App.xcodeproj", "-scheme")).toThrow();
});

test("read-only app tokens still prove the user's actual repository role", async () => {
  const f = await fixture();
  f.state.omitPermissions = true;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(201);
  f.state.push = false;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(403);
});
test("deployment cannot register a different default-branch commit after a race", async () => {
  const f = await fixture();
  f.state.head = next;
  expect((await f.request("POST", "apps", metadata))!.status).toBe(409);
  expect((await f.request("GET", "apps/test-app"))!.status).toBe(404);
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1sAAAAASUVORK5CYII=", "base64");
function addPresentation(files: Map<string, Buffer>, name = "Committed App") {
  files.set("menloapp/app.json", Buffer.from(JSON.stringify({ version: 1, name, subtitle: "A useful app", description: "First line\nSecond line", icon: "menloapp/icon.png", screenshots: ["menloapp/one.png", "menloapp/two.png", "menloapp/three.png"], preview: { path: "menloapp/preview.mp4", kind: "simulator", source_commit: sha } })));
  for (const file of ["icon.png", "one.png", "two.png", "three.png"]) files.set(`menloapp/${file}`, png);
  files.set("menloapp/preview.mp4", Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]));
}

test("app pages and API use committed metadata and pin every asset to that commit", async () => {
  const f = await fixture();
  addPresentation(f.files);
  const deployed = await (await f.request("POST", "apps", { ...metadata, name: "Ignored request name" }))!.json();
  expect(deployed.name).toBe("Committed App");
  const page = (await f.router.render("test-app"))!;
  expect(page).toContain("Committed App");
  expect(page).toContain("First line\nSecond line");
  expect(page).toContain("<video muted loop playsinline");
  expect(page).toContain(`/media/${sha}/menloapp/icon.png`);
  expect(page.match(/alt="Committed App screenshot/g)?.length).toBe(3);
  expect(page).not.toContain("Ignored request name");
  expect(page).toContain('<summary class="ml-button ml-pill ml-get-button">Get app</summary>');
  expect(page).toContain("Get Committed App on your iPhone");
  expect(page).toContain(`href="menlo://app/test-app?commit=${sha}&amp;repository=12">Open in Menlo</a>`);
  expect(page).toContain('href="/download/macos" data-remember-app>Download Menlo</a>');
  // The ordinary page shows the plain app link; only a shared version carries its commit.
  expect(page).toContain("npx menloapp@1.6.0 try &#39;https://tohseno.com/test-app&#39;");
  expect(page).toContain('id="app-link" value="https://tohseno.com/test-app"');
  expect(f.router.resolvePath("test-app", "latest")).toBe("test-app");
  expect(f.router.resolvePath("missing", "latest")).toBeUndefined();
  expect(f.router.resolvePath(deployed.publisher.login.toUpperCase(), "test-app")).toBe("test-app");
  expect(f.router.resolvePath("someone-else", "test-app")).toBeUndefined();
  addPresentation(f.files, "Next name"); f.state.head = next; f.restart();
  const updated = await (await f.request("GET", "apps/test-app"))!.json();
  expect(updated.name).toBe("Next name");
  expect(updated.head_commit).toBe(next);
  expect(updated.presentation.preview.source_commit).toBe(sha);
});

test("public media verifies committed bytes, supports video ranges, and refuses unselected files", async () => {
  const f = await fixture(); addPresentation(f.files);
  await f.request("POST", "apps", metadata);
  const route = `https://tohseno.com/api/menlo/v1/apps/test-app/media/${sha}/menloapp/`;
  const icon = (await f.router.fetch(new Request(`${route}icon.png`)))!;
  expect(icon.status).toBe(200);
  expect(icon.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await icon.arrayBuffer())).toEqual(png);
  const range = (await f.router.fetch(new Request(`${route}preview.mp4`, { headers: { Range: "bytes=4-7" } })))!;
  expect(range.status).toBe(206); expect(await range.text()).toBe("ftyp");
  expect(range.headers.get("content-range")).toBe("bytes 4-7/16");
  expect((await f.router.fetch(new Request(`${route}preview.mp4`, { headers: { Range: "bytes=999-" } })))!.status).toBe(416);
  expect((await f.router.fetch(new Request(`${route}private.png`)))!.status).toBe(404);
  f.files.set("menloapp/icon.png", Buffer.from("different bytes"));
  expect((await f.router.fetch(new Request(`${route}icon.png`)))!.status).toBe(502);
  const share = (await f.request("GET", `apps/test-app/og.png?commit=${sha}`))!;
  expect(share.status).toBe(200);
  expect(share.headers.get("content-type")).toBe("image/png");
});

test("malformed committed presentation cannot publish arbitrary remote media or HTML", async () => {
  const f = await fixture();
  f.files.set("menloapp/app.json", Buffer.from(JSON.stringify({ version: 1, name: "App", icon: "https://evil.test/a.png" })));
  expect((await f.request("POST", "apps", metadata))!.status).toBe(422);
  addPresentation(f.files, '<script>alert("x")</script>');
  expect((await f.request("POST", "apps", metadata))!.status).toBe(201);
  const page = (await f.router.render("test-app"))!;
  expect(page).toContain("&lt;script&gt;");
  expect(page).not.toContain('<script>alert');
});


test("public presentation rejects symbolic links even when Contents API would follow them", async () => {
  const f = await fixture(); addPresentation(f.files);
  f.state.fileMode = "120000";
  expect((await f.request("POST", "apps", metadata))!.status).toBe(422);
  f.state.fileMode = "100644"; f.state.folderMode = "120000";
  expect((await f.request("POST", "apps", metadata))!.status).toBe(422);
});

test("public discovery lists each app once and leaves updates to installed-app comparisons", async () => {
  const f = await fixture(); addPresentation(f.files);
  await f.request("POST", "apps", metadata);
  await f.request("POST", "apps", metadata);
  f.state.commits = [
    { sha: next, author: { id: 8, login: "contributor" }, commit: { committer: { date: "2090-01-02T12:00:00Z" }, message: "A useful improvement\nPrivate-looking extra line" } },
    { sha, author: null, commit: { committer: { date: "2020-01-01T00:00:00Z" }, message: "Before MENLO" } },
  ];
  const feed = await (await f.request("GET", "activity"))!.json();
  expect(feed.events.map((event: any) => event.kind)).toEqual(["published"]);
  expect(feed.apps).toHaveLength(1);
  expect(f.requests.some(path => path.endsWith("/commits"))).toBe(false);
  const page = await f.router.renderIndex();
  expect(page).toContain("<h1>Shipped on Menlo</h1>");
  expect(page).not.toContain("SOFTWARE IS INFINITE.");
  expect(page.match(/<li class="ml-post">/g)).toHaveLength(1);
  // The preview tile and Get app both open the app; Source pins the published commit.
  expect(page.match(/href="\/test-app"/g)).toHaveLength(2);
  expect(page).toContain('data-flash-copy="https://tohseno.com/test-app"');
  expect(page).toContain(`href="https://github.com/maker/TestApp/tree/${f.state.head}"`);
  expect(page).not.toContain("Latest activity");
  expect(page).not.toContain("deployed an update");
  expect(page).not.toContain("A useful improvement");
  expect(page).not.toContain("Before MENLO");
  const comparison = await (await f.request("GET", `apps/test-app/compare?base=${sha}`))!.json();
  expect(comparison.commits_behind).toBe(3);
  const db = new Database(join(f.root, "github-apps.sqlite"));
  expect((db.query("SELECT count(*) n FROM registration_events").get() as any).n).toBe(2);
  db.close();
});

test("discovery keeps actual publication history when GitHub is unavailable and rejects replacement commits", async () => {
  const f = await fixture();
  await f.request("POST", "apps", metadata);
  f.state.id = 99;
  const feed = await (await f.request("GET", "activity"))!.json();
  expect(feed.listings_unavailable).toBe(true);
  expect(feed.events.length).toBe(1);
  expect(feed.events[0].kind).toBe("published");
  expect(feed.apps[0].listing).toBeUndefined();
  // A post never waits on details that failed to load, and the feed shows no error banner.
  const page = await f.router.renderIndex();
  expect(page.match(/<li class="ml-post">/g)).toHaveLength(1);
  expect(page).toContain('href="https://github.com/maker/TestApp"');
  expect(page).not.toContain("temporarily unavailable");
});

test("app share metadata is server-rendered and serves a real 1200 by 630 PNG to crawlers", async () => {
  const f = await fixture(); addPresentation(f.files);
  await f.request("POST", "apps", metadata);
  const page = (await f.router.render("test-app"))!;
  expect(page).toContain('<meta property="og:title" content="Committed App">');
  expect(page).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(page).toContain(`og.png?v=2&amp;commit=${sha}`);
  const url = `https://tohseno.com/api/menlo/v1/apps/test-app/og.png?v=2&commit=${sha}`;
  const image = (await f.router.fetch(new Request(url, { headers: { "User-Agent": "Twitterbot/1.0" } })))!;
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/png");
  const bytes = Buffer.from(await image.arrayBuffer());
  expect(bytes.subarray(0, 8)).toEqual(png.subarray(0, 8));
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  const head = (await f.router.fetch(new Request(url, { method: "HEAD" })))!;
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe(String(bytes.length));
  expect(await head.text()).toBe("");
  expect((await f.router.fetch(new Request(url, { headers: { "If-None-Match": image.headers.get("etag")! } })))!.status).toBe(304);
  expect((await f.request("GET", "apps/test-app/og.png?commit=main"))!.status).toBe(400);
});

const recommendation = { policy: REVIEW_POLICY, statement: REVIEW_STATEMENT, repository_id: 12, commit: sha, project: "App.xcodeproj", scheme: "App", outcome: "recommend", scopes: ["source", "dependencies"], notes: "Examined the app source and dependencies." };
test("a shared version remains pinned after a push, including source, handoff, canonical URL and review command", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  f.state.head = next; f.restart();
  const params = new URLSearchParams({ commit: sha, repository: "12" });
  const page = (await f.router.render("test-app", params))!;
  expect(page).toContain(`menlo://app/test-app?commit=${sha}&amp;repository=12`);
  expect(page).toContain(`rel="canonical" href="https://tohseno.com/test-app?commit=${sha}&amp;repository=12"`);
  expect(page).toContain("You’re viewing a shared version");
  expect(page).toContain("Send to your Mac");
  expect(page).toContain(`npx menloapp@1.6.0 try &#39;https://tohseno.com/test-app?commit=${sha}&amp;repository=12&#39;`);
  expect(page).toContain("Share on X");
  expect(page).toContain(`npx menloapp@1.6.0 review &#39;https://tohseno.com/test-app?commit=${sha}&amp;repository=12&#39;`);
  const resolved = await (await f.request("GET", `apps/test-app?${params}`))!.json();
  expect(resolved.head_commit).toBe(sha);
  expect(resolved.latest_commit).toBe(next);
  expect((await f.request("GET", "apps/test-app?commit=main"))!.status).toBe(400);
  expect((await f.request("GET", `apps/test-app?commit=${sha}&commit=${next}`))!.status).toBe(400);
  expect((await f.request("GET", `apps/test-app?commit=${sha}&repository=99`))!.status).toBe(400);
  f.state.badCommit = true; f.restart();
  expect((await f.request("GET", `apps/test-app?${params}`))!.status).toBe(409);
  expect((await f.router.render("test-app", params))!).not.toContain('href="menlo:');
});

test("reviews authenticate the actual GitHub user, are idempotent, and never transfer to a new commit or recipe", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  const route = `apps/test-app/reviews?commit=${sha}&repository=12`;
  expect((await f.request("POST", route, recommendation, false))!.status).toBe(401);
  f.state.authFail = true;
  expect((await f.request("POST", route, recommendation))!.status).toBe(401);
  f.state.authFail = false; f.state.user = 7;
  const review = await (await f.request("POST", route, { ...recommendation, reviewer: { id: 999, login: "impersonated" } }))!.json();
  expect(review.reviewer).toEqual({ id: 7, login: "reviewer" });
  const repeated = await (await f.request("POST", route, recommendation))!.json();
  expect(repeated.id).toBe(review.id);
  f.restart();
  const reviews = await (await f.request("GET", route))!.json();
  expect(reviews.count).toBe(1);
  expect(reviews.reviews[0].commit).toBe(sha);
  expect((await f.router.render("test-app"))!).toContain("@reviewer");
  f.state.head = next; f.restart();
  expect((await (await f.request("GET", `apps/test-app/reviews?commit=${next}`))!.json()).count).toBe(0);
  expect((await f.router.render("test-app"))!).not.toContain("@reviewer");
  expect((await f.router.render("test-app", new URLSearchParams({ commit: sha })))!).toContain("@reviewer");
  await f.request("POST", "apps", { ...metadata, commit: next, scheme: "Other" });
  expect((await (await f.request("GET", route))!.json()).count).toBe(0);
  expect((await f.request("POST", route, recommendation))!.status).toBe(409);
  const db = new Database(join(f.root, "github-apps.sqlite"));
  expect((db.query("SELECT count(*) n FROM review_events").get() as any).n).toBe(1);
  expect(() => db.exec("UPDATE review_events SET reviewer_id=99")).toThrow("append-only");
  expect(() => db.exec("DELETE FROM review_events")).toThrow("append-only");
  db.close();
  expect((await readFile(join(f.root, "github-apps.sqlite"))).includes(Buffer.from("ghp_testcredential"))).toBe(false);
});

test("withdrawal affects only the authenticated reviewer's selected version and retains the historical statement", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  const route = `apps/test-app/reviews?commit=${sha}`;
  await f.request("POST", route, recommendation);
  f.state.user = 7;
  expect((await f.request("POST", route, { ...recommendation, outcome: "withdraw", scopes: [] }))!.status).toBe(404);
  await f.request("POST", route, recommendation);
  await f.request("POST", route, { ...recommendation, outcome: "withdraw", scopes: [] });
  expect((await (await f.request("GET", route))!.json()).reviews.map((review: any) => review.reviewer.id)).toEqual([4]);
  const db = new Database(join(f.root, "github-apps.sqlite"));
  expect((db.query("SELECT count(*) n FROM review_events").get() as any).n).toBe(3);
  db.close();
});

test("reviews require a bounded explicit statement and escape public findings", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  const route = `apps/test-app/reviews?commit=${sha}`;
  for (const change of [{ statement: "safe" }, { policy: "unknown" }, { scopes: [] }, { scopes: ["source", "source"] }, { scopes: ["source", "safe"] }, { notes: "x".repeat(2001) }, { notes: "\u0000" }, { commit: next }, { repository_id: 99 }]) expect((await f.request("POST", route, { ...recommendation, ...change }))!.status).toBeGreaterThanOrEqual(400);
  expect((await f.request("POST", "apps/test-app/reviews", recommendation))!.status).toBe(400);
  expect((await f.request("POST", route, { ...recommendation, notes: '<script>alert("x")</script>' }))!.status).toBe(201);
  const page = (await f.router.render("test-app"))!;
  expect(page).toContain("&lt;script&gt;");
  expect(page).not.toContain('<script>alert');
  expect(page).toContain("· maker");
});

test("browser GitHub review sign-in keeps credentials private, respects polling, and authorizes only the verified account", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  f.state.user = 7;
  const started = (await f.request("POST", "review-login", {}, false))!;
  const cookie = started.headers.get("set-cookie")!.split(";")[0]!;
  expect(started.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
  expect(started.headers.get("set-cookie")).toContain("Secure");
  const code = await started.json();
  expect(code.user_code).toBe("ABCD-1234");
  expect(JSON.stringify(code)).not.toContain("private-device-code");
  expect((await (await f.request("POST", "review-login/poll", {}, false, cookie))!.json()).pending).toBe(true);
  expect(f.state.oauthRequests).toBe(0);
  f.state.now = 5000;
  const identity = await (await f.request("POST", "review-login/poll", {}, false, cookie))!.json();
  expect(identity.reviewer).toEqual({ id: 7, login: "reviewer" });
  expect(JSON.stringify(identity)).not.toContain("ghp_browsercredential");
  const route = `apps/test-app/reviews?commit=${sha}`;
  const published = await (await f.request("POST", route, recommendation, false, cookie))!.json();
  expect(published.reviewer.id).toBe(7);
  const csrf = new Request(`https://tohseno.com/api/menlo/v1/${route}`, { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.test", "Content-Type": "application/json" }, body: JSON.stringify({ ...recommendation, outcome: "withdraw" }) });
  expect((await f.router.fetch(csrf))!.status).toBe(403);
  await f.request("DELETE", "review-login", undefined, false, cookie);
  expect((await f.request("POST", route, recommendation, false, cookie))!.status).toBe(401);
  expect((await (await f.request("GET", route))!.json()).count).toBe(1);
  const persisted = await readFile(join(f.root, "github-apps.sqlite"));
  expect(persisted.includes(Buffer.from("ghp_browsercredential"))).toBe(false);
  expect(persisted.includes(Buffer.from("private-device-code"))).toBe(false);
});

test("browser review authority expires and never survives a server restart", async () => {
  const f = await fixture(); await f.request("POST", "apps", metadata);
  const start = (await f.request("POST", "review-login", {}, false))!;
  const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
  f.state.now = 5000;
  await f.request("POST", "review-login/poll", {}, false, cookie);
  f.state.now = 605001;
  expect((await f.request("POST", `apps/test-app/reviews?commit=${sha}`, recommendation, false, cookie))!.status).toBe(401);
  f.restart();
  expect((await f.request("POST", "review-login/poll", {}, false, cookie))!.status).toBe(401);
});

test("a selected custom share image overrides the generated card and is served only from the pinned public folder", async () => {
  const f = await fixture(); addPresentation(f.files);
  const manifest = JSON.parse(f.files.get("menloapp/app.json")!.toString());
  manifest.ogImage = "menloapp/share.png";
  f.files.set("menloapp/app.json", Buffer.from(JSON.stringify(manifest)));
  expect((await f.request("POST", "apps", metadata))!.status).toBe(404);
  f.files.set("menloapp/share.png", png);
  expect((await f.request("POST", "apps", metadata))!.status).toBe(201);
  const page = (await f.router.render("test-app"))!;
  const imageURL = `https://tohseno.com/api/menlo/v1/apps/test-app/media/${sha}/menloapp/share.png`;
  expect(page).toContain(`<meta property="og:image" content="${imageURL}">`);
  expect(page).toContain(`<meta name="twitter:image" content="${imageURL}">`);
  expect(page).not.toContain('og:image:width');
  expect(page).not.toContain('og.png?');
  const image = (await f.router.fetch(new Request(imageURL)))!;
  expect(image.status).toBe(200);
  expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
});

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { createGitHubApps, validateRecipe } from "../src/github-apps.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const run of cleanup.splice(0)) await run(); });
const sha = "a".repeat(40), next = "b".repeat(40);
const metadata = { repository: "maker/TestApp", slug: "test-app", name: "Test App", commit: sha, project: "App.xcodeproj", scheme: "App" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "menlo-github-"));
  const state = { id: 12, owner: 4, push: true, omitPermissions: false, private: false, head: sha, status: "ahead", ahead: 3, fail: false };
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.github.com");
    if (state.fail) return Response.json({}, { status: 503 });
    if (url.pathname === "/user") return Response.json({ id: 4, login: "maker" });
    if (url.pathname.includes("/collaborators/")) return Response.json({ permission: state.push ? "write" : "read", user: { id: 4 } });
    if (url.pathname.includes("/compare/")) return Response.json({ status: state.status, ahead_by: state.ahead });
    if (url.pathname.includes("/commits/")) return Response.json({ sha: state.head });
    if (url.pathname.includes("/contents/")) { expect(url.searchParams.get("ref")).toBe(state.head); return Response.json({ type: "file" }); }
    return Response.json({ id: state.id, owner: { id: state.owner, login: "maker" }, full_name: "maker/TestApp", private: state.private, visibility: state.private ? "private" : "public", permissions: state.omitPermissions ? undefined : { push: state.push }, default_branch: "main" });
  };
  let router = createGitHubApps({ root, baseUrl: "https://tohseno.com" }, { fetch: fetcher as typeof fetch });
  const request = (method: string, route: string, body?: unknown, auth = true) => router.fetch(new Request(`https://tohseno.com/api/menlo/v1/${route}`, {
    method, headers: auth ? { Authorization: "Bearer ghp_testcredential", "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  cleanup.push(async () => { router.close(); await rm(root, { recursive: true, force: true }); });
  return { root, state, request, get router() { return router; }, restart() { router.close(); router = createGitHubApps({ root, baseUrl: "https://tohseno.com" }, { fetch: fetcher as typeof fetch }); } };
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

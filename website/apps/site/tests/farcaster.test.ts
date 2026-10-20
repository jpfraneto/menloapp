import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { Database } from "bun:sqlite";
import { createAppClient } from "@farcaster/auth-client";
import { createClient as quickAuthClient } from "@farcaster/quick-auth";
import { createPublicClient, custom } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createFarcaster, type FarcasterOptions } from "../src/farcaster.ts";
import { createApplication } from "../server.ts";
import { loadConfig } from "../config.ts";
import { miniAppMetadata } from "../src/farcaster-miniapp.ts";

const base = "https://menloapp.lol", domain = "menloapp.lol";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
const app = { slug: "hello", repository_id: 7, commit: "a".repeat(40), name: "Hello", repository: "builder/hello", url: `${base}/hello?commit=${"a".repeat(40)}&repository=7` };
const cleanup: (() => void)[] = [];
afterEach(() => { for (const remove of cleanup.splice(0).reverse()) remove(); });
function request(path: string, method = "GET", cookie = "", body?: unknown, extra: Record<string, string> = {}) {
  return new Request(`${base}/api/menlo/v1/farcaster${path}`, { method, headers: { Cookie: cookie, ...(method !== "GET" ? { Origin: base, "Content-Type": "application/json" } : {}), ...extra }, ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}) });
}
function sessionCookie(response: Response) { return response.headers.get("set-cookie")!.split(";")[0]!; }
function fixture(options: FarcasterOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "menlo-farcaster."));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  let now = Date.now(), calls = 0;
  let params: Record<string, unknown> = {}, wrongSignature = false, authorized = true, authAddress = false;
  const ethereum = {
    // Local chain-state fixture; signatures are real and verified by the production SDK.
    getFid: async (address: string) => authorized && !authAddress && address.toLowerCase() === account.address.toLowerCase() ? 42n : 0n,
    isValidAuthAddress: async (address: string, fid: bigint) => authAddress && authorized && address.toLowerCase() === account.address.toLowerCase() && fid === 42n,
    publicClient: createPublicClient({ transport: custom({ request: async () => { throw new Error("EOA-only local fixture"); } }, { retryCount: 0 }) }),
  };
  const client = createAppClient({ ethereum });
  const verify = client.verifySignInMessage;
  client.verifySignInMessage = args => { calls++; return verify(args); };
  function open(extra: FarcasterOptions = {}) {
    const router = createFarcaster({ baseUrl: base, root }, async (slug, commit, repository) => {
      if (slug !== app.slug || commit !== app.commit || repository !== app.repository_id) throw new Error("Wrong source identity");
      return app;
    }, { authClient: client, now: () => now, ...options, ...extra });
    cleanup.push(() => router.close());
    return router;
  }
  const router = open();
  return { router, client, root, open, advance: (ms: number) => { now += ms; }, calls: () => calls,
    change: (next: Record<string, unknown>) => { params = next; }, wrongSignature: () => { wrongSignature = true; }, revoke: () => { authorized = false; }, useAuthAddress: () => { authAddress = true; },
    async login() {
      const start = (await router.fetch(request("/login", "POST", "", { address: account.address, ...(authAddress ? { fid: 42 } : {}) })))!;
      const pending = sessionCookie(start);
      const data = await start.clone().json();
      const message = Object.keys(params).length ? createSiweMessage({ address: account.address, domain, uri: `${base}/login`, version: "1", chainId: 10, statement: "Farcaster Auth", nonce: "changednonce123", issuedAt: new Date(now), expirationTime: new Date(now + 600_000), resources: ["farcaster://fid/42"], ...params }) : data.message;
      const signature = await (wrongSignature ? other : account).signMessage({ message });
      const complete = (await router.fetch(request("/verify", "POST", pending, { message, signature })))!;
      return { pending, cookie: sessionCookie(complete), complete, start, message, signature };

    } };
}

test("real SIWF signatures resolve the verified FID, rotate sessions, and recover saved versions across browsers and restarts", async () => {
  const f = fixture();
  const first = await f.login();
  expect(await first.complete.json()).toEqual({ fid: 42 });
  expect(first.start.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
  expect(first.start.headers.get("set-cookie")).toContain("Secure");
  expect(first.cookie).not.toBe(first.pending);
  expect((await (await f.router.fetch(request("/session", "GET", first.pending)))!.json()).fid).toBeNull();
  const save = (await f.router.fetch(request("/saved-apps", "POST", first.cookie, { ...app, fid: 999 })))!;
  expect((await save.json()).apps).toEqual([app]);
  const second = await f.login();
  expect((await (await f.router.fetch(request("/saved-apps", "GET", second.cookie)))!.json()).apps).toEqual([app]);
  const db = new Database(join(f.root, "farcaster.sqlite"));
  expect(db.query("SELECT id FROM sessions WHERE id = ?").get(first.cookie.split("=")[1]!)).toBeNull();
  db.close();
  const restarted = f.open();
  expect((await (await restarted.fetch(request("/saved-apps", "GET", second.cookie)))!.json()).apps).toEqual([app]);
  await restarted.fetch(request("/logout", "POST", second.cookie));
  await expect(restarted.fetch(request("/saved-apps", "GET", second.cookie))).rejects.toThrow("Sign in");
  expect((await (await restarted.fetch(request("/saved-apps", "GET", first.cookie)))!.json()).apps).toEqual([app]);
});

test("registered auth addresses can sign in without sharing custody credentials", async () => {
  const f = fixture(); f.useAuthAddress();
  expect((await (await f.login()).complete.json()).fid).toBe(42);
});

test("wallet challenges are single-use and recheck the current key authority", async () => {
  const f = fixture();
  const { pending, message, signature } = await f.login();
  await expect(f.router.fetch(request("/verify", "POST", pending, { message, signature }))).rejects.toThrow("expired");
  const start = (await f.router.fetch(request("/login", "POST", "", { address: account.address })))!;
  const next = await start.json();
  const signed = await account.signMessage({ message: next.message });
  f.revoke();
  await expect(f.router.fetch(request("/verify", "POST", sessionCookie(start), { message: next.message, signature: signed }))).rejects.toThrow("ownership");
});

test("unknown wallets cannot select a Farcaster identity without proving its authority", async () => {
  const f = fixture();
  await expect(f.router.fetch(request("/login", "POST", "", { address: other.address }))).rejects.toThrow("does not own");
  const start = (await f.router.fetch(request("/login", "POST", "", { address: other.address, fid: 42 })))!;
  const { message } = await start.json();
  const signature = await other.signMessage({ message });
  await expect(f.router.fetch(request("/verify", "POST", sessionCookie(start), { message, signature }))).rejects.toThrow("ownership");
});

test("revoking a wallet's authority also ends an existing browser session", async () => {
  const f = fixture();
  const { cookie } = await f.login();
  await f.router.fetch(request("/saved-apps", "POST", cookie, app));
  f.revoke();
  await expect(f.router.fetch(request("/saved-apps", "GET", cookie))).rejects.toThrow("no longer has authority");
  expect((await (await f.router.fetch(request("/session", "GET", cookie)))!.json()).fid).toBeNull();
});

test("altered domain, nonce, callback, expiry and signatures fail closed", async () => {
  const attempts: ((f: ReturnType<typeof fixture>) => void)[] = [
    f => f.change({ domain: "evil.test" }), f => f.change({ nonce: "differentnonce123" }),
    f => f.change({ uri: `${base}/other-app` }), f => f.change({ expirationTime: new Date(Date.now() - 60_000) }),
    f => f.change({ expirationTime: new Date(Date.now() + 3600_000) }), f => f.wrongSignature(),
  ];
  for (const change of attempts) {
    const f = fixture(); change(f);
    await expect(f.login()).rejects.toThrow();

  }
});

test("a delayed wallet signature cannot resurrect a cancelled session", async () => {
  const f = fixture();
  const start = (await f.router.fetch(request("/login", "POST", "", { address: account.address })))!, pending = sessionCookie(start);
  const { message } = await start.json();
  const signature = await account.signMessage({ message });
  let entered!: () => void, resume!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { resume = resolve; });
  const verify = f.client.verifySignInMessage;
  f.client.verifySignInMessage = async args => { const value = await verify(args); entered(); await held; return value; };
  f.advance(2100);
  const attempt = f.router.fetch(request("/verify", "POST", pending, { message, signature }));
  await reached;
  await f.router.fetch(request("/logout", "POST", pending));
  resume();
  await expect(attempt).rejects.toThrow("expired");
});

test("browser actions reject cross-origin requests, fake identities, and oversized bodies", async () => {
  const f = fixture();
  await expect(f.router.fetch(request("/login", "POST", "", {}, { Origin: "https://evil.test" }))).rejects.toThrow("from Menlo");
  expect(f.calls()).toBe(0);
  await expect(f.router.fetch(request("/saved-apps", "POST", "", { ...app, fid: 42 }))).rejects.toThrow("Sign in");
  const { cookie } = await f.login();
  await expect(f.router.fetch(request("/saved-apps", "POST", cookie, { ...app, text: "x".repeat(4096) }))).rejects.toThrow("too large");
  await expect(f.router.fetch(request("/saved-apps", "POST", cookie, { ...app, commit: "latest" }))).rejects.toThrow("exact app version");
  f.advance(24 * 3600_000);
  expect((await (await f.router.fetch(request("/session", "GET", cookie)))!.json()).fid).toBeNull();
});

test("Quick Auth checks actual JWT signatures, issuer, audience and expiry before sharing a library", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: "jwk" }), alg: "RS256", kid: "test", use: "sig" };
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ keys: [jwk] }) });
  cleanup.push(() => { server.stop(true); });
  const issuer = server.url.origin, quick = quickAuthClient({ origin: issuer });
  const f = fixture({ verifyToken: (token, domain) => quick.verifyJwt({ token, domain }) });
  const token = (overrides: Record<string, unknown> = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: issuer, aud: domain, sub: 42, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...overrides })).toString("base64url");
    const data = `${header}.${payload}`;
    return `${data}.${sign("RSA-SHA256", Buffer.from(data), keys.privateKey).toString("base64url")}`;
  };
  const bearer = { Authorization: `Bearer ${token()}` };
  const { cookie } = await f.login();
  await f.router.fetch(request("/saved-apps", "POST", cookie, app));
  expect((await (await f.router.fetch(request("/saved-apps", "GET", "", undefined, bearer)))!.json()).apps).toEqual([app]);
  for (const invalid of [token({ aud: "evil.test" }), token({ iss: "https://evil.test" }), token({ exp: 1 }), token({ exp: undefined }), token({ sub: "42" }), token({ iat: Math.floor(Date.now() / 1000) + 1000 }), token().slice(0, -10) + "forged"]) {
    await expect(f.router.fetch(request("/session", "GET", cookie, undefined, { Authorization: `Bearer ${invalid}` }))).rejects.toThrow("verified");
  }
  const different = { Authorization: `Bearer ${token({ sub: 43 })}` };
  expect((await (await f.router.fetch(request("/saved-apps", "GET", "", undefined, different)))!.json()).apps).toEqual([]);
});

test("HTTP entrypoints ship a self-hosted SDK, allow only Farcaster framing, and leave the unsigned manifest unavailable", async () => {
  const application = await createApplication({ config: loadConfig({ NODE_ENV: "test", BASE_URL: base }), log() {}, logError() {} });
  for (const path of ["/", "/login", "/library"]) {
    const response = await application.fetch(new Request(base + path));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="fc:miniapp"');
    expect(html).toContain('/menlo/farcaster.js?v=2');
    if (path === "/login") {
      expect(html).toContain("Connect wallet and sign in");
      expect(html).not.toContain("Continue in Farcaster");
      expect(html).not.toContain("data-farcaster-qr");
    }
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://farcaster.xyz https://warpcast.com");
    expect(response.headers.get("content-security-policy")).not.toContain("unsafe-inline");
  }
  const privacy = await application.fetch(new Request(`${base}/privacy`));
  expect(privacy.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  const bundle = await application.fetch(new Request(`${base}/menlo/farcaster.js`));
  expect(bundle.status).toBe(200);
  expect(bundle.headers.get("content-type")).toContain("javascript");
  expect((await bundle.text()).length).toBeGreaterThan(1000);
  const manifest = await application.fetch(new Request(`${base}/.well-known/farcaster.json`));
  expect(manifest.status).toBe(503);
  expect(manifest.headers.get("cache-control")).toBe("no-store");
  for (const [name, width, height] of [["icon", 1024, 1024], ["splash", 200, 200], ["preview", 1200, 800]] as const) {
    const image = await application.fetch(new Request(`${base}/menlo/farcaster-${name}.png`));
    const bytes = Buffer.from(await image.arrayBuffer());
    expect(image.status).toBe(200);
    expect(bytes.readUInt32BE(16)).toBe(width);
    expect(bytes.readUInt32BE(20)).toBe(height);
  }
  // Exact-version links keep their query when shared as a Mini App.
  expect(miniAppMetadata(app.url)).toContain(`commit=${app.commit}&amp;repository=7`);
});

test("manifest configuration requires an association for the canonical domain", async () => {
  const association = { header: Buffer.from('{"fid":42,"type":"custody","key":"0x00"}').toString("base64url"), payload: Buffer.from(JSON.stringify({ domain })).toString("base64url"), signature: "AA" };
  // Fixture tests publication of an owner-supplied association, not cryptographic ownership.
  const config = loadConfig({ NODE_ENV: "test", BASE_URL: base, FARCASTER_ACCOUNT_ASSOCIATION: JSON.stringify(association) });
  const application = await createApplication({ config, log() {}, logError() {} });
  const response = await application.fetch(new Request(`${base}/.well-known/farcaster.json`));
  expect(response.status).toBe(200);
  expect((await response.json()).accountAssociation).toEqual(association);
  expect(() => loadConfig({ BASE_URL: "https://evil.test", FARCASTER_ACCOUNT_ASSOCIATION: JSON.stringify(association) })).toThrow("domain");
});

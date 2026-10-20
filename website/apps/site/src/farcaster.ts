import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createAppClient, viemConnector, type AppClient } from "@farcaster/auth-client";
import { createClient } from "@farcaster/quick-auth";
import { getAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { HttpError } from "./security.ts";
import { menloPage } from "./menlo-shell.ts";

const PREFIX = "/api/menlo/v1/farcaster";
const PENDING_MS = 10 * 60_000;
const SESSION_MS = 24 * 60 * 60_000;
export interface SavedApp {
  slug: string;
  repository_id: number;
  commit: string;
  name: string;
  repository: string;
  url: string;
}
type Session = { id: string; fid: number | null; address: `0x${string}` | null; expires: number; nonce: string | null; message: string | null };
type TokenClaims = { sub: number; exp: number; iat: number };
export interface FarcasterOptions {
  authClient?: AppClient;
  verifyToken?: (token: string, domain: string) => Promise<TokenClaims>;
  now?: () => number;
}

/** Farcaster proves user identity only. It grants no GitHub, signing, or device authority. */
export function createFarcaster(config: { baseUrl: string; root?: string; rpcUrl?: string },
  resolveApp: (slug: string, commit: string, repository: number) => Promise<SavedApp>, options: FarcasterOptions = {}) {
  const origin = new URL(config.baseUrl).origin, domain = new URL(origin).host;
  const secure = origin.startsWith("https:"), cookieName = secure ? "__Host-menlo-farcaster" : "menlo-farcaster";
  const now = options.now ?? Date.now;
  const appClient = options.authClient ?? createAppClient({ ethereum: viemConnector({ rpcUrl: config.rpcUrl ?? "https://mainnet.optimism.io" }) });
  const quickAuth = createClient();
  const verifyToken = options.verifyToken ?? (async (token, domain) => quickAuth.verifyJwt({ token, domain }));
  let db: Database | undefined;
  if (config.root) {
    mkdirSync(config.root, { recursive: true, mode: 0o700 });
    db = new Database(join(config.root, "farcaster.sqlite"), { create: true });
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, fid INTEGER, address TEXT, expires INTEGER NOT NULL, nonce TEXT, message TEXT);
      CREATE TABLE IF NOT EXISTS saved_apps (fid INTEGER NOT NULL, repository_id INTEGER NOT NULL, record TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY(fid, repository_id));`);
  }
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const cookie = (value: string, seconds = SESSION_MS / 1000) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
  const json = (value: unknown, headers: Record<string, string> = {}) => Response.json(value, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization", ...headers } });
  function database() {
    if (!db) throw new HttpError(503, "Farcaster sign-in is unavailable. You can still browse apps.");
    return db;
  }
  function sameOrigin(request: Request) {
    if (request.headers.get("origin") !== origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new HttpError(403, "This action must come from Menlo.");
  }
  function session(request: Request): Session | undefined {
    const token = (request.headers.get("cookie") ?? "").split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    const value = db?.query("SELECT * FROM sessions WHERE id = ? AND expires > ?").get(hash(token), now()) as Session | null;
    return value ?? undefined;
  }
  async function identity(request: Request): Promise<number | undefined> {
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      if (!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(authorization)) throw new HttpError(401, "Sign in with Farcaster again.");
      try {
        const claims = await verifyToken(authorization.slice(7), domain);
        if (!Number.isSafeInteger(claims.sub) || claims.sub <= 0 || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)
            || claims.exp * 1000 <= now() || claims.iat * 1000 > now() + 30_000) throw new Error();
        return claims.sub;
      } catch { throw new HttpError(401, "Farcaster authentication could not be verified. Sign in again."); }
    }
    const current = session(request);
    if (!current?.fid || !current.address) return;
    let authorized: boolean;
    try {
      authorized = await appClient.ethereum.isValidAuthAddress(current.address, BigInt(current.fid))
        || await appClient.ethereum.getFid(current.address) === BigInt(current.fid);
    } catch { throw new HttpError(503, "Farcaster ownership could not be checked. Please try again."); }
    if (!authorized) {
      db?.query("DELETE FROM sessions WHERE id = ?").run(current.id);
      throw new HttpError(401, "This wallet no longer has authority for that Farcaster account. Sign in again.");
    }
    // Logout during an ownership check cannot recover the prior session.
    return session(request)?.id === current.id ? current.fid : undefined;
  }
  function newSession(fid: number | null, nonce: string | null, expires: number, message: string | null = null, address: string | null = null) {
    const token = randomBytes(32).toString("hex"), id = hash(token);
    database().query("INSERT INTO sessions (id, fid, address, nonce, expires, message) VALUES (?, ?, ?, ?, ?, ?)").run(id, fid, address, nonce, expires, message);
    return { token, id };
  }
  let windowStart = now(), starts = 0, requests = 0;
  function limit(start: boolean) {
    if (now() - windowStart >= 60_000) { windowStart = now(); starts = requests = 0; }
    if (++requests > 1200 || start && ++starts > 30) throw new HttpError(429, "Too many sign-in requests. Try again in a minute.");
  }
  async function body(request: Request) {
    if (!request.body) throw new HttpError(400, "Missing request body.");
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > 4096) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
        chunks.push(next.value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new HttpError(400, "Invalid JSON."); }
    } finally { reader.releaseLock(); }
  }
  return {
    close() { db?.close(); },
    async fetch(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(`${PREFIX}/`)) return;
      const action = url.pathname.slice(PREFIX.length);
      limit(action === "/login" && request.method === "POST");
      if (request.method !== "GET") sameOrigin(request);
      if (action === "/session" && request.method === "GET") return json({ available: !!db, fid: await identity(request) ?? null });
      const store = database();
      if (action === "/logout" && request.method === "POST") {
        const existing = session(request);
        if (existing) store.query("DELETE FROM sessions WHERE id = ?").run(existing.id);
        return json({ fid: null }, { "Set-Cookie": cookie("", 0) });
      }
      if (action === "/login" && request.method === "POST") {
        store.query("DELETE FROM sessions WHERE expires <= ?").run(now());
        const value = await body(request);
        let address: `0x${string}`;
        try { address = getAddress(value.address); }
        catch { throw new HttpError(400, "Connect an Ethereum wallet to sign in."); }
        let fid: number;
        if (value.fid !== undefined) {
          if (!Number.isSafeInteger(value.fid) || value.fid <= 0) throw new HttpError(400, "Enter a valid Farcaster ID.");
          fid = value.fid;
        } else {
          try { fid = Number(await appClient.ethereum.getFid(address)); }
          catch { throw new HttpError(503, "Farcaster ownership could not be checked. Please try again."); }
          if (!Number.isSafeInteger(fid) || fid <= 0) throw new HttpError(400, "This wallet does not own a Farcaster ID. For a registered auth wallet, enter your Farcaster ID below.");
        }
        const count = store.query("SELECT count(*) AS count FROM sessions").get() as { count: number };
        if (count.count >= 10_000) throw new HttpError(429, "Many people are signing in. Try again later.");
        const nonce = randomBytes(24).toString("hex"), expires = now() + PENDING_MS;
        const message = createSiweMessage({ address, domain, uri: `${origin}/login`, version: "1", chainId: 10,
          statement: "Farcaster Auth", nonce, issuedAt: new Date(now()), expirationTime: new Date(expires), resources: [`farcaster://fid/${fid}`] });
        const existing = session(request);
        const pending = newSession(null, nonce, expires, message);
        if (existing) store.query("DELETE FROM sessions WHERE id = ?").run(existing.id);
        return json({ message, fid }, { "Set-Cookie": cookie(pending.token, PENDING_MS / 1000) });
      }
      if (action === "/verify" && request.method === "POST") {
        const existing = session(request);
        if (!existing || !existing.nonce || !existing.message) throw new HttpError(401, "Sign-in expired. Please start again.");
        const value = await body(request);
        if (!value || value.message !== existing.message || typeof value.signature !== "string" || !/^0x[0-9a-fA-F]{130,3000}$/.test(value.signature)) throw new HttpError(401, "The signature must match this login request.");
        const verified = await appClient.verifySignInMessage({ message: existing.message, signature: value.signature,
          domain, nonce: existing.nonce, acceptAuthAddress: true });
        if (verified.isError || !verified.success || !Number.isSafeInteger(verified.fid) || verified.fid <= 0)
          throw new HttpError(401, "This signature could not prove Farcaster ownership. Use the custody wallet or a registered auth wallet.");
        // Consume the exact challenge once; cancellation or a competing verification wins.
        const authenticated = store.transaction(() => {
          const consumed = store.query("DELETE FROM sessions WHERE id = ? AND expires > ? AND nonce = ?").run(existing.id, now(), existing.nonce);
          if (consumed.changes !== 1) throw new HttpError(401, "Sign-in expired or was already used. Please start again.");
          return newSession(verified.fid, null, now() + SESSION_MS, null, verified.data.address);
        })();
        return json({ fid: verified.fid }, { "Set-Cookie": cookie(authenticated.token) });
      }
      if (action === "/saved-apps" && ["GET", "POST", "DELETE"].includes(request.method)) {
        const fid = await identity(request);
        if (!fid) throw new HttpError(401, "Sign in with Farcaster to access your saved apps.");
        if (request.method !== "GET") {
          const value = await body(request);
          if (!value || !Number.isSafeInteger(value.repository_id) || value.repository_id <= 0) throw new HttpError(400, "Invalid app identity.");
          if (request.method === "DELETE") store.query("DELETE FROM saved_apps WHERE fid = ? AND repository_id = ?").run(fid, value.repository_id);
          else {
            if (typeof value.slug !== "string" || value.slug.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) || typeof value.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.commit)) throw new HttpError(400, "Save an exact app version.");
            const app = await resolveApp(value.slug, value.commit, value.repository_id);
            // Do not write after a session was revoked while GitHub was responding.
            if (await identity(request) !== fid) throw new HttpError(401, "Sign in again.");
            store.transaction(() => {
              const count = store.query("SELECT count(*) AS count FROM saved_apps WHERE fid = ?").get(fid) as { count: number };
              const saved = store.query("SELECT 1 FROM saved_apps WHERE fid = ? AND repository_id = ?").get(fid, value.repository_id);
              if (!saved && count.count >= 100) throw new HttpError(409, "Your library holds up to 100 saved apps. Remove one before saving another.");
              store.query("INSERT INTO saved_apps VALUES (?, ?, ?, ?) ON CONFLICT(fid, repository_id) DO UPDATE SET record = excluded.record, saved_at = excluded.saved_at").run(fid, value.repository_id, JSON.stringify(app), now());
            })();
          }
        }
        const rows = store.query("SELECT record FROM saved_apps WHERE fid = ? ORDER BY saved_at DESC").all(fid) as { record: string }[];
        return json({ fid, apps: rows.map(row => JSON.parse(row.record)) });
      }
      throw new HttpError(405, "Method not allowed.");
    },
  };
}

export function renderFarcasterAccount(baseUrl: string, library: boolean) {
  return menloPage(library ? "Saved apps" : "Sign in", "Keep your saved apps with your Farcaster identity.", `${baseUrl}/${library ? "library" : "login"}`, `<main id="main" class="ml-container ml-account-page">
<h1>${library ? "Saved apps" : "Your apps, wherever you open Menlo."}</h1><p>Sign in with Farcaster to keep your saved apps across browsers and devices.</p>
<section data-farcaster-account><p data-farcaster-identity>Checking sign-in…</p><div class="ml-actions"><button class="ml-button ml-pill" data-farcaster-signin hidden>Connect wallet and sign in</button><button class="ml-button ml-button-secondary ml-pill" data-farcaster-signout hidden>Sign out</button><a class="ml-text-link" href="/">Discover apps →</a></div>
<div data-farcaster-wallets hidden><p>Choose your wallet</p><div class="ml-actions" data-farcaster-wallet-options></div></div>
<details class="ml-terminal-option"><summary>Using a delegated auth wallet?</summary><label for="farcaster-fid">Farcaster ID</label><input class="ml-link-field" id="farcaster-fid" data-farcaster-fid inputmode="numeric" pattern="[1-9][0-9]*" placeholder="Your FID"><p class="ml-small">Use a wallet registered as an auth address for this ID. A profile's verified wallet alone does not grant login authority.</p></details>
<p class="ml-small">Sign a login message in your wallet. No gas, payment, or seed phrase.</p>
<p class="ml-copy-status" data-farcaster-status role="status" aria-live="polite"></p><button class="ml-button ml-button-secondary" data-farcaster-merge hidden></button>
<ul class="ml-saved-apps" data-farcaster-library></ul></section><p class="ml-small">Browsing works without signing in. Guest saves stay in this browser until you choose to add them to your account. Saving an app does not build, install, or publish it.</p></main>`);
}

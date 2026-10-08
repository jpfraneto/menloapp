import { randomBytes } from "node:crypto";
import { HttpError } from "./security.ts";

type Reviewer = { id: number; login: string };
type Session = { expires: number; device?: string; nextPoll: number; interval: number; reviewer?: Reviewer; polling?: boolean };

/** Short-lived browser authorization using the existing GitHub Device Flow.
 * Only the device code / verified account live in memory; access tokens are
 * consumed to resolve /user and immediately discarded. */
export function createReviewLogin(config: { baseUrl: string; clientId?: string }, remote: typeof fetch, identify: (token: string) => Promise<Reviewer>, now = Date.now) {
  const sessions = new Map<string, Session>();
  const secure = new URL(config.baseUrl).protocol === "https:";
  const cookieName = secure ? "__Host-menlo-review" : "menlo-review";
  const cookie = (id: string, seconds = 600) => `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
  function sameOrigin(request: Request) {
    if (request.headers.get("origin") !== new URL(config.baseUrl).origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new HttpError(403, "Review actions must come from this MENLO page");
  }
  function session(request: Request) {
    const id = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const value = id ? sessions.get(id) : undefined;
    if (!value || value.expires <= now()) { if (id) sessions.delete(id); return undefined; }
    return { id: id!, value };
  }
  async function post(path: string, fields: Record<string, string>) {
    const response = await remote(`https://github.com${path}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields), redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new HttpError(503, "GitHub sign-in is temporarily unavailable");
    if (!response.body) throw new HttpError(502, "GitHub sign-in returned an invalid response");
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16_384) { await reader.cancel(); throw new HttpError(502, "GitHub sign-in returned an invalid response"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  return {
    reviewer(request: Request) {
      sameOrigin(request);
      const reviewer = session(request)?.value.reviewer;
      if (!reviewer) throw new HttpError(401, "Sign in with GitHub to review this version");
      return reviewer;
    },
    async fetch(request: Request): Promise<Response | undefined> {
      const path = new URL(request.url).pathname;
      if (!["/api/menlo/v1/review-login", "/api/menlo/v1/review-login/poll"].includes(path)) return undefined;
      const json = (body: unknown, headers: Record<string, string> = {}) => Response.json(body, { headers: { "Cache-Control": "no-store", ...headers } });
      if (request.method === "GET" && path.endsWith("/review-login")) return json({ reviewer: session(request)?.value.reviewer ?? null, available: !!config.clientId });
      if (!["POST", "DELETE"].includes(request.method)) throw new HttpError(405, "Method not allowed");
      sameOrigin(request);
      const existing = session(request);
      if (request.method === "DELETE") {
        if (existing) sessions.delete(existing.id);
        return json({ reviewer: null }, { "Set-Cookie": cookie("", 0) });
      }
      if (!config.clientId) throw new HttpError(503, "Browser GitHub sign-in is unavailable. Use menloapp review in Terminal.");
      if (path.endsWith("/poll")) {
        if (!existing) throw new HttpError(401, "GitHub sign-in expired. Start again.");
        const value = existing.value;
        if (value.reviewer) return json({ reviewer: value.reviewer });
        if (value.polling || now() < value.nextPoll) return json({ pending: true, interval: Math.max(1, Math.ceil((value.nextPoll - now()) / 1000)) });
        value.nextPoll = now() + value.interval * 1000;
        value.polling = true;
        try {
          const result = await post("/login/oauth/access_token", { client_id: config.clientId, device_code: value.device!, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
          if (typeof result.access_token === "string" && /^[A-Za-z0-9_]+$/.test(result.access_token) && result.access_token.length <= 1024) {
            const reviewer = await identify(result.access_token);
            // A logout, restart or expiry during the provider request cannot
            // resurrect a session or authorize a delayed review.
            if (sessions.get(existing.id) !== value || value.expires <= now()) throw new HttpError(401, "GitHub sign-in expired. Start again.");
            value.reviewer = reviewer;
            delete value.device;
            value.expires = now() + 600_000;
            return json({ reviewer }, { "Set-Cookie": cookie(existing.id) });
          }
          if (result.error === "slow_down") { value.interval += 5; value.nextPoll = now() + value.interval * 1000; }
          else if (result.error !== "authorization_pending") { sessions.delete(existing.id); throw new HttpError(401, "GitHub sign-in was cancelled or expired. Start again."); }
          return json({ pending: true, interval: value.interval });
        } finally { value.polling = false; }
      }
      if (existing?.value.reviewer) return json({ reviewer: existing.value.reviewer });
      for (const [id, value] of sessions) if (value.expires <= now()) sessions.delete(id);
      if (sessions.size >= 128) throw new HttpError(429, "Many people are signing in. Try again shortly.");
      if (existing) sessions.delete(existing.id);
      const result = await post("/login/device/code", { client_id: config.clientId, scope: "read:user" });
      if (typeof result.device_code !== "string" || !result.device_code || result.device_code.length > 1024 || typeof result.user_code !== "string" || !/^[A-Z0-9-]{1,16}$/.test(result.user_code) || result.verification_uri !== "https://github.com/login/device" || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw new HttpError(502, "GitHub sign-in returned an invalid response");
      const interval = Number.isFinite(result.interval) ? Math.max(5, Math.min(result.interval, 30)) : 5;
      const id = randomBytes(32).toString("hex");
      sessions.set(id, { device: result.device_code, expires: now() + Math.min(result.expires_in, 600) * 1000, interval, nextPoll: now() + interval * 1000 });
      return json({ user_code: result.user_code, verification_uri: result.verification_uri, interval }, { "Set-Cookie": cookie(id) });
    },
  };
}

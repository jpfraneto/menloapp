import { expect, test } from "bun:test";
import { createReviewLogin } from "../src/github-review-login.ts";

const base = "https://menloapp.lol";
const device = { device_code: "private-device", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 600, interval: 5 };
const request = (route: string, cookie = "", method = "POST", origin = base) => new Request(`${base}/api/menlo/v1/review-login${route}`, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie } });
test("browser Device Flow honors provider backoff and consumes tokens only to identify the reviewer", async () => {
  let now = 0, polls = 0;
  const tokens: string[] = [];
  const results = [{ error: "slow_down" }, { error: "authorization_pending" }, { access_token: "ghp_private" }];
  const login = createReviewLogin({ baseUrl: base, clientId: "public-client" }, (async (url, init) => {
    if (String(url).endsWith("/device/code")) {
      expect(String(init?.body)).toContain("scope=read%3Auser");
      return Response.json(device);
    }
    polls++; return Response.json(results.shift());
  }) as typeof fetch, async token => { tokens.push(token); return { id: 7, login: "reviewer" }; }, () => now);
  const start = (await login.fetch(request("")))!;
  const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
  expect(cookie).toMatch(/^__Host-menlo-review=[a-f0-9]{64}$/);
  now = 5000;
  expect((await (await login.fetch(request("/poll", cookie)))!.json()).interval).toBe(10);
  now = 9000;
  expect((await (await login.fetch(request("/poll", cookie)))!.json()).pending).toBe(true);
  expect(polls).toBe(1);
  now = 15000;
  await login.fetch(request("/poll", cookie));
  now = 25000;
  const complete = (await login.fetch(request("/poll", cookie)))!;
  expect(await complete.json()).toEqual({ reviewer: { id: 7, login: "reviewer" } });
  expect(tokens).toEqual(["ghp_private"]);
  expect(complete.headers.get("set-cookie")).not.toContain("ghp_private");
  expect(login.reviewer(request("", cookie))).toEqual({ id: 7, login: "reviewer" });
});

test("a delayed GitHub approval cannot resurrect a signed-out browser session", async () => {
  let now = 0, entered!: () => void, resume!: () => void;
  const identifying = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { resume = resolve; });
  const login = createReviewLogin({ baseUrl: base, clientId: "public-client" }, (async url => Response.json(String(url).endsWith("/device/code") ? device : { access_token: "ghp_private" })) as typeof fetch,
    async () => { entered(); await held; return { id: 7, login: "reviewer" }; }, () => now);
  const cookie = (await login.fetch(request("")))!.headers.get("set-cookie")!.split(";")[0]!;
  now = 5000;
  const pending = login.fetch(request("/poll", cookie));
  await identifying;
  await login.fetch(request("", cookie, "DELETE"));
  resume();
  await expect(pending).rejects.toThrow("expired");
  expect(() => login.reviewer(request("", cookie))).toThrow("Sign in");
});

test("browser sign-in rejects cross-origin actions, spoofed provider destinations, and oversized responses", async () => {
  let calls = 0;
  const login = createReviewLogin({ baseUrl: base, clientId: "public-client" }, (async (_url: string | URL | Request) => { calls++; return Response.json({ ...device, verification_uri: "https://evil.test/login" }); }) as typeof fetch, async () => ({ id: 7, login: "reviewer" }));
  await expect(login.fetch(request("", "", "POST", "https://evil.test"))).rejects.toThrow("MENLO page");
  expect(calls).toBe(0);
  await expect(login.fetch(request(""))).rejects.toThrow("invalid response");
  const oversized = createReviewLogin({ baseUrl: base, clientId: "public-client" }, (async (_url: string | URL | Request) => new Response("x".repeat(16385))) as typeof fetch, async () => ({ id: 7, login: "reviewer" }));
  await expect(oversized.fetch(request(""))).rejects.toThrow("invalid response");
});

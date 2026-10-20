import type { AppConfig } from "../config.ts";
import { SECURITY_HEADERS } from "./security.ts";

export function miniAppMetadata(url: string) {
  if (!/^https?:\/\//.test(url)) return "";
  const origin = new URL(url).origin;
  const value = { version: "1", imageUrl: `${origin}/menlo/farcaster-preview.png`, button: { title: "Open Menlo", action: {
    type: "launch_miniapp", name: "Menlo", url, splashImageUrl: `${origin}/menlo/farcaster-splash.png`, splashBackgroundColor: "#121510",
  } } };
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return `<meta name="fc:miniapp" content="${escape(JSON.stringify(value))}"><meta name="fc:frame" content="${escape(JSON.stringify({ ...value, button: { ...value.button, action: { ...value.button.action, type: "launch_frame" } } }))}">`;
}

export function farcasterManifest(config: AppConfig) {
  if (!config.farcaster?.accountAssociation) return Response.json({ error: "The owner has not signed Menlo's Farcaster domain association yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ accountAssociation: config.farcaster.accountAssociation, miniapp: {
    version: "1", name: "Menlo", homeUrl: `${config.baseUrl}/`, iconUrl: `${config.baseUrl}/menlo/farcaster-icon.png`,
    splashImageUrl: `${config.baseUrl}/menlo/farcaster-splash.png`, splashBackgroundColor: "#121510",
    subtitle: "Apps from their builders", description: "Discover open-source iPhone apps and keep your saved apps with your Farcaster identity.",
    primaryCategory: "developer-tools", tags: ["apps", "opensource"], canonicalDomain: new URL(config.baseUrl).hostname,
  } }, { headers: { "Cache-Control": "public, max-age=300" } });
}

/** Only public Menlo pages are embeddable. Authentication still requires a signed credential. */
export function miniAppResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", SECURITY_HEADERS["Content-Security-Policy"]
    .replace("connect-src 'self'", "connect-src 'self' https://auth.farcaster.xyz")
    .replace("frame-ancestors 'none'", "frame-ancestors 'self' https://farcaster.xyz https://warpcast.com"));
  return new Response(response.body, { status: response.status, headers });
}

let browserBundle: Promise<Blob> | undefined;
export function farcasterBrowserBundle() {
  return browserBundle ??= Bun.build({ entrypoints: [joinBrowserPath()], target: "browser", format: "esm", minify: true }).then(result => {
    if (!result.success || result.outputs.length !== 1) throw new Error("Farcaster browser bundle could not be built");
    return result.outputs[0]!;
  });
}
function joinBrowserPath() { return new URL("./farcaster-browser.js", import.meta.url).pathname; }

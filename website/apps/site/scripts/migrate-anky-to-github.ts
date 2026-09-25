// One-time owner-authorized /anky migration (2026-09-25, ADR 0043).
// Run inside the existing production container; supply a GitHub user token on
// stdin, never in arguments or environment. --check uses an isolated directory.
// This invokes the ordinary authenticated registrar. It does not rewrite the
// historical Registry or weaken the public endpoint's legacy-slug protection.
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config.ts";
import { createGitHubApps } from "../src/github-apps.ts";

const mode = process.argv[2];
if (process.argv.length !== 3 || !["--check", "--apply"].includes(mode ?? "")) {
  throw new Error("Use --check or --apply; provide the GitHub user token on stdin");
}
const config = loadConfig();
if (config.baseUrl !== "https://menloapp.lol" || !config.registry.root) {
  throw new Error("This migration is only for the existing MENLO production directory");
}
const repository = "jpfraneto/anky-seed";
const repositoryID = 1236924944;
const ownerID = 63654352;
const commit = "f3451eea236e86fa5a18be731294dc9133e81443";
const release = "0xbfedc96908c631e6cb65bade0e7ee3d3002e0afb08d82a797d435f50211a0744";
const shot = "0xd3f39ec1f705cf9b2e87688869f7e09188ac0a14ded693d566d5e3cd4c0c075f";
const token = (await Bun.stdin.text()).trim();
if (!/^[A-Za-z0-9_]{20,1024}$/.test(token)) throw new Error("A GitHub user token is required");

async function historicalManifest() {
  const response = await fetch(`${config.baseUrl}/api/registry/v1/releases/${release}`, {
    redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("The historical signed release is unavailable");
  const evidence = await response.json() as any;
  if (evidence.release_digest !== release || evidence.signed_manifest?.release?.shot_id !== shot
      || evidence.signed_manifest?.release?.display?.app_slug !== "anky") {
    throw new Error("The historical Anky identity differs from the authorized migration");
  }
  return createHash("sha256").update(JSON.stringify(evidence.signed_manifest)).digest("hex");
}

const before = await historicalManifest();
const temporary = mode === "--check" ? await mkdtemp(join(tmpdir(), "menlo-anky-check-")) : undefined;
const router = createGitHubApps({
  baseUrl: config.baseUrl,
  root: temporary ?? config.menlo?.root ?? join(config.registry.root, "menlo"),
}, {
  // Check the fixed numeric identities within the same requests used by the
  // normal registrar, before it can write a directory record or ledger event.
  fetch: Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(input, init);
    const url = String(input);
    if (response.ok && ["https://api.github.com/user", `https://api.github.com/repos/${repository}`].includes(url)) {
      const identity = await response.clone().json() as any;
      if (url.endsWith("/user") ? identity.id !== ownerID
        : identity.id !== repositoryID || identity.owner?.id !== ownerID) {
        throw new Error("GitHub identity differs from the authorized Anky migration");
      }
    }
    return response;
  }, { preconnect: fetch.preconnect }),
});
try {
  const existing = router.find("anky");
  if (existing) throw new Error("Anky is already registered; inspect it instead of replaying the migration");
  const response = await router.fetch(new Request(`${config.baseUrl}/api/menlo/v1/apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ repository, slug: "anky", name: "Anky", commit,
      description: "Anky, built from its public GitHub source for your iPhone.",
      project: "apps/ios/Anky.xcodeproj", scheme: "Anky" }),
  }));
  const result = await response?.json() as any;
  if (response?.status !== 201) throw new Error(result?.error ?? "Anky registration failed");
  if (await historicalManifest() !== before) throw new Error("Historical signed evidence changed; inspect before continuing");
  console.log(JSON.stringify({ mode, app: result, historical_release: release,
    historical_url: `${config.baseUrl}/s/${shot.slice(2)}`,
    historical_signed_manifest_sha256: before, historical_signed_manifest_unchanged: true }, null, 2));
} finally {
  router.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}

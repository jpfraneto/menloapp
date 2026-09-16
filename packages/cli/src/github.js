import { execFileSync, spawn } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const MENLO_ORIGIN = "https://tohseno.com";
const SHA = /^[a-f0-9]{40}$/;
export function githubRepository(remote) {
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (!match || match[1].split("/").some(p => p === "." || p === "..")) throw new Error("Set origin to a github.com repository before deploying.");
  return match[1];
}
export function deployOptions(args) {
  const options = { directory: ".", json: false, dryRun: false };
  let directory = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--scheme", "--app-slug", "--project", "--name"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("-")) throw new Error(`${arg} needs a value`);
      options[{ "--scheme": "scheme", "--app-slug": "slug", "--project": "project", "--name": "name" }[arg]] = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown MENLO deploy option: ${arg}`);
    else if (!directory) { options.directory = arg; directory = true; }
    else throw new Error("Choose one app directory.");
  }
  return options;
}
async function api(url, init = {}, fetcher = fetch) {
  const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
  let body;
  try { body = await response.json(); } catch { throw new Error("The service returned an unreadable response. Try again."); }
  if (!response.ok) throw new Error(body.error && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  return body;
}
export async function deviceLogin(clientId, { fetcher = fetch, log = console.error, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), open = url => { if (process.platform === "darwin") { const browser = spawn("/usr/bin/open", [url], { stdio: "ignore" }); browser.on("error", () => {}); browser.unref(); } } } = {}) {
  const post = (url, fields) => api(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) }, fetcher);
  const device = await post("https://github.com/login/device/code", { client_id: clientId, scope: "read:user public_repo" });
  if (!device.device_code || !device.user_code || device.verification_uri !== "https://github.com/login/device" || !Number.isFinite(device.expires_in)) throw new Error("GitHub device sign-in is unavailable. Enable Device Flow for the MENLO GitHub app.");
  log(`Sign in to GitHub: ${device.verification_uri}\nEnter code: ${device.user_code}`);
  open(device.verification_uri);
  const deadline = Date.now() + Math.min(device.expires_in, 900) * 1000;
  let interval = Math.max(device.interval || 5, 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const result = await post("https://github.com/login/oauth/access_token", { client_id: clientId, device_code: device.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (typeof result.access_token === "string") return result.access_token;
    if (result.error === "slow_down") interval += 5000;
    else if (result.error !== "authorization_pending") throw new Error(`GitHub sign-in ${result.error === "access_denied" ? "was cancelled" : "expired; try again"}.`);
  }
  throw new Error("GitHub sign-in expired. Run deploy again.");
}
async function token() {
  // Reuse GitHub's own credential manager. Never persist a copy in the app directory.
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const value = execFileSync("gh", ["auth", "token", "--hostname", "github.com"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim();
    if (value) return value;
  } catch { /* Device flow works without installing the GitHub CLI. */ }
  if (process.platform === "darwin") {
    try {
      const saved = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "com.menlo.github", "-a", "github", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim();
      if (saved) return saved;
    } catch { /* A Mac app login is optional. */ }
  }
  if (process.env.MENLO_NONINTERACTIVE === "1") throw new Error("Sign in with GitHub in MENLO’s profile, or run gh auth login in Terminal, then deploy again.");
  const status = await api(`${MENLO_ORIGIN}/api/menlo/v1/status`);
  if (!status.github_client_id) throw new Error("GitHub sign-in is not configured on MENLO yet. For now, sign in with `gh auth login` and run deploy again.");
  return deviceLogin(status.github_client_id);
}
function git(directory, ...args) {
  try { return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { throw new Error("Open a Git repository with a GitHub origin and at least one pushed commit."); }
}
export async function inspectProject(options) {
  const input = await realpath(options.directory);
  const explicitContainer = /\.(xcodeproj|xcworkspace)$/.test(input) ? input : undefined;
  const directory = explicitContainer ? path.dirname(input) : input;
  const root = git(directory, "rev-parse", "--show-toplevel");
  const repository = githubRepository(git(root, "remote", "get-url", "origin"));
  const commit = git(root, "rev-parse", "HEAD");
  if (!SHA.test(commit)) throw new Error("This Git revision is unsupported.");
  if (git(root, "status", "--porcelain", "--untracked-files=normal")) throw new Error("Commit and push your changes first. MENLO shares what is on GitHub; it never uploads uncommitted files.");
  let containers = [];
  async function walk(folder, depth = 0) {
    if (depth > 4) return;
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (!item.isDirectory() || item.name.startsWith(".") || ["node_modules", "Pods", "build", "vendor"].includes(item.name)) continue;
      const child = path.join(folder, item.name);
      if (/\.(xcodeproj|xcworkspace)$/.test(item.name)) containers.push(child);
      else await walk(child, depth + 1);
    }
  }
  if (options.project) containers = [await realpath(path.resolve(root, options.project))];
  else if (explicitContainer) containers = [explicitContainer];
  else await walk(directory);
  if (containers.length !== 1) throw new Error(`Found ${containers.length} Xcode containers. Choose one with --project <path relative to repo>.`);
  const project = path.relative(root, containers[0]);
  if (project.startsWith("..") || path.isAbsolute(project)) throw new Error("Choose a project inside this GitHub repository.");
  let scheme = options.scheme;
  if (!scheme) {
    const schemes = await readdir(path.join(containers[0], "xcshareddata/xcschemes")).catch(() => []);
    const names = schemes.filter(name => name.endsWith(".xcscheme")).map(name => name.slice(0, -9));
    if (names.length === 1) scheme = names[0];
    else {
      // A single auto-generated Xcode scheme normally matches the project name.
      // Confirm with Xcode; never execute a build merely to publish a repo link.
      try {
        const kind = containers[0].endsWith(".xcworkspace") ? "-workspace" : "-project";
        const result = JSON.parse(execFileSync("xcodebuild", ["-list", "-json", kind, containers[0], "-disableAutomaticPackageResolution"], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }));
        const choices = (result.project || result.workspace)?.schemes ?? [];
        if (choices.length === 1) scheme = choices[0];
      } catch { /* An explicit choice is actionable on any machine. */ }
    }
  }
  if (!scheme) throw new Error("Choose the iOS app scheme with --scheme <name>.");
  return { repository, project, scheme, name: options.name || scheme, slug: options.slug || repository.split("/")[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), commit };
}
export async function deploy(args) {
  const options = deployOptions(args);
  if (options.help) {
    console.log("MENLO deploy\n\ntohseno deploy [path] [--scheme Name] [--app-slug your-app]\n\nConnect a public GitHub repo once. Its app link follows the default branch.\nOptional: --project path/App.xcodeproj, --name Name, --dry-run, --json");
    return 0;
  }
  const project = await inspectProject(options);
  if (options.dryRun) { console.log(JSON.stringify(project, null, 2)); return 0; }
  const credential = await token();
  const headers = { Authorization: `Bearer ${credential}`, Accept: "application/vnd.github+json", "User-Agent": "menlo-cli" };
  const repo = await api(`https://api.github.com/repos/${project.repository}`, { headers });
  if (repo.private !== false) throw new Error("MENLO currently supports public repositories. Your private source has not been published.");
  const head = await api(`https://api.github.com/repos/${project.repository}/commits/${encodeURIComponent(repo.default_branch)}`, { headers });
  if (head.sha !== project.commit) throw new Error(`Push this commit to GitHub's default branch (${repo.default_branch}) first. MENLO will not silently deploy a different revision.`);
  const result = await api(`${MENLO_ORIGIN}/api/menlo/v1/apps`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...project, description: repo.description || "" }) });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`\n${result.public_url}\n\nShare this link. Future pushes to ${repo.default_branch} appear automatically.\nGitHub: https://github.com/${project.repository}\nNo gas. No source upload.\n`);
  return 0;
}

import { execFileSync, spawnSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { choose, continueAfter, deployUI, openBrowser, shellQuote } from "./deploy-ui.js";

import { setupPresentation, readCommittedPresentation, updatePresentationLinks, commitPresentation, previewNeedsRefresh } from "./project-presentation.js";
import { recordExperience } from "./record.js";
import { previewTools } from "./experience-agent.js";

export const MENLO_ORIGIN = "https://menloapp.lol";
const SHA = /^[a-f0-9]{40}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 20_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

export function githubRepository(remote) {
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (!match || match[1].split("/").some(p => p === "." || p === "..")) throw new Error("This app needs a GitHub repository as its origin.\nSet it with: git remote set-url origin https://github.com/YOUR-NAME/YOUR-APP.git\nThen run menloapp deploy again.");
  return match[1];
}

export function deployOptions(args) {
  const options = { directory: ".", json: false, dryRun: false, record: false, seconds: 20 };
  let directory = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--record") options.record = true;
    else if (arg === "--no-preview") options.noPreview = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--scheme", "--app-slug", "--project", "--name", "--simulator", "--seconds"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("-")) throw new Error(`${arg} needs a value`);
      options[{ "--scheme": "scheme", "--app-slug": "slug", "--project": "project", "--name": "name", "--simulator": "simulator", "--seconds": "seconds" }[arg]] = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown MENLO deploy option: ${arg}\nRun menloapp deploy --help for supported options.`);
    else if (!directory) { options.directory = arg; directory = true; }
    else throw new Error("Choose one app directory.");
  }
  options.seconds = Number(options.seconds);
  if (!Number.isInteger(options.seconds) || options.seconds < 3 || options.seconds > 60) throw new Error("Choose --seconds from 3 to 60.");
  if (options.record && options.noPreview) throw new Error("Choose --record or --no-preview.");
  if (options.dryRun && options.record) throw new Error("Choose --dry-run or --record, not both.");
  return options;
}

class APIError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(url, init = {}, fetcher = fetch) {
  const service = ["api.github.com", "github.com"].includes(new URL(url).hostname) ? "GitHub" : "MENLO";
  let response;
  try { response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error(`Could not reach ${service}. Check your connection and run menloapp deploy again.`); }
  let body;
  try { body = await response.json(); } catch { throw new Error(`${service} returned an unreadable response. Run menloapp deploy again shortly.`); }
  if (!body || typeof body !== "object") throw new Error(`${service} returned an unreadable response. Run menloapp deploy again shortly.`);
  if (!response.ok) {
    const detail = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
    if (response.status === 429 || response.status === 403 && /rate limit/i.test(detail)) throw new APIError(`${service}'s request limit was reached. Wait a few minutes, then run menloapp deploy again.`, 429);
    throw new APIError(detail.slice(0, 500).replace(/[\x00-\x1f\x7f]/g, " ") || `${service} request failed (${response.status}).`, response.status);
  }
  return body;
}

export async function deviceLogin(clientId, { fetcher = fetch, log = console.error, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), open = openBrowser } = {}) {
  const post = (url, fields) => api(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) }, fetcher);
  const device = await post("https://github.com/login/device/code", { client_id: clientId, scope: "read:user public_repo" });
  if (!device.device_code || !device.user_code || device.verification_uri !== "https://github.com/login/device" || !Number.isFinite(device.expires_in)) throw new Error("MENLO's GitHub sign-in is unavailable. Run gh auth login, then menloapp deploy.");
  log(`Sign in to GitHub: ${device.verification_uri}\nEnter code: ${device.user_code}\nWaiting for your approval in the browser…`);
  open(device.verification_uri);
  const deadline = Date.now() + Math.min(device.expires_in, 900) * 1000;
  let interval = Math.max(device.interval || 5, 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const result = await post("https://github.com/login/oauth/access_token", { client_id: clientId, device_code: device.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (typeof result.access_token === "string") return result.access_token;
    if (result.error === "slow_down") interval += 5000;
    else if (result.error !== "authorization_pending") throw new Error(`GitHub sign-in ${result.error === "access_denied" ? "was cancelled" : "expired"}. Run menloapp deploy to sign in again.`);
  }
  throw new Error("GitHub sign-in expired. Run menloapp deploy to sign in again.");
}

const headers = credential => ({ Authorization: `Bearer ${credential}`, Accept: "application/vnd.github+json", "User-Agent": "menlo-cli" });
const optionalRun = (execute, command, args) => { try { return execute(command, args); } catch { return ""; } };

export async function authenticate(ui, { fetcher = fetch, execute = run, env = process.env, platform = process.platform, login = () => spawnSync("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"], { stdio: "inherit" }).status, device = deviceLogin } = {}) {
  const variable = env.GH_TOKEN ? "GH_TOKEN" : env.GITHUB_TOKEN ? "GITHUB_TOKEN" : null;
  let credential = variable ? env[variable] : optionalRun(execute, "gh", ["auth", "token", "--hostname", "github.com"]);
  if (!credential && platform === "darwin") credential = optionalRun(execute, "/usr/bin/security", ["find-generic-password", "-s", "com.menlo.github", "-a", "github", "-w"]);
  const validate = async value => {
    const user = await api("https://api.github.com/user", { headers: headers(value) }, fetcher);
    if (!user.login || !Number.isSafeInteger(user.id)) throw new Error("GitHub did not return your account. Run gh auth login, then menloapp deploy.");
    ui.log(`GitHub: signed in as ${user.login}`);
    return { credential: value, user };
  };
  if (credential) {
    try { return await validate(credential); }
    catch (error) {
      if (error.status !== 401) throw error;
      if (variable) throw new Error(`GitHub rejected the credential in ${variable}.\nReplace it with a valid token, or run:\n  unset ${variable}\n  gh auth login\n  menloapp deploy`);
      ui.log("Your GitHub sign-in has expired. Sign in again to continue.");
    }
  } else ui.log("You are not signed in to GitHub. Sign in to connect this app to your account.");
  const hasGH = Boolean(optionalRun(execute, "gh", ["--version"]));
  const instructions = hasGH ? "Run gh auth login, then menloapp deploy." : "Install GitHub CLI from https://cli.github.com (on Mac: brew install gh), then run:\n  gh auth login\n  menloapp deploy";
  if (!ui.interactive) throw new Error(`You are not signed in to GitHub, or your sign-in has expired.\n${instructions}`);
  if (hasGH) {
    const answer = await ui.ask("Sign in to GitHub in your browser now? [Y/n] ");
    if (answer && !/^y(es)?$/i.test(answer)) throw new Error(`GitHub sign-in is required to deploy.\n${instructions}`);
    if (login() !== 0) throw new Error(`GitHub sign-in did not finish.\n${instructions}`);
    credential = optionalRun(execute, "gh", ["auth", "token", "--hostname", "github.com"]);
  } else {
    const status = await api(`${MENLO_ORIGIN}/api/menlo/v1/status`, {}, fetcher);
    if (!status.github_client_id) throw new Error(`MENLO's browser sign-in is not configured yet.\n${instructions}`);
    credential = await device(status.github_client_id, { fetcher, log: ui.log, open: ui.open });
  }
  if (!credential) throw new Error(`GitHub sign-in did not return a credential.\n${instructions}`);
  try { return await validate(credential); }
  catch (error) { if (error.status === 401) throw new Error(`GitHub did not accept the new sign-in.\n${instructions}`); throw error; }
}

function git(directory, ...args) {
  try { return run("git", ["-C", directory, ...args]); }
  catch { throw new Error("Open your app's Git repository, then run menloapp deploy. It needs a GitHub origin and at least one commit."); }
}

async function inspectRepository(options) {
  let input;
  try { input = await realpath(options.directory); } catch { throw new Error(`App directory not found: ${options.directory}\nRun menloapp deploy from your app's repository.`); }
  const explicitContainer = /\.(xcodeproj|xcworkspace)$/.test(input) ? input : undefined;
  const directory = explicitContainer ? path.dirname(input) : input;
  const root = git(directory, "rev-parse", "--show-toplevel");
  let remote;
  try { remote = run("git", ["-C", root, "remote", "get-url", "origin"]); }
  catch { throw new Error("This repository has no GitHub origin.\nCreate a GitHub repository and connect it with gh repo create --source=. --remote=origin, then run menloapp deploy."); }
  return { root, directory, explicitContainer, repository: githubRepository(remote) };
}

export async function inspectProject(options, ui = deployUI(options)) {
  const { root, directory, explicitContainer, repository } = await inspectRepository(options);
  while (git(root, "status", "--porcelain", "--untracked-files=normal")) {
    await continueAfter(ui, "Your app has uncommitted changes. MENLO shares the code pushed to GitHub.\nIn another terminal, review git status, commit the files you want to share, and push them. Local files will not be uploaded automatically.");
  }
  const commit = git(root, "rev-parse", "HEAD");
  if (!SHA.test(commit)) throw new Error("This Git revision is unsupported.");
  // Only committed containers are available to recipients. Ignore abandoned
  // projects and generated build folders even when they exist on this Mac.
  const files = git(root, "ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0").filter(Boolean);
  const tracked = new Set(files);
  let containers = files.flatMap(file => {
    if (/\.xcodeproj\/project\.pbxproj$/.test(file)) return [path.dirname(file)];
    if (/\.xcworkspace\/contents\.xcworkspacedata$/.test(file) && !file.includes(".xcodeproj/")) return [path.dirname(file)];
    return [];
  }).filter(file => {
    const relative = path.relative(directory, path.join(root, file));
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }).sort();
  const members = new Map();
  for (const workspace of containers.filter(file => file.endsWith(".xcworkspace"))) {
    const xml = await readFile(path.join(root, workspace, "contents.xcworkspacedata"), "utf8");
    members.set(workspace, [...xml.matchAll(/location\s*=\s*"group:([^"]+\.xcodeproj)"/g)].map(match => path.posix.normalize(path.posix.join(path.posix.dirname(workspace), match[1]))));
  }
  if (options.project || explicitContainer) {
    let selected;
    try { selected = await realpath(options.project ? path.resolve(root, options.project) : explicitContainer); }
    catch { throw new Error("That Xcode project does not exist. Run menloapp deploy without --project to choose a committed app."); }
    const relative = path.relative(root, selected);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Choose a project inside this GitHub repository.");
    if (!tracked.has(`${relative}/${relative.endsWith(".xcodeproj") ? "project.pbxproj" : "contents.xcworkspacedata"}`)) throw new Error("That Xcode project is not committed to GitHub. Commit and push it, or run menloapp deploy without --project to select a committed app.");
    containers = [relative];
  } else {
    const covered = new Set([...members.values()].flat());
    containers = containers.filter(file => !covered.has(file));
  }
  if (!containers.length) throw new Error("No committed Xcode project or workspace was found.\nGenerate or add your iOS project (.xcodeproj or .xcworkspace), commit and push it, then run menloapp deploy.");
  const project = await choose(ui, "Which app do you want to deploy?", containers, "--project");
  let scheme = options.scheme;
  if (!scheme) {
    const sources = [project, ...(members.get(project) || [])];
    const schemeFiles = files.filter(file => sources.some(source => file.startsWith(`${source}/xcshareddata/xcschemes/`)) && file.endsWith(".xcscheme"));
    const appSchemes = [];
    for (const file of schemeFiles) {
      if (/BuildableName\s*=\s*"[^"]+\.app"/.test(await readFile(path.join(root, file), "utf8"))) appSchemes.push(path.basename(file, ".xcscheme"));
    }
    let names = [...new Set(appSchemes)].sort();
    if (!names.length) {
      try {
        const kind = project.endsWith(".xcworkspace") ? "-workspace" : "-project";
        const result = JSON.parse(execFileSync("xcodebuild", ["-list", "-json", kind, path.join(root, project), "-disableAutomaticPackageResolution", "-skipPackageUpdates"], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }));
        names = (result.project || result.workspace)?.schemes ?? [];
      } catch { /* Explain how to make the app scheme available. */ }
    }
    if (!names.length) throw new Error(`Could not find an app scheme in ${project}.\nIn Xcode, open Product → Scheme → Manage Schemes and mark your iOS app scheme Shared. Commit and push it, then run menloapp deploy.\nIf you already know the scheme: menloapp deploy --scheme YOUR-APP`);
    scheme = await choose(ui, "Which iOS app scheme should testers build?", names, "--scheme");
  }
  const presentation = await readCommittedPresentation(root, commit);
  return { repository, project, scheme, name: presentation?.name || options.name || scheme, slug: options.slug || repository.split("/")[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), commit, ...(presentation ? { description: presentation.description } : {}) };
}

async function publicRepository(repository, credential, ui, fetcher) {
  const read = async () => {
    try { return await api(`https://api.github.com/repos/${repository}`, { headers: headers(credential) }, fetcher); }
    catch (error) {
      if (error.status === 404 || error.status === 403 && !/request limit/.test(error.message)) throw new Error(`Your GitHub account could not access ${repository}.\nCheck https://github.com/${repository} and grant access to this repository, or sign in with gh auth login using the account that owns it.\nThen run menloapp deploy again.`);
      if (error.status === 401) throw new Error("Your GitHub sign-in expired. Run gh auth login, then menloapp deploy.");
      throw error;
    }
  };
  let repo = await read();
  if (repo.private !== false) {
    const url = `https://github.com/${repository}/settings#danger-zone`;
    const message = `${repository} is private. MENLO currently lets testers build from public GitHub source.\nTo deploy this app, make the repository public in GitHub Settings → Danger Zone → Change visibility. This makes its code and history public.\n${url}`;
    if (!ui.interactive) throw new Error(`${message}\n\nThen run menloapp deploy again. To keep this source private, stop here; private repositories are not supported yet.`);
    ui.log(`\n${message}`);
    const answer = await ui.ask("Open GitHub settings to continue? [Y/n] ");
    if (answer && !/^y(es)?$/i.test(answer)) throw new Error("Deploy stopped. Your repository is still private.");
    ui.open(url);
    while (repo.private !== false) {
      await ui.ask("After making the repository public, press Enter to check again (Ctrl+C to cancel): ");
      repo = await read();
      if (repo.private !== false) ui.log("GitHub still reports this repository as private.");
    }
  }
  if (repo.archived || repo.disabled) throw new Error("This GitHub repository is archived or disabled. Restore it in GitHub settings, then run menloapp deploy.");
  return repo;
}

export async function deploy(args, dependencies = {}) {
  const options = deployOptions(args);
  const ui = dependencies.ui || deployUI(options);
  const fetcher = dependencies.fetcher || fetch;
  if (options.help) {
    ui.print("MENLO deploy\n\nmenloapp deploy [path]\n\nSign in to GitHub, choose your app if needed, and get a production app link.\nMENLO guides you through each step. Later pushes appear automatically.\n\nOptions: --project path/App.xcodeproj, --scheme Name, --app-slug your-app,\n         --name Name, --dry-run (local checks only), --json (no prompts)\n         --record (regenerate the automatic preview), --no-preview,\n         --seconds 3–60, --simulator UDID");
    return 0;
  }
  if (options.dryRun) { ui.print(JSON.stringify(await inspectProject(options, ui), null, 2)); return 0; }
  const local = await inspectRepository(options);
  ui.log(`MENLO deploy\nRepository: ${local.repository}`);
  const { credential } = await authenticate(ui, { ...dependencies, fetcher });
  const repo = await publicRepository(local.repository, credential, ui, fetcher);
  let project;
  while (true) {
    project = await inspectProject(options, ui);
    if (project.repository !== local.repository) throw new Error("The GitHub origin changed during deployment. Run menloapp deploy again to connect the new repository.");
    const head = await api(`https://api.github.com/repos/${project.repository}/commits/${encodeURIComponent(repo.default_branch)}`, { headers: headers(credential) }, fetcher);
    if (head.sha === project.commit) break;
    const branch = git(local.root, "branch", "--show-current");
    const instruction = branch === repo.default_branch
      ? `Push your committed changes: git push origin ${shellQuote(branch)}\nIf GitHub has newer commits, bring them in first: git pull --ff-only origin ${shellQuote(branch)}`
      : `MENLO follows ${repo.default_branch}. Merge your changes into that branch and push it, then switch this checkout to ${repo.default_branch}.`;
    await continueAfter(ui, `Your local commit ${project.commit.slice(0, 7)} is not the latest commit on GitHub's ${repo.default_branch} branch.\n${instruction}`);
  }
  const generated = [];
  if (await setupPresentation(local.root, project.name)) generated.push("menloapp/app.json", "menloapp/README.md");
  const presentation = await readCommittedPresentation(local.root, project.commit);
  if (!options.noPreview && (options.record || previewNeedsRefresh(local.root, project.commit, presentation))) {
    const missing = (dependencies.previewTools || previewTools)();
    if (missing.length && !options.record) ui.log(`Sharing without a generated preview. Automatic previews need ${missing.join(", ")}; see menloapp deploy --help.`);
    else {
      try {
        const captures = await (dependencies.recordExperience || recordExperience)(local.root, project, options, ui);
        generated.push("menloapp/app.json", ...captures);
      } catch (error) {
        if (options.record) throw error;
        ui.log(`Automatic preview was unavailable: ${error.message}\nSharing with your existing app assets. Use --record to retry the preview.`);
      }
    }
  }
  if (generated.length) {
    (dependencies.commitPresentation || commitPresentation)(local.root, [...new Set(generated)], repo.default_branch);
    project = await inspectProject(options, ui);
  }
  ui.log(`App: ${project.name}\nProject: ${project.project} · ${project.scheme}\nConnecting this app to MENLO…`);
  let result;
  let reusedLink = false;
  while (true) {
    try {
      // The server reads full presentation copy from the pinned Git commit.
      // Only a short legacy fallback belongs in the registration request.
      result = await api(`${MENLO_ORIGIN}/api/menlo/v1/apps`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...project, description: (repo.description || "").slice(0, 500) }) }, fetcher);
      break;
    } catch (error) {
      const existing = /^This repository already has a link: https:\/\/menloapp\.lol\/([a-z0-9-]+)\. Use --app-slug /.exec(error.message);
      if (error.status === 409 && existing && !reusedLink) {
        project.slug = existing[1]; reusedLink = true;
        ui.log(`Keeping your existing app link: ${MENLO_ORIGIN}/${project.slug}`);
        continue;
      }
      if ((error.status === 409 && /app link.*(?:in use|another repository)/.test(error.message) || error.status === 400 && /app slug/.test(error.message)) && ui.interactive) {
        ui.log(`That app link is unavailable: ${MENLO_ORIGIN}/${project.slug}`);
        const suggestion = `${project.repository.split("/")[0].toLowerCase()}-${project.slug}`.slice(0, 64).replace(/-$/, "");
        let slug;
        do {
          slug = await ui.ask(`Choose another link name [${suggestion}]: `) || suggestion;
          if (slug.length >= 2 && slug.length <= 64 && SLUG.test(slug)) break;
          ui.log("Use 2–64 lowercase letters, numbers, and single hyphens.");
        } while (true);
        project.slug = slug;
        continue;
      }
      if (error.status === 401) throw new Error("GitHub sign-in was not accepted by MENLO. Run gh auth login, then menloapp deploy.");
      if (error.status === 403) throw new Error(`Your GitHub account needs write access to ${project.repository} to deploy it.\nAsk its owner for access, or run gh auth login with an account that has access. Then run menloapp deploy.`);
      throw new Error(`${error.message}\n\nRun menloapp deploy again after completing that step.`);
    }
  }
  if (result.public_url !== `${MENLO_ORIGIN}/${project.slug}`) throw new Error("MENLO did not confirm the expected app link. Run menloapp deploy again to verify it.");
  if (await updatePresentationLinks(local.root, project.repository, result.public_url)) {
    (dependencies.commitPresentation || commitPresentation)(local.root, ["menloapp/app.json"], repo.default_branch);
    ui.log("Saved your GitHub and MENLO links to menloapp/app.json.");
  }
  result = { ...result, githubRepo: `https://github.com/${project.repository}`, menloLink: result.public_url };
  if (options.json) ui.print(JSON.stringify(result));
  else ui.print(`\nYour app is live:\n${result.public_url}\n\nShare this link. Testers open it in MENLO to build and run the app on their iPhone.\nKeep pushing to ${repo.default_branch}; this link follows your code automatically.\n`);
  return 0;
}

import { execFileSync } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Deploy can take a plain folder all the way to a public GitHub repository.
// Every step that publishes code asks first, and nothing secret-looking is committed.

const GITHUB_FILE_LIMIT = 100 * 1024 * 1024;

export const XCODE_GITIGNORE = `# Xcode
build/
DerivedData/
xcuserdata/
*.xcuserstate
*.xcscmblueprint
*.xccheckout
.build/
.swiftpm/xcode/

# macOS
.DS_Store

# Secrets and signing material stay on this Mac
.env
.env.*
*.p8
*.p12
*.pem
*.key
*.cer
*.mobileprovision
*.provisionprofile
`;

// Files that usually hold credentials. Deploy refuses to publish them automatically.
const RISKY = [
  /(?:^|\/)\.env(?:\.|$)/, /\.(?:p8|p12|pem|key|cer|mobileprovision|provisionprofile|keystore|jks)$/i,
  /(?:^|\/)(?:credentials|secrets?)(?:\.[a-z]+)?$/i, /(?:^|\/)id_(?:rsa|ed25519|ecdsa)$/,
];
export const riskyFile = file => RISKY.some(pattern => pattern.test(file));

const gitIn = (root, args, options = {}) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...options }).trim();

/** Files that `git add -A` would stage, relative to the repository root. */
function pendingFiles(root) {
  const untracked = gitIn(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  let changed = [];
  try { changed = gitIn(root, ["diff", "HEAD", "--name-only", "-z"]).split("\0").filter(Boolean); }
  catch { changed = gitIn(root, ["ls-files", "-z"]).split("\0").filter(Boolean); }
  return [...new Set([...changed, ...untracked])].sort();
}

async function checkPublishable(root, files) {
  const risky = files.filter(riskyFile);
  if (risky.length) throw new Error(`These files look like secrets, so Menlo will not publish them:\n${risky.slice(0, 10).map(file => `  ${file}`).join("\n")}\nAdd them to .gitignore (or remove them), then run menloapp deploy again.`);
  const large = [];
  for (const file of files) {
    const info = await stat(path.join(root, file)).catch(() => null);
    if (info?.isFile() && info.size > GITHUB_FILE_LIMIT) large.push(file);
  }
  if (large.length) throw new Error(`GitHub does not accept files over 100 MB:\n${large.map(file => `  ${file}`).join("\n")}\nAdd them to .gitignore, then run menloapp deploy again.`);
}

function summary(files) {
  const shown = files.slice(0, 12).map(file => `  ${file}`).join("\n");
  return files.length > 12 ? `${shown}\n  …and ${files.length - 12} more` : shown;
}

const yes = (answer, fallback) => answer === "" ? fallback : /^y(es)?$/i.test(answer);

/** Make a plain app folder into a Git repository with one reviewed first commit. */
export async function initRepository(directory, ui) {
  if (!ui.interactive) throw new Error("This folder is not a Git repository yet.\nRun menloapp deploy in a terminal and Menlo will set it up, or run:\n  git init && git add -A && git commit -m \"First version\"");
  const projects = execFileSync("find", [directory, "-maxdepth", "4", "(", "-name", "*.xcodeproj", "-o", "-name", "*.xcworkspace", ")", "-not", "-path", "*/DerivedData/*", "-not", "-path", "*/build/*", "-not", "-path", "*.xcodeproj/*"], { encoding: "utf8", timeout: 20_000 }).trim();
  if (!projects) throw new Error("No Xcode project was found in this folder.\nRun menloapp deploy from your iOS app's folder.");
  ui.log(`\nThis folder is not a Git repository yet. Menlo shares apps from public GitHub source,\nso it will set one up here (with a standard Xcode .gitignore that keeps secrets out).`);
  if (!yes(await ui.ask("Set up Git here? [Y/n] "), true)) throw new Error("Deploy stopped. Nothing was changed.");
  gitIn(directory, ["init", "-q", "--initial-branch=main"]);
  const ignore = path.join(directory, ".gitignore");
  try { await writeFile(ignore, XCODE_GITIGNORE, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  return directory;
}

/**
 * Offer to commit pending work. Returns true when a commit was made.
 * `first` describes a brand-new repository's first commit.
 */
export async function offerCommit(root, ui, { first = false, name = "app" } = {}) {
  const files = pendingFiles(root);
  if (!files.length) return false;
  await checkPublishable(root, files);
  ui.log(`\n${first ? "Files for the first version" : "Uncommitted changes"} (${files.length}):\n${summary(files)}`);
  const question = first ? `Commit ${files.length === 1 ? "this file" : `these ${files.length} files`}? [Y/n] ` : `Commit ${files.length === 1 ? "this change" : `these ${files.length} changes`} and publish them to GitHub? [y/N] `;
  if (!yes(await ui.ask(question), first)) return false;
  const message = (first ? "" : await ui.ask(`Commit message [Update ${name}]: `)) || (first ? `First version of ${name}` : `Update ${name}`);
  gitIn(root, ["add", "-A"]);
  try { gitIn(root, ["commit", "-q", "-m", message]); }
  catch (error) {
    const detail = String(error.stderr || "").trim();
    throw new Error(`Git could not commit${detail ? `:\n${detail}` : "."}${/user\.(?:name|email)|identity/i.test(detail) ? "\nSet your Git name and email, then run menloapp deploy again:\n  git config --global user.name \"Your Name\"\n  git config --global user.email you@example.com" : ""}`);
  }
  return true;
}

/**
 * Push a branch to GitHub. Use the person's own Git credentials first; if
 * those are not set up, use the GitHub sign-in deploy already verified for this
 * one push, passed through the environment and never saved.
 */
export function pushBranch(root, repository, branch, credential, { upstream = false } = {}) {
  const target = `HEAD:refs/heads/${branch}`;
  const quiet = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  try { gitIn(root, ["push", "-q", ...(upstream ? ["-u"] : []), "origin", target], { env: quiet, timeout: 600_000 }); return; }
  catch { /* Fall back to the verified sign-in below. */ }
  if (!credential) throw new Error(`Git could not push to GitHub. Run git push origin ${branch}, then menloapp deploy.`);
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${credential}`).toString("base64")}`;
  const env = { ...quiet, GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "", GIT_CONFIG_KEY_1: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_1: header };
  try { gitIn(root, ["push", "-q", `https://github.com/${repository}.git`, target], { env, timeout: 600_000 }); }
  catch { throw new Error(`GitHub did not accept the push to ${repository}.\nRun git push origin ${branch} to see why, then menloapp deploy again.`); }
  // Keep `git status` accurate after a push that bypassed the remote's configured URL.
  try { gitIn(root, ["fetch", "-q", "origin", branch], { env: quiet, timeout: 60_000 }); } catch { /* Cosmetic only. */ }
}

/** A GitHub repository name derived from the folder, e.g. "My App!" → "My-App". */
export function repositoryName(directory) {
  return path.basename(directory).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "").slice(0, 100) || "my-app";
}

/** Create the public GitHub repository for this folder, connect it as origin, and push. */
export async function createGitHubRepository(root, ui, { credential, user, api, describe = "" }) {
  if (!ui.interactive) throw new Error(`This repository has no GitHub origin.\nRun menloapp deploy in a terminal and Menlo will create the public GitHub repository, or run:\n  gh repo create --public --source=. --remote=origin --push`);
  let name = repositoryName(root);
  ui.log(`\nThis app is not on GitHub yet. Menlo shares apps from public GitHub source:\nanyone can read the code and its history.`);
  while (true) {
    const answer = await ui.ask(`Create the public repository github.com/${user.login}/${name}? [Y/n, or type another name] `);
    if (/^n(o)?$/i.test(answer)) throw new Error("Deploy stopped. Nothing was published.");
    if (answer && !/^y(es)?$/i.test(answer)) {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(answer) || /^\.+$/.test(answer)) { ui.log("Use letters, numbers, dots, hyphens and underscores."); continue; }
      name = answer;
    }
    try {
      await api("https://api.github.com/user/repos", { method: "POST", body: JSON.stringify({ name, private: false, ...(describe ? { description: describe.slice(0, 350) } : {}) }) });
      break;
    } catch (error) {
      if (error.status === 422) { ui.log(`You already have a repository named ${name} on GitHub. Choose another name.`); name = `${name}-app`; continue; }
      if (error.status === 403 || error.status === 404) throw new Error(`Your GitHub sign-in cannot create repositories.\nCreate it at https://github.com/new (public), then run:\n  git remote add origin https://github.com/${user.login}/${name}.git\n  menloapp deploy`);
      throw error;
    }
  }
  const repository = `${user.login}/${name}`;
  gitIn(root, ["remote", "add", "origin", `https://github.com/${repository}.git`]);
  const branch = gitIn(root, ["branch", "--show-current"]) || "main";
  ui.log(`Created https://github.com/${repository}\nPushing ${branch}…`);
  pushBranch(root, repository, branch, credential, { upstream: true });
  return repository;
}

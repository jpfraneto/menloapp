import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRESENTATION_PATH, MAX_PRESENTATION_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, validatePresentation, presentationFiles, validateMediaBytes } from "./presentation.js";

export function projectRoot(directory) {
  try { return execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { throw new Error("Run menloapp from your app's Git repository."); }
}

export async function setupPresentation(root, name = path.basename(root)) {
  const directory = path.join(root, "menloapp");
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) throw new Error("menloapp/ must be a real directory, not a symbolic link.");
  try {
    await writeFile(path.join(root, PRESENTATION_PATH), JSON.stringify(validatePresentation({ version: 1, name, subtitle: "", description: "", icon: null, screenshots: [], preview: null }), null, 2) + "\n", { flag: "wx" });
  } catch (error) { if (error.code === "EEXIST") return false; throw error; }
  const guide = `# Your app on MENLO

Edit app.json and run menloapp deploy from your app's repository.
Name, subtitle, description, icon and screenshots appear on your public page.
Shared links get a card with the app icon, title, description and MENLO URL.
Set ogImage to a PNG/JPEG path such as menloapp/share.png for custom share artwork
(1200 x 630 recommended), or leave it null to use the automatic card.
website and tokenAddress are optional. An ERC-20 token uses CAIP-19:
eip155:CHAIN_ID/erc20:0x followed by the token's 40 hex address characters.
MENLO fills githubRepo and menloLink automatically when you deploy.

Use real PNG/JPEG images inside menloapp/ (up to three screenshots, 10 MiB each).
A preview is an MP4 of up to 50 MiB. These files are public and committed.
Deploy can generate a preview with Codex in a fresh iPhone Simulator.
Use --record to regenerate it, or --no-preview to skip generation.

Only the metadata and captures created by this deploy are committed automatically.
Commit your own app changes before deploying. Keep node_modules/ ignored if
menloapp is installed as a project dependency.
`;
  try { await writeFile(path.join(directory, "README.md"), guide, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  return true;
}

export async function readCommittedPresentation(root, commit) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { maxBuffer: MAX_VIDEO_BYTES + 1024, stdio: ["ignore", "pipe", "pipe"] });
  const entries = new Map(git("ls-tree", "-r", "-z", commit, "--", "menloapp/").toString("utf8").split("\0").filter(Boolean).map(line => { const [info, file] = line.split("\t"); return [file, info.split(" ")[0]]; }));
  if (!entries.has(PRESENTATION_PATH)) return null;
  const read = (file, maximum) => {
    if (!["100644", "100755"].includes(entries.get(file))) throw new Error(`${file} must be a committed regular file; links are not supported.`);
    const size = Number(git("cat-file", "-s", `${commit}:${file}`).toString());
    if (size > maximum) throw new Error(`${file} exceeds its supported size.`);
    return git("show", `${commit}:${file}`);
  };
  let value;
  try { value = JSON.parse(read(PRESENTATION_PATH, MAX_PRESENTATION_BYTES).toString("utf8")); }
  catch (error) { throw new Error(`Cannot read ${PRESENTATION_PATH}: ${error.message}`); }
  const presentation = validatePresentation(value);
  for (const file of presentationFiles(presentation)) validateMediaBytes(file, read(file, file.endsWith(".mp4") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES));
  return presentation;
}

export async function initPresentation(args) {
  if (args.includes("--help")) { console.log("menloapp init [path]\n\nCreate menloapp/app.json and instructions for your public app page."); return 0; }
  if (args.length > 1 || args[0]?.startsWith("-")) throw new Error("Usage: menloapp init [path]");
  const root = projectRoot(args[0] || ".");
  const created = await setupPresentation(root);
  console.log(`${created ? "Created" : "Keeping existing"} ${PRESENTATION_PATH}.\nAdd your app's name, subtitle, description, icon and up to three screenshots.\nReview, commit and push menloapp/, then run menloapp deploy.`);
  return 0;
}

export async function updatePresentationLinks(root, repository, menloLink) {
  const file = path.join(root, PRESENTATION_PATH);
  if (!(await lstat(file)).isFile()) throw new Error("menloapp/app.json must be a regular file.");
  const before = await readFile(file, "utf8");
  const value = validatePresentation(JSON.parse(before));
  const githubRepo = `https://github.com/${repository}`;
  if (value.githubRepo === githubRepo && value.menloLink === menloLink) return false;
  await writeFile(file, JSON.stringify({ ...value, githubRepo, menloLink }, null, 2) + "\n");
  return true;
}

export function previewNeedsRefresh(root, commit, presentation) {
  if (!presentation?.preview) return true;
  if (presentation.preview.kind !== "simulator") return false;
  if (!presentation.preview.source_commit) return true;
  try {
    execFileSync("git", ["-C", root, "diff", "--quiet", presentation.preview.source_commit, commit, "--", ".", ":(exclude)menloapp"], { stdio: "ignore" });
    return false;
  } catch { return true; }
}

export function commitPresentation(root, files, branch) {
  const allowed = new Set(files);
  for (const file of allowed) if (!file.startsWith("menloapp/") || file.split("/").some(part => part === ".." || part === ".")) throw new Error("Only generated app presentation files can be committed by deploy.");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("branch", "--show-current") !== branch) throw new Error(`Switch to ${branch} before publishing generated app assets.`);
  const trackedChanges = git("diff", "HEAD", "--name-only", "-z").split("\0").filter(Boolean);
  const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  if ([...trackedChanges, ...untracked].some(file => !allowed.has(file))) throw new Error("Other files changed during deployment. Your work was preserved. Commit and push your changes, then deploy again.");
  if (!trackedChanges.length && !untracked.length) return false;
  git("add", "--", ...allowed);
  git("commit", "-m", "Update MENLO app page", "--only", "--", ...allowed);
  try { git("push", "origin", branch); }
  catch { throw new Error(`The app page is committed locally, but the push did not complete. Run git push origin ${branch}, then menloapp deploy.`); }
  return true;
}

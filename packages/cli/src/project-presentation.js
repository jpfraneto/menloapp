import { execFileSync } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
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
  const guide = `# Your public app page\n\nEdit app.json, then commit and push this folder with your app.\nMENLO reads it and the selected assets from the same public Git commit.\n\nAdd your real icon and up to three screenshots (PNG/JPEG, at most 10 MiB each).\nSet icon to "menloapp/icon.png" and screenshots to paths such as\n["menloapp/screenshot-1.png", "menloapp/screenshot-2.png", "menloapp/screenshot-3.png"].\nNo sample artwork is published as if it were your app.\n\nRun menloapp deploy --record to build and launch this app in an already booted\nSimulator and record a short walkthrough. Review the recording, commit and push,\nthen deploy again. To use your own MP4 (at most 50 MiB), set preview to\n{"path":"menloapp/preview.mp4","kind":"screen-recording"}.\n\nUse normal Git files, not Git LFS pointers. Never put secrets or private captures\nin this public folder. If you install menloapp as a local npm dependency, ignore /node_modules/ in your\nproject .gitignore and commit package.json plus the lockfile.\nAn npm install runs no setup or upload scripts.\n`;
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

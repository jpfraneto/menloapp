import { execFileSync, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRESENTATION_PATH, validatePresentation, validateMediaBytes } from "./presentation.js";

export function selectSimulator(devices, requested) {
  const booted = Object.entries(devices).filter(([runtime]) => /ios/i.test(runtime)).flatMap(([, items]) => items).filter(device => device.state === "Booted" && device.isAvailable !== false && (device.deviceTypeIdentifier?.includes(".iPhone-") || device.name?.startsWith("iPhone")));
  const selected = requested ? booted.filter(device => device.udid === requested) : booted;
  if (selected.length !== 1) throw new Error("Open your intended iPhone Simulator first. If several are running, choose --simulator UDID (xcrun simctl list devices booted).");
  return selected[0];
}

async function build(args, directory, log) {
  log("Building your app for Simulator. This can take several minutes; recording starts after the app launches.");
  await new Promise((resolve, reject) => {
    const child = spawn("xcodebuild", args, { cwd: directory, stdio: ["ignore", "inherit", "inherit"] });
    const timer = setTimeout(() => { child.kill("SIGTERM"); }, 5 * 60_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Simulator build did not finish successfully. Fix the Xcode error, then run menloapp deploy --record again.")); });
  });
}

export async function recordExperience(root, project, options, ui) {
  if (process.platform !== "darwin") throw new Error("Recording requires macOS, Xcode, and a running iPhone Simulator.");
  const run = (args) => execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  const device = selectSimulator(JSON.parse(run(["list", "devices", "booted", "--json"])).devices, options.simulator);
  const destination = path.join(root, "menloapp", `preview-${project.commit.slice(0, 12)}-${Date.now()}.mp4`);
  const manifestPath = path.join(root, PRESENTATION_PATH);
  if (!(await lstat(path.dirname(manifestPath))).isDirectory() || !(await lstat(manifestPath)).isFile()) throw new Error("The public presentation must use regular files, not links.");
  const before = await readFile(manifestPath, "utf8");
  const presentation = validatePresentation(JSON.parse(before));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "menloapp-record-"));
  try {
    const source = path.join(temporary, "source");
    await mkdir(source);
    const archive = path.join(temporary, "source.tar");
    execFileSync("git", ["-C", root, "archive", "--format=tar", "--output", archive, project.commit], { timeout: 30_000 });
    execFileSync("tar", ["-xf", archive, "-C", source], { timeout: 30_000 });
    const args = [project.project.endsWith(".xcworkspace") ? "-workspace" : "-project", path.join(source, project.project), "-scheme", project.scheme, "-configuration", "Debug", "-sdk", "iphonesimulator", "-destination", `id=${device.udid}`, "-derivedDataPath", path.join(temporary, "build"), "CODE_SIGNING_ALLOWED=NO"];
    await build([...args, "build"], source, ui.log);
    const settings = JSON.parse(execFileSync("xcodebuild", [...args, "-showBuildSettings", "-json"], { cwd: source, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
    const apps = settings.map(item => item.buildSettings).filter(item => item.WRAPPER_EXTENSION === "app" && item.PRODUCT_BUNDLE_IDENTIFIER);
    if (apps.length !== 1) throw new Error("The scheme builds several apps. Select a scheme that builds just the app you want to record.");
    const app = apps[0];
    run(["install", device.udid, path.join(app.TARGET_BUILD_DIR, app.FULL_PRODUCT_NAME)]);
    run(["launch", "--terminate-running-process", device.udid, app.PRODUCT_BUNDLE_IDENTIFIER]);
    spawn("open", ["-a", "Simulator"], { stdio: "ignore" }).unref();
    ui.log(`Recording ${project.name} in ${device.name} for ${options.seconds} seconds. Use the app now; only this Simulator's screen is recorded.`);
    const movie = path.join(temporary, "preview.mp4");
    await new Promise((resolve, reject) => {
      const child = spawn("xcrun", ["simctl", "io", device.udid, "recordVideo", "--codec=h264", movie], { stdio: ["ignore", "ignore", "pipe"] });
      let timer;
      let started = false;
      let cancelled = false;
      let diagnostic = "";
      const cancel = () => { cancelled = true; child.kill("SIGINT"); };
      process.once("SIGINT", cancel);
      const deadline = setTimeout(() => child.kill("SIGKILL"), (options.seconds + 30) * 1000);
      child.stderr.on("data", chunk => {
        diagnostic = (diagnostic + chunk.toString()).slice(-1024);
        if (!started && diagnostic.includes("Recording started")) { started = true; timer = setTimeout(() => child.kill("SIGINT"), options.seconds * 1000); }
      });
      const cleanup = () => { clearTimeout(timer); clearTimeout(deadline); process.removeListener("SIGINT", cancel); };
      child.once("error", error => { cleanup(); reject(error); });
      child.once("exit", code => { cleanup(); !cancelled && started && code === 0 ? resolve() : reject(new Error("Recording did not finish. Your public presentation was not changed.")); });
    });
    const bytes = await readFile(movie);
    validateMediaBytes(destination, bytes);
    if (await readFile(manifestPath, "utf8") !== before) throw new Error("app.json changed while recording. Run recording again after saving your edits.");
    await copyFile(movie, destination, constants.COPYFILE_EXCL);
    // Recording describes the source that was actually built, even when a later
    // commit adds the resulting video to the public presentation.
    presentation.preview = { path: path.relative(root, destination), kind: "simulator", source_commit: project.commit };
    await writeFile(manifestPath, JSON.stringify(presentation, null, 2) + "\n");
    ui.print(`Saved ${presentation.preview.path}\nReview the video, commit and push menloapp/, then run menloapp deploy to share it.\nThis is a Simulator recording; it is not evidence of an iPhone installation.`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

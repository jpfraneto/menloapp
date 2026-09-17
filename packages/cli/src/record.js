import { execFileSync, spawn, spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile, copyFile, rename } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import { actionArguments, nextPreviewAction, previewTools } from "./experience-agent.js";
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
  const missing = previewTools();
  if (missing.length) throw new Error(`Automatic previews need ${missing.join(", ")}. Install Codex, sign in with codex login, and install the capture tools with brew install cameroncooke/axe/axe ffmpeg. Use --no-preview to deploy without generating a preview.`);
  const destination = path.join(root, "menloapp", `preview-${project.commit.slice(0, 12)}-${Date.now()}.mp4`);
  const manifestPath = path.join(root, PRESENTATION_PATH);
  if (!(await lstat(path.dirname(manifestPath))).isDirectory() || !(await lstat(manifestPath)).isFile()) throw new Error("The public presentation must use regular files, not links.");
  const before = await readFile(manifestPath, "utf8");
  const presentation = validatePresentation(JSON.parse(before));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "menloapp-record-"));
  let device, ownedDevice = false, saved = false;
  const copied = [];
  try {
    if (options.simulator) device = selectSimulator(JSON.parse(run(["list", "devices", "booted", "--json"])).devices, options.simulator);
    else {
      const available = JSON.parse(run(["list", "devices", "available", "--json"])).devices;
      const candidates = Object.entries(available).filter(([runtime]) => /ios/i.test(runtime)).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true })).flatMap(([runtime, devices]) => devices.filter(item => item.isAvailable !== false && item.deviceTypeIdentifier?.includes(".iPhone-")).map(item => ({ ...item, runtime })));
      if (!candidates.length) throw new Error("Install an iPhone Simulator runtime in Xcode Settings → Components, then deploy again.");
      const template = candidates[0];
      device = { deviceTypeIdentifier: template.deviceTypeIdentifier, udid: run(["create", `MENLO preview ${Date.now()}`, template.deviceTypeIdentifier, template.runtime]).trim(), name: "MENLO preview" };
      ownedDevice = true;
    }
    if (ownedDevice) {
      run(["boot", device.udid]);
      execFileSync("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { timeout: 120_000, stdio: "ignore" });
    }
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
    spawnSync("open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", device.udid], { stdio: "ignore", timeout: 15_000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    ui.log(`Codex is exploring ${project.name} in a fresh iPhone Simulator and recording the preview. No manual interaction is needed.`);
    const types = JSON.parse(run(["list", "devicetypes", "--json"])).devicetypes;
    const type = types.find(item => item.identifier === device.deviceTypeIdentifier);
    if (!type?.bundlePath) throw new Error("The Simulator's display dimensions could not be verified.");
    const scale = Number(execFileSync("plutil", ["-extract", "mainScreenScale", "raw", "-o", "-", path.join(type.bundlePath, "Contents/Resources/profile.plist")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("The Simulator's screen scale is unavailable.");
    const history = [], clips = [], captures = [];
    const maximumSeconds = options.seconds || 20;
    const stepSeconds = Math.ceil(maximumSeconds / 5);
    const maximumSteps = Math.min(5, maximumSeconds);
    for (let step = 0; step < maximumSteps; step++) {
      const screenshot = path.join(temporary, `screen-${step}.png`);
      run(["io", device.udid, "screenshot", screenshot]);
      const screen = await readFile(screenshot);
      const bounds = { width: screen.readUInt32BE(16) / scale, height: screen.readUInt32BE(20) / scale };
      let hierarchy;
      try { hierarchy = execFileSync("axe", ["describe-ui", "--udid", device.udid], { encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
      catch { hierarchy = "Accessibility is unavailable on this runtime. Use the screenshot and exact screen-point dimensions. Leave label and identifier empty; choose a visible coordinate target."; }
      const action = await nextPreviewAction({ directory: temporary, screenshot, hierarchy, history, name: project.name, bounds });
      actionArguments(action, device.udid, bounds);
      await writeFile(path.join(temporary, `action-${step}.json`), JSON.stringify(action));
      if (!action.safe) { ui.log(`Preview stopped: ${action.reason}`); break; }
      if (action.action === "done" && clips.length) break;
      ui.log(`Preview: ${action.reason}`);
      const movie = path.join(temporary, `clip-${step}.mp4`);
      const duration = Math.min(stepSeconds, maximumSeconds - step * stepSeconds);
      if (duration <= 0) break;
      await recordClip(device.udid, movie, duration, () => {
        const args = actionArguments(action, device.udid, bounds);
        if (args) execFileSync("axe", args, { timeout: 15_000, stdio: "ignore" });
      });
      // simctl omits unchanged trailing frames. Keep the observed screen visible
      // for the actual capture interval and normalize all clips for playback.
      const normalized = path.join(temporary, `normalized-${step}.mp4`);
      execFileSync("ffmpeg", ["-v", "error", "-i", movie, "-vf", `tpad=stop_mode=clone:stop_duration=${duration},fps=30`, "-t", String(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-an", normalized], { timeout: 60_000, stdio: "ignore" });
      clips.push(normalized);
      const after = path.join(temporary, `capture-${step}.png`);
      run(["io", device.udid, "screenshot", after]);
      captures.push(after);
      history.push({ action: action.action, label: action.label, reason: action.reason, priorUI: hierarchy.slice(0, 4000) });
      if (action.action === "done") break;
    }
    if (!clips.length) throw new Error("The app could not be safely previewed automatically. Add a preview after preparing a demo screen, or deploy with --no-preview.");
    const movie = path.join(temporary, "preview.mp4");
    const playlist = path.join(temporary, "clips.txt");
    await writeFile(playlist, clips.map(file => `file '${path.basename(file)}'`).join("\n") + "\n");
    execFileSync("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "1", "-i", playlist, "-c", "copy", "-movflags", "+faststart", movie], { timeout: 30_000, stdio: "ignore" });
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", movie], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }));
    if (!Number.isFinite(duration) || duration < 1) throw new Error("The Simulator did not produce a playable preview. Your public recording was not changed.");
    const bytes = await readFile(movie);
    validateMediaBytes(destination, bytes);
    if (await readFile(manifestPath, "utf8") !== before) throw new Error("app.json changed while recording. Run recording again after saving your edits.");
    await copyFile(movie, destination, constants.COPYFILE_EXCL);
    copied.push(destination);
    // Recording describes the source that was actually built, even when a later
    // commit adds the resulting video to the public presentation.
    presentation.preview = { path: path.relative(root, destination), kind: "simulator", source_commit: project.commit };
    const files = [presentation.preview.path];
    if (!presentation.screenshots.length) {
      for (const [index, capture] of captures.slice(0, 3).entries()) {
        const file = `menloapp/screenshot-${project.commit.slice(0, 12)}-${Date.now()}-${index + 1}.png`;
        validateMediaBytes(file, await readFile(capture));
        await copyFile(capture, path.join(root, file), constants.COPYFILE_EXCL);
        copied.push(path.join(root, file));
        presentation.screenshots.push(file); files.push(file);
      }
    }
    const manifestTemporary = `${destination}.json`;
    await writeFile(manifestTemporary, JSON.stringify(presentation, null, 2) + "\n", { flag: "wx" });
    copied.push(manifestTemporary);
    if (await readFile(manifestPath, "utf8") !== before) throw new Error("app.json changed while recording. Your edits were preserved.");
    await rename(manifestTemporary, manifestPath);
    saved = true;
    ui.log(`Created ${presentation.preview.path}`);
    return files;
  } finally {
    if (!saved) for (const file of copied) await rm(file, { force: true });
    if (ownedDevice) {
      try { run(["shutdown", device.udid]); } catch { /* It may already be stopped. */ }
      try { run(["delete", device.udid]); } catch { /* Never target another Simulator. */ }
    }
    if (options.diagnostics) ui.log(`Preview diagnostics: ${temporary}`);
    else await rm(temporary, { recursive: true, force: true });
  }
}

async function recordClip(udid, movie, seconds, action) {
  await new Promise((resolve, reject) => {
    const child = spawn("xcrun", ["simctl", "io", udid, "recordVideo", "--codec=h264", movie], { stdio: ["ignore", "ignore", "pipe"] });
    let timer, started = false, failure, diagnostic = "";
    const cancel = () => { failure = new Error("Preview cancelled."); child.kill("SIGINT"); };
    process.once("SIGINT", cancel);
    const deadline = setTimeout(() => { failure = new Error("Preview capture timed out."); child.kill("SIGKILL"); }, (seconds + 30) * 1000);
    child.stderr.on("data", chunk => {
      diagnostic = (diagnostic + chunk.toString()).slice(-1024);
      if (!started && diagnostic.includes("Recording started")) {
        started = true;
        setTimeout(() => { try { action(); } catch (error) { failure = error; child.kill("SIGINT"); } }, 400);
        timer = setTimeout(() => child.kill("SIGINT"), seconds * 1000);
      }
    });
    const cleanup = () => { clearTimeout(timer); clearTimeout(deadline); process.removeListener("SIGINT", cancel); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("exit", code => { cleanup(); !failure && started && code === 0 ? resolve() : reject(failure || new Error("Preview recording did not finish.")); });
  });
}

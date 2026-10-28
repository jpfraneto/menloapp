import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { installRoot, nativeLauncher } from "./native.js";

// `menloapp try` hands the build to the native runtime. This wrapper keeps the
// person in the same session: one live timer instead of a line every ten
// seconds; an exact commit that is already built and signed goes straight to
// the iPhone; and while the iPhone is out of reach it waits for Enter (check
// again) or /notnow (the Mac keeps the build and installs it the next time
// that iPhone is reachable).

const WAITING_FOR_PHONE = /Connect and unlock your intended iPhone to install/;
const ELAPSED = /^(.*?) (\d+) seconds elapsed\. Keep this Terminal open\.$/;
const DOWNLOADING = "Downloading the selected GitHub commit, then building for your iPhone…";
const API = "https://menloapp.lol/api/menlo/v1/apps";

export function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Run the native command, showing its output as it arrives. Resolves { status, text }. */
export function runNative(args, { launcher = nativeLauncher(), output = process.stdout, live = output.isTTY, rename = value => value } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(launcher, args, { stdio: ["inherit", "pipe", "inherit"] });
    let text = "", pending = "", timerOpen = false;
    const line = raw => {
      text += `${raw}\n`;
      const value = rename(raw);
      const elapsed = live && ELAPSED.exec(value);
      if (elapsed) {
        output.write(`\r\x1b[2K${elapsed[1]} ${clock(Number(elapsed[2]))} elapsed`);
        timerOpen = true;
        return;
      }
      if (timerOpen) { output.write("\n"); timerOpen = false; }
      output.write(`${value}\n`);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop();
      lines.forEach(line);
    });
    child.on("error", () => reject(new Error("the installed native TOHSENO could not start")));
    child.on("close", status => {
      if (pending) line(pending);
      if (timerOpen) output.write("\n");
      resolve({ status: status ?? 1, text });
    });
  });
}

/** The service's private record for this app, read only. */
export async function savedApp(slug, root = installRoot()) {
  const directory = path.join(root, "service", "living-projects-v1", "projects");
  let names = [];
  try { names = await readdir(directory); } catch { return null; }
  for (const name of names.filter(name => name.endsWith(".json"))) {
    try {
      const record = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      if (record?.github_origin?.slug === slug) return record;
    } catch { /* A record being rewritten is read again on the next check. */ }
  }
  return null;
}

async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** The exact commit `try` will build: the link's commit, or the app's newest one. */
async function selectedCommit(slug, args, fetcher = fetch) {
  const index = args.indexOf("--commit");
  if (index >= 0) return args[index + 1] ?? null;
  try {
    const response = await fetcher(`${API}/${slug}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const body = await response.json();
    return /^[a-f0-9]{40}$/.test(body?.head_commit ?? "") ? body.head_commit : null;
  } catch { return null; }
}

async function askLine(question) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(question); } finally { prompt.close(); }
}

/** Watch the record while the service installs the saved build. */
async function watchInstall(slug, { read, output, seconds, pause }) {
  for (let elapsed = 0; elapsed <= seconds; elapsed += 2) {
    const record = await read(slug);
    const delivery = record?.network_delivery;
    if (delivery?.status === "installed") { output.write(`\r\x1b[2KInstalled on your iPhone.\n`); return "installed"; }
    if (delivery?.status === "failed") { output.write(`\r\x1b[2K${delivery.failure || "Installing failed."}\n`); return "failed"; }
    if (delivery?.status !== "ready_for_iphone") { output.write("\r\x1b[2K"); return "changed"; }
    output.write(`\r\x1b[2KLooking for your iPhone… ${clock(elapsed)}`);
    await pause(2_000);
  }
  output.write(`\r\x1b[2KYour iPhone isn't reachable yet.\n`);
  return "waiting";
}

export async function tryApp(args, {
  run = runNative,
  ask = askLine,
  log = console.log,
  read = savedApp,
  fetcher = fetch,
  output = process.stdout,
  pause = sleep,
  watchSeconds = 40,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
} = {}) {
  const slug = args[2];
  const commit = await selectedCommit(slug, args, fetcher);
  const saved = commit ? await read(slug) : null;
  const sameCommit = saved?.github_origin?.commit === commit;
  const short = commit?.slice(0, 7);
  let waiting = false;
  if (sameCommit && saved.network_delivery?.status === "installed" && saved.installations?.length) {
    log(`${saved.display_name} ${short} is already installed on your iPhone.`);
    return 0;
  }
  if (sameCommit && saved.network_delivery?.status === "ready_for_iphone" && await exists(saved.network_delivery.artifact_path ?? "")) {
    log(`${saved.display_name} ${short} is already built and signed on this Mac.`);
    waiting = true;
  } else {
    const downloaded = sameCommit && await exists(saved.source_path ?? "");
    const rename = value => downloaded ? value.replace(DOWNLOADING, `Building ${saved.display_name} ${short} for your iPhone (source already downloaded)…`) : value;
    const attempt = await run(args, { rename });
    if (attempt.status !== 0 || !WAITING_FOR_PHONE.test(attempt.text)) return attempt.status;
    waiting = true;
  }
  while (waiting) {
    if (!interactive) { log("Plug in and unlock your iPhone; this Mac installs the saved build when it can reach it."); return 0; }
    const answer = (await ask("\nPlug your iPhone into this Mac (or keep it on the same Wi-Fi) and unlock it.\nPress Enter to install now, or type /notnow to install later: ")).trim().toLowerCase();
    if (["/notnow", "notnow", "n", "no"].includes(answer)) {
      log("OK. The signed build is saved on this Mac. It installs the next time your iPhone is unlocked and reachable, or run this command again.");
      return 0;
    }
    const result = await watchInstall(slug, { read, output, seconds: watchSeconds, pause });
    if (result === "installed") return 0;
    if (result === "failed") return 1;
    if (result === "changed") return run(args).then(attempt => attempt.status);
  }
  return 0;
}

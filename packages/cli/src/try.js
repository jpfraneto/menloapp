import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline/promises";
import { nativeLauncher } from "./native.js";

// `menloapp try` hands the work to the native runtime. This wrapper keeps the
// person in the same session: one live timer instead of a line every ten
// seconds, and when the build is signed but the iPhone is out of reach, it
// waits for Enter (retry) or /notnow (the Mac keeps the build and installs it
// the next time that iPhone is reachable).

const WAITING_FOR_PHONE = /Connect and unlock your intended iPhone to install/;
const ELAPSED = /^(.*?) (\d+) seconds elapsed\. Keep this Terminal open\.$/;

export function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Run the native command, showing its output as it arrives. Resolves { status, text }. */
export function runNative(args, { launcher = nativeLauncher(), output = process.stdout, live = output.isTTY } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(launcher, args, { stdio: ["inherit", "pipe", "inherit"] });
    let text = "", pending = "", timerOpen = false;
    const line = value => {
      text += `${value}\n`;
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

async function askLine(question) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return await prompt.question(question); } finally { prompt.close(); }
}

export async function tryApp(args, {
  run = runNative,
  ask = askLine,
  log = console.log,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
} = {}) {
  let attempt = await run(args);
  while (attempt.status === 0 && WAITING_FOR_PHONE.test(attempt.text) && interactive) {
    const answer = (await ask("\nPlug your iPhone into this Mac (or keep it on the same Wi-Fi) and unlock it.\nPress Enter to install now, or type /notnow to install later: ")).trim().toLowerCase();
    if (["/notnow", "notnow", "n", "no"].includes(answer)) {
      log("OK. The signed build is saved on this Mac. It installs the next time your iPhone is unlocked and reachable, or run this command again.");
      return 0;
    }
    attempt = await run(args);
  }
  return attempt.status;
}

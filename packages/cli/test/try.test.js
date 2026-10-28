import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { clock, runNative, tryApp } from "../src/try.js";

const WAITING = "Built and signed. Connect and unlock your intended iPhone to install the update.\n";
const INSTALLED = "Installed on your iPhone.\n";

function sink(isTTY) {
  const written = [];
  return { isTTY, write: value => { written.push(value); return true; }, written };
}

async function fakeNative(script) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "menlo-try-"));
  const launcher = path.join(directory, "tohseno");
  await writeFile(launcher, `#!/bin/sh\n${script}\n`);
  await chmod(launcher, 0o755);
  return launcher;
}

test("clock shows minutes and seconds", () => {
  assert.equal(clock(7), "0:07");
  assert.equal(clock(70), "1:10");
});

test("one live timer replaces the repeated elapsed lines in a terminal", async () => {
  const launcher = await fakeNative(`echo "Downloading…"
echo "Downloading… 10 seconds elapsed. Keep this Terminal open."
echo "Downloading… 70 seconds elapsed. Keep this Terminal open."
printf "${WAITING}"`);
  const output = sink(true);
  const result = await runNative(["github", "install", "fatline"], { launcher, output });
  assert.equal(result.status, 0);
  assert.match(result.text, /Connect and unlock/);
  const shown = output.written.join("");
  assert.match(shown, /\r\x1b\[2KDownloading… 0:10 elapsed\r\x1b\[2KDownloading… 1:10 elapsed\n/);
  assert.doesNotMatch(shown, /Keep this Terminal open/);
  assert.match(shown, /Built and signed/);
});

test("plain output keeps every line when not in a terminal", async () => {
  const launcher = await fakeNative(`echo "Downloading… 10 seconds elapsed. Keep this Terminal open."; exit 3`);
  const output = sink(false);
  const result = await runNative([], { launcher, output });
  assert.equal(result.status, 3);
  assert.equal(output.written.join(""), "Downloading… 10 seconds elapsed. Keep this Terminal open.\n");
});

test("Enter retries the install in the same session until it lands", async () => {
  const outcomes = [WAITING, WAITING, INSTALLED];
  const runs = [];
  const questions = [];
  const status = await tryApp(["github", "install", "fatline"], {
    run: async args => { runs.push(args); return { status: 0, text: outcomes.shift() }; },
    ask: async question => { questions.push(question); return ""; },
    log: () => {},
    interactive: true,
  });
  assert.equal(status, 0);
  assert.equal(runs.length, 3);
  assert.equal(questions.length, 2);
  assert.match(questions[0], /Press Enter to install now, or type \/notnow/);
});

test("/notnow leaves the signed build for later", async () => {
  const logs = [];
  let runs = 0;
  const status = await tryApp([], {
    run: async () => { runs++; return { status: 0, text: WAITING }; },
    ask: async () => "/notnow",
    log: value => logs.push(value),
    interactive: true,
  });
  assert.equal(status, 0);
  assert.equal(runs, 1);
  assert.match(logs[0], /installs the next time your iPhone is unlocked and reachable/);
});

test("without a terminal it does not wait for input", async () => {
  let asked = false;
  const status = await tryApp([], {
    run: async () => ({ status: 0, text: WAITING }),
    ask: async () => { asked = true; return ""; },
    interactive: false,
  });
  assert.equal(status, 0);
  assert.equal(asked, false);
});

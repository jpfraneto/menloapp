import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { clock, runNative, tryApp, wakeIntendedPhone } from "../src/try.js";

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

const COMMIT = "e6031efe923dcff9ccc61c7df34ac713ec19dcf8";
const ARGS = ["github", "install", "fatline"];
const fetcher = async () => ({ ok: true, json: async () => ({ head_commit: COMMIT }) });
const record = (status, extra = {}) => ({ display_name: "Fatline", source_path: os.tmpdir(), github_origin: { slug: "fatline", commit: COMMIT }, network_delivery: { status, artifact_path: os.tmpdir() }, installations: [], ...extra });
const quiet = { log: () => {}, output: sink(false), pause: async () => {}, fetcher, wake: async () => true };

test("an exact commit already built and signed goes straight to the iPhone", async () => {
  const states = [record("ready_for_iphone"), record("ready_for_iphone"), record("ready_for_iphone"), record("installed")];
  const logs = [];
  let runs = 0;
  const output = sink(false);
  const status = await tryApp(ARGS, { ...quiet, output, log: value => logs.push(value), read: async () => states.length > 1 ? states.shift() : states[0], run: async () => { runs++; return { status: 0, text: "" }; }, ask: async () => "", interactive: true });
  assert.equal(status, 0);
  assert.equal(runs, 0);
  assert.match(logs[0], /Fatline e6031ef is already built and signed on this Mac/);
  assert.match(output.written.join(""), /Installed on your iPhone/);
});

test("after a build waits for the iPhone, Enter watches the install instead of rebuilding", async () => {
  const states = [record("verified_source"), record("ready_for_iphone"), record("installed")];
  let runs = 0;
  const questions = [];
  const status = await tryApp(ARGS, { ...quiet, read: async () => states.shift() ?? record("installed"), run: async () => { runs++; return { status: 0, text: WAITING }; }, ask: async question => { questions.push(question); return ""; }, interactive: true });
  assert.equal(status, 0);
  assert.equal(runs, 1);
  assert.equal(questions.length, 1);
  assert.match(questions[0], /Press Enter to install now, or type \/notnow/);
});

test("an unreachable iPhone asks again", async () => {
  let questions = 0;
  const status = await tryApp(ARGS, { ...quiet, watchSeconds: 4, read: async () => record("ready_for_iphone"), run: async () => ({ status: 0, text: "" }), ask: async () => (++questions === 1 ? "" : "/notnow"), interactive: true });
  assert.equal(status, 0);
  assert.equal(questions, 2);
});

test("/notnow leaves the signed build for later", async () => {
  const logs = [];
  const status = await tryApp(ARGS, { ...quiet, log: value => logs.push(value), read: async () => record("ready_for_iphone"), run: async () => ({ status: 0, text: "" }), ask: async () => "/notnow", interactive: true });
  assert.equal(status, 0);
  assert.match(logs.at(-1), /installs the next time your iPhone is unlocked and reachable/);
});

test("a downloaded commit says it is building, not downloading", async () => {
  let rename;
  await tryApp(ARGS, { ...quiet, read: async () => record("verified_source"), run: async (args, options) => { rename = options.rename; return { status: 0, text: INSTALLED }; }, ask: async () => "", interactive: true });
  assert.equal(rename("Downloading the selected GitHub commit, then building for your iPhone… 10 seconds elapsed. Keep this Terminal open."), "Building Fatline e6031ef for your iPhone (source already downloaded)… 10 seconds elapsed. Keep this Terminal open.");
});

test("a new commit still downloads and builds", async () => {
  let runs = 0;
  const status = await tryApp(ARGS, { ...quiet, read: async () => ({ ...record("ready_for_iphone"), github_origin: { slug: "fatline", commit: "a".repeat(40) } }), run: async () => { runs++; return { status: 0, text: INSTALLED }; }, ask: async () => "", interactive: true });
  assert.equal(status, 0);
  assert.equal(runs, 1);
});

test("without a terminal it does not wait for input", async () => {
  let asked = false;
  const status = await tryApp(ARGS, { ...quiet, read: async () => null, run: async () => ({ status: 0, text: WAITING }), ask: async () => { asked = true; return ""; }, interactive: false });
  assert.equal(status, 0);
  assert.equal(asked, false);
});

test("Enter first opens the connection to the intended iPhone", async () => {
  let woke = 0;
  await tryApp(ARGS, { ...quiet, wake: async () => { woke++; return true; }, read: async () => record("installed", { installations: [] }), run: async () => ({ status: 0, text: "" }), ask: async () => "", interactive: true });
  assert.equal(woke, 0, "an installed record never needs the phone");
  const states = [record("ready_for_iphone"), record("installed")];
  await tryApp(ARGS, { ...quiet, wake: async () => { woke++; return true; }, read: async () => states.shift() ?? record("installed"), run: async () => ({ status: 0, text: "" }), ask: async () => "", interactive: true });
  assert.equal(woke, 1);
});

test("only the intended iPhone is asked to connect", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "menlo-wake-"));
  await mkdir(path.join(root, "service"));
  const intended = "PHONE-B";
  await writeFile(path.join(root, "service", "cable-genesis-v1.json"), JSON.stringify({ intended_device_digest: createHash("sha256").update(`TOHSENO-CABLE-DEVICE-V1\0${intended}`).digest("hex") }));
  const calls = [];
  const exec = async (command, args) => {
    calls.push(args);
    if (args[1] === "list") await writeFile(args.at(-1), JSON.stringify({ result: { devices: [
      { identifier: "PHONE-A", connectionProperties: { tunnelState: "disconnected" } },
      { identifier: "PHONE-B", connectionProperties: { tunnelState: "disconnected" } },
    ] } }));
  };
  assert.equal(await wakeIntendedPhone(root, exec), true);
  assert.deepEqual(calls[1], ["devicectl", "device", "info", "details", "--device", "PHONE-B", "--timeout", "20"]);
  assert.equal(calls.length, 2);
});

test("no intended iPhone means nothing is asked to connect", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "menlo-wake-"));
  let called = false;
  assert.equal(await wakeIntendedPhone(root, async () => { called = true; }), false);
  assert.equal(called, false);
});

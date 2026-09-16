import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { validatePresentation } from "../src/presentation.js";
import { setupPresentation, readCommittedPresentation } from "../src/project-presentation.js";
import { selectSimulator } from "../src/record.js";

test("scaffold is public, preserves owner edits, and reads the commit instead of the working copy", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "menloapp-presentation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await setupPresentation(root, "My App"), true);
  const manifest = path.join(root, "menloapp/app.json");
  const before = await readFile(manifest, "utf8");
  assert.equal(await setupPresentation(root, "Different"), false);
  assert.equal(await readFile(manifest, "utf8"), before);
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8" }).trim();
  git("init", "-q"); git("add", "."); git("commit", "-qm", "Presentation");
  await writeFile(manifest, JSON.stringify({ version: 1, name: "Uncommitted name" }));
  assert.equal((await readCommittedPresentation(root, "HEAD")).name, "My App");
  await writeFile(manifest, JSON.stringify({ version: 1, name: "My App", icon: "menloapp/icon.png" }));
  await symlink("app.json", path.join(root, "menloapp/icon.png"));
  git("add", "."); git("commit", "-qm", "Invalid icon link");
  await assert.rejects(readCommittedPresentation(root, "HEAD"), /regular file/);
});

test("presentation rejects external assets, traversal, duplicate/excess screenshots, and fake metadata", () => {
  for (const icon of ["https://evil.test/icon.png", "menloapp/../private.png", "menloapp//icon.png", "menloapp/icon.svg"]) assert.throws(() => validatePresentation({ version: 1, name: "App", icon }));
  for (const screenshots of [["menloapp/a.png", "menloapp/a.png"], Array.from({ length: 4 }, (_, i) => `menloapp/${i}.png`)]) assert.throws(() => validatePresentation({ version: 1, name: "App", screenshots }));
  assert.throws(() => validatePresentation({ version: 1, name: "App", installed: true }));
  assert.throws(() => validatePresentation({ version: 1, name: "App", preview: { kind: "simulator", path: "menloapp/p.mp4", source_commit: "main" } }));
});

test("recording refuses ambiguous or unavailable Simulators", () => {
  const a = { udid: "a", name: "iPhone A", state: "Booted", isAvailable: true };
  const b = { udid: "b", name: "iPhone B", state: "Booted", isAvailable: true };
  assert.throws(() => selectSimulator({ ios: [] }));
  assert.throws(() => selectSimulator({ ios: [a, b] }));
  assert.equal(selectSimulator({ ios: [a, b] }, "b"), b);
  assert.throws(() => selectSimulator({ ios: [a] }, "other"));
});

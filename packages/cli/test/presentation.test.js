import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { validatePresentation, presentationFiles } from "../src/presentation.js";
import { setupPresentation, readCommittedPresentation, updatePresentationLinks, commitPresentation, previewNeedsRefresh } from "../src/project-presentation.js";
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
  const preview = { preview: { kind: "simulator", source_commit: git("rev-parse", "HEAD") } };
  assert.equal(previewNeedsRefresh(root, "HEAD", preview), false);
  await writeFile(manifest, JSON.stringify({ version: 1, name: "Uncommitted name" }));
  assert.equal((await readCommittedPresentation(root, "HEAD")).name, "My App");
  await writeFile(manifest, JSON.stringify({ version: 1, name: "My App", icon: "menloapp/icon.png" }));
  await symlink("app.json", path.join(root, "menloapp/icon.png"));
  git("add", "."); git("commit", "-qm", "Invalid icon link");
  await assert.rejects(readCommittedPresentation(root, "HEAD"), /regular file/);
  assert.equal(previewNeedsRefresh(root, "HEAD", preview), false, "app-page edits alone keep the recorded experience");
  await writeFile(path.join(root, "App.swift"), "new app source");
  git("add", "App.swift"); git("commit", "-qm", "Change app");
  assert.equal(previewNeedsRefresh(root, "HEAD", preview), true);
  assert.equal(previewNeedsRefresh(root, "HEAD", { preview: { kind: "device" } }), false);
});

test("presentation rejects external assets, traversal, duplicate/excess screenshots, and fake metadata", () => {
  for (const icon of ["https://evil.test/icon.png", "menloapp/../private.png", "menloapp//icon.png", "menloapp/icon.svg"]) assert.throws(() => validatePresentation({ version: 1, name: "App", icon }));
  for (const screenshots of [["menloapp/a.png", "menloapp/a.png"], Array.from({ length: 4 }, (_, i) => `menloapp/${i}.png`)]) assert.throws(() => validatePresentation({ version: 1, name: "App", screenshots }));
  assert.throws(() => validatePresentation({ version: 1, name: "App", installed: true }));
  assert.throws(() => validatePresentation({ version: 1, name: "App", preview: { kind: "simulator", path: "menloapp/p.mp4", source_commit: "main" } }));
  for (const ogImage of ["https://evil.test/share.png", "menloapp/../private.png", "menloapp/share.svg", "menloapp/share.mp4"]) assert.throws(() => validatePresentation({ version: 1, name: "App", ogImage }));
  const custom = validatePresentation({ version: 1, name: "App", icon: "menloapp/icon.png", ogImage: "menloapp/share.jpg" });
  assert.equal(custom.ogImage, "menloapp/share.jpg");
  assert.deepEqual(presentationFiles(custom), ["menloapp/icon.png", "menloapp/share.jpg"]);
  assert.equal(validatePresentation({ version: 1, name: "App" }).ogImage, null);
});

test("recording refuses ambiguous or unavailable Simulators", () => {
  const a = { udid: "a", name: "iPhone A", state: "Booted", isAvailable: true };
  const b = { udid: "b", name: "iPhone B", state: "Booted", isAvailable: true };
  assert.throws(() => selectSimulator({ ios: [] }));
  assert.throws(() => selectSimulator({ ios: [a, b] }));
  assert.equal(selectSimulator({ ios: [a, b] }, "b"), b);
  assert.throws(() => selectSimulator({ ios: [a] }, "other"));
});

test("optional links and CAIP-19 token addresses validate without accepting executable URLs", () => {
  const tokenAddress = `eip155:8453/erc20:0x${"a".repeat(40)}`;
  const value = validatePresentation({ version: 1, name: "App", tokenAddress, website: "https://app.example", githubRepo: "https://github.com/maker/App", menloLink: "https://menloapp.lol/my-app" });
  assert.equal(value.tokenAddress, tokenAddress);
  assert.equal(value.website, "https://app.example/");
  for (const token of ["0x" + "a".repeat(40), "eip155:8453:0x" + "a".repeat(40), "eip155:1/erc20:0x123", "javascript:alert(1)"]) assert.throws(() => validatePresentation({ version: 1, name: "App", tokenAddress: token }), /CAIP-19/);
  for (const website of ["javascript:alert(1)", "http://example.com", "https://user:secret@example.com"]) assert.throws(() => validatePresentation({ version: 1, name: "App", website }), /HTTPS/);
  assert.throws(() => validatePresentation({ version: 1, name: "App", menloLink: "https://evil.example/my-app" }), /menloapp.lol/);
});

test("deploy fills confirmed links and will not auto-commit unrelated owner changes", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "menloapp-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main"); await setupPresentation(root, "App"); git("add", "."); git("commit", "-qm", "App");
  assert.equal(await updatePresentationLinks(root, "maker/App", "https://menloapp.lol/my-app"), true);
  assert.equal(await updatePresentationLinks(root, "maker/App", "https://menloapp.lol/my-app"), false);
  const value = JSON.parse(await readFile(path.join(root, "menloapp/app.json"), "utf8"));
  assert.equal(value.githubRepo, "https://github.com/maker/App"); assert.equal(value.menloLink, "https://menloapp.lol/my-app");
  await writeFile(path.join(root, "private.txt"), "owner work");
  const head = git("rev-parse", "HEAD");
  assert.throws(() => commitPresentation(root, ["menloapp/app.json"], "main"), /Other files changed/);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(await readFile(path.join(root, "private.txt"), "utf8"), "owner work");
});

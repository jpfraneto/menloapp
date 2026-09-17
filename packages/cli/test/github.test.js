import test from "node:test";
import assert from "node:assert/strict";
import { githubRepository, deployOptions, deviceLogin, inspectProject, authenticate, deploy } from "../src/github.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { suggestedCommand } from "../src/cli.js";

const schemeXML = name => `<Scheme><BuildableReference BuildableName="${name}.app" /></Scheme>`;
const appFiles = name => ({ [`${name}.xcodeproj/project.pbxproj`]: "fixture", [`${name}.xcodeproj/xcshareddata/xcschemes/${name}.xcscheme`]: schemeXML(name) });
async function repository(t, files = appFiles("App")) {
  files = { "menloapp/app.json": JSON.stringify({ version: 1, name: "App", subtitle: "", description: "", screenshots: [] }), ...files };
  const root = await mkdtemp(path.join(os.tmpdir(), "menlo-deploy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=MENLO Test", "-c", "user.email=menlo@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "--initial-branch=main");
  git("remote", "add", "origin", "https://github.com/maker/App.git");
  git("config", "user.name", "MENLO Test"); git("config", "user.email", "menlo@example.invalid");
  git("config", "commit.gpgsign", "false"); git("config", "core.hooksPath", "/dev/null");
  const remote = await mkdtemp(path.join(os.tmpdir(), "menlo-push-"));
  t.after(() => rm(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("config", "remote.origin.pushurl", remote);
  git("add", "."); git("commit", "-qm", "Initial app");
  return { root, git, commit: git("rev-parse", "HEAD") };
}
function interfaceFor(answers = [], interactive = true) {
  const logs = [], output = [], prompts = [], opened = [];
  return { interactive, logs, output, prompts, opened,
    log: text => logs.push(text), print: text => output.push(text), open: url => opened.push(url),
    ask: async text => { prompts.push(text); assert.ok(answers.length, `Unexpected prompt: ${text}`); const answer = answers.shift(); return typeof answer === "function" ? answer() : answer; },
  };
}
function requests(commit, { privateRepo = false, post, repoRead } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === "https://api.github.com/user") return Response.json({ id: 42, login: "maker" });
    if (url === "https://api.github.com/repos/maker/App") return Response.json(repoRead ? repoRead() : { private: privateRepo, default_branch: "main", description: "An app" });
    if (url.endsWith("/commits/main")) return Response.json({ sha: commit });
    if (url === "https://menloapp.lol/api/menlo/v1/apps") {
      const body = JSON.parse(init.body);
      return post ? post(body) : Response.json({ public_url: `https://menloapp.lol/${body.slug}` });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { calls, fetcher };
}
const noCredentials = { env: {}, platform: "linux", execute: () => { throw new Error("not installed"); } };

test("only GitHub remotes become public repository identities", () => {
  for (const remote of ["git@github.com:maker/App.git", "https://github.com/maker/App.git", "ssh://git@github.com/maker/App.git"]) assert.equal(githubRepository(remote), "maker/App");
  for (const remote of ["https://github.com.evil/maker/App", "https://token@github.com/maker/App", "file:///tmp/App", "git@github.com:maker/.."]) assert.throws(() => githubRepository(remote));
});
test("deploy options fail visibly instead of silently ignoring legacy publication controls", () => {
  assert.equal(deployOptions(["--json", ".", "--scheme", "App"]).scheme, "App");
  assert.throws(() => deployOptions(["--claim-edition", "open"]), /Unknown MENLO/);
  assert.throws(() => deployOptions(["--scheme"]), /needs a value/);
});
test("device authorization observes GitHub backoff and never logs its access token", async () => {
  const waits = [], logs = [];
  const responses = [
    { device_code: "private-code", user_code: "ABCD", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 },
    { error: "authorization_pending" }, { error: "slow_down" }, { access_token: "private-token" },
  ];
  const value = await deviceLogin("public-client-id", { fetcher: async () => Response.json(responses.shift()), log: text => logs.push(text), sleep: async ms => waits.push(ms), open: () => {} });
  assert.equal(value, "private-token");
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.ok(!logs.join("").includes("private-"));
});

test("committed app discovery ignores the abandoned project and DerivedData that blocked Logos", async t => {
  const { root } = await repository(t, { ...appFiles("Logos"), ".gitignore": "TenorPractice.xcodeproj/\nDerivedData/\n" });
  await mkdir(path.join(root, "TenorPractice.xcodeproj"));
  await mkdir(path.join(root, "DerivedData", "Generated.xcodeproj"), { recursive: true });
  const result = await inspectProject({ directory: root }, interfaceFor());
  assert.equal(result.project, "Logos.xcodeproj");
  assert.equal(result.scheme, "Logos");
});

test("real ambiguity is an in-terminal selection and never an arbitrary app guess", async t => {
  const { root } = await repository(t, { ...appFiles("Alpha"), ...appFiles("Beta") });
  const ui = interfaceFor(["wrong", "2"]);
  assert.equal((await inspectProject({ directory: root }, ui)).project, "Beta.xcodeproj");
  assert.equal(ui.prompts.length, 2);
  await assert.rejects(inspectProject({ directory: root }, interfaceFor([], false)), /--project Alpha.xcodeproj/);
});

test("a workspace containing the app is selected once and uses its shared app scheme", async t => {
  const { root } = await repository(t, { ...appFiles("App"), "App.xcworkspace/contents.xcworkspacedata": '<Workspace><FileRef location="group:App.xcodeproj" /></Workspace>', "App.xcodeproj/project.xcworkspace/contents.xcworkspacedata": "internal workspace" });
  const ui = interfaceFor();
  const result = await inspectProject({ directory: root }, ui);
  assert.equal(result.project, "App.xcworkspace");
  assert.equal(result.scheme, "App");
  assert.equal(ui.prompts.length, 0);
});

test("multiple app schemes are selectable without picking a test-only scheme", async t => {
  const { root } = await repository(t, { ...appFiles("App"), "App.xcodeproj/xcshareddata/xcschemes/Staging.xcscheme": schemeXML("App"), "App.xcodeproj/xcshareddata/xcschemes/Tests.xcscheme": '<BuildableReference BuildableName="Tests.xctest" />' });
  const ui = interfaceFor(["2"]);
  assert.equal((await inspectProject({ directory: root }, ui)).scheme, "Staging");
  assert.ok(!ui.logs.join("\n").includes("Tests"));
});

test("an explicit ignored project cannot be registered as available source", async t => {
  const { root } = await repository(t, { ...appFiles("App"), ".gitignore": "Old.xcodeproj/\n" });
  await mkdir(path.join(root, "Old.xcodeproj"));
  await writeFile(path.join(root, "Old.xcodeproj/project.pbxproj"), "old");
  await assert.rejects(inspectProject({ directory: root, project: "Old.xcodeproj" }, interfaceFor()), /not committed/);
});

test("no credentials gives sign-in instructions without ever trying publication", async () => {
  const ui = interfaceFor([], false);
  await assert.rejects(authenticate(ui, { ...noCredentials, fetcher: () => assert.fail("no request should be made") }), /not signed in.*[\s\S]*gh auth login/);
});

test("an expired saved GitHub session signs in and resumes with the new identity", async () => {
  const ui = interfaceFor([""]);
  let signedIn = false;
  const result = await authenticate(ui, { ...noCredentials,
    execute: (_command, args) => args[0] === "--version" ? "gh version" : signedIn ? "new-secret" : "expired-secret",
    login: () => { signedIn = true; return 0; },
    fetcher: async (_url, init) => init.headers.Authorization === "Bearer new-secret" ? Response.json({ id: 42, login: "maker" }) : Response.json({ message: "Bad credentials" }, { status: 401 }),
  });
  assert.equal(result.user.login, "maker");
  assert.equal(result.credential, "new-secret");
  assert.match(ui.logs.join("\n"), /expired/);
  assert.ok(!ui.logs.join("\n").includes("secret"));
});

test("an invalid explicit environment token identifies the variable and does not change accounts", async () => {
  const ui = interfaceFor();
  await assert.rejects(authenticate(ui, { ...noCredentials, env: { GH_TOKEN: "bad-secret" }, fetcher: async () => Response.json({ message: "Bad credentials" }, { status: 401 }), login: () => assert.fail("must not switch account") }), /unset GH_TOKEN/);
  assert.equal(ui.prompts.length, 0);
});

test("without gh, configured MENLO device sign-in resumes deployment authentication", async () => {
  const ui = interfaceFor();
  const result = await authenticate(ui, { ...noCredentials,
    device: async client => { assert.equal(client, "public-client"); return "device-secret"; },
    fetcher: async url => Response.json(url.endsWith("/status") ? { github_client_id: "public-client" } : { id: 42, login: "maker" }),
  });
  assert.equal(result.user.login, "maker");
});

test("missing GitHub App configuration gives an actionable authentication fallback", async () => {
  await assert.rejects(authenticate(interfaceFor(), { ...noCredentials, fetcher: async () => Response.json({ github_client_id: null }) }), /browser sign-in is not configured[\s\S]*brew install gh[\s\S]*gh auth login/);
});

test("private source requires the human's visibility action and then resumes to the public link", async t => {
  const { root, commit } = await repository(t);
  const ui = interfaceFor(["", ""]);
  let reads = 0;
  const network = requests(commit, { repoRead: () => ({ private: reads++ === 0, default_branch: "main" }) });
  assert.equal(await deploy([root, "--no-preview"], { ui, ...network, env: { GH_TOKEN: "fixture-secret" } }), 0);
  assert.deepEqual(ui.opened, ["https://github.com/maker/App/settings#danger-zone"]);
  assert.match(ui.logs.join("\n"), /code and history public/);
  assert.match(ui.output.join("\n"), /Your app is live:\nhttps:\/\/menloapp.lol\/app/);
  assert.equal(network.calls.filter(call => call.init.method === "POST").length, 1);
  assert.ok(!network.calls.some(call => call.init.method === "PATCH"));
});

test("ordinary deploy attempts the automatic preview and still returns its link when capture is unavailable", async t => {
  const { root, commit } = await repository(t);
  const ui = interfaceFor([], false);
  let attempted = false;
  await deploy([root, "--json"], { ui, ...requests(commit), env: { GH_TOKEN: "fixture-secret" }, previewTools: () => [], recordExperience: async () => { attempted = true; throw new Error("Simulator unavailable"); } });
  assert.equal(attempted, true);
  assert.equal(JSON.parse(ui.output[0]).menloLink, "https://menloapp.lol/app");
  assert.match(ui.logs.join("\n"), /Simulator unavailable/);
});

test("cancelling private visibility never publishes or changes the GitHub repo", async t => {
  const { root, commit } = await repository(t);
  const ui = interfaceFor(["n"]);
  const network = requests(commit, { privateRepo: true });
  await assert.rejects(deploy([root], { ui, ...network, env: { GH_TOKEN: "fixture-secret" } }), /still private/);
  assert.equal(ui.opened.length, 0);
  assert.ok(!network.calls.some(call => call.init.method));
});

test("a private repo in noninteractive mode reports exact settings and never prompts", async t => {
  const { root, commit } = await repository(t);
  const ui = interfaceFor([], false);
  await assert.rejects(deploy([root, "--json"], { ui, ...requests(commit, { privateRepo: true }), env: { GH_TOKEN: "fixture-secret" } }), /github.com\/maker\/App\/settings#danger-zone[\s\S]*menloapp deploy again/);
  assert.equal(ui.prompts.length, 0);
  assert.equal(ui.output.length, 0);
});

test("dirty source waits for a user commit and uses the resulting commit", async t => {
  const { root, git } = await repository(t);
  await writeFile(path.join(root, "App.swift"), "new source");
  const ui = interfaceFor([() => { git("add", "App.swift"); git("commit", "-qm", "Add source"); return ""; }]);
  const result = await inspectProject({ directory: root }, ui);
  assert.equal(result.commit, git("rev-parse", "HEAD"));
  assert.match(ui.logs.join("\n"), /uncommitted changes/);
});

test("an unpushed commit explains the push and can continue without restarting deploy", async t => {
  const { root, commit } = await repository(t);
  let pushed = false;
  const ui = interfaceFor([() => { pushed = true; return ""; }]);
  const network = requests(commit);
  const fetcher = (url, init) => url.endsWith("/commits/main") && !pushed ? Response.json({ sha: "0".repeat(40) }) : network.fetcher(url, init);
  await deploy([root, "--no-preview"], { ui, fetcher, env: { GH_TOKEN: "fixture-secret" } });
  assert.match(ui.logs.join("\n"), /git push origin main/);
  assert.match(ui.output.join("\n"), /Your app is live/);
});

test("repeat deploy finds the existing stable app link without requiring a slug flag", async t => {
  const { root, commit } = await repository(t);
  const registered = [];
  const network = requests(commit, { post: body => {
    registered.push(body);
    return body.slug === "existing-app" ? Response.json({ public_url: "https://menloapp.lol/existing-app" }) : Response.json({ error: "This repository already has a link: https://menloapp.lol/existing-app. Use --app-slug existing-app." }, { status: 409 });
  } });
  const ui = interfaceFor([], false);
  await deploy([root, "--json", "--no-preview"], { ui, ...network, env: { GH_TOKEN: "fixture-secret" } });
  assert.deepEqual(registered.map(body => body.slug), ["app", "existing-app"]);
  assert.equal(JSON.parse(ui.output[0]).public_url, "https://menloapp.lol/existing-app");
});

test("link collisions are resolved in the same deploy without changing repositories", async t => {
  const { root, commit } = await repository(t);
  const ui = interfaceFor(["", "my-app"]);
  let count = 0;
  const network = requests(commit, { post: body => ++count < 3 ? Response.json({ error: "That app link belongs to another repository. Choose --app-slug with another name." }, { status: 409 }) : Response.json({ public_url: `https://menloapp.lol/${body.slug}` }) });
  await deploy([root, "--no-preview"], { ui, ...network, env: { GH_TOKEN: "fixture-secret" } });
  assert.match(ui.output.join("\n"), /https:\/\/menloapp.lol\/my-app/);
});

test("network failures and rate limits name the service and do not masquerade as bad sign-in", async () => {
  const ui = interfaceFor([], false);
  await assert.rejects(authenticate(ui, { ...noCredentials, env: { GH_TOKEN: "fixture-secret" }, fetcher: async () => { throw new Error("offline"); } }), /Could not reach GitHub/);
  await assert.rejects(authenticate(ui, { ...noCredentials, env: { GH_TOKEN: "fixture-secret" }, fetcher: async () => Response.json({ message: "API rate limit exceeded" }, { status: 403 }) }), /request limit was reached/);
});

test("common deploy typos suggest the command without executing it", () => {
  for (const typo of ["deplpy", "deply", "deplloy", "depoly"]) assert.equal(suggestedCommand(typo), "deploy");
  for (const command of ["deploy", "create", "init", "doctor", undefined]) assert.equal(suggestedCommand(command), null);
});

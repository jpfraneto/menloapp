import test from "node:test";
import assert from "node:assert/strict";
import { githubRepository, deployOptions, deviceLogin } from "../src/github.js";

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

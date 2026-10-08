import test from "node:test";
import assert from "node:assert/strict";
import { review } from "../src/review.js";
import { REVIEW_POLICY, REVIEW_STATEMENT } from "../src/review-policy.js";

const commit = "a".repeat(40);
const link = `https://menloapp.lol/test-app?commit=${commit}&repository=12`;
function fixture({ answer = "recommend", interactive = true, wrongVersion = false } = {}) {
  const calls = [], output = [], opened = [], logs = [];
  const ui = { interactive, log: text => logs.push(text), print: text => output.push(text), open: url => opened.push(url), ask: async () => answer };
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === "https://api.github.com/user") return Response.json({ id: 7, login: "reviewer" });
    if (init.method === "POST") {
      assert.equal(init.headers.Authorization, "Bearer ghp_fixture");
      return Response.json({ ...JSON.parse(init.body), schema: REVIEW_POLICY, reviewer: { id: 7, login: "reviewer" } });
    }
    return Response.json({ repository_id: 12, repository: "maker/App", head_commit: wrongVersion ? "b".repeat(40) : commit, project: "App.xcodeproj", scheme: "App" });
  };
  return { ui, fetcher, env: { GH_TOKEN: "ghp_fixture" }, calls, output, opened, logs };
}

test("review pins the examined version and names the verified reviewer before publication", async () => {
  const f = fixture();
  assert.equal(await review([link, "--scope", "networking", "--notes", "No undeclared requests found."], f), 0);
  assert.equal(f.opened[0], `https://github.com/maker/App/tree/${commit}`);
  const published = f.calls.find(call => call.init.method === "POST");
  assert.equal(published.url, `https://menloapp.lol/api/menlo/v1/apps/test-app/reviews?commit=${commit}&repository=12`);
  const body = JSON.parse(published.init.body);
  assert.equal(body.statement, REVIEW_STATEMENT);
  assert.deepEqual(body.scopes, ["source", "networking"]);
  assert.match(f.output[0], /#reviews$/);
  assert.ok(!f.logs.join("\n").includes("ghp_fixture"));
});
test("cancelling publishes nothing and a substituted version does not authenticate", async () => {
  const cancelled = fixture({ answer: "" });
  await review([link], cancelled);
  assert.equal(cancelled.calls.length, 2);
  assert.ok(!cancelled.calls.some(call => call.init.method === "POST"));
  assert.equal(cancelled.output[0], "Review cancelled.");
  const substituted = fixture({ wrongVersion: true });
  await assert.rejects(review([link], substituted), /did not confirm/);
  assert.equal(substituted.calls.length, 1);
});
test("unattended reviews require both an explicit assertion and a repository-bound version link", async () => {
  for (const args of [[link], ["test-app", "--confirm"], [`https://menloapp.lol/test-app?commit=${commit}`, "--confirm"]]) {
    const f = fixture({ interactive: false });
    await assert.rejects(review(args, f), /exact version link/);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ interactive: false });
  await review([link, "--confirm", "--json"], f);
  assert.equal(JSON.parse(f.output[0]).commit, commit);
});
test("withdrawal selects the same version and performs no new source-review claim", async () => {
  const f = fixture({ answer: "withdraw" });
  await review([link, "--withdraw"], f);
  assert.equal(f.opened.length, 0);
  const body = JSON.parse(f.calls.find(call => call.init.method === "POST").init.body);
  assert.equal(body.outcome, "withdraw");
  assert.deepEqual(body.scopes, []);
});
test("malformed links and review controls cannot publish or execute source", async () => {
  for (const args of [[link, "--scope", "safe"], [link, "--notes", "x".repeat(2001)], [link, "--yes"], ["https://evil.test/app", "--confirm"]]) {
    const f = fixture();
    await assert.rejects(review(args, f));
    assert.equal(f.calls.length, 0);
  }
});

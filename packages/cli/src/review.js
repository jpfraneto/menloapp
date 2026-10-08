import { authenticate, MENLO_ORIGIN } from "./github.js";
import { parseAppLink } from "./app-link.js";
import { deployUI } from "./deploy-ui.js";
import { REVIEW_POLICY, REVIEW_SCOPES, REVIEW_STATEMENT } from "./review-policy.js";

export async function review(args, dependencies = {}) {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    (dependencies.ui?.print ?? console.log)(`menloapp review <link> [--scope dependencies] [--notes "Your findings"]

Publish a GitHub-authenticated recommendation of one exact app version.
Only publish after personally examining the source. This does not build the app.
Scopes: ${REVIEW_SCOPES.join(", ")}.
Use --withdraw to withdraw your recommendation of the selected version.
Noninteractive publishing requires --confirm and a version-pinned link.`);
    return 0;
  }
  const selected = parseAppLink(args[0]);
  let withdraw = false, confirm = false, json = false, notes = "";
  const scopes = new Set(["source"]);
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--withdraw") withdraw = true;
    else if (args[i] === "--confirm") confirm = true;
    else if (args[i] === "--json") json = true;
    else if (["--scope", "--notes"].includes(args[i])) {
      const option = args[i], value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${option} needs a value`);
      if (option === "--notes") notes = value;
      else if (REVIEW_SCOPES.includes(value)) scopes.add(value);
      else throw new Error(`Choose a review scope: ${REVIEW_SCOPES.join(", ")}`);
    } else throw new Error(`Unknown review option: ${args[i]}`);
  }
  if (notes.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(notes)) throw new Error("Review notes must be at most 2000 characters.");
  const ui = dependencies.ui ?? deployUI({ json });
  if (!ui.interactive && !confirm || confirm && (!selected.commit || !selected.repositoryID)) throw new Error("Noninteractive reviews require an exact version link and --confirm after you have reviewed that source.");
  const fetcher = dependencies.fetcher ?? fetch;
  const request = async (url, init = {}) => {
    const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(20_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `MENLO review failed (${response.status}).`);
    return body;
  };
  const params = new URLSearchParams();
  if (selected.commit) params.set("commit", selected.commit);
  if (selected.repositoryID) params.set("repository", selected.repositoryID);
  const endpoint = `${MENLO_ORIGIN}/api/menlo/v1/apps/${selected.slug}`;
  const app = await request(`${endpoint}${params.size ? `?${params}` : ""}`);
  if (!/^[a-f0-9]{40}$/.test(app.head_commit) || !Number.isSafeInteger(app.repository_id) || app.repository_id <= 0 || selected.commit && app.head_commit !== selected.commit || selected.repositoryID && app.repository_id !== Number(selected.repositoryID) || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(app.repository)) throw new Error("MENLO did not confirm the selected source version.");
  const sourceURL = `https://github.com/${app.repository}/tree/${app.head_commit}`;
  const versionURL = `${MENLO_ORIGIN}/${selected.slug}?commit=${app.head_commit}&repository=${app.repository_id}`;
  ui.log(`Source: ${sourceURL}\nVersion: ${app.head_commit}\nReviewed scopes: ${[...scopes].join(", ")}\n${withdraw ? "Withdraw your recommendation of this version." : REVIEW_STATEMENT}\n${notes ? `Public notes: ${notes}\n` : ""}Your GitHub identity and statement will be public. A new version receives no inherited review.`);
  if (!confirm && !withdraw) ui.open(sourceURL);
  let identity;
  try { identity = await authenticate(ui, { ...dependencies, fetcher }); }
  catch (error) { throw new Error(error.message.replaceAll("menloapp deploy", "menloapp review")); }
  if (!confirm) {
    const word = withdraw ? "withdraw" : "recommend";
    if (await ui.ask(`Publishing as @${identity.user.login}. Type ${word}, or press Enter to cancel: `) !== word) { ui.print("Review cancelled."); return 0; }
  }
  const result = await request(`${endpoint}/reviews?commit=${app.head_commit}&repository=${app.repository_id}`, {
    method: "POST", headers: { Authorization: `Bearer ${identity.credential}`, "Content-Type": "application/json" },
    body: JSON.stringify({ policy: REVIEW_POLICY, statement: REVIEW_STATEMENT, outcome: withdraw ? "withdraw" : "recommend", repository_id: app.repository_id, commit: app.head_commit, project: app.project, scheme: app.scheme, scopes: withdraw ? [] : [...scopes], notes }),
  });
  if (result.schema !== REVIEW_POLICY || result.commit !== app.head_commit || result.repository_id !== app.repository_id || result.reviewer?.id !== identity.user.id || result.outcome !== (withdraw ? "withdraw" : "recommend")) throw new Error("MENLO did not confirm your review. Check the version page before retrying.");
  ui.print(json ? JSON.stringify(result) : `${withdraw ? "Recommendation withdrawn" : "Source review published"}.\n${versionURL}#reviews`);
  return 0;
}

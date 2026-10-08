import type { Database } from "bun:sqlite";
import type { GitHubApp } from "./github-apps.ts";
import { HttpError } from "./security.ts";
import { REVIEW_POLICY, REVIEW_SCOPES, REVIEW_STATEMENT } from "../../../../packages/cli/src/review-policy.js";

export { REVIEW_STATEMENT };
export interface GitHubSourceReview {
  schema: "menlo.github-source-review/1";
  id: string;
  repository_id: number;
  commit: string;
  project: string;
  scheme: string;
  reviewer: { id: number; login: string };
  policy: string;
  outcome: "recommend" | "withdraw";
  scopes: string[];
  notes: string;
  created_at: string;
}

/** Authenticated human statements; these are not DeviceKey-signed attestations. */
export function createReviewLedger(db?: Database) {
  db?.exec(`CREATE TABLE IF NOT EXISTS review_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, repository_id INTEGER NOT NULL,
      source_commit TEXT NOT NULL, reviewer_id INTEGER NOT NULL, record TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS review_versions ON review_events(repository_id, source_commit, reviewer_id, sequence);
    CREATE TRIGGER IF NOT EXISTS immutable_review_updates BEFORE UPDATE ON review_events BEGIN SELECT RAISE(ABORT, 'review ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_review_deletes BEFORE DELETE ON review_events BEGIN SELECT RAISE(ABORT, 'review ledger is append-only'); END;`);
  const latest = (app: GitHubApp, commit: string, reviewerID: number) => {
    const row = db?.query("SELECT record FROM review_events WHERE repository_id = ? AND source_commit = ? AND reviewer_id = ? ORDER BY sequence DESC LIMIT 1").get(app.repository_id, commit, reviewerID) as { record: string } | null;
    return row ? JSON.parse(row.record) as GitHubSourceReview : undefined;
  };
  return {
    list(app: GitHubApp, commit: string) {
      const rows = db?.query(`SELECT e.record FROM review_events e JOIN (
        SELECT reviewer_id, MAX(sequence) sequence FROM review_events WHERE repository_id = ? AND source_commit = ? GROUP BY reviewer_id
      ) latest ON e.sequence = latest.sequence ORDER BY e.sequence DESC`).all(app.repository_id, commit) as { record: string }[] ?? [];
      const active = rows.map(row => JSON.parse(row.record) as GitHubSourceReview).filter(review => review.outcome === "recommend" && review.project === app.project && review.scheme === app.scheme);
      return { count: active.length, reviews: active.slice(0, 100) };
    },
    append(app: GitHubApp, commit: string, reviewer: { id: number; login: string }, body: any) {
      if (!db) throw new HttpError(503, "MENLO's review directory is unavailable");
      if (!body || body.policy !== REVIEW_POLICY || body.statement !== REVIEW_STATEMENT || !["recommend", "withdraw"].includes(body.outcome)) throw new HttpError(400, "Confirm the exact source-review statement before publishing");
      if (body.repository_id !== app.repository_id || body.commit !== commit || body.project !== app.project || body.scheme !== app.scheme) throw new HttpError(409, "The selected app or build recipe changed. Review that version again.");
      if (!Array.isArray(body.scopes) || body.scopes.length > REVIEW_SCOPES.length || body.scopes.some((scope: unknown) => typeof scope !== "string" || !REVIEW_SCOPES.includes(scope)) || new Set(body.scopes).size !== body.scopes.length || body.outcome === "recommend" && !body.scopes.includes("source")) throw new HttpError(400, "Choose the source-review scopes you actually examined");
      if (typeof body.notes !== "string" || body.notes.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.notes)) throw new HttpError(400, "Review notes must be at most 2000 characters");
      const scopes = REVIEW_SCOPES.filter(scope => body.scopes.includes(scope));
      const notes = body.notes.trim();
      return db.transaction(() => {
        const prior = latest(app, commit, reviewer.id);
        if (body.outcome === "withdraw" && !prior) throw new HttpError(404, "You have no review of this version to withdraw");
        if (prior && prior.outcome === body.outcome && prior.notes === notes && prior.project === app.project && prior.scheme === app.scheme && JSON.stringify(prior.scopes) === JSON.stringify(scopes)) return prior;
        const review: GitHubSourceReview = { schema: "menlo.github-source-review/1", id: crypto.randomUUID(), repository_id: app.repository_id, commit, project: app.project, scheme: app.scheme, reviewer, policy: REVIEW_POLICY, outcome: body.outcome, scopes, notes, created_at: new Date().toISOString() };
        db!.query("INSERT INTO review_events(repository_id, source_commit, reviewer_id, record) VALUES (?, ?, ?, ?)").run(app.repository_id, commit, reviewer.id, JSON.stringify(review));
        return review;
      })();
    },
  };
}

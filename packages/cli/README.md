# MENLO CLI (`tohseno` on npm)

```sh
npm i -g tohseno
cd YourApp
menlo deploy
```

Version 1.3.1 guides you from a GitHub repository to a production MENLO app link.
`tohseno deploy` works too. Deploy verifies your GitHub sign-in and offers browser
login through GitHub CLI when needed. It detects committed Xcode containers,
ignores old/generated project folders, and asks you to choose only when several
apps or schemes remain. A private repository opens GitHub settings with an
explicit explanation that making it public exposes its code and history; only
the user changes visibility. Deploy resumes after sign-in, visibility, or push
steps and reuses an existing app link automatically. Later pushes to the default
branch appear as updates without another deployment.

Deploy uses Node 20+ and Git directly. It does not require Companion, a wallet,
a native runtime download, or an iPhone. For automation, select a project with
`--project path/App.xcodeproj --scheme App`; choose a link with `--app-slug name`.
`--json` and noninteractive sessions never prompt. `--dry-run` checks local
metadata without authenticating or publishing. Missing/expired authentication,
uncommitted/unpushed source, and link collisions report their next action.

Recipients can use the MENLO Mac app or `tohseno github install <slug>`.
A recipient build needs macOS, Xcode, their Apple signing identity, and their
paired intended iPhone. Source is pinned to a Git commit and independently
verified. Scripts can require `--approve-mac-review` after local review.

npm install has no postinstall action. Commands requiring the native runtime
use the fixed HTTPS manifest at `https://tohseno.com/releases/cli-1.3.0.json`,
verify archive length, SHA-256, the closed file manifest, and Developer ID.
Deployment does not use that runtime. Existing chain-based publishing is
available explicitly through `deploy --legacy-registry`.

Development: `npm test` and `npm pack --dry-run`.
Release/setup evidence: `docs/runbooks/MENLO_GITHUB_DISTRIBUTION.md` in the repository.

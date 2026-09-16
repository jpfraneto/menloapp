# MENLO CLI (`tohseno` on npm)

```sh
npm i -g tohseno
cd YourApp
tohseno deploy
```

Version 1.3.0 connects a public GitHub repository to a stable MENLO app link.
`menlo deploy` works too. Commit and push first; sign in through GitHub device
authorization or your existing `gh auth login` session. Later pushes to the
default branch appear as updates without another deployment.

Deploy uses Node 20+ and Git directly. It does not require Companion, a wallet,
a native runtime download, or an iPhone. Select an ambiguous Xcode project with
`--project path/App.xcodeproj --scheme App`; choose a link with `--app-slug name`.
`--dry-run` checks local metadata without authenticating or publishing.

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

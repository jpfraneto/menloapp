# MENLO GitHub distribution

Authority: [ADR 0040](../adr/0040-menlo-github-distribution.md). This is the normal
public-repository path; the historical Registry and Claim path remains separate.

## What is ready, and what still needs a human

Implementation targets npm CLI 1.3.1, native CLI 1.3.0, and Mac 1.3.0-rc.1 (10012).
The website, app-link API, local exact-commit build path, and Companion update
projection are implemented. Release evidence is appended below as each actual
publication succeeds. No new physical installation/update or clean-Mac
acceptance is claimed by source tests.

Two credentials were absent during implementation:

- The production website has no `GITHUB_CLIENT_ID`. Existing `gh auth login`
  sessions can deploy; the native GitHub sign-in button explains this setup gap.
- `npm whoami` returns 401. The owner must run `npm login` before publishing the
  prepared `tohseno@1.3.1` package. Until then the unversioned npm command still
  resolves to the earlier release. Use the exact prepared package for testing.

## GitHub setup

Create a GitHub App for MENLO, enable **Device Flow**, and allow the intended
public repositories. Use repository **Contents: read** and **Metadata: read**;
MENLO checks the authorizing user's actual repository role before registering
an app. Give the website the public **Client ID** as `GITHUB_CLIENT_ID`.
A client secret is not required for device authorization. User tokens remain
on the developer's machine; the server uses them only for the current deploy
request and stores no credentials in the directory or ledger.

If using an OAuth App instead, device authorization requests `read:user
public_repo`; this grants broader public-repository access than the read-only
GitHub App. Prefer the GitHub App. User tokens can expire; sign in again when
prompted. The first version does not persist refresh tokens or implement
installation webhooks.

For production reads, provision a dedicated **read-only** GitHub credential as
`GITHUB_READ_TOKEN`. Public unauthenticated reads work, but GitHub's shared
rate limit is small. Never reuse an operator's broad write credential as the
server's read token. The website caches GitHub responses for 60 seconds.

The Railway `tohseno` production service stores `github-apps.sqlite` under
`MENLO_ROOT`, or under `$REGISTRY_ROOT/menlo` when omitted. Keep that directory
on the existing persistent volume. A single repository has one stable app
link. Renames require redeploy; ownership transfers require explicit operator
review. Do not edit the append-only registration ledger to impersonate a deploy.

Official references:
[GitHub device authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps),
[GitHub App user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[repository permissions](https://docs.github.com/en/rest/collaborators/collaborators),
[commit comparisons](https://docs.github.com/en/rest/commits/commits).

## The first real handoff

1. Install the exact MENLO Mac candidate. Open it and finish Apple's account,
   Trust, Developer Mode, and Companion pairing steps with the intended iPhone.
   Those are physical authority, not something an agent or fixture can accept.
   Existing owners also need the new Companion source on their phone: the old
   client cannot display GitHub status or send the new update command. The
   existing `companion install` command returns early for an already paired
   installation. For this upgrade, open
   `companion/apple/TohsenoCompanion/App/TohsenoCompanion.xcodeproj` in Xcode,
   choose the same signing team and intended phone, and Run once. Updating the
   existing app preserves pairing. The candidate bundles this project and SDK
   under `Tohseno.app/Contents/Resources/FactoryRelease/share/` as well.
2. In a public GitHub iOS app, commit and push to its default branch. Run
   `menlo deploy` (or `tohseno deploy`). It verifies authentication, offers
   GitHub CLI browser sign-in, detects committed app projects, and prompts for
   genuine project/scheme ambiguity. Ignored or abandoned Xcode directories
   are excluded. Private-repository guidance opens GitHub settings; only the
   user changes visibility, with the public-source consequence stated first.
   It resumes after a visibility change or push and reuses the repository's
   existing app link. Noninteractive/JSON runs give exact next steps without
   waiting for input. Keep the returned root URL.
3. Open that URL on the recipient's Mac or paired Companion. **Open in MENLO**
   reviews the pinned commit. Choose **Build for my iPhone** on the Mac or
   **Prepare on my Mac** on Companion. Build scripts and dependencies can stop
   for a second explicit source review on the Mac; Companion cannot bypass it.
4. The Mac fetches directly from GitHub, checks numeric repository identity and
   commit ancestry, verifies the Git checkout, and builds/signs with the
   recipient's Apple identity. Once ready, connect/unlock the intended phone.
   Another visible phone must never receive the app.
5. Confirm the real app launches. Send feedback through its GitHub Issues link.
   Record device/build/commit evidence without publishing private device IDs.
6. Push a small visible change to GitHub. No new MENLO deploy should be needed.
   With the Mac awake, allow about five minutes and sync Companion. Confirm the
   installed app says **N commits behind**, then choose **Update**. Confirm the
   second commit reaches the same app on the intended phone and its data survives.

Installation records advance only after a successful device installation and
bundle inventory verification. A source download, successful build, signed
command receipt, or animation does not count as installation. Failed updates
retain the previous installed-commit record and source. Diverged/rewritten
history displays an explicit review state rather than inventing a count.

## Current limits

Public repos only; checked-in Xcode projects/workspaces and an iOS app scheme
are required. This does not generate missing native projects for other toolchains.
Submodules and symlinks need source/layout work before import. Uncommitted edits
and extra local files are preserved and rejected for exact-source builds.
Downloaded commits live separately under `~/Developer/Menlo/`; moving an edited
checkout aside permits a clean retry without deleting those edits.

Xcode's provisioning, free-team device/app limits, entitlements, and expiration
still apply. The download is not an App Store installation. Dependencies must
be pinned and supported by the existing build safety checks.

The Mac service checks GitHub about every five minutes. Companion notices
synchronize while it is active; background APNs delivery is not implemented.
GitHub feedback links use the repository's Issues page; its owner controls
whether Issues is enabled. Private repos, webhooks, and GitHub refresh-token
management remain follow-ups after the first real handoff.

## Release integrity

For this GitHub path, the old contract activation, Claim, sponsored-upload,
and chain-specific lifecycle gates are not prerequisites. Build from a
recorded clean `main` commit. Keep exact source metadata, Developer ID,
hardened runtime, notarization, stapling, Gatekeeper, immutable download
length/SHA-256, and downloaded-byte agreement. Public Mac builds remain
explicit release candidates until the exact physical acceptance is observed.

The Node deploy command is independent of the native runtime. Preserve the
native manifest's fail-closed version and signature checks for recipient commands.
The owner npm publication step is:

```sh
cd packages/cli
npm login
npm publish --access public
npm view tohseno@1.3.1 version
```

Do not replace already published version bytes. Normal website deployment is
the existing Railway production service from reviewed `main`.

## Observed release evidence

- Native implementation commit: `409916d`; preview package/pin commit: `d9cfcae`.
- Production website deployment: `c2dcf3a4-0825-4899-b31d-ee492f4e35ad`.
- Real sample: [hello-menlo](https://tohseno.com/hello-menlo), backed by
  [jpfraneto/menlo-hello-world](https://github.com/jpfraneto/menlo-hello-world),
  GitHub repository ID `1373192564`.
- The packed CLI's `menlo deploy` returned that URL. A later push from
  `6473453f146de6f011a891f84f0e966f0c8c6e69` to
  `d02af97c84f790bf9437c4378a1836aa4eb2af69` changed the existing live link
  and returned `commits_behind: 1`, without a second deployment.
- The candidate's real `github install` fetched the latter public commit,
  verified it, adopted it, built with Xcode and signed locally. Its isolated
  workspace returned `ready_for_iphone`; no phone was associated, so no physical
  installation occurred. The source and build evidence were retained.
- Mac app notarization: `360c55cd-5c86-4891-a11f-d751fa8d15dc` (Accepted).
  DMG notarization: `f6e9b697-3099-4ba0-8f94-e616fe1bfdeb` (Accepted).
  Both stapled-ticket validation and Gatekeeper assessment passed.
- Checks passed: 142 website tests + TypeScript, 19 npm tests, 267 Rust tests
  across CLI/application/Companion (one unrelated ignored test), targeted
  Clippy, 46 Mac tests, 32 shared SDK tests, and 58 Companion tests.
- The in-app browser reported no available browser. Public HTTP routes and
  native fixture renders were checked; browser visual acceptance is not claimed.

The signed candidate and direct-install preview CLI are packaged under
`dist/menlo-1.3.0-rc.1/`. The preview uses
`https://tohseno.com/releases/cli-1.3.0.json`; the older `cli-v1.json` pin is
retained for existing npm clients. The landing page deliberately shows the
working preview URL until the owner publishes npm 1.3.0. After that publication,
its command can return to `npm i -g tohseno`.


Published release: [MENLO 1.3.0-rc.1](https://github.com/jpfraneto/tohseno/releases/tag/v1.3.0-rc.1).
Origin downloads of the DMG, both native archives, preview package, and manifest
matched every published SHA-256. The DMG is 53,474,187 bytes, SHA-256
`b5509689a96611d549f53488edad6664295e455c9aa8adc70f05a098a90d5656`.
The preview npm package SHA-256 is
`645015fbdcfef8103048df9c284e8b18e8fd2f74c7c27f7a31fd08baffcaaa65`.


The updated documentation is live at [docs.tohseno.com](https://docs.tohseno.com/)
(Cloudflare Pages deployment `e3e1838c`, source `6326679`). Astro check, the
static build, and the 40-page/link/search/feed verifier passed. The published
preview npm URL installed successfully into a temporary prefix; its `menlo`
alias and GitHub dry-run worked. The downloaded native archive passed its
closed-file manifest and Developer ID checks and resolved the current live
sample commit.

The final Railway rollout from `6326679` is
`3d753785-bce2-4b49-bebf-a19525e15cf6`; it applies the verified 1.3.0-rc.1
Mac pin and versioned CLI manifest while preserving the older CLI manifest.


Final production checks observed Mac version `1.3.0-rc.1`, build `10012`,
the preview CLI manifest at `cli-1.3.0.json`, and the preserved 1.2.1 manifest
at `cli-v1.json`. Downloading through `https://tohseno.com/download/macos`
returned exactly 53,474,187 bytes with the pinned DMG digest above. The live
homepage contains the preview command and persisted `hello-menlo` app card;
the directory still resolves the current GitHub commit after redeployment.

### Guided deploy CLI 1.3.1

Source `94533a7` fixes the real Logos project-discovery failure and adds the
guided authentication, visibility, project/scheme choice, push, existing-link,
and collision paths. The package is published at
[CLI 1.3.1](https://github.com/jpfraneto/tohseno/releases/tag/cli-v1.3.1).
Its 17,348-byte `tohseno-1.3.1.tgz` has SHA-256
`fca0b5fa9261080067346112ec503dd1ed81e063ddc9bdd85984c240386e4761`;
the public download matched. It is installed in the owner's existing npm
prefix. Native release pins remain at their exact previously signed 1.3.0
artifacts; the npm-only change does not relabel or rebuild those artifacts.

Verification passed: 39 CLI tests including packed installation, 28 relevant
website tests and typecheck, and the docs build/link verifier. The real Logos
repository automatically selected `Logos.xcodeproj` and `Logos`, authenticated
the owner, and reached the explicit private-repository step. Terminal Ctrl+C
cancelled cleanly. The repository remained private. A real no-flags sample
deployment reused `https://tohseno.com/hello-menlo`; the installed package also
completed deployment against production. No physical installation is implied.

Railway deployment `c9ef7c4c-d603-4c93-8447-b0f77c84143e` serves the new landing
installer URL; it and the sample's real app/deep link were observed over HTTP.
Cloudflare docs deployment `5da8ced2` serves the updated guided quickstart.
The npm registry still serves 1.2.1 and npm authentication still returned 401;
the direct preview package works while the owner renews npm authentication.

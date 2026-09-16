# ADR 0040: MENLO distributes living GitHub apps

Status: accepted

Date: 2026-09-16

Authority: the owner's September 16 instruction to make GitHub-first, gas-free
iOS distribution the primary product path.

## Decision

MENLO connects a public GitHub repository to a stable app link. `npm i -g menloapp`
and `menloapp deploy` are the developer entry point at `menloapp.lol`. The
owner’s later September 16 naming and media instruction supersedes the initial
`tohseno` npm name and `menlo` alias for new installations. Native technical
identifiers and existing published release pins remain compatible.
Deployment proves the signed-in GitHub user has push access to the repository.
GitHub numeric user, owner, and repository IDs anchor identity. Profiles link to
GitHub. We do not introduce a separate reputation system.

A small centralized, persistent directory and append-only registration ledger
replace chain writes on this path. No wallet, gas, Builder bootstrap, Companion
publication signature, Shot, Ship, or Claim is required. This explicitly
supersedes ADRs 0025, 0034, 0035, and 0039 where they prescribe the consumer
entry point, public identity, publication, or acquisition path. Historical
Registry releases and receipts keep their existing semantics and verification;
GitHub registrations never impersonate them. Frozen protocol bytes, deployed
contracts, and their activations are unchanged.

The app follows its repository's default branch. A deploy registers the build
recipe and stable link; subsequent pushes need no MENLO publication or payment.
Each recipient action pins a full Git commit. Downloaded source must match it,
and build scripts/dependencies retain explicit local review. A link opens a
review surface; opening a URL alone is never permission to execute remote code.

The recipient's Mac remains the build machine, using that recipient's Apple
signing identity and the existing intended-iPhone selection and installation
verification. Downloaded, built, ready, and installed commits are distinct.
The installed commit advances only after physical installation verification.
Updates preserve the app's local bundle identity and existing installation data.
Local edits are preserved; no automatic reset or overwrite is permitted.

Mac and Companion show GitHub comparison evidence for the installed commit.
Only an ancestor comparison can say “N commits behind”; rewritten/divergent
history and unavailable GitHub evidence are shown explicitly. Update requires
an explicit action, pins the chosen commit, builds on the Mac, and retains the
artifact until the intended iPhone is reachable. Companion is a private remote
over the existing authenticated channel, not a second build machine.

The initial scope is public repositories. Private source, webhooks, GitHub App
installation management, and push delivery through APNs are not prerequisites.
Bounded cached polling while the products are running is sufficient. GitHub
device authorization supports people without an existing GitHub CLI session.
User tokens are not stored by the public directory or written to its ledger.

The landing page explains centralized distribution now and possible
decentralized witnessing in v1/v2 when it earns its cost. That roadmap is not a
promise of a scheduled contract migration. Existing Apple signing, notarized
Mac-download pins, source-integrity, and physical-device boundaries remain.

## Acceptance

Exercise a real public repo -> deploy -> app link -> recipient review -> exact
commit checkout -> local build/sign -> intended iPhone, followed by a push and
an explicitly accepted update. Tests and source implementation are separately
reported from published packages, released clients, and physical acceptance.

## Public presentation and optional recording

The owner’s September 16 extension selects a small public `menloapp/` folder.
`app.json` declares a name, subtitle, description, optional app icon, up to three
screenshots, and an optional recorded preview. These files are ordinary public
Git files and are read from the same full commit as the app page. Later pushes
update presentation through the existing default-branch discovery mechanism.
Registration establishes identity and recipe; it is not a second media editor.

`menloapp init` scaffolds the folder. A first deploy offers that same scaffold
and requires review, commit and push before registration. Installing the npm
package globally or as a project dependency does not run a setup or upload hook.

`menloapp deploy --record` explicitly builds an isolated copy of the committed
app for one selected, booted iPhone Simulator, launches it, and records a bounded
walkthrough. The resulting MP4 is selected in the manifest and stops for review
before a subsequent commit/push/deploy makes it public. No private existing
capture is automatically selected. The source commit actually built remains
attached to the preview, even when a later commit contains the video file.

A Simulator recording is a recorded demonstration, not an interactive app,
physical installation, recipient acceptance or verification report. Manually
supplied screen/device recordings are labeled as supplied by the maker.

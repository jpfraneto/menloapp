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

The owner's September 18 instruction makes the public homepage app discovery.
It shows each app once, without commits, redeployments, or update notices.
Updates belong to the existing user's claimed or installed apps in their private
library; the installed-commit comparison mechanism remains unchanged.
App pages use a store listing:
icon, title, subtitle, maker avatar/username, GitHub link, one gallery with the
recording first, and the description. A prominent Discover Other Apps control
opens discovery. Public copy describes the commands and current behavior directly.
Existing Apple signing, notarized Mac-download pins, source integrity and
physical-device boundaries remain.

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

The owner's September 18 extension adds optional `ogImage`, a PNG or JPEG inside
the public `menloapp/` folder, under the existing 10 MiB image limit. It uses the
same commit, regular-file and selected-media checks. Without a custom image,
shared app links render a 1200 × 630 PNG with the app's icon (or a labeled initial
when no icon exists), title, description, and public MENLO URL. Open Graph and
Twitter metadata are server-rendered. Historical Registry app pages also gain
share cards without changing their signed releases or acquisition semantics.
Anky's first-release share icon is taken from its verified, already-public source
archive; it is presentation artwork, not a new signed catalog attachment.

The owner’s September 17 instruction adds optional `website` and `tokenAddress`
(CAIP-19 ERC-20 asset identifier), plus automatically derived `githubRepo` and
`menloLink` fields. GitHub identity and the registered MENLO link are derived by
the server; a supplied metadata URL cannot replace those identities.

The ordinary commands are `menloapp deploy` and `menloapp try <link>`. Deploy
creates missing presentation metadata and commits/pushes only the metadata and
captures it generates; unrelated owner edits must already be committed. It fills
the actual GitHub and MENLO links after registration. `init` and explicit project,
scheme, slug and recording controls remain optional advanced tools.

Deploy can generate an automatic preview using a signed-in local Codex CLI and
Simulator capture tools. It builds the exact committed source, creates a fresh
iPhone Simulator by default, and uses bounded, structured agent actions targeted
to that Simulator. The agent receives only the screen and accessibility data;
it does not receive project source or authority to sign in, purchase, message,
or authorize account actions. Existing screenshots and videos marked device or
screen-recording are preserved; Simulator previews refresh after app-source
changes. Missing capture tools or a failed automatic preview do not prevent
deployment with existing assets. `--record` regenerates a
preview, and `--no-preview` skips generation.

A Simulator recording is a demonstration of actual app use. The source commit
that was built stays attached to it, even when a later commit contains the media.
The page labels it as a Simulator preview. It is not physical installation,
recipient acceptance or a verification report. The deploy instruction authorizes
publication of newly generated preview assets in the public app folder.

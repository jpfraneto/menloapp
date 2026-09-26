# Launch menloapp on npm and menloapp.lol

The GitHub repository is `https://github.com/jpfraneto/menloapp`, on `main`.
The local checkout is `/Users/kithkui/code/menloapp`.
The npm package is published as `menloapp@1.5.1`; its only executable is
`menloapp`. Existing `tohseno`/`menlo` installations can coexist with it.

This change implements the owner's September 16 naming and public-media
extension to [ADR 0040](../adr/0040-menlo-github-distribution.md). It does not
publish a new native artifact, change Apple signing, or activate a contract.

## App discovery and share previews: September 18

September 18 follow-up: app discovery and share-card source `02bee76` is live in
production deployment `d67c2834-c9cc-4154-b2be-eba877818660`. `/anky` includes
server-rendered Open Graph and Twitter metadata and serves its app-specific
1200 × 630 PNG to both crawler user agents. `/` and `/apps` show app cards without
commit/update activity. Live desktop/mobile navigation, image GET/HEAD, health,
native-manifest compatibility and stylesheet/source agreement passed.

The exact `dist/menloapp-1.5.1/menloapp-1.5.1.tgz` package for `ogImage` metadata
is published as npm latest after owner login and browser publishing approval.
The downloaded registry tarball matches the reviewed archive byte for byte.
A fresh isolated registry installation reports `menloapp 1.5.1` and accepts
custom `ogImage` metadata. Published integrity:
`sha512-f1ucB1JDFeM6XUQeq2uc9krmN6LvItNDe/+kf5rstowRKNrNW87PxEWdRqUSbSoEq+rr6XimzO8WsJaTq2Lcwg==`.

## App-store listing and automatic deploy: September 17

The September 17 website ran source `dd2cf1c65854c5c8a2e0ef255dc5b83574845e5c`, uploaded
from main in Railway deployment `353914dd-7814-49d1-ba7f-60396f6d8190`. The
homepage is the network activity feed. App pages show creator identity and a
recording-first gallery. Live desktop/mobile navigation, image loading and video
playback passed, and the served stylesheet matches the commit.

The published `menloapp@1.5.0` tarball has integrity
`sha512-A+du2BPKToqdiwpweraNz7/j+WEGy/dAYzGeDSxIsgQ/Cz05BIBxIOyzI60gInMQ6vyHMWklSZejGaXC6is6Cg==`.
Its 47 npm checks, 34 focused website checks, website typecheck and native
embedded-module regression passed. Installed from that tarball, plain
`menloapp deploy` built public sample source
`bca6b4472cb00c1b9b4af3210ef86f03eb7ca1c0`, automatically recorded real Codex
interaction, created a screenshot, committed/pushed the presentation and then
wrote confirmed `githubRepo` and `menloLink` values. The existing public URL was
retained. Sample commit `00dab9045d9061b7277e3d10cd4715ee8d0c2eef` contains
the result; public media match the Git bytes, and the four-second recording
plays on the live listing. The temporary Simulator was removed.

npm published the exact 1.5.0 tarball after owner browser account verification
and registry processing. It was latest at that release. Downloaded registry bytes
match the reviewed tarball, and a global registry install reports
`menloapp 1.5.0`; deploy and try help both pass. The reviewed tarball remains at
`dist/menloapp-1.5.0/menloapp-1.5.0.tgz`. No native artifact is changed by this
npm update.

## Initial launch: September 17, 2026

- [menloapp@1.4.0](https://www.npmjs.com/package/menloapp) is published. A global
  registry install reports the expected version, and the published tarball
  matches the reviewed local package byte for byte.
- [menloapp.lol](https://menloapp.lol) serves source
  `f59f08d0570f54ed19b6effd3f729f74b517cde9`. Railway deployment
  `4af21e10-2d07-4c70-bb3b-cb978bdefd9d` built the root Dockerfile and serves the
  new homepage and public-media API. Health and app endpoints return 200.
- The installed npm command deployed [Hello MENLO](https://menloapp.lol/hello-menlo).
  Its public commit `63012d3ab2284e6ce85d3f5718826515dea88c8b` includes one real
  screenshot and a six-second Simulator recording. Both public assets match
  their Git bytes, and the recording plays in desktop and mobile Chrome.
- The owner configured Namecheap DNS and `BASE_URL=https://menloapp.lol`.
  `tohseno.com` is also active on the same service for existing clients.
  `www.tohseno.com` is no longer a Railway custom domain.

The September 16 npm-login and custom-domain-limit blockers are resolved.
No further DNS setup is needed. Later npm publications can require fresh account
verification. GitHub device authorization was configured on September 26 as
recorded in [the distribution runbook](MENLO_GITHUB_DISTRIBUTION.md#github-setup).
A dedicated GitHub read token remains unconfigured; developers can also deploy
with an existing `gh auth login` session. Physical recipient
installation and update remain separate, unobserved acceptance steps.

## 1. Keep both production domains connected

Use the existing `menloapp` service in the **production** environment of Railway
project `menloapp-production` (`3cd7e1db-dcd7-4fce-900d-321799179911`).
The service ID is
`1b13b201-6332-4355-b47a-5df2642e1fbd`. It was renamed from `tohseno`; its durable
volume and application directory are unchanged.

Both `menloapp.lol` and `tohseno.com` connect to port 3000. Keep **tohseno.com**:
released native clients, pinned npm runtime manifests and historical links still
use it. Do not redirect old API or release-manifest requests wholesale to the
new domain; released clients reject redirects there. The optional `www` alias
was removed to fit the service's two custom-domain slots; no plan upgrade was
needed.

Check the existing connections without recreating them:

```sh
cd /Users/kithkui/code/menloapp
railway domain status menloapp.lol --service menloapp --environment production
railway domain status tohseno.com --service menloapp --environment production
curl --fail https://menloapp.lol/healthz
curl --fail https://tohseno.com/releases/cli-1.3.0.json
```

For later DNS changes, use the exact destination/verification records shown by
Railway. Namecheap's records live under Domain List → menloapp.lol → Manage →
Advanced DNS → Host Records. Preserve mail and unrelated records. See
[Namecheap's ALIAS instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/10128/2237/how-to-create-an-alias-record/)
and [Railway's domain instructions](https://docs.railway.com/networking/domains/working-with-domains).
There is no requirement to add `www.menloapp.lol`.

## 2. Deploy the current website from main

The production service currently receives CLI uploads, with no GitHub source
configured in Railway; renaming GitHub therefore did not break an automatic
source connection. Deploy from the repository root. The root Dockerfile
includes both the website and the small shared presentation validator in
`packages/cli/src/presentation.js`. Uploading only `website/` omits that module.

For a later website change, commit and push reviewed source on `main`, then
export that exact commit for upload. This keeps unrelated local files out of the
deployment. The canonical origin is already configured; the variable command
below only needs repeating if that setting changes:

```sh
cd /Users/kithkui/code/menloapp
git switch main
railway variable set BASE_URL=https://menloapp.lol \
  --service menloapp --environment production --skip-deploys
menlo_source="$(mktemp -d)"
git archive main | tar -x -C "$menlo_source"
railway up "$menlo_source" --path-as-root \
  --project 3cd7e1db-dcd7-4fce-900d-321799179911 \
  --service menloapp --environment production --detach
```

Keep `MENLO_ROOT`, or the current `REGISTRY_ROOT/menlo` default, on the existing
persistent volume so all registered links and the append-only ledger survive.
Preserve GitHub, Registry and native download configuration. Do not turn on
legacy write capabilities for this launch.

A successful upload is not yet a healthy deployment. Use one deployment-status
check, or the Railway dashboard; inspect a failing step if needed instead of
restarting the entire flow. The npm package is already live and does not need
republishing for website-only changes.

After the deployment succeeds:

```sh
curl --fail https://menloapp.lol/healthz
curl --fail https://menloapp.lol/api/menlo/v1/status
curl --fail https://menloapp.lol/api/menlo/v1/apps/hello-menlo
curl --fail https://tohseno.com/releases/cli-1.3.0.json
```

The app response should contain `public_url: https://menloapp.lol/hello-menlo`.
The old runtime manifest should remain directly available. Existing native
clients can keep reading the same app directory through `tohseno.com`.

Existing `gh auth login` sessions can deploy. For people without GitHub CLI,
production now advertises the Menlo GitHub App's public `GITHUB_CLIENT_ID` with
Device Flow enabled, as recorded in [the distribution runbook](MENLO_GITHUB_DISTRIBUTION.md#github-setup).
A dedicated read-only `GITHUB_READ_TOKEN` is useful to avoid the small anonymous
GitHub rate limit. User write tokens are never persisted by the directory.

## 3. Install the published package or publish a later version

From a terminal:

```sh
npm i -g menloapp
menloapp --version
menloapp deploy --help
```

Version 1.5.1 is published. For a future CLI change, update the package version,
run its relevant checks, and commit/push the source before publishing:

```sh
cd /Users/kithkui/code/menloapp/packages/cli
npm whoami
npm publish --access public
npm view menloapp version bin dist.integrity
```

Use `npm login` if the session has expired, and complete any browser/2FA prompt
yourself. A package name/version is immutable once published, so a later fix
needs a new version. See [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
No postinstall script runs. Publishing this JavaScript package does not rebuild
or relabel the signed native runtime; 1.4.0 and the 1.5.x versions retain the exact 1.3.0 runtime pin.

## 4. Deploy and try an app

In your app's public GitHub repository, with app changes committed and pushed:

```sh
menloapp deploy
```

The command creates missing `menloapp/app.json`, generates an automatic preview
when capture tools are available, commits and pushes its generated presentation,
and returns `https://menloapp.lol/your-app`. It writes the confirmed `menloLink`
and `githubRepo` back to `app.json`. The [package README](../../packages/cli/README.md#your-app-page)
contains the complete metadata format, including optional `website` and
CAIP-19 `tokenAddress` fields. `menloapp init` is optional when preparing custom
metadata and artwork before the first deploy.

The listing shows the app icon, name, subtitle, maker avatar and username,
GitHub link, description, and a gallery with the recording first. The homepage
and Discover Other Apps button open the network activity feed. Later pushes
update the same page, with up to 60 seconds of cache delay.

Automatic previews require full Xcode with an iPhone Simulator runtime, a
signed-in Codex CLI, AXe and FFmpeg. Install these once:

```sh
npm i -g @openai/codex
codex login
brew install cameroncooke/axe/axe ffmpeg
```

Normal `menloapp deploy` then builds committed source in a fresh Simulator.
Codex chooses bounded interactions from real screenshots; capture omits the
agent's thinking time. Only generated metadata and media are committed and
pushed. Existing screenshots and device/screen-recording videos are preserved;
Simulator previews refresh after app-source changes. Preview failures preserve
existing media and do not block the app link. `--record` explicitly regenerates
a preview and reports failures; `--no-preview` skips generation.

For a project dependency:

```sh
npm install menloapp
# Commit package.json and package-lock.json; keep node_modules/ ignored.
npx menloapp deploy
```

To try a shared app:

```sh
menloapp try https://menloapp.lol/hello-menlo
```

The recipient reviews exact source, builds with their own Mac, Xcode and Apple
signing identity, and installs on their intended iPhone. A Simulator preview is
not evidence of physical installation.

## When Get app does not open MENLO

Get app expands an installation panel with Open MENLO, a Mac download/update
link and a Terminal alternative. The browser handoff needs the desktop app's
registered `menlo://` handler. An npm installation provides the command and its
native runtime; it does not install or update the desktop app.

Install the currently pinned Mac download, open MENLO from Applications, and
try Open MENLO again. The link pins the displayed GitHub commit and repository
identity. It opens a source-review sheet; Build for my iPhone remains the
recipient's explicit action. With the npm command installed, the alternative is:

```sh
menloapp try https://menloapp.lol/logos
```

On the owner's Mac, 1.2.0 supported only `tohseno://`. The verified public
1.3.0-rc.1 app installed at `/Applications/Menlo.app` registered `menlo://` and
opened the real Logos source-review sheet. The older app was preserved. This
verified the browser-to-desktop boundary, not a physical iPhone installation.

## Verification and evidence

Before launch, all 42 npm launcher/presentation checks passed, including packed
global and project-dependency installation. Website typechecking and 32 focused
GitHub/HTTP tests passed. The native embedded-launcher regression also passed.
A local fixture page loaded the icon and all three screenshots, played the video,
and kept the gallery within the page at desktop and 390-pixel mobile widths.
These checks were retained for the unchanged source; no full matrix was rerun
for the deployment.

On September 17, Railway built the production image from the exact main commit
above. The public homepage includes the npm command, the served stylesheet
matches that commit, and health/status/app endpoints respond successfully. The
previously registered sample remained available after deployment, confirming
that the existing directory survived.

A global install from the public npm registry then ran the real deployment and
recording flows. The recorder built sample source
`4ac9c0e6a7fe26eacdcde8781e7e7c239b447ab4` and produced a 6.021667-second H.264
MP4 at 1206×2622. The reviewed video and a screenshot were committed and pushed
as `63012d3ab2284e6ce85d3f5718826515dea88c8b`, then deployed through the published
CLI. The live API reports that commit and retains the earlier recorded-source
identity. Both served media files match their committed bytes. An isolated
Chrome session loaded the live page on desktop and mobile, loaded the screenshot,
and played the video without page errors or horizontal page overflow. The
temporary recording Simulator was removed after verification.

The sample is a single-screen app, so it includes one real screenshot and no
invented icon or extra screens. This is a Simulator preview; no new physical
recipient installation or update is claimed. GitHub device authorization was
still unconfigured at this publication; the September 26 setup above resolves
that configuration gap for developers without an existing GitHub CLI session.

The published tarball and local evidence are under `dist/menloapp-1.4.0/`.
`menloapp-1.4.0.tgz` is 23,387 bytes with SHA-256
`025d456ff415f66b91fec90c0fd66af76122eeb2f8e35a5b2a7fd38171bda781`.
The tarball downloaded from npm matches it exactly. `verification.json` records
publication, production deployment and the sample's live checks. The old
`tohseno.com/releases/cli-1.3.0.json` remains directly readable using the actual
npm launcher's fetch implementation and matches the pinned manifest bytes.

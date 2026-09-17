# Launch menloapp on npm and menloapp.lol

The GitHub repository is `https://github.com/jpfraneto/menloapp`, on `main`.
The intended local checkout is `/Users/kithkui/code/menloapp`.
The npm package is published as `menloapp@1.4.0`; its only executable is
`menloapp`. Existing `tohseno`/`menlo` installations can coexist with it.

This change implements the owner's September 16 naming and public-media
extension to [ADR 0040](../adr/0040-menlo-github-distribution.md). It does not
publish a new native artifact, change Apple signing, or activate a contract.

## Live launch: September 17, 2026

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
No further DNS or npm setup is needed for this launch. GitHub device-flow
credentials and a dedicated GitHub read token remain unconfigured; developers
can deploy with an existing `gh auth login` session. Physical recipient
installation and update remain separate, unobserved acceptance steps.

## 1. Keep both production domains connected

Use the existing `menloapp` service in the **production** environment of Railway
project `3cd7e1db-dcd7-4fce-900d-321799179911`. The service ID is
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
configure the existing GitHub App's public `GITHUB_CLIENT_ID` with Device Flow
enabled, as described in [the distribution runbook](MENLO_GITHUB_DISTRIBUTION.md#github-setup).
A dedicated read-only `GITHUB_READ_TOKEN` is useful to avoid the small anonymous
GitHub rate limit. User write tokens are never persisted by the directory.

## 3. Install the published package or publish a later version

From a terminal:

```sh
npm i -g menloapp
menloapp --version
menloapp deploy --help
```

Version 1.4.0 is already published. For a future CLI change, update the package
version, run its relevant checks, and commit/push the source before publishing:

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
or relabel the signed native runtime; 1.4.0 retains the exact 1.3.0 runtime pin.

## 4. Exercise one real app page

In the app's public GitHub repository:

```sh
menloapp init
```

Edit `menloapp/app.json` and add real assets. The [package README](../../packages/cli/README.md#your-app-page)
contains the complete format. Keep only the basic presentation fields there;
repository identity, version, source, build recipe and feedback are handled by
the existing GitHub and recipient flows.

```text
YourApp/
  YourApp.xcodeproj/
  menloapp/
    app.json
    README.md
    icon.png
    screenshot-1.png
    screenshot-2.png
    screenshot-3.png
    preview-....mp4       optional
```

`init` creates the JSON and README; it does not fabricate image or video files.
Commit and push the reviewed folder. Then:

```sh
menloapp deploy --app-slug your-app
```

The expected link is `https://menloapp.lol/your-app`. Open it and check the name,
subtitle, description, icon and three screenshots. App slugs use lowercase
letters, numbers and single hyphens. Later default-branch pushes update the same
page, with up to 60 seconds of cache delay.

To add a real preview, open an iPhone Simulator and run:

```sh
menloapp deploy --record --seconds 20
```

The command builds and launches the committed app, records while you use it,
and saves a new MP4 with its source commit in `app.json`. Review the recording,
commit/push the folder, then run `menloapp deploy`. Video and screenshots are
read from the public commit; no local capture is published merely by recording.
The page's controls play the MP4 before someone chooses to build the app.
A Simulator preview is not evidence of physical installation.

For a project dependency instead of a global tool:

```sh
npm install menloapp
npx menloapp init
# Review, commit and push package.json, package-lock.json, and menloapp/.
npx menloapp deploy
```

Keep `/node_modules/` in the project’s `.gitignore`; do not commit installed
dependencies.

A recipient still reviews the exact source, builds with Xcode and their own
Apple signing identity, and installs on their intended iPhone. A browser page
or recording does not remove those native requirements.

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
recipient installation or update is claimed. GitHub device authorization still
requires production configuration for developers without an existing GitHub
CLI session.

The published tarball and local evidence are under `dist/menloapp-1.4.0/`.
`menloapp-1.4.0.tgz` is 23,387 bytes with SHA-256
`025d456ff415f66b91fec90c0fd66af76122eeb2f8e35a5b2a7fd38171bda781`.
The tarball downloaded from npm matches it exactly. `verification.json` records
publication, production deployment and the sample's live checks. The old
`tohseno.com/releases/cli-1.3.0.json` remains directly readable using the actual
npm launcher's fetch implementation and matches the pinned manifest bytes.

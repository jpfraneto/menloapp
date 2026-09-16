# Launch menloapp on npm and menloapp.lol

The GitHub repository is `https://github.com/jpfraneto/menloapp`, on `main`.
The intended local checkout is `/Users/kithkui/code/menloapp`.
The npm package is prepared as `menloapp@1.4.0`; its only executable is
`menloapp`. Existing `tohseno`/`menlo` installations can coexist with it.

This change implements the owner's September 16 naming and public-media
extension to [ADR 0040](../adr/0040-menlo-github-distribution.md). It does not
publish a new native artifact, change Apple signing, or activate a contract.

## Current blockers

- `npm whoami` returned **401**. The owner needs to run `npm login` before
  publication. `npm view menloapp` returned **404**; availability is not a
  reservation of the name.
- `railway domain menloapp.lol` was rejected because the existing production
  service already uses its two custom-domain slots: `tohseno.com` and
  `www.tohseno.com`. No domain was removed and no paid plan was changed.
- DNS currently uses `dns1.registrar-servers.com` and
  `dns2.registrar-servers.com`, consistent with Namecheap. Confirm the provider
  in your domain account before editing records.

## 1. Connect the domain to the existing service

Use the existing `tohseno` service in the **production** environment of Railway
project `3cd7e1db-dcd7-4fce-900d-321799179911`. The service ID is
`1b13b201-6332-4355-b47a-5df2642e1fbd`. Keep its durable volume and all current
credentials. This is the same application and directory, not a new environment.

Resolve the domain limit first. The smallest change is to retire the optional
`www.tohseno.com` alias and reuse that slot, if you accept that the old `www`
address will stop working. Otherwise increase the plan's domain allowance.
Keep **tohseno.com**: released native clients, pinned npm runtime manifests and
historical links still use it. Do not redirect old API or release-manifest
requests wholesale to the new domain; released clients reject redirects there.

After your choice, add the domain:

```sh
cd /Users/kithkui/code/menloapp
railway domain menloapp.lol \
  --project 3cd7e1db-dcd7-4fce-900d-321799179911 \
  --service tohseno --environment production --port 3000 --json
```

Use the exact DNS destination and any ownership-verification record returned by
that command. A destination cannot be supplied here because Railway refused
creation before assigning the domain.

For Namecheap: Domain List → menloapp.lol → Manage → Advanced DNS → Host Records.
Add an **ALIAS** with Host **@** and Value set to Railway's assigned destination.
Add any TXT verification record with exactly the host/value Railway supplies.
Replace conflicting parking or root redirect records, while preserving mail
and unrelated records. Namecheap supports root ALIAS records on BasicDNS,
FreeDNS and PremiumDNS. See [Namecheap's ALIAS instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/10128/2237/how-to-create-an-alias-record/)
and [Railway's domain instructions](https://docs.railway.com/networking/domains/working-with-domains).

Then check DNS and TLS:

```sh
railway domain status menloapp.lol --service tohseno --environment production
curl --fail https://menloapp.lol/healthz
```

Do not publish the npm package until the new API origin responds over HTTPS.
There is no requirement to add `www.menloapp.lol`.

## 2. Deploy the current website from main

The production service currently receives CLI uploads, with no GitHub source
configured in Railway; renaming GitHub therefore did not break an automatic
source connection. Deploy from the repository root. The root Dockerfile
includes both the website and the small shared presentation validator in
`packages/cli/src/presentation.js`. Uploading only `website/` omits that module.

Once DNS/TLS is ready, set the canonical origin without triggering an intermediate
deployment, then upload this reviewed source:

```sh
cd /Users/kithkui/code/menloapp
git switch main
railway variable set BASE_URL=https://menloapp.lol \
  --service tohseno --environment production --skip-deploys
railway up --project 3cd7e1db-dcd7-4fce-900d-321799179911 \
  --service tohseno --environment production --detach
```

Keep `MENLO_ROOT`, or the current `REGISTRY_ROOT/menlo` default, on the existing
persistent volume so all registered links and the append-only ledger survive.
Preserve GitHub, Registry and native download configuration. Do not turn on
legacy write capabilities for this launch.

The new homepage shows the npm command, so perform npm publication next in the
same launch session. A successful upload is not yet a healthy deployment. Use
one deployment-status check, or the Railway dashboard; inspect a failing step
if needed instead of restarting the entire flow.

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

## 3. Publish the prepared npm package

```sh
cd /Users/kithkui/code/menloapp/packages/cli
npm login
npm whoami
npm publish --access public
npm view menloapp@1.4.0 version bin dist.integrity
```

Complete any npm browser/2FA prompt yourself. A package name/version is immutable
once published, so fix a later release with a new version. See
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
No postinstall script runs, and publishing this JavaScript package does not
rebuild or relabel the signed native runtime.

From a fresh terminal:

```sh
npm i -g menloapp
menloapp --version
menloapp deploy --help
```

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

## Verification from this change

All 42 npm launcher/presentation checks passed, including packed global and
project-dependency installation. Website typechecking and 32 focused GitHub/HTTP
tests passed. The native embedded-launcher regression test also passed; it
loads the new JavaScript modules from its private temporary directory. The
Dockerfile’s frozen production dependency-install inputs passed in a clean
temporary directory.
The recording command built the real `menlo-hello-world` sample in an isolated
checkout and captured a playable 4.1-second H.264 MP4 (with a five-second recording window) on a temporary iPhone Simulator.
The recording was not uploaded or represented as a physical iPhone result.
A fresh headless Chrome session exercised the local fixture page at desktop and
390-pixel mobile widths: icon and all three screenshots loaded, the video played,
the mobile gallery scrolled, and neither page overflowed horizontally. No browser
console errors were observed. The connected Browser runtime had no available
browser, so this was an isolated local browser check. Docker was not running on
this Mac; the container image has not been built locally.
Domain activation, npm publication, production deployment of this change and a
new physical recipient handoff remain separate, unfinished operational steps.


The prepared tarball and local visual evidence are under
`dist/menloapp-1.4.0/`. `menloapp-1.4.0.tgz` is 23,387 bytes with SHA-256
`025d456ff415f66b91fec90c0fd66af76122eeb2f8e35a5b2a7fd38171bda781`.
This is a local package, not an npm publication. `verification.json` records
its checks and the still-inactive launch steps.

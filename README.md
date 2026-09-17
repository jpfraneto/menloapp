# MENLO

Share your iPhone app. Let anyone try it.

```sh
npm i -g menloapp
menloapp deploy
```

Run it in your app’s public GitHub repository. You get a live link:
`https://menloapp.lol/your-app`.

The page has your app’s icon, name, subtitle, creator, screenshots, preview and
description. Share the link. Later GitHub pushes update the same app page.

To try an app:

```sh
menloapp try https://menloapp.lol/hello-menlo
```

Your Mac builds the app with Xcode and your Apple signing identity, then delivers
it to your paired iPhone. You review the source before running its build.

[Discover apps](https://menloapp.lol) · [Hello MENLO](https://menloapp.lol/hello-menlo)

## Your app page

Keep the public metadata and media in `menloapp/`. Deploy creates `app.json` if
needed and fills in `githubRepo` and `menloLink` automatically. You can supply
an icon, up to three screenshots, a website, and an optional CAIP-19 token address.
The preview appears first in the gallery.

With Codex and the Simulator capture tools installed, deploy can create an
automatic preview: it builds the committed app in a fresh Simulator, explores
it, and records real interactions. See the [CLI guide](packages/cli/README.md)
for the metadata format and one-time setup.

You can also add MENLO to a project with `npm install menloapp` and run
`npx menloapp deploy`.

## Development

The website lives in `website/`, the npm CLI in `packages/cli/`, and the Mac
build and delivery runtime in `cli/`, `engine/`, and `macos/`.

Read [AGENTS.md](AGENTS.md) before changing the project. The
[launch runbook](docs/runbooks/MENLOAPP_LAUNCH.md) covers production operation;
[STATE.md](docs/STATE.md) records verified behavior and remaining work.

# MENLO (`menloapp`)

Share your iOS app from a public GitHub repository:

```sh
npm i -g menloapp
cd YourApp
menloapp init
# Edit menloapp/app.json, then commit and push your changes.
menloapp deploy
```

Deploy returns `https://menloapp.lol/your-app`. Subsequent pushes update the same
page automatically. GitHub supplies repository identity, commits, source and
feedback. MENLO checks that you have write access before registering the app.
There is no gas, wallet, or Companion publication approval on this path.

You can also install it as a project dependency:

```sh
npm install menloapp
npx menloapp init
# Review, commit and push package.json, package-lock.json and menloapp/.
npx menloapp deploy
```

For a local dependency, keep `/node_modules/` in your project’s `.gitignore`;
commit the package manifests and your public `menloapp/` folder.

Installation runs no setup, download or upload scripts. `menloapp init` creates
`menloapp/app.json` and a short README without replacing existing files. The
first deploy creates that folder if it is missing, then asks you to review,
commit and push it. Node 20+ and Git are required. An existing `gh auth login`
session works; a configured GitHub device flow is also supported.

## Your app page

The website reads this file from the same exact Git commit as its media:

```json
{
  "version": 1,
  "name": "Your App",
  "subtitle": "A short reason to try it",
  "description": "What the app does and who it helps.",
  "icon": "menloapp/icon.png",
  "screenshots": [
    "menloapp/screenshot-1.png",
    "menloapp/screenshot-2.png",
    "menloapp/screenshot-3.png"
  ],
  "preview": null
}
```

Put the real files at those paths before committing. An icon is optional
(`null`), and zero to three PNG/JPEG screenshots are supported, up to 10 MiB per
image. No placeholder icon or fake screenshot is inserted. Metadata limits:
100 characters for the name, 160 for the subtitle, and 4,000 for the description.
Descriptions support line breaks and are rendered as text.

Files must be ordinary Git files inside `menloapp/`; symbolic links, external
URLs and Git LFS pointers are not supported. Only files explicitly selected in
`app.json` are served as presentation media. Media URLs contain the full commit,
and the server checks the downloaded bytes against that commit's Git blob.
Pages follow the default branch with a cache of up to 60 seconds. A recording
can show an earlier app version; its recorded source commit stays visible.

## Record an experience

Open an iPhone Simulator, then:

```sh
menloapp deploy --record --seconds 20
```

This builds an isolated copy of the current committed source for that Simulator,
launches the chosen app, and records its screen while you use it. It executes
your project's normal Xcode build scripts. It does not use your physical phone
or Apple signing identity. The duration is 3–60 seconds. With multiple booted
Simulators, pass `--simulator UDID` from `xcrun simctl list devices booted`.

The command writes a new MP4 and updates `app.json`, then stops for your review.
Review the recording, commit and push `menloapp/`, and run `menloapp deploy` to
publish its selection. The page labels it as a Simulator recording and shows
the exact source commit used to build it. Recording is explicit; deploy does
not silently record an app or publish private captures.

You can supply an existing MP4 of up to 50 MiB instead:

```json
"preview": { "path": "menloapp/preview.mp4", "kind": "screen-recording" }
```

Use `"kind": "device"` for your own physical-device recording. These are
maker-supplied descriptions, not installation attestations. H.264 MP4 gives
broad browser playback support. Previews have playback controls and are not
interactive versions of the app.

## Deploy and try

`menloapp deploy --project path/App.xcodeproj --scheme App --app-slug your-app`
handles explicit project selection. Slugs use 2–64 lowercase letters, numbers
and single hyphens. `--dry-run` checks local committed metadata without writing,
authenticating or publishing. `--json` and noninteractive sessions do not prompt.
`--name` supplies an initial scaffold name; committed `app.json` is authoritative.

Recipients open the link in the MENLO Mac app, or run
`menloapp github install your-app`. They review the exact source and build with
Xcode and their own Apple signing identity for their paired intended iPhone.
Build scripts can require `--approve-mac-review` after local review.

Commands needing the native runtime retain the exact signed native 1.3.0
manifest at `https://tohseno.com/releases/cli-1.3.0.json`; hashes, archive layout,
and Apple signature checks remain unchanged. Deployment and recording run in
Node directly. Existing `tohseno` and `menlo` commands belong to the earlier
package; this package installs only `menloapp`, so it can coexist with them.
Historical publication is available through `deploy --legacy-registry`.

Development: `npm test`, `npm pack --dry-run`.

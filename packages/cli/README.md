# menloapp

Share your iPhone app. Let anyone try it.

Starting from scratch:

```sh
npm i -g menloapp
menloapp
```

Keep your intended iPhone connected and unlocked. Menlo checks Xcode and your
Apple signing, installs Menlo on your iPhone, and guides you through the private
connection. Setup finishes when the app is installed and paired. Open Menlo on
your iPhone to send intents; your Mac builds and signs the apps you ask for.
If setup stops for an Apple prerequisite, follow the instruction and run
`menloapp setup` to continue.

Already have an app to share:

```sh
npm i -g menloapp
menloapp deploy
```

Run deploy in your app’s public GitHub repository. It returns a live link like
**https://menloapp.lol/your-app**. Share it. New commits update the same app page.

To install someone’s app:

```sh
menloapp try https://menloapp.lol/hello-menlo
```

MENLO uses your Mac, Xcode and Apple signing identity to build the app for your
paired iPhone. You review the exact source before its build runs. The iPhone
needs Trust and Developer Mode enabled.
The app you came for installs first. You can add Menlo to your iPhone later with
`menloapp setup`; it is not required to try the linked app.

[Discover apps](https://menloapp.lol)

## Your app page

Deploy creates `menloapp/app.json` if it does not exist. Edit it to make the
listing yours:

```json
{
  "version": 1,
  "name": "Your App",
  "subtitle": "A short reason to try it",
  "description": "What the app does and who it helps.",
  "website": "https://your-app.example",
  "tokenAddress": null,
  "githubRepo": "https://github.com/your-name/your-app",
  "menloLink": "https://menloapp.lol/your-app",
  "icon": "menloapp/icon.png",
  "ogImage": null,
  "screenshots": [
    "menloapp/screenshot-1.png",
    "menloapp/screenshot-2.png",
    "menloapp/screenshot-3.png"
  ],
  "preview": null
}
```

`githubRepo` comes from your GitHub origin. `menloLink` is filled in after a
successful deploy. You do not need to set either field yourself. `website` is
an optional HTTPS link. `tokenAddress` is an optional
[CAIP-19 ERC-20 identifier](https://namespaces.chainagnostic.org/eip155/caip19):
`eip155:<chain-id>/erc20:<contract-address>`. For example, a token on Base uses
`eip155:8453/erc20:` followed by its `0x` contract address. Set optional fields
to `null` when they do not apply.

Put real PNG/JPEG files at the selected image paths. An icon is optional;
zero to three screenshots are supported, up to 10 MiB each. The name allows
100 characters, the subtitle 160, and the description 4,000. The recording is
the first item in the gallery, followed by the screenshots.

The public page reads metadata and media from your Git commit. Media must be
ordinary files inside `menloapp/`, not symbolic links or Git LFS pointers.
Only selected files are served. Updates can take up to 60 seconds to appear.

Shared links include a 1200 × 630 image with your app icon, title, description,
and `menloapp.lol/your-app`. To use your own artwork, set
`"ogImage": "menloapp/share.png"` (PNG or JPEG, up to 10 MiB; 1200 × 630
recommended), then commit and push the image and `app.json`. Leave `ogImage`
absent or `null` for the automatic card. Use menloapp 1.5.1 or later when
deploying metadata with this field. Social networks may cache older previews.

## Automatic previews

Deploy can build the committed app in a fresh iPhone Simulator, have Codex
explore its screens, and record the interactions. It adds screenshots when none
were supplied. You do not need to drive the app or configure
recording settings.

One-time prerequisites: full Xcode with an iPhone Simulator runtime, a signed-in
[Codex CLI](https://developers.openai.com/codex/cli/),
[AXe](https://github.com/cameroncooke/AXe), and FFmpeg:

```sh
npm i -g @openai/codex
codex login
brew install cameroncooke/axe/axe ffmpeg
```

The preview uses your Codex account. Only screenshots and the Simulator’s UI
structure are sent to Codex. It stops at sign-in, purchases, messaging and other
sensitive actions. Existing screenshots and videos marked `device` or
`screen-recording` are preserved. Simulator previews refresh when app source
changes. If capture is unavailable, deploy shares the app with the media you
already have and explains what prevented the new preview.

MENLO commits and pushes the metadata and captures it creates. Commit your own
app changes before deploying. The recording identifies the source that was
built and is labeled as a Simulator preview on the public page.

You can also select your own H.264 MP4 of up to 50 MiB:

```json
"preview": { "path": "menloapp/preview.mp4", "kind": "screen-recording" }
```

Use `"kind": "device"` for a physical-device recording.

## Advanced options

The everyday commands are `menloapp deploy` and `menloapp try <link>`.

- `menloapp init` prepares metadata for editing before a first deploy.
- `--record` regenerates the automatic preview; `--no-preview` skips generation.
- `--project path/App.xcodeproj` and `--scheme App` select an ambiguous project.
- `--app-slug your-app` chooses the link name; ordinary deploy reuses an existing link.
- `--simulator UDID` selects a booted iPhone Simulator; the default is a fresh one.
- `--seconds 3–60` caps the preview length, excluding the agent’s thinking time.
- `--dry-run` checks committed source without publishing. `--json` avoids prompts.

Node 20+, Git and GitHub sign-in are required. An existing `gh auth login` session
works. Deploy guides sign-in when GitHub CLI is installed.

For a project dependency:

```sh
npm install menloapp
npx menloapp deploy
```

Keep `node_modules/` ignored. Installation runs no setup or upload scripts.

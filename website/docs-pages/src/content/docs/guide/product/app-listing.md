---
title: Your app page and preview
description: Control listing copy, media, and share artwork from the public menloapp folder.
---

Deploy creates `menloapp/app.json` if missing. Edit and push it with your source:

```json
{
  "version": 1,
  "name": "Your App",
  "subtitle": "A short reason to try it",
  "description": "What the app does and who it helps.",
  "website": null,
  "tokenAddress": null,
  "githubRepo": "https://github.com/your-name/your-app",
  "menloLink": "https://menloapp.lol/your-app",
  "icon": "menloapp/icon.png",
  "ogImage": null,
  "screenshots": ["menloapp/screenshot-1.png"],
  "preview": null
}
```

`githubRepo` is derived from your GitHub origin and `menloLink` is filled after registration. They do not replace the server’s verified repository identity. Remove the example icon and screenshot selections or set them to `null` and `[]` if you do not have those files.

## Copy and images

Names allow 100 characters, subtitles 160, and descriptions 4,000. An empty description can be filled from the public GitHub repository description; supplied text is preserved.

Select real PNG/JPEG files inside `menloapp/`, up to 10 MiB each. An icon and up to three screenshots are optional. Media must be ordinary Git files, not symlinks or Git LFS pointers. Only selected media are served. Deploy can copy a normal icon from exactly one committed `AppIcon.appiconset`; ambiguous catalogs and appearance variants need your choice.

App pages show the icon, title, subtitle, maker, GitHub link, one recording-first gallery, and description. Metadata and media come from the displayed source commit. Default-branch updates can take up to 60 seconds to appear.

## Share artwork

The generated 1200 × 630 card includes the icon, title, description, app URL, and first selected screenshot when available. Set `"ogImage": "menloapp/share.png"` to use custom PNG/JPEG artwork, up to 10 MiB. An image is presentation, not proof of installation or review.

## Preview recording

With full Xcode, an iPhone Simulator runtime, a signed-in local Codex CLI, AXe, and FFmpeg, deploy can build committed source and generate a preview on a fresh iPhone Simulator. `--record` regenerates it; `--no-preview` skips generation. `--simulator UDID` selects a booted Simulator and `--seconds` bounds the recording length from 3 to 60 seconds, excluding agent thinking time.

The preview agent receives screenshots and Simulator UI structure, not project source. It stops at sensitive actions such as sign-in, purchases, and messaging. Deploy commits and pushes the metadata and captures it generates. Existing recordings marked `device` or `screen-recording` are preserved; Simulator recordings refresh after app-source changes. Missing tools or failed capture do not prevent sharing existing assets.

To select your own H.264 MP4, up to 50 MiB:

```json
"preview": { "path": "menloapp/preview.mp4", "kind": "screen-recording" }
```

Use `device` for a physical-device recording. Simulator previews are labeled and retain the source commit that was built. They do not establish installation on a physical iPhone.

`website` is an optional HTTPS URL. `tokenAddress` is an optional CAIP-19 ERC-20 identifier such as `eip155:8453/erc20:<contract-address>`. Leave either `null` when unused; a token field does not introduce a payment or Claim requirement.

Next: [deploy the listing](/guide/start/share-an-app/).

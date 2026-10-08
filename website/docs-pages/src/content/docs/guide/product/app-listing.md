---
title: Edit your app page
description: Set your app’s copy, images, and preview in Git.
---

Deploy creates `menloapp/app.json`. Edit it, commit, and push. Listings follow the selected source commit; default-branch changes can take up to 60 seconds to appear.

## Copy and images

Start with these fields in the generated file:

```json
"name": "Your App",
"subtitle": "A short reason to try it",
"description": "What it does and who it helps."
```

Limits: name 100 characters, subtitle 160, description 4,000. An empty description can use your GitHub repository description; supplied text is preserved.

Optional media:

| Field | File | Limit |
| --- | --- | --- |
| `icon` | PNG/JPEG | 10 MiB |
| `screenshots` | Up to three PNG/JPEGs | 10 MiB each |
| `ogImage` | Custom share card, ideally 1200 × 630 | 10 MiB |

Use paths such as `menloapp/icon.png`. Files must be committed ordinary files inside `menloapp/`; symlinks and Git LFS pointers are unsupported. Only selected media are served. Leave unused fields `null` or `[]`.

Without `ogImage`, the share card is generated from your listing. Keep the generated repository and app-link fields; they do not override verified GitHub identity.

## Preview recording

Automatic Simulator capture needs Xcode, an iPhone Simulator runtime, signed-in local Codex CLI, AXe, and FFmpeg.

- `menloapp deploy --record` regenerates a preview.
- `menloapp deploy --no-preview` skips capture.
- Missing tools or failed capture do not block sharing existing media.

To select your own H.264 MP4, up to 50 MiB:

```json
"preview": { "path": "menloapp/preview.mp4", "kind": "screen-recording" }
```

Use `device` for a physical-device recording. Existing device/screen recordings are preserved; Simulator previews refresh after source changes and are labeled with the built commit. A preview does not prove physical installation.

`website` accepts an optional HTTPS URL. `tokenAddress` accepts an optional CAIP-19 ERC-20 identifier; it creates no payment requirement.

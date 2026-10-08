---
title: Availability
description: Published releases and current limits.
---

Checked October 8, 2026.

| Surface | Current release |
| --- | --- |
| npm launcher | `menloapp` 1.6.0 |
| Mac download | 1.3.0-rc.2, build 10013; release candidate, macOS 14+ |
| Website | Public GitHub listings, exact-version links, and source reviews |

The npm launcher and Mac app are separate releases. Publishing one does not update the other.

## Current limits

- Public GitHub repositories only.
- Recipients need full Xcode, compatible dependencies/capabilities, and their own Apple signing identity.
- Updates are chosen explicitly. The Mac must be awake; the iPhone client syncs while active. Background APNs update notifications are not implemented.
- Menlo on iPhone is required for fresh-start intent creation, and optional when trying a linked app.
- Another person’s complete public-download-to-iPhone installation has not been recorded as physically accepted.

[Live service status](https://menloapp.lol/api/menlo/v1/status) · [Mac download metadata](https://menloapp.lol/api/distribution/v1/macos) · [Detailed evidence](https://github.com/jpfraneto/menloapp/blob/main/docs/STATE.md)

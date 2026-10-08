---
title: Troubleshooting
description: Find the blocker and take the next step.
---

## Deploy cannot find the app

Commit and push your Xcode project to a public GitHub repository. Check push access and run from that repository. Specify the project and scheme if needed:

```sh
menloapp deploy --project path/App.xcodeproj --scheme App
```

Commit your own changes first; do not reset unrelated work. Use `--no-preview` if capture tools are unavailable.

## The app page shows older copy

Check that your listing changes were committed and pushed. The ordinary page can take up to 60 seconds to refresh. An exact-version link intentionally keeps its original commit.

## A version link is rejected

Copy the complete returned link, including commit and repository parameters. Quote it in Terminal to preserve `&`. Removing parameters selects different source.

## Review sign-in expired

Sign in again, recheck the selected source, and confirm the review. Browser sessions last ten minutes; sign-in alone publishes nothing.

## Xcode or signing stops the build

Open full Xcode, finish setup, and configure your Apple Account and signing team. Follow the displayed provisioning or entitlement error.

## Ready for phone does not advance

Reconnect your intended iPhone. Unlock it, enable Developer Mode, and confirm Trust. Another phone is never substituted.

The verified build is retained. Delivery resumes when the phone is ready; a coding pass is not needed for a device-only failure.

## Fresh-start setup stopped

Complete the displayed Apple prerequisite, then run `menloapp setup`. Trying a linked app does not require private phone pairing.

## A private intent is waiting

Keep your paired Mac awake. Relay acknowledgement does not mean the Mac has accepted the request. Do not delete the phone outbox.

```sh
menloapp service status
menloapp service logs
```

## Evolution is stale

Reopen the app and submit against its current source. Preserve existing edits if implementation failed partway; there is no general automatic rollback.

For retained Registry actions, see [historical distribution](/guide/architecture/person-to-person-network/).

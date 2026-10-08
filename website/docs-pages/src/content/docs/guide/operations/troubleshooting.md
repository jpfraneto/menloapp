---
title: Troubleshooting
description: Find the concrete blocker in deploy, exact-version review, build, or intended-iPhone delivery.
---

## Deploy cannot find the app

Commit and push the Xcode project to a public GitHub repository. Run from that repository and check the account has push access. Resolve ambiguity explicitly:

```sh
menloapp deploy --project path/App.xcodeproj --scheme App
```

Do not reset unrelated work to satisfy deploy. Commit your app changes yourself; deploy commits only the metadata and captures it creates. If preview tools are unavailable, use `--no-preview` and retain your existing media.

## The app page shows older copy

The ordinary page follows the default branch and may take up to 60 seconds to refresh. An exact-version URL intentionally keeps its selected commit. Confirm which link you opened and that the selected `menloapp/app.json` and media were committed and pushed.

## A version link is rejected

Use the complete link returned by deploy or the app page, with a full Git commit and numeric repository ID. Quote it in Terminal to preserve `&`. Branch names, duplicate version parameters, and substituted repository identities are invalid. Do not remove the parameters merely to make a different version install.

## Review sign-in expired

Browser sign-in lasts ten minutes and ends on sign-out or a server restart. Sign in again, check the selected source, then explicitly confirm the recommendation. Signing in alone publishes nothing. Only the original authenticated reviewer can withdraw their recommendation.

## Xcode or signing stops the build

Open full Xcode, finish its setup/license, and configure your own Apple Account and signing team. Follow the displayed provisioning or entitlement error. A website review cannot resolve Apple authority or unsupported source.

## Ready for phone does not advance

Confirm the intended iPhone is reachable, unlocked, trusted, and has Developer Mode enabled. A recorded intended-device association must match; older unassociated records require exactly one eligible phone. Another phone is never substituted.

Menlo retains the verified artifact and resumes delivery when the missing condition is satisfied. Do not rerun the coding harness for a device-only failure. Installed requires the exact bundle in that phone’s inventory.

## Fresh-start setup stopped

Complete the stated Apple prerequisite and run `menloapp setup` again. Setup completes only after Menlo is installed on the intended phone and private pairing succeeds. Trying a linked app does not require this fresh-start pairing.

## A private intent is waiting

Keep the paired Mac awake. An encrypted relay acknowledgement is not Mac admission. Inspect the app status and, when needed, the durable command journal. Do not delete the phone’s outbox to make a queued request disappear.

Another source job may hold the factory lease. Waiting work is durable; a verified artifact waiting for a phone releases the lease. Advanced native diagnostics include:

```sh
menloapp service status
menloapp service logs
menloapp service restart
```

## Evolution is stale or failed after source mutation

Reopen the app and submit against its current base. Do not force an old request onto newer source. For partially changed adopted repositories, inspect the recorded baseline and preserve owner work; there is no general automatic rollback.

## Historical Registry actions fail

Inspect activation, runtime, Builder authority, canonical receipt, Registry head, signed manifest, and source bytes. Claim also needs edition, nonce, deadline, and relayer evidence. Never edit an index row to manufacture success. These checks apply to the retained legacy path, not ordinary GitHub deploy.

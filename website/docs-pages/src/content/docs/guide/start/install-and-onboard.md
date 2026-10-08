---
title: Try an app
description: Review the source, then build and install on your iPhone.
---

## Try someone else's app

You need [a Mac with Xcode and your intended iPhone](/guide/start/requirements/#to-try-an-app).

1. Open the app link and choose **Get app**. Check the repository, source commit, and build recipe.
2. [Download the Mac app](https://menloapp.lol/download/macos), open the DMG, and drag **Menlo.app** into Applications. Return to the listing to continue.
3. Review the selected source and approve the build. Build scripts run on your Mac; opening a link does not authorize them.
4. Your Mac builds with Xcode and signs with your Apple identity. Follow any displayed Apple setup steps.
5. Keep your intended iPhone unlocked and reachable. Installation is confirmed against that phone’s app inventory.

The linked app installs first. Menlo on iPhone is optional afterward.

### From Terminal

```sh
npm i -g menloapp
menloapp try 'YOUR_APP_LINK'
```

Replace `YOUR_APP_LINK` with the full link. Keep the quotes: exact-version links contain `&`.

## Start from scratch

To send app-building requests from your iPhone:

```sh
npm i -g menloapp
menloapp
```

Connect and unlock your intended iPhone. Setup installs Menlo on it and completes the private connection to your Mac. Configure your Mac’s coding agent, then send an intent from the phone.

If setup stops, complete the displayed prerequisite and resume with `menloapp setup`. Existing libraries remain accessible when the phone is away.

## Keep an installed app up to date

The maker pushes to GitHub. Your awake Mac checks for updates; choose **Update on my Mac** to build the next commit.

An exact-version link stays pinned. Failed updates preserve the installed version, and local edits are not silently reset.

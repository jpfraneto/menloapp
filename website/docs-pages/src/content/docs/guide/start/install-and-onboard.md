---
title: Install and get started
description: Try the linked app first, or set up Menlo on your iPhone to create from intents.
---

## Try someone else's app

You need a Mac with full Xcode, your own Apple signing identity, and your intended iPhone. [Check the requirements](/guide/start/requirements/).

1. Open the app link and choose **Get app**. Check the maker, repository, build recipe, and selected source commit.
2. [Download Menlo for Mac](https://menloapp.lol/download/macos). Open the signed, notarized DMG, drag **Menlo.app** into Applications, and open it. If you arrived from a version link, the browser remembers a deliberate Mac-download handoff in that session; return to the listing to resume that version.
3. Continue into Menlo’s source review. Give explicit permission for the selected source to build. Opening the URL or reading a recommendation alone never authorizes execution.
4. Your Mac retrieves and verifies that commit, builds with Xcode, and signs with your Apple identity. Follow the specific Apple setup instructions if signing, Trust, or Developer Mode is incomplete.
5. Keep the intended iPhone reachable and unlocked for delivery. Menlo checks the exact app bundle in that phone’s inventory before reporting installation. A build waiting for the phone remains ready; another visible phone is never substituted.

The app you came for installs first. Menlo’s iPhone app and its private pairing are optional afterward.

Terminal is another entry point:

```sh
npm i -g menloapp
menloapp try https://menloapp.lol/hello-menlo
```

For a selected version, paste the full link and quote it so the shell preserves `&`:

```sh
menloapp try 'https://menloapp.lol/your-app?commit=<full-commit>&repository=<numeric-id>'
```

Use a real returned version link, not the placeholders. On an iPhone, use the system share sheet to send that version to your Mac. The iPhone does not run Xcode.

## Start from scratch

```sh
npm i -g menloapp
menloapp
```

Connect and unlock your intended iPhone. Setup checks Xcode and your Apple signing, builds and installs Menlo on the phone, and guides you through its private connection to the Mac. Setup completes only when installation and pairing evidence agree.

If an Apple prerequisite stops setup, follow the displayed action, then resume:

```sh
menloapp setup
```

Open Menlo on your iPhone to send intents. Your Mac uses the configured coding route, builds, signs, and delivers the resulting apps. Existing libraries remain accessible when the phone is away or pairing is incomplete.

npm installation itself installs the launcher. It does not implicitly install the iPhone app; help, deploy, and trying a linked app do not start fresh-start setup.

## Keep an installed app up to date

The maker pushes to GitHub as usual. The awake Mac checks for updates; the paired iPhone client syncs while active. Choose **Update on my Mac** to build the selected next commit.

Only an ancestor comparison can report “N commits behind.” Divergent or rewritten history and unavailable GitHub evidence are shown explicitly. Failed updates preserve the installed version; local edits are not silently reset. An exact-version link stays pinned until you separately choose newer source.

Next: [share your own app](/guide/start/share-an-app/) or [create from an idea](/guide/start/create-an-app/).

---
title: Share your app
description: Register a public GitHub iOS app and send a link that preserves the version you deployed.
---

## Prepare the repository

Your iOS project or workspace must be committed and pushed to a public GitHub repository. Use an account with push access. Commit your own app changes before deploying; Menlo preserves unrelated work and does not reset your checkout.

## Deploy

Open Terminal in the app’s project folder:

```sh
npm i -g menloapp
menloapp deploy
```

Deploy checks GitHub identity and repository access, detects the Xcode project and app scheme, and asks you to resolve ambiguity. An existing `gh auth login` session works; follow the sign-in instructions if needed. A private repository must be made public by you before registration. Check its entire history for private information before changing visibility.

Menlo creates missing `menloapp/app.json`, fills an empty description from the public repository description, and can copy an unambiguous committed app icon. Supplied copy and selected artwork are preserved. It can also generate a Simulator preview when the capture tools are available. Missing preview tools do not block a deploy with existing media.

Deploy commits and pushes the listing metadata and captures it generates. Registration publishes the listing and build recipe; source stays on GitHub. No `init`, iPhone pairing, wallet, gas, or Companion publication approval is needed.

## Share the returned version

The ordinary link looks like `https://menloapp.lol/your-app`. The version link adds `?commit=<full-commit>&repository=<numeric-id>`. Use the returned version link when the recipient should try exactly the source you shared.

Interactive Mac deploy copies the app link and prints an X sharing URL. App pages also offer X sharing and the system share sheet. From an iPhone, Get app lets you send the selected version to your Mac.

## Update the app

Push to the default branch as usual. The ordinary listing follows the new head; an older version link still selects its original commit. Discovery shows each app once. Existing users see update information in their own library and choose when to build it.

Changes to listing media live in Git too. [Customize the app page](/guide/product/app-listing/) before pushing them.

## Advanced controls

```sh
menloapp deploy --project path/App.xcodeproj --scheme App --app-slug your-app
menloapp deploy --no-preview
menloapp deploy --record
menloapp deploy --dry-run
```

`menloapp init` optionally prepares listing metadata ahead of deployment. `--json` avoids prompts; provide explicit project and scheme choices for automation. `--dry-run` checks committed source without publishing.

Next: [try the app link](/guide/start/install-and-onboard/#try-someone-elses-app).

---
title: Share an app
description: Deploy your public GitHub iOS project and share its link.
---

## Prepare the repository

Commit and push your Xcode project to a public GitHub repository. You need push access. Check the repository’s history for secrets before making it public.

## Deploy

Run in the project folder:

```sh
npm i -g menloapp
menloapp deploy
```

Follow the GitHub sign-in instructions if prompted. An existing `gh auth login` session works.

Deploy detects the project and app scheme, creates missing `menloapp/app.json`, and can generate a Simulator preview. It commits and pushes only the listing metadata and captures it generates. Commit your own app changes first.

No iPhone pairing, wallet, gas, or publication approval is required.

## Share the returned version

Share the returned exact-version link to preserve the repository and commit. The ordinary `https://menloapp.lol/your-app` link follows the default branch.

## Update the app

Push to GitHub as usual. The ordinary listing follows the new commit; recipients choose when to install it. Existing version links stay pinned.

[Edit your listing and media](/guide/product/app-listing/) in `menloapp/`, then commit and push.

## Advanced controls

```sh
menloapp deploy --project path/App.xcodeproj --scheme App
menloapp deploy --no-preview
menloapp deploy --record
menloapp deploy --dry-run
```

Use `--no-preview` to skip capture, `--record` to regenerate it, or `--dry-run` to check without publishing. See `menloapp deploy --help` for all options.

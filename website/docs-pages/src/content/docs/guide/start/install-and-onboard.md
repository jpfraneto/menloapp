---
title: Deploy from GitHub. Try it on iPhone.
description: Connect a public GitHub app, share its MENLO link, and prepare exact commits on the recipient's Mac.
---

## Share your app

Commit and push your iOS project to GitHub. Install the preview CLI:

```sh
npm i -g https://github.com/jpfraneto/tohseno/releases/download/cli-v1.3.1/tohseno-1.3.1.tgz
cd YourApp
menlo deploy
```

The package remains named `tohseno`; `tohseno deploy` works too. Once 1.3.1 is published on npm, the normal installer is `npm i -g tohseno`. npm installation does not start a service or install native software.

Deploy verifies your GitHub sign-in and offers browser login through GitHub CLI if needed. Without GitHub CLI, it gives installation instructions until MENLO's own device sign-in is configured. MENLO proves write access to the repository and returns **tohseno.com/your-app**. No `init`, Companion publication approval, wallet, gas, or source upload is required.

Deploy detects committed projects and ignores old or generated project folders. If several apps or schemes remain, choose one in the terminal. If your repository is private, MENLO explains that public source is required, opens GitHub settings with your consent, and continues after you change visibility. Making a repository public exposes its code and history; MENLO never changes visibility for you. If a push is needed, it explains the command and waits for you to finish. Existing repositories retain their app links.

For automation, use `--project path/App.xcodeproj --scheme App` and `--app-slug your-app`. `--json` never prompts; `--dry-run` checks local metadata without publishing.

## Try someone else's app

1. [Download MENLO for Mac](https://tohseno.com/download/macos). Open the signed, notarized DMG, drag the app into Applications, and open it. It retains the technical `Tohseno.app` filename.
2. Complete Xcode, Apple signing, Trust, Developer Mode, and Companion pairing with your intended iPhone. Apple credentials stay in Xcode.
3. Open the maker's link and choose **Open in MENLO**. Review the source and exact commit, then choose **Build for my iPhone**. Opening a link alone never starts a build.
4. Your Mac downloads the selected commit directly from GitHub, verifies it, builds with Xcode, and signs with your Apple identity. Build scripts can require explicit Mac review.
5. Connect and unlock the intended iPhone when the build is ready. Another visible phone is not substituted. Open the app and use its GitHub feedback link to tell the maker what you noticed.

Start with [Hello from MENLO](https://tohseno.com/hello-menlo). A local build is not evidence of physical installation.

## Keep up with the maker

The maker pushes to GitHub as usual. The same MENLO link follows the default branch without another deploy. Your awake Mac checks about every five minutes. Companion syncs while active and shows how many commits the installed app is behind.

Choose **Update on my Mac**. It builds the chosen commit, then waits for the intended phone. The installed-commit record changes only after verified device installation. Rewritten history is shown explicitly; failed updates retain the old installed version. This preview does not provide background APNs notifications.

## Where the network stands

GitHub supplies identity, source, profiles, and version control. MENLO operates a small centralized directory and off-chain registration ledger. Decentralized witnessing is a possible v1/v2 step when it is useful. Historical Registry/Claim releases retain their semantics; they are outside this normal GitHub path.

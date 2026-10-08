---
title: What is Menlo?
description: A public GitHub app, a link to share, and a local build for someone’s iPhone.
---

Menlo connects a public GitHub iOS repository to a stable app link. Run `menloapp deploy`, share the link, and let another person try the app using their own Mac, Xcode, and Apple signing identity.

## Share source people can inspect

The app page shows its maker, GitHub repository, description, and selected media. Get app selects a specific source commit for review and local installation. Opening a link alone never starts a build.

The ordinary link follows the default branch. Exact-version links preserve a full Git commit and numeric repository ID. Share that version when asking for feedback or recommending source you reviewed.

## Push updates as usual

After registration, pushes become available through the same app page without another deploy. Existing users explicitly choose an update. Downloaded source, a successful build, and an installed commit are separate facts; the installed record advances only after physical installation verification.

## Start with an idea, too

Starting from scratch, `menloapp` installs Menlo on your intended iPhone and completes its private connection to the Mac. Send an intent from the phone; the Mac uses your configured coding agent, builds, signs, and delivers the app. This setup is optional when you only want to try someone’s linked app.

## Public identity and local authority

GitHub supplies the maker’s identity and source history. Menlo runs a centralized directory and append-only registration ledger. GitHub deployment requires no wallet, gas, Claim, or Companion publication signature.

Apple provisioning, Trust, Developer Mode, and signing still apply. A source recommendation is human judgment about one version, not a safety guarantee or permission to run its build.

The product and npm command are **Menlo** and **`menloapp`**. Existing `tohseno` protocol, storage, and bundle identifiers remain for compatibility. Historical Registry releases retain their separate semantics.

Next: [share an app](/guide/start/share-an-app/) or [try one](/guide/start/install-and-onboard/).

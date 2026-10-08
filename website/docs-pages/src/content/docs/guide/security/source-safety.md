---
title: Before you build
description: Check the source and scripts that will run on your Mac.
---

A public repository or source recommendation is not a safety guarantee.

## Select exact source

Check the repository, commit, and Xcode project/scheme on the app page. An exact-version link preserves that selection. Your Mac verifies the repository and commit before building; local edits are preserved.

## Give local build consent

Read the source, dependencies, and build scripts before approving. Xcode Run Script phases and plugins can execute code on your Mac.

Opening a link or reading a review never authorizes execution. Source requiring Mac review waits for explicit approval of the exact commit; unsupported source does not build.

## Build and install

Xcode uses your Apple signing identity. The verified app goes only to your intended iPhone. A newer commit requires a separate update choice. Signing does not make malicious behavior safe.

Historical archive and witness checks are documented in [legacy distribution](/guide/architecture/person-to-person-network/).

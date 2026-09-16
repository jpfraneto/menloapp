---
title: Requirements
description: What makers need to share, and what testers need to build and install.
---

## To share an existing app

- Node 20+ and Git.
- A public GitHub repository with a committed, pushed Xcode iOS project or workspace.
- A GitHub account with write access to that repository.
- One app scheme; specify `--scheme` when needed. Xcode can discover a scheme on a Mac.

Deployment does not need an iPhone, Companion, wallet, or coding agent. The initial scope is public repositories. Submodules, symlinks, unsupported entitlements, or missing native project files can require project changes before a recipient build succeeds.

## To try an app

- macOS 14 or newer and full Xcode, opened once to finish installation and accept its license.
- An Apple Account configured in Xcode and a usable signing team.
- Your intended iPhone, a data-capable cable for initial setup, Trust, Developer Mode, and Companion pairing.

Apple credentials remain in Xcode. Apple's provisioning, app/device limits, and expiration still apply. MENLO signs locally for the recipient rather than sharing the maker's Apple credentials.

Keep the Mac awake for builds and update checks. Companion receives status while active; background APNs notifications are not implemented. Build scripts and dependencies can require review on the Mac. Source edits are preserved, and a modified downloaded checkout is not silently reset.

No coding agent or paid inference is needed to receive an app. Creating or evolving source through the optional factory is a separate workflow.

Next: [deploy or try an app](/guide/start/install-and-onboard/).

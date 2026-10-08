---
title: Requirements
description: What makers, recipients, and intent-driven creation need.
---

## To share an existing app

- Node 20 or newer and Git.
- A public GitHub repository containing a committed, pushed Xcode iOS project or workspace.
- A GitHub account with push access.
- An identifiable application scheme; use `--project` and `--scheme` for ambiguity.

Sharing does not require an iPhone or Menlo’s private phone pairing. Preview generation additionally uses local Xcode and capture tools; it is optional. See [listing media](/guide/product/app-listing/).

## To try an app

- macOS 14 or newer and full Xcode, opened once to finish setup and accept the license.
- Your Apple Account in Xcode and a usable signing team.
- Your intended iPhone with Trust and Developer Mode enabled; use a data-capable cable for initial setup.
- Explicit review and consent for the selected source and build scripts.

Apple credentials stay in Xcode. Apple’s provisioning, app/device limits, entitlement rules, and expiration still apply. Menlo signs locally using the recipient’s identity. Menlo’s iPhone app and private pairing are optional for trying a linked app.

Public source is executable input. Unsupported paths, dependencies, scripts, or entitlements can prevent installation even when a listing is visible. A source review does not override your local consent or those checks.

## To create or evolve through intents

Set up Menlo on the intended iPhone and complete its private connection. Configure an installed, authenticated coding agent on your Mac. Local or bring-your-own execution has no Menlo subscription gate. Managed inference has separate consent, balance, and availability rules.

Keep the Mac awake and reachable for builds. Active clients can sync update status; background APNs update notifications are not implemented. No coding agent or paid inference is required merely to receive an app.

Next: [install and get started](/guide/start/install-and-onboard/).

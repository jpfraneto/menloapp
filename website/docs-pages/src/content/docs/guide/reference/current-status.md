---
title: Current availability
description: Published CLI and website evidence, native artifact limits, and what still needs physical acceptance.
---

Checked October 8, 2026, against the repository’s [evidence record](https://github.com/jpfraneto/menloapp/blob/main/docs/STATE.md). [Live directory status](https://menloapp.lol/api/menlo/v1/status) and [Mac download metadata](https://menloapp.lol/api/distribution/v1/macos) expose current service configuration.

## Published CLI and website

**`menloapp` 1.6.0 is published on npm.** A fresh registry installation and deploy/review help checks passed. Use `npm i -g menloapp`; the former preview tarball and `tohseno` npm instructions are obsolete for new installations.

The live website serves public GitHub app listings, exact-version handoffs, sharing controls, and generated share cards. Live checks passed for version identity, historical version selection, malformed-version rejection, browser review sign-in availability, and rejection of anonymous review writes. The signed native runtime manifest remained unchanged during that website deployment.

Deploy returns a final version link after generated metadata is pushed. `try` preserves the full commit and numeric repository identity. Browser and CLI source recommendations bind one commit and build recipe and have no inheritance across versions.

## Mac and iPhone releases are separate

The live Mac download currently selects **1.3.0-rc.2, build 10013**, a release candidate requiring macOS 14 or newer. The download metadata identifies its exact pinned HTTPS artifact and SHA-256. npm or website publication does not update that artifact. September’s native Settings, sign-in, and icon improvements were locally verified; the evidence record explicitly says the public Mac bundle was not replaced by those local UI builds.

The owner’s intended iPhone has a locally built Menlo installation recorded through CoreDevice inventory. That is separate from a clean-Mac recipient completing the entire public download, source review, local signing, and intended-iPhone path.

## Remaining observations

No real source recommendation was published during the October 8 verification. Desktop/mobile interaction acceptance, X’s actual rendered card, and another person’s physical iPhone installation remain separate, unobserved acceptance facts. A passing test or served page cannot substitute for them.

## Current limits

Public repositories only. Recipients need compatible Xcode projects, dependencies, capabilities, and Apple provisioning. Local edits are preserved. The awake Mac checks updates; the iPhone client syncs while active. Background APNs update notifications are not implemented.

Menlo on iPhone and private pairing are required for fresh-start intent creation, and optional for trying a linked app. Managed inference remains a separately gated route; local or bring-your-own coding does not require a Menlo subscription.

## Historical Registry

Generation-0.8 Registry and Claims records retain their own exact-release verification and authority. They are outside ordinary GitHub distribution. GitHub deploy requires no Registry gas, Claim, or Companion publication approval. Historical pages describe those mechanisms rather than promising current write availability.

---
title: Current status
description: GitHub distribution is in preview; published artifacts, working paths, and remaining human acceptance.
---

Checked September 16, 2026. [Live directory status](https://tohseno.com/api/menlo/v1/status) and [Mac download metadata](https://tohseno.com/api/distribution/v1/macos) show current service configuration.

## GitHub distribution preview

MENLO registers public GitHub apps without gas or another source upload. The real [Hello from MENLO](https://tohseno.com/hello-menlo) link was created with the packed CLI. A subsequent GitHub push changed the live head and produced a one-commit comparison without another deploy.

The candidate client fetched that live source, verified it, built with Xcode, and signed locally. An isolated workspace with no paired phone stopped at **ready for iPhone**, with no installed-commit record. Physical installation and an on-device update still require human acceptance.

## Published clients

[1.3.0-rc.1](https://github.com/jpfraneto/tohseno/releases/tag/v1.3.0-rc.1) contains the universal Mac app (build 10012), signed native CLI archives, and the small 1.3.0 npm preview package. App and DMG were signed, notarized, stapled, and Gatekeeper-verified. Public download bytes matched their SHA-256 pins.

The npm registry login needs owner renewal; `npm i -g tohseno` still selects the earlier release until publication. Use the [preview command](/guide/start/install-and-onboard/). GitHub device authorization awaits the operator's Client ID; an existing `gh auth login` session works now. A dedicated server read token is also needed before expanding beyond GitHub's unauthenticated rate limits.

## Current limits

Public repositories first. Xcode projects, dependencies, signing capabilities, and intended-phone setup must be compatible. The awake Mac checks updates about every five minutes; Companion syncs while active. Background APNs delivery is not implemented yet.

## Historical Registry

The earlier generation-0.8 Registry and Claims services retain their signatures, receipts, and exact-release semantics. Their sponsored-upload and ETH-funding rules apply only to the explicit legacy path. GitHub deploy does not use them. Centralized discovery and an off-chain ledger are the current choice; decentralized witnessing can return in v1/v2 when useful.

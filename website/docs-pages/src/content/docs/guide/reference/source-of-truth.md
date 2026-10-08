---
title: Source of truth
description: Repository authority, current Menlo decisions, and evidence behind the public guides.
---

This site explains the product. The repository carries authority. Menlo is the product name and `menloapp` is the npm package/command. Existing Tohseno protocol, storage, and bundle identifiers retain compatibility.

## Normative protocol

- [Specification](https://github.com/jpfraneto/menloapp/blob/main/protocol/SPECIFICATION.md): exact identities, encodings, commitments, and transitions.
- [Conformance](https://github.com/jpfraneto/menloapp/blob/main/protocol/CONFORMANCE.md): required fail-closed checks.
- [Implementers](https://github.com/jpfraneto/menloapp/blob/main/protocol/IMPLEMENTERS.md), [schemas](https://github.com/jpfraneto/menloapp/tree/main/protocol/schemas), and [test vectors](https://github.com/jpfraneto/menloapp/tree/main/protocol/test-vectors): integration and exact cross-language law.

If explanatory prose conflicts with `protocol/`, the protocol wins. Product distribution decisions do not rewrite frozen bytes or deployed contract semantics.

## Current product decisions

- [ADR 0040](https://github.com/jpfraneto/menloapp/blob/main/docs/adr/0040-menlo-github-distribution.md): GitHub identity, public repositories, app registration, `menloapp deploy`/`try`, listing media, and explicit recipient-local build/sign/install.
- [ADR 0043](https://github.com/jpfraneto/menloapp/blob/main/docs/adr/0043-first-app-onboarding.md): fresh-start setup installs and pairs Menlo on iPhone; a linked app installs first, with Menlo on iPhone optional afterward.
- [ADR 0044](https://github.com/jpfraneto/menloapp/blob/main/docs/adr/0044-version-linked-distribution-and-source-reviews.md): exact-version sharing and GitHub-authenticated source recommendations bound to one commit and build recipe.

The [ADR index](https://github.com/jpfraneto/menloapp/tree/main/docs/adr) records earlier decisions and supersession. Retained requirements include one Mac factory, bounded implementation, exact bases, the integral `.tohseno/` boundary, intended-iPhone installation, Apple authority, and signed/notarized pinned native downloads.

Earlier Registry, Ship, Claim, and DeviceKey rules retain authority for historical releases and the explicit `--legacy-registry` path. They are superseded where ADR 0040 defines ordinary GitHub publication/acquisition. GitHub source recommendations are not DeviceKey-signed Release Attestations.

## Current evidence

[docs/STATE.md](https://github.com/jpfraneto/menloapp/blob/main/docs/STATE.md) distinguishes implemented, locally verified, published, deployed, and physically observed facts. [packages/cli/README.md](https://github.com/jpfraneto/menloapp/blob/main/packages/cli/README.md) explains current CLI use. [release/](https://github.com/jpfraneto/menloapp/tree/main/release) retains immutable artifact and activation evidence.

A source implementation or passing test does not establish public artifact availability or another person’s physical installation. Historical readiness records describe their recorded moment.

## Historical law

`MASTER_PROMPT.md` is superseded implementation input for frozen v0.7, not current protocol or deployment authority. `genome/LAWS.md` is retained agent-facing compatibility law matching engine behavior, not freely editable prose.

Follow the higher authority when this guide disagrees, then correct the guide.

---
title: Architecture overview
description: GitHub distribution and private intent execution share one Mac build and delivery boundary.
---

## GitHub distribution

| Component | Responsibility |
| --- | --- |
| `menloapp` npm launcher | Deploy, try, review, setup, and verified native-runtime entry |
| GitHub | Public identity, push-access evidence, repository identity, source commits and comparison |
| Menlo directory | Persistent app registration, build recipe, append-only registration/review history, listings and selected media |
| App page | Source and version review, sharing, source recommendations, and Mac handoff |
| Menlo.app and Local Workspace Service | Exact-source retrieval, local consent, Xcode build/sign, durable library and intended-iPhone delivery |
| Menlo on iPhone | Optional private remote for the same Mac; required by fresh-start intent setup |

```text
public repo → authenticated registration → app/version link
    → selected commit and recipe → recipient consent
    → verified checkout → Xcode and local signing → intended iPhone inventory
```

The directory stores registrations, not GitHub user tokens. It is centralized and uses GitHub’s independently checked numeric identity and source facts. A version link must preserve both commit and repository identity. Source reviews identify a GitHub account and one recipe/commit; they do not confer execution authority.

## Private intent execution

Menlo on iPhone persists a signed request and encrypted outbox. The content-blind relay transports it. The Mac authenticates and durably admits it, binds the exact base, and runs the configured bounded coding harness. Deterministic build, signing, device, and installation gates follow. Closing a UI or losing the cable does not redefine durable state.

The native app, CLI, and private phone client converge on one application service and factory. [The command lifecycle](/guide/architecture/command-lifecycle/) explains that private path; it is not a prerequisite for deploying a public GitHub app.

## Retained protocol and historical network

The pure protocol crate still defines exact records, digests, signatures, reducers, and conformance. Generation-0.8 contracts, DeviceKey-signed catalog releases, and separately activated Claims retain their historical semantics. The public Registry database remains an index rather than chain authority.

These mechanisms do not become GitHub registration, GitHub source reviews, or physical installation evidence. See the [historical person-to-person network](/guide/architecture/person-to-person-network/).

## Separate evidence

Retrieved source, build output, signature verification, and phone inventory are distinct observations. A recommendation is human judgment; a Simulator capture is presentation; a public page is not installation. The Mac remains the one Apple build boundary.

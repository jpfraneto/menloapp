---
title: Trust boundaries
description: GitHub identity, recipient consent, local Apple authority, and the separate historical protocol.
---

## GitHub and the directory

Deploy proves the authenticated GitHub account has push access. Numeric user, owner, and repository IDs anchor identity. The directory stores the registration and recipe in a persistent append-only ledger. It is a centralized service, not an on-chain witness.

The recipient independently checks repository identity and the selected full commit. A URL alone is never build consent. Changing the link’s commit or repository changes what must be verified.

## Human source recommendations

The directory verifies the reviewer’s GitHub account and binds the statement to a commit, project, scheme, and scopes. It does not prove the review occurred or certify safety. Maker reviews are labeled, and newer source or a changed recipe gets no inherited review. Review tokens are consumed for identity verification and not persisted in public records or the database.

[Source reviews](/guide/security/source-reviews/) do not authorize another person’s build.

## Recipient Mac and Apple

The Mac owns checkout, source classification, local build consent, Xcode execution, code-signature checks, intended-device selection, and installation observation. Apple credentials and signing authority stay with the recipient’s Xcode environment.

Another reachable phone is never substituted for the intended target. Build or signature success cannot replace physical bundle inventory evidence. Apple provisioning and Developer Mode remain authoritative.

## Phone and private relay

Menlo on iPhone signs private commands under its pairing grant and persists an encrypted outbox. The relay transports ciphertext and routing metadata; it cannot decrypt requests, admit commands, or execute source. Revocation prevents future admission.

The coding harness is an untrusted source mutator within a bounded request. It receives necessary private context through the configured route. Its successful exit alone earns no accepted app state.

## Historical Registry authority

On the retained Registry path, the non-exportable Builder DeviceKey authorizes exact structured public actions. The Mac does not possess it. The service submits constrained allowlisted calls; canonical chain evidence, signed manifests, and exact bytes must agree. Claims remain distinct from installation.

This authority is not imposed on ordinary GitHub deploy. GitHub reviews never impersonate DeviceKey-signed attestations or canonical Registry receipts.

## Browser intention compatibility

Browser Draft, Pending Relay Intention, and Local Pending Intention are transport states, never Shots. Their retained production handoff requires the matching release and verified installer pin.

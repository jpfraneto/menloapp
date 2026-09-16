---
title: What is MENLO?
description: Share a GitHub iOS app, let someone try it on their iPhone, and get practical feedback.
---

“Deploy it on MENLO. I'll try it right now.”

MENLO connects a public GitHub repository to a stable app link. The maker runs `menlo deploy` or `tohseno deploy` once. A tester opens the link, reviews a commit, and uses their Mac to build and sign for their own iPhone. Later GitHub pushes become available updates without another publication.

GitHub is the public identity and source system. App pages link directly to the maker's GitHub profile and repository. Feedback belongs with that existing work; MENLO does not add a separate reputation system.

## Centralized now, decentralized when useful

MENLO currently runs a centralized app directory with an append-only off-chain registration ledger. No wallet or gas payment is required. Source goes from GitHub to the tester's Mac. On-chain witnessing can return in v1/v2 when its benefit justifies its cost.

The earlier Registry, Shot, Ship, and Claim system remains available for historical releases. It does not gate GitHub distribution. Frozen protocol encodings and deployed contracts keep their existing semantics.

## Apple boundaries still apply

The tester needs a Mac, full Xcode, their own Apple signing identity, and an intended iPhone with Trust and Developer Mode. MENLO does not bypass provisioning limits or make a website download into an App Store installation.

Companion is a private remote for the paired Mac. It shows installed-commit update status and can request the next build. The Mac is the single build machine. A coding agent is optional for creating or changing source, and is not needed for distribution.

The npm package, technical identifiers, and existing domain retain the Tohseno name; MENLO is the product name and CLI alias.

Next: [deploy or try an app](/guide/start/install-and-onboard/).

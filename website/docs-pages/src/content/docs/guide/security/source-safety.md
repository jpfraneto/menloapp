---
title: Source and build safety
description: Review the selected GitHub commit before local execution and preserve its source identity.
---

Public source is executable input. GitHub identity and a human recommendation do not make it safe to run.

## Select exact source

An ordinary app link resolves the registered repository’s default-branch head. A version link pins a full commit and numeric repository ID. The listing, source link, recipe, Mac handoff, and Terminal command must agree on that selection. GitHub must confirm the identity and commit before installation is offered.

The Mac retrieves the selected source into its local workspace and verifies the commit. Existing edits are preserved; a modified checkout is not silently reset or merged with a different release. Unsupported symlinks, submodules, dependencies, or capabilities stop the supported import/build path with a reason.

## Give local build consent

Opening a URL or seeing a review never starts source execution. Review the source and build recipe before choosing to build. A recipe can execute Run Script phases, dependency code, plugins, or other tools on your Mac.

The local classifier distinguishes narrow ordinary iOS builds, source requiring explicit Mac review, and unsupported source. Review-classified input waits for your explicit approval of that exact commit; unsupported input does not build. A published recommendation cannot override classification or local consent.

## Build and install

Xcode runs on the recipient’s Mac using the recipient’s signing identity. Menlo verifies the candidate signature and delivers only to the intended iPhone. It reports Installed after observing the exact bundle in the phone’s inventory.

A newer commit is a separate update choice. Downloaded, built, ready, and installed commit records do not collapse into one status. Local signing preserves Apple authority; it does not sanitize malicious application behavior.

## Historical source archives

The retained Registry path instead verifies a signed catalog, archive length/SHA-256, source-tree commitment, canonical receipt, and live witness. Its sanitized snapshot and extraction reject traversal, unsafe links, special files, path collisions, oversized trees, known secret paths, and high-confidence secrets. `.gitignore` is not that security boundary.

Those archive/canonical-witness rules keep their historical scope. GitHub deploy does not create a catalog signature or a Registry receipt.

Next: [review a specific version](/guide/security/source-reviews/) or [Apple delivery](/guide/architecture/apple-delivery/).

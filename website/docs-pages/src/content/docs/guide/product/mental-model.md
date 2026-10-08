---
title: Product mental model
description: App links, selected source, local builds, and installed versions are separate facts.
---

## The everyday loop

```text
menloapp deploy → share a version link → review source
    → recipient Mac builds and signs → intended iPhone
```

| Concept | Meaning |
| --- | --- |
| App link | A stable directory entry following the repository’s default branch |
| Version link | One full Git commit and numeric repository ID |
| Source review | A GitHub user’s recommendation of one commit and recipe |
| Build consent | Your explicit permission to execute the selected source locally |
| Ready for phone | A verified candidate exists and awaits the intended iPhone |
| Installed | The exact bundle was observed on that physical phone after installation |
| Update | An explicit choice to build a newer commit for the same local app |

The source you downloaded, the artifact you built, and the commit installed on your phone can differ while work is in progress. Menlo preserves those distinctions. Reviews do not migrate to new commits and do not grant build consent.

## Your Mac and iPhone

The Mac is the one build machine. Menlo on iPhone is its private intent client: start an app or request a change, then let the Mac build and deliver it. Fresh-start setup installs and pairs that client. Trying a linked app installs the selected app first and leaves phone-client setup optional.

Creation and evolution stay private until you explicitly publish source. Adopting an existing Xcode project does not publish it or alter its repository. GitHub deployment separately registers public source and a recipe.

## History beneath the product

Commands and journals keep requests durable. Generated apps retain Shot, Expression, Evolution, and Version records. Historical Registry releases additionally use Builder DeviceKeys, public checkpoints, one Ship, later Updates, and Claims. None of those historical publication requirements is added to ordinary GitHub deploy.

The deleted Studio dashboard, pipeline renderer, Feedback/Marketing forms, and manual Version controls remain deleted.

Next: [Mac app](/guide/product/mac-app/) or [Menlo on iPhone](/guide/product/companion/).

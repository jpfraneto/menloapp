---
title: Use an existing project
description: Connect your Xcode project to the private app factory.
---

To share a public GitHub app, use [deploy](/guide/start/share-an-app/). Adoption is for making private changes through intents.

1. Choose **Adopt Existing App**.
2. Select its `.xcodeproj` or `.xcworkspace` and app scheme.
3. Wait for the unsigned Simulator build check.
4. Check the source path, scheme, bundle identifier, and existing edits before [requesting a change](/guide/start/evolve-an-app/).

Adoption records the project privately. It does not move files, change settings, initialize Git, commit, push, or publish. A Simulator build does not prove iPhone installation.

If you move the source folder, the saved path becomes unavailable. Automatic relinking is not implemented.

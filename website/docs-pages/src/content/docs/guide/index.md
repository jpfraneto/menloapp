---
title: Menlo documentation
description: GitHub identity, living app links, local Xcode builds, and practical feedback.
---

MENLO connects a public GitHub iOS app to a link someone can use to try it on their iPhone.

- [Deploy or try an app](/guide/start/install-and-onboard/)
- [Requirements for makers and testers](/guide/start/requirements/)
- [Current availability](/guide/reference/current-status/)
- [Create or evolve your own source](/guide/start/evolve-an-app/)

```text
GitHub repo → menlo deploy → app link
    → recipient reviews commit → their Mac builds and signs → intended iPhone
GitHub push → commits-behind notice → explicit Update → same app on their phone
```

GitHub is the identity and version-control system. MENLO's directory and registration ledger are centralized today; decentralized witnessing is a future choice when useful. The protocol and historical Registry documentation describe their retained boundaries, not prerequisites for GitHub distribution.

Repository authority: frozen bytes in `protocol/`, accepted decisions in `docs/adr/` (especially ADR 0040), and current evidence in `docs/STATE.md`.

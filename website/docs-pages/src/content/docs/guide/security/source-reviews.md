---
title: Review a version
description: Recommend the exact source you examined.
---

A source review is a public, GitHub-authenticated recommendation for one repository, commit, and Xcode build recipe. It is human judgment, not a safety guarantee. Maker reviews are labeled.

## Review in the browser

1. Open an exact-version link and choose **Review this version**.
2. Read the source and build recipe.
3. Sign in with GitHub using the displayed device code.
4. Select only scopes you examined, add any public notes, and confirm the review checkbox.

Signing in does not publish a review. The session expires after ten minutes. Only you can withdraw your review; its history remains recorded.

## Review from Terminal

```sh
menloapp review 'YOUR_EXACT_VERSION_LINK'
menloapp review 'YOUR_EXACT_VERSION_LINK' --withdraw
```

Replace the placeholder with the full version link. The command asks for confirmation and does not execute the app source. Use `--scope` and `--notes` to describe what you examined; `--confirm` is for unattended publication after an actual review.

New commits and changed build recipes receive no inherited reviews. A recommendation never authorizes a recipient build: each person still reviews and approves execution on their own Mac.

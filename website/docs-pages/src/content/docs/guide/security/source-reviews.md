---
title: Review a specific version
description: Publish or withdraw a GitHub source recommendation bound to one commit and build recipe.
---

An app page can show this explicit human recommendation:

> I reviewed this version's source and recommend it for installation.

The reviewer is identified through GitHub. The statement binds one numeric repository ID, full source commit, Xcode project and scheme, examined scopes, public notes, policy version, and timestamp. Maker recommendations are labeled.

## Review in the browser

1. Open the exact-version link and choose **Review this version**.
2. Examine the linked source and build recipe. Include dependency, networking, or other scopes only if you examined them.
3. Sign in with GitHub using the displayed device code and verification page.
4. Confirm the source-review checkbox and publish the recommendation. Your GitHub identity, scopes, and notes are public.

Signing in does not publish a review. Browser authority lasts ten minutes and ends on sign-out, expiry, or server restart. Only you can withdraw or replace your own recommendation. Withdrawal preserves its history in the append-only ledger.

## Review from Terminal

```sh
menloapp review 'https://menloapp.lol/your-app?commit=<full-commit>&repository=<numeric-id>'
```

Use a real exact-version link. The command shows the selected source and statement before confirmation and does not execute that source.

Add examined scopes and public notes:

```sh
menloapp review 'YOUR_EXACT_VERSION_LINK' --scope dependencies --scope networking --notes 'What I examined'
menloapp review 'YOUR_EXACT_VERSION_LINK' --withdraw
```

Unattended publication requires both an exact-version link and `--confirm`, after you have reviewed the source. An ordinary link follows the latest head, so use an exact-version link to preserve what you examined.

## What a recommendation means

It is self-reported human judgment. GitHub identity verification does not prove the review occurred, and Menlo does not issue a safety verdict. New commits and changed build recipes receive no inherited reviews.

A review never authorizes a recipient build. You still choose whether to run the selected source on your Mac, use your own Apple signing identity, and install on your intended iPhone. These GitHub recommendations are separate from historical DeviceKey-signed Registry Release Attestations.

Next: [source and build safety](/guide/security/source-safety/).

---
title: Menlo for Mac
description: The local source review, library, intent factory, and iPhone delivery surface.
---

Menlo.app is a native SwiftUI application over the existing Rust service and factory. It retrieves source, runs Xcode, signs using your Apple identity, and delivers to your intended iPhone.

## Choose the path you came for

An app link opens review of that selected version. Cancelling or restarting does not turn it into fresh-start setup. Build permission remains explicit.

Starting from scratch guides you through installing Menlo on your intended iPhone and completing the private connection. Existing libraries remain accessible without pairing or while the phone is away.

## Apps and discovery

Discover shows registered apps with GitHub maker and repository links. Your library holds received, adopted, and created apps. Installed-commit comparisons tell you when an update is available; choosing an update selects source for a new local build.

The selected [app workspace](/guide/product/app-workspace/) exposes build activity, the app, source, and the permanent iPhone handoff. Source and installation facts come from the service, not an animation.

## Settings

General, iPhone, Intelligence, and Advanced cover account information, phone readiness and pairing, coding routes, and diagnostics. Private pairing can be renamed or explicitly revoked. [Current availability](/guide/reference/current-status/) separates locally verified UI improvements from the public pinned Mac artifact.

## One service underneath

The native app authenticates to a loopback Local Workspace Service. The service owns durable admission, command journals, the factory lease, execution, and reconciliation. Closing the window does not erase those records or create a second factory.

The app verifies its bundled factory release before installation. Public Mac artifacts require Developer ID signing, hardened runtime, notarization, stapling, Gatekeeper acceptance, and exact published digest pins.

## Keyboard behavior

In a focused intention composer, Return sends and Shift–Return adds a line. Exactly-once guards protect submission. Technical diagnostics stay behind explicit controls; the deleted Studio execution dashboard is not restored.

The `menloapp` launcher is the Terminal entry point for deploy, try, review, setup, and compatible native tools.

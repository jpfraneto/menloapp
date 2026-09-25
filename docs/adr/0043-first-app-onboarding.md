# ADR 0043: Onboarding installs the app the person came for

Status: accepted

Date: 2026-09-24

The owner's instruction distinguishes two first-use paths.

Starting from scratch installs **Menlo** on the intended iPhone first. Plain
`menloapp` and `menloapp setup` use the existing Mac service's iPhone setup:
observe Xcode, Trust, Developer Mode and recipient Apple signing; build, sign,
install and launch the iPhone app; finish its existing private pairing. Setup
is complete only after the real device inventory and pairing evidence agree.
The introduction explains that the person sends intents from Menlo on iPhone
and the Mac builds, signs and delivers the resulting apps. Missing prerequisites
and incomplete pairing give the next action and remain incomplete.

Arriving for a particular app, such as `menloapp.lol/anky`, installs that app
first. `menloapp try <link>` and the exact-commit Mac link continue directly to
source review and recipient-local build/sign/install. Menlo's iPhone app is
optional afterward. A valid Mac app link survives cancellation or restart
without being replaced by the fresh-start Menlo setup. Existing libraries stay
available when Menlo is not paired or the intended phone is temporarily away.

The iPhone app's visible name and icon are Menlo. Its existing
`com.tohseno.companion` bundle identity, private data, DeviceKey and pairing
protocol remain unchanged so an upgrade preserves the person's connection.
There is still one Mac factory and one iPhone intent client.

This narrows ADR 0032's mandatory Companion-first onboarding to the fresh-start
path and extends ADR 0040's app-first GitHub acquisition. npm installation itself
still installs only the launcher; help, guide, deploy and app acquisition do not
implicitly install Menlo on iPhone. It changes no source-review consent,
intended-device selection, Apple authority, frozen protocol, deployed ABI or
distribution artifact gate. Source implementation and a local physical install
do not establish that updated public Mac/npm artifacts have been released.

On September 25 the owner explicitly authorized migrating the live `/anky`
alias to the already-public `jpfraneto/anky-seed` repository (repository ID
`1236924944`, owner ID `63654352`). This is a one-time authenticated registration
under ADR 0040. The historical signed Registry release, its exact `/s/<shot>`
route, and its Claim semantics remain intact. Other historical aliases retain
the public registrar's existing collision protection.

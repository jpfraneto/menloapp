# MENLO

Deploy your iOS app from GitHub. Share a link. Let someone build it on their own
Mac, try it on their iPhone, and give practical feedback.

```sh
npm i -g tohseno
cd YourApp
tohseno deploy
# menlo deploy is an alias
```

Commit and push a public GitHub repository first. Deploy signs in with GitHub,
checks repository write access, and registers the Xcode project and scheme.
It returns `https://tohseno.com/your-app`. Later pushes to the default branch
appear as updates without another deploy, source upload, wallet, or gas payment.
Use `--project path/App.xcodeproj`, `--scheme App`, or `--app-slug your-app`
when a repository needs an explicit choice. `--dry-run` inspects without publishing.

The link opens MENLO into a review of one exact commit. The recipient explicitly
chooses to build; their Mac checks GitHub identity, downloads and verifies that
commit, and uses their own Xcode signing identity. The artifact waits for their
intended iPhone. Companion shows the installed app's commits-behind count and
can request its next build. Source and feedback stay on GitHub.

Testers need macOS 14+, full Xcode, an Apple signing identity, and a paired
physical iPhone with Trust and Developer Mode enabled. Provisioning limits
still apply. Scripts and package dependencies can require explicit Mac review;
unsupported entitlements and source layouts stop with an explanation.

MENLO currently operates a centralized directory and append-only off-chain
registration ledger. GitHub is the public identity and version-control system.
Decentralized witnessing is a possible v1/v2 step when it earns its cost. Existing
on-chain Registry releases remain available through the historical Registry;
their signatures and receipts retain their meaning. `deploy --legacy-registry`
is the explicit compatibility path.

The package and technical bundle identifiers remain `tohseno` while the product
is MENLO. The Mac remains the single build machine; Companion is its paired
private remote. Updates are checked about every five minutes while the Mac
service runs and synchronize when Companion is active; this is not APNs delivery.

See the [GitHub distribution setup and acceptance guide](docs/runbooks/MENLO_GITHUB_DISTRIBUTION.md)
for credentials, release availability, and the exact physical test path. The
[current evidence](docs/STATE.md), [ADR 0040](docs/adr/0040-menlo-github-distribution.md),
and [authority hierarchy](AGENTS.md) distinguish implementation from deployment
and physical acceptance. Frozen protocol bytes remain governed by `protocol/`.


## Where your work lives

Adopted source stays exactly where the owner selected it. Its versioned private
pointer, stable Tohseno project ID, build/install observations, and evolution
history live under `~/.tohseno/service/living-projects-v1`. Generated apps are
still visible folders under `~/Desktop/Tohseno`. Private factory state,
execution records, and pairing records live under `~/.tohseno`; identities and
secrets use Keychain. The installed service listens only on Mac loopback.

Each app's `.tohseno/` directory is durable app-local metadata, not a cache and
not blanket-gitignored. Safe identity and integrity views may travel with the
repository. Exact intentions, inline-private lineage, references, feedback,
execution records, logs, and `.tohseno/private/` remain explicitly ignored;
publishing a Git repository is never allowed to silently publish them.

The iPhone Companion is the normal request surface for an adopted app. It sends
durably queued evolution requests and receives encrypted status/history. It
does not receive source code, raw harness output, credentials, or signing
material. The current transport uses the existing content-blind relay; it
carries signed end-to-end-encrypted envelopes that the relay cannot read.

When the exact paired devices are nearby, the Mac and Companion can also form a
separate authenticated local Workshop Session for low-latency capability
snapshots and ephemeral app events. It uses the existing pairing identities but
cannot perform or replace durable commands, Claim, Ship, Update, installation,
publication, payment, or revocation. The small Shot-facing package is
[`sdk/apple/TohsenoWorkshopKit`](sdk/apple/TohsenoWorkshopKit/); a Shot with no
Workshop declaration remains an ordinary focused app.

## Advanced recovery and automation from Terminal

The interactive adoption path is the default. Generated Shot creation and
evolution remain scriptable recovery/secondary operations:

```bash
tohseno create --prompt "An app that..."
tohseno create my-app --prompt-file intention.md --wait
tohseno evolve my-app --prompt "Make the first-run screen clearer" --wait
tohseno studio
tohseno service status
tohseno service logs
```

Existing app folders can also use the historical explicit recording layer:

```bash
tohseno recording init my-app
tohseno recording record my-app --note "Describe these exact files"
```

## Find your way around the repository

This repository contains the whole product:

- [`cli/`](cli/) provides the command-line surface.
- [`macos/Tohseno/`](macos/Tohseno/) contains the primary native Mac app and
  distribution tooling.
- [`engine/`](engine/) runs the build, verification, recording, and delivery
  lifecycle.
- [`studio/`](studio/) is the local browser interface.
- [`companion/`](companion/) and [`sdk/apple/`](sdk/apple/) contain the iPhone
  Companion, durable private SDK, and ephemeral Workshop SDK.
- [`network/`](network/) defines signed catalog, deterministic source, build
  safety, and public release evidence.
- [`website/`](website/) serves the public site, Registry/catalog/blob service,
  constrained transaction relayer, and encrypted relays.
- [`protocol/`](protocol/) defines the exact public recording format and
  conformance rules.
- [`docs/adr/`](docs/adr/) records the accepted product and architecture
  decisions.

If you want a current plain-language map, begin with
[`docs/STATE.md`](docs/STATE.md). For the system boundaries, read
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). If you change governed behavior,
read [`AGENTS.md`](AGENTS.md) first: `protocol/` is authoritative over prose.

## Develop locally

The most useful first checks are:

```bash
cargo test --locked --workspace --all-targets --all-features
swift test --package-path macos/Tohseno
swift test --package-path companion/apple/TohsenoCompanion
swift test --package-path sdk/apple/TohsenoWorkshopKit
(cd website && bun run typecheck && bun test)
./scripts/test-network-e2e.sh
```

The complete verification matrix is in [`AGENTS.md`](AGENTS.md). Publishing a
signed native artifact, enabling managed Stripe/Bankr service, or activating
the public download remains an explicit owner action backed by external
evidence.

More detail:

- [Current runtime architecture](docs/ARCHITECTURE.md)
- [Living connection implementation and test](docs/LIVING_CONNECTION.md)
- [App → Intent → App decision](docs/adr/0016-app-intent-app-on-your-iphone.md)
- [Bounded build lifecycle](docs/adr/0019-bounded-intent-to-usable-app.md)
- [Native Mac product and managed balance](docs/adr/0025-native-macos-app-factory-managed-balance.md)
- [Keyboard-first Registry and native installer](docs/adr/0026-keyboard-first-local-registry-and-native-installer.md)
- [Native distribution runbook](docs/runbooks/NATIVE_MACOS_DISTRIBUTION.md)
- [Managed-compute runbook](docs/runbooks/MANAGED_COMPUTE.md)
- [Privacy boundary](docs/PRIVACY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Protocol specification](protocol/SPECIFICATION.md)

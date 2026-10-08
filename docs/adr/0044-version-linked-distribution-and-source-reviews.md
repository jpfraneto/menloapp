# ADR 0044: Distribution preserves the version people recommend

Status: accepted

Date: 2026-10-08

Authority: the owner's October 8 instruction to implement the deploy, social
sharing, app-link and iPhone installation loop, with human validation of a
specific app version.

## Decision

The primary product loop is `menloapp deploy` → share an app link → recipient
review → recipient-local build/sign → installation on the intended iPhone.
The existing ADR 0040 GitHub registration and ADR 0043 app-first acquisition
remain the implementation path.

The ordinary app link follows the repository's default branch. A version link
adds a full Git commit and numeric repository ID. Its metadata, source link,
review projection, Mac handoff, and Terminal command select that commit. GitHub
must independently confirm the repository identity and selected commit before
installation is offered. A newer available version is a separate choice.

An iPhone visitor can use their system share sheet to send the version link to
their Mac. A deliberate Mac-download handoff is remembered in that browser
session so returning to the listing resumes the selected version. The Mac
remains the build machine; Apple signing, source-execution consent and physical
installation verification retain their existing authority.

Generated social cards may include the first selected screenshot alongside the
icon, title, description and app URL. Custom `ogImage` artwork remains supported.
Artwork is loaded from the displayed commit and does not establish installation
or review evidence. Deploy fills an empty description from the public GitHub
repository description, preserves supplied copy, and returns sharing controls
and the final version link after generated metadata has been pushed.
When exactly one committed `AppIcon.appiconset` exists, deploy may copy a normal
regular-file image declared by its Contents.json into the public app folder.
It skips ambiguity, appearance variants, symlinks and uncommitted files and
does not overwrite existing icons or artwork.

## GitHub source reviews

On this GitHub distribution path, a human may publish the explicit statement:

> I reviewed this version's source and recommend it for installation.

The directory verifies the reviewer through GitHub's authenticated user API.
The app page reuses GitHub Device Flow with a ten-minute, same-origin browser
session. Device codes and verified account IDs live only in bounded process
memory; the provider access token is consumed for identity verification and
discarded. The session cookie is HttpOnly, SameSite Strict and Secure on HTTPS.
Browser writes require the canonical Origin and JSON, and the source-review
checkbox still requires explicit confirmation after sign-in. Sign-out, expiry
or a server restart ends browser authority. No additional provider secret is
required.
The review binds the numeric reviewer and repository IDs, full source commit,
registered Xcode project and scheme, policy version, examined scopes, public
notes and server timestamp. Source is a required scope; additional scopes use
ADR 0037's bounded vocabulary. Recommendations are self-reported human judgment,
not proof that review occurred or a MENLO safety verdict. Maker reviews are
labeled. A new commit or changed build recipe receives no inherited review.

`menloapp review <link>` shows the exact source and canonical statement before
confirmation. Explicit unattended publication requires `--confirm` and a link
with both version and repository identity. The command does not execute source.
Only the authenticated reviewer may withdraw or replace their own statement.
Writes and withdrawals append to the existing directory's persistent ledger;
repeated identical submissions are idempotent and history is retained. User
tokens are neither stored in the database nor included in public records.

This decision supplies the GitHub-native review identity for ADR 0040 apps.
It supersedes ADR 0037's DeviceKey approval requirement only for these explicitly
named GitHub source reviews. They are not `ReleaseAttestation` records and never
impersonate DeviceKey signatures, Builder authority, historical Registry releases
or Claims. Those signed mechanisms keep their own semantics. Reviews never
authorize a recipient build or bypass the existing local review controls.

## Acceptance

Verify exact-version preservation across a push, repository substitution and
duplicate-parameter rejection, authenticated identity, scope and statement
validation, replay idempotence, withdrawal isolation, append-only storage,
escaping, absence of token persistence, and zero review inheritance across
commits or recipes. Exercise desktop/mobile sharing and resume behavior in the
browser. Public npm/site availability, X's actual rendered card, and another
person's physical iPhone installation remain separate observations.

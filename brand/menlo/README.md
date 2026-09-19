# Menlo design system

Implemented from the owner's September 18, 2026 design guide and supplied
Menlo-Pixel-Font-Kit. The owner's accompanying linked-loop references supersede
the guide's older plain-wordmark instruction. This describes presentation, not
protocol, publication, signing, or installation authority.

## Identity

The lowercase wordmark uses the kit's authored `m`, `e`, `n`, and `l` outlines.
Its final `o` touches a second green `o` above and to the right; a stepped neon
mint connection joins them. Both loops use the font's normal `o` geometry.
The upper loop is `#38A148`, and the connection is `#20F4C4`. These two colors
belong to the identity, not to status or action controls.

- `wordmark.svg`: canonical linked wordmark, transparent, light/dark aware.
- `mark.svg`: canonical compact symbol, transparent, light/dark aware.
- `app-icon.svg`: symbol on warm paper for the Mac application icon.
- `export-assets.py`: exports web SVGs, native light/dark PDFs, and the app PNG.

Run `python3 brand/menlo/export-assets.py` with librsvg available to refresh the
exports. `render-icon.swift` retains the existing single-icon export entry point.
Do not edit exported web SVGs or native PDFs independently.

## Typography

The finished kit names its family **MenloApp**, weight **700**, PostScript name
**MenloApp-Bold**. That newer name supersedes “Menlo Pixel” in the earlier brief.
It never resolves to the macOS monospace font called Menlo.

The unmodified WOFF2 is bundled in `website/apps/site/public/fonts/`. The
unmodified TTF is bundled with `TohsenoMacCore/Resources/` and registered only
for the running process. Neither surface requires a system-installed font.

Use the authored pixel face for identity and short brand statements at 24 px
or larger. Use system sans-serif for app names, headings, reading, and controls;
use system monospace for literal commands, paths, and identifiers. Keep the
font's own spacing and single authored weight. The linked `o` is logo artwork,
not a text ligature.

## Semantic colors

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#FAF9F6` | `#19211C` |
| Paper | `#F3EDDD` | `#252D24` |
| Surface | `#FFFEFA` | `#222B24` |
| Text | `#202720` | `#F2F0E6` |
| Muted text | `#62695E` | `#B3BBAA` |
| Accent | `#315F40` | `#A6CBA5` |
| On accent | `#FFFFFF` | `#19291D` |
| Accent soft | `#E8EDDE` | `#303E2E` |
| Separator | `#DCDED3` | `#455042` |
| Control border | `#858D7E` | `#86947D` |
| Warning | `#805A13` | `#E6C27A` |
| Error | `#A3302D` | `#FFB4A9` |

Web definitions are in `public/menlo/tokens.css`; native definitions are in
`TohsenoMacCore/Theme.swift`. Update both when a role changes. Initial appearance
follows the system. Old `brand/tokens/` files belong to retained Tohseno surfaces.

Use the 4 px spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Web content is at most
1120 px with 40 px desktop and 20 px mobile gutters. Control, surface, and sheet
radii are 8, 12, and 16 px. Web controls are at least 44 px high; Mac controls
use native desktop density. Outlined web controls sit on canvas or surface.

## Components and behavior

`menlo-shell.ts` owns the shared web brand, actions, command blocks, and sheets.
`menlo-listings.ts` owns app identity, previews, catalogue, and installation
instructions. Native views use the same roles through native SwiftUI controls.

- Discovery lists each app once, with maker identity and installation requirements.
- App pages keep one dominant actual preview and optional screenshot thumbnails.
- Get app preserves the exact existing deep link and source-review boundary.
  Device hints choose instructions only; they do not detect installation.
- Sheets use native HTML dialogs for focus containment, Escape, and focus return.
  Without JavaScript, the existing details/summary disclosures remain usable.
- Copy failure keeps the command or link selectable and announces a fallback.
- The Mac keeps Your apps beside the selected workspace. One Shot, creation,
  source, sharing, and account controls remain accessible.
- Build complete, preview availability, and installed are separate facts.
  Missing previews use a compact message. Source files, logs, and retained
  evolution history stay inside Technical details; errors remain visible.

This design change does not activate a release or change the published Mac
installer. Native resource bundles must be copied into packaged applications.

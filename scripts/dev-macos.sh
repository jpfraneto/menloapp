#!/bin/bash
# Incremental native UI preview over the currently installed, signed factory.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd -P)"
base="/Applications/Menlo.app"
manifest="$base/Contents/Resources/FactoryRelease/FILES.sha256"
current="${HOME}/.tohseno/current/FILES.sha256"
if ! cmp -s "$manifest" "$current"; then
  echo 'Installed Mac bundle and active factory differ. Resolve the intended runtime before previewing.' >&2
  exit 1
fi
team="$(tr -d '\n' < "$base/Contents/Resources/native-client-requirement.txt")"
[[ "$team" =~ ^[A-Z0-9]{10}$ ]] || exit 1
requirement="identifier \"com.tohseno.mac\" and anchor apple generic and certificate leaf[subject.OU] = \"$team\""
codesign --verify --deep --strict -R "=$requirement" "$base"
identity="${TOHSENO_DEVELOPER_ID_APPLICATION:-$(codesign -dvv "$base" 2>&1 | sed -n 's/^Authority=\(Developer ID Application:.*\)/\1/p')}"
[[ -n "$identity" ]] || { echo 'A matching Developer ID signing identity is required.' >&2; exit 1; }

swift build --package-path "$repo/macos/Tohseno" -c debug
bin="$(swift build --package-path "$repo/macos/Tohseno" -c debug --show-bin-path)/TohsenoMacApp"
mkdir -p "$repo/dist/local-macos"
preview="$(mktemp -d "$repo/dist/local-macos/preview.XXXXXX")"
app="$preview/Menlo.app"
ditto "$base" "$app"
cp "$bin" "$app/Contents/MacOS/TohsenoMacApp"
cp "$repo/macos/Tohseno/Packaging/Info.plist" "$app/Contents/Info.plist"
ditto "$(dirname "$bin")/TohsenoMac_TohsenoMacCore.bundle" "$app/Contents/Resources/TohsenoMac_TohsenoMacCore.bundle"
iconset="$preview/AppIcon.iconset"
mkdir "$iconset"
for specification in '16 16x16' '32 16x16@2x' '32 32x32' '64 32x32@2x' '128 128x128' '256 128x128@2x' '256 256x256' '512 256x256@2x' '512 512x512' '1024 512x512@2x'; do
  pixels="${specification%% *}"
  name="${specification#* }"
  sips -z "$pixels" "$pixels" "$repo/brand/menlo/app-icon-1024.png" \
    --out "$iconset/icon_${name}.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
stamp="$(git -C "$repo" rev-parse --short HEAD)-$(date +%H%M%S)"
if ! git -C "$repo" diff --quiet -- macos/Tohseno sdk/apple/TohsenoWorkshopKit brand/menlo scripts/dev-macos.sh; then
  stamp="$stamp-dirty"
fi
/usr/libexec/PlistBuddy -c "Add :TohsenoLocalBuild string $stamp" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Menlo Local $stamp" "$app/Contents/Info.plist"
codesign --force --sign "$identity" --options runtime --timestamp \
  --entitlements "$repo/macos/Tohseno/Packaging/Tohseno.entitlements" "$app"
codesign --verify --deep --strict -R "=$requirement" "$app"
echo "Local UI: $stamp; factory payload is unchanged from $base"
echo "Opening $app (keep or close the previous window after preserving drafts)."
open -n "$app"

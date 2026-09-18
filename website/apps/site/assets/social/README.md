# Social card assets

`NotoSans-Regular.ttf` and `NotoSans-Bold.ttf` come from
https://github.com/googlefonts/noto-fonts/tree/main/hinted/ttf/NotoSans
and are distributed under the adjacent SIL Open Font License (`OFL.txt`).
The server bundles the fonts so cards render consistently on macOS and Linux.

`anky-icon.png` is the unmodified
`Anky/Assets.xcassets/AppIcon.appiconset/Icon-1024.png` extracted from Anky's
already-public deterministic source archive, verified on September 18, 2026:

- Source SHA-256: `b39de082c43c69a3dc517578f319a3fe878c455961ea5ae015106cbd24884bec`
- Icon SHA-256: `b72c99ed04b5d5f66661546ec11b9d7a6e68ed3d80405e852a926bde797958a0`
- Release: `0xbfedc96908c631e6cb65bade0e7ee3d3002e0afb08d82a797d435f50211a0744`

Its use is restricted to that exact legacy release's share card. The signed
catalog remains unchanged. New GitHub app cards read icons and optional
`ogImage` directly from the app's selected public metadata at its full commit.

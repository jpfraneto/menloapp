"""Export the canonical SVG identity for the web, Mac, and iPhone apps.

Run with Python 3 and librsvg installed: python3 brand/menlo/export-assets.py
The supplied MenloApp font binaries are copied unchanged, separately.
"""
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

brand = Path(__file__).resolve().parent
root = brand.parent.parent
web = root / "website/apps/site/public/menlo"
native = root / "macos/Tohseno/Sources/TohsenoMacCore/Resources"

for source, destination in [("wordmark", "wordmark"), ("mark", "menlo-mark"), ("mark", "favicon")]:
    shutil.copyfile(brand / f"{source}.svg", web / f"{destination}.svg")

with tempfile.TemporaryDirectory(prefix="menlo-brand-") as temporary:
    for name in ["wordmark", "mark"]:
        source = re.sub(r"<style>.*?</style>", "", (brand / f"{name}.svg").read_text())
        for appearance, ink in [("light", "#202720"), ("dark", "#F2F0E6")]:
            svg = Path(temporary) / f"{name}-{appearance}.svg"
            svg.write_text(source.replace("#202720", ink))
            subprocess.run(["rsvg-convert", "--format", "pdf", "--output",
                            str(native / f"menlo-{name}-{appearance}.pdf"), str(svg)], check=True)

subprocess.run(["rsvg-convert", "--width", "1024", "--height", "1024", "--output",
                str(brand / "app-icon-1024.png"), str(brand / "app-icon.svg")], check=True)

# iOS supplies its own corner mask; give its asset catalog an opaque square.
iphone_icon = root / "companion/apple/TohsenoCompanion/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
subprocess.run(["rsvg-convert", "--width", "1024", "--height", "1024",
                "--background-color", "#F3EDDD", "--output",
                str(iphone_icon), str(brand / "app-icon.svg")], check=True)

#!/bin/sh
set -eu

# Check built binaries against their source version, independently of release pins.
repository_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
cargo metadata --locked --no-deps --format-version 1 \
  --manifest-path "$repository_root/Cargo.toml" |
  python3 -c '
import json, sys
packages = json.load(sys.stdin)["packages"]
print(next(package["version"] for package in packages if package["name"] == "tohseno"))
'

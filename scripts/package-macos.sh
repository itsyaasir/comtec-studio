#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun run tauri build
APP="$PWD/src-tauri/target/release/bundle/macos/Comtec Studio.app"
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
for binary in "$APP/Contents/MacOS/comtec-desktop"; do
  if otool -L "$binary" | tail -n +2 | awk '{print $1}' | rg -v '^(/usr/lib/|/System/Library/)'; then
    echo "Unexpected non-system dependency in $binary" >&2
    exit 1
  fi
done
printf 'Ready: %s\n' "$APP"

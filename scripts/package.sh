#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

if ! cmp -s "$ROOT/manifest.json" "$ROOT/manifest.firefox.json"; then
  echo "manifest.json must match manifest.firefox.json (manifest.json is used for Firefox development)." >&2
  exit 1
fi

VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/manifest.firefox.json")"
COMMON_FILES=(
  shared.js
  background.js
  content.js
  content.css
  popup.html
  popup.js
  popup.css
  options.html
  options.js
  options.css
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  icons/icon-96.png
  icons/icon-128.png
)

rm -rf "$DIST"
mkdir -p "$DIST/firefox" "$DIST/chrome"

build_browser() {
  local browser_name="$1"
  local source_manifest="$2"
  local target="$DIST/$browser_name"

  cp "$ROOT/$source_manifest" "$target/manifest.json"
  for file in "${COMMON_FILES[@]}"; do
    mkdir -p "$target/$(dirname "$file")"
    cp "$ROOT/$file" "$target/$file"
  done

  (
    cd "$target"
    zip -qr "$DIST/ytctl-${browser_name}-${VERSION}.zip" .
  )
}

build_browser firefox manifest.firefox.json
build_browser chrome manifest.chrome.json

echo "Built:"
echo "  $DIST/ytctl-firefox-${VERSION}.zip"
echo "  $DIST/ytctl-chrome-${VERSION}.zip"
echo "  $DIST/firefox (unpacked)"
echo "  $DIST/chrome  (unpacked)"

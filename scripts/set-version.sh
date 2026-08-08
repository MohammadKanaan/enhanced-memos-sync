#!/usr/bin/env bash
#
# set-version.sh — set the plugin version across all version sources.
#
# Updates: manifest.json, package.json, and versions.json.
#
# Usage:
#   scripts/set-version.sh <version> [minAppVersion]
#
#   version       required, semver (e.g. 0.2.0)
#   minAppVersion optional, defaults to the current value in manifest.json
#
# Examples:
#   scripts/set-version.sh 0.2.0
#   scripts/set-version.sh 0.2.0 1.6.6
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <version> [minAppVersion]" >&2
  exit 64
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- resolve runtime (prefer node, fall back to bun) ---
if command -v node &>/dev/null; then
  RUNTIME=node
elif command -v bun &>/dev/null; then
  RUNTIME=bun
else
  echo "error: needs node or bun on PATH" >&2
  exit 1
fi

# Read a JSON field via the available runtime.
read_field() {
  local file="$1" field="$2"
  "$RUNTIME" -e '
    const fs = require("fs");
    const o = JSON.parse(fs.readFileSync("'"$file"'", "utf8"));
    console.log(o["'"$field"'"]);
  '
}

# Write a JSON file with a 2-space indent + trailing newline.
write_json() {
  local file="$1" obj="$2"
  "$RUNTIME" -e '
    const fs = require("fs");
    fs.writeFileSync("'"$file"'", JSON.stringify('"$obj"', null, 2) + "\n");
  '
}

# --- manifest.json ---
MANIFEST="$ROOT/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "error: $MANIFEST not found" >&2; exit 1; }

CURRENT_MIN_APP="$(read_field "$MANIFEST" minAppVersion)"
MIN_APP="${2:-$CURRENT_MIN_APP}"

MANIFEST_JSON="$(
  "$RUNTIME" -e '
    const fs = require("fs");
    const o = JSON.parse(fs.readFileSync("'"$MANIFEST"'", "utf8"));
    o.version = "'"$VERSION"'";
    o.minAppVersion = "'"$MIN_APP"'";
    console.log(JSON.stringify(o));
  '
)"
write_json "$MANIFEST" "$MANIFEST_JSON"
echo "✓ manifest.json → $VERSION (minAppVersion $MIN_APP)"

# --- package.json ---
PACKAGE="$ROOT/package.json"
[[ -f "$PACKAGE" ]] || { echo "error: $PACKAGE not found" >&2; exit 1; }

PACKAGE_JSON="$(
  "$RUNTIME" -e '
    const fs = require("fs");
    const o = JSON.parse(fs.readFileSync("'"$PACKAGE"'", "utf8"));
    o.version = "'"$VERSION"'";
    console.log(JSON.stringify(o));
  '
)"
write_json "$PACKAGE" "$PACKAGE_JSON"
echo "✓ package.json → $VERSION"

# --- versions.json (idempotent, semver-sorted) ---
VERSIONS="$ROOT/versions.json"
[[ -f "$VERSIONS" ]] || { echo "error: $VERSIONS not found" >&2; exit 1; }

VERSIONS_JSON="$(
  "$RUNTIME" -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync("'"$VERSIONS"'", "utf8"));
    data["'"$VERSION"'"] = "'"$MIN_APP"'";
    const sorted = Object.keys(data)
      .map(v => v.split(".").map(Number))
      .sort((a, b) => {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          const d = (a[i] || 0) - (b[i] || 0);
          if (d) return d;
        }
        return 0;
      })
      .map(v => v.join("."));
    const out = {};
    for (const v of sorted) out[v] = data[v];
    console.log(JSON.stringify(out));
  '
)"
write_json "$VERSIONS" "$VERSIONS_JSON"
echo "✓ versions.json → added $VERSION"

echo
echo "Done. Run \`bun run check\` to verify, then commit and tag."

#!/usr/bin/env bash
#
# set-version.sh — set the plugin version across all version sources.
#
# Updates: manifest.json, package.json, and versions.json.
# Then runs `bun run check`, commits, and tags.
#
# Usage:
#   scripts/set-version.sh <version> [minAppVersion]
#
#   version       required, semver X.Y.Z (e.g. 0.2.0)
#   minAppVersion optional, defaults to the current value in manifest.json
#
# Push the tag to trigger the release workflow:
#   git push origin main && git push origin <version>
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

# --- validate semver ---
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: not a semver (expected X.Y.Z): $VERSION" >&2
  exit 64
fi

# --- require bun (this is a bun project) ---
if ! command -v bun &>/dev/null; then
  echo "error: bun not found on PATH" >&2
  exit 1
fi

# --- bail early if tag already exists (before touching any files) ---
if git -C "$ROOT" rev-parse -q --verify "refs/tags/$VERSION" &>/dev/null; then
  echo "error: tag $VERSION already exists — pick a new version" >&2
  exit 1
fi

# Read a JSON field.
read_field() {
  local file="$1" field="$2"
  bun -e '
    const o = JSON.parse(require("fs").readFileSync("'"$file"'", "utf8"));
    console.log(o["'"$field"'"]);
  '
}

# Write a JSON file with a 2-space indent + trailing newline.
write_json() {
  local file="$1" obj="$2"
  bun -e '
    require("fs").writeFileSync("'"$file"'", JSON.stringify('"$obj"', null, 2) + "\n");
  '
}

# --- manifest.json ---
MANIFEST="$ROOT/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "error: $MANIFEST not found" >&2; exit 1; }

CURRENT_MIN_APP="$(read_field "$MANIFEST" minAppVersion)"
MIN_APP="${2:-$CURRENT_MIN_APP}"

MANIFEST_JSON="$(
  bun -e '
    const o = JSON.parse(require("fs").readFileSync("'"$MANIFEST"'", "utf8"));
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
  bun -e '
    const o = JSON.parse(require("fs").readFileSync("'"$PACKAGE"'", "utf8"));
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
  bun -e '
    const data = JSON.parse(require("fs").readFileSync("'"$VERSIONS"'", "utf8"));
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
echo "Running \`bun run check\`…"
(
  cd "$ROOT"
  bun run check
)

# --- commit + tag ---
git -C "$ROOT" add manifest.json package.json versions.json
git -C "$ROOT" commit -m "release: $VERSION"
git -C "$ROOT" tag "$VERSION"
echo "✓ committed and tagged $VERSION"
echo "Push to release:  git push origin main && git push origin $VERSION"
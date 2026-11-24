#!/usr/bin/env bash
# Build the macOS arm64 desktop app for in-app updates and, with --publish,
# upload it as a GitHub release of this fork.
#
#   scripts/fork/release-desktop.sh 0.0.49            # build and verify only
#   scripts/fork/release-desktop.sh 0.0.49 --publish  # also create release v0.0.49
#
# Updates need every build signed with the same identity: Squirrel.Mac rejects
# an update whose signature does not satisfy the installed app's designated
# requirement, and adhoc signatures change on every build. The identity is the
# self-signed "Tandem Code Signing" certificate in the login keychain (backup
# in ~/.tandem-signing). The app reads releases from the repository baked in
# here, so it must be the fork, never upstream.
set -euo pipefail

VERSION="${1:-}"
PUBLISH="${2:-}"
REPO="${TANDEM_RELEASE_REPO:-InM1nd/t3code-jcode}"
IDENTITY="${TANDEM_MAC_SIGN_IDENTITY:-Tandem Code Signing}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE_DIR="$ROOT/release"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 <x.y.z> [--publish]" >&2
  exit 2
fi
if [[ "$REPO" == pingdotgg/* ]]; then
  echo "Refusing to target upstream ($REPO)." >&2
  exit 2
fi
if ! security find-identity -v -p codesigning | grep -q "\"$IDENTITY\""; then
  echo "No valid code signing identity \"$IDENTITY\" in the keychain." >&2
  exit 1
fi
if [[ "$PUBLISH" == "--publish" ]] && gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release v$VERSION already exists in $REPO." >&2
  exit 1
fi

cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$PATH"
node scripts/update-release-package-versions.ts "$VERSION"

TANDEM_MAC_SIGN_IDENTITY="$IDENTITY" \
  T3CODE_DESKTOP_UPDATE_REPOSITORY="$REPO" \
  T3CODE_DESKTOP_VERSION="$VERSION" \
  vp run dist:desktop:dmg:arm64

DMG="$(ls "$RELEASE_DIR"/*-"$VERSION"-arm64.dmg)"
ZIP="$(ls "$RELEASE_DIR"/*-"$VERSION"-arm64.zip)"
MANIFEST="$RELEASE_DIR/latest-mac.yml"
grep -q "version: $VERSION" "$MANIFEST"

# The zip is what the updater installs, so check the app inside it.
CHECK_DIR="$(mktemp -d)"
trap 'rm -rf "$CHECK_DIR"' EXIT
ditto -x -k "$ZIP" "$CHECK_DIR"
APP="$(ls -d "$CHECK_DIR"/*.app)"
codesign --verify --deep --strict "$APP"
codesign -dr - "$APP" 2>&1 | grep -q 'certificate root = H"' || {
  echo "The app is not signed with a certificate identity." >&2
  exit 1
}
unzip -p "$ZIP" "*/Contents/Resources/app-update.yml" | grep -q "repo: ${REPO#*/}"
echo "Built and verified Tandem $VERSION: $DMG"

if [[ "$PUBLISH" == "--publish" ]]; then
  gh release create "v$VERSION" \
    --repo "$REPO" \
    --title "Tandem $VERSION" \
    --notes "${TANDEM_RELEASE_NOTES:-Tandem $VERSION for macOS (Apple Silicon).}" \
    "$DMG" "$DMG.blockmap" "$ZIP" "$ZIP.blockmap" "$MANIFEST"
  echo "Published https://github.com/$REPO/releases/tag/v$VERSION"
fi

#!/usr/bin/env bash
# Builds ColoredLensStudio-<version>-mac.pkg from the build outputs. Run on macOS (CI: .github/workflows/release.yml).
# Inputs: dist/premiere (panel), dist/resolve, engine/build/LukulukuLook.ofx.bundle, optional engine/build/LukulukuLook.plugin
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
STAGE="$(mktemp -d)/root"; OUT="dist/release"; mkdir -p "$OUT"
mkdir -p "$STAGE/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins" "$STAGE/Library/OFX/Plugins" "$STAGE/Library/Application Support/ColoredLens"
cp -R dist/resolve/com.designpraise.coloredlens "$STAGE/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/"
cp -R engine/build/LukulukuLook.ofx.bundle "$STAGE/Library/OFX/Plugins/"
if [ -d engine/build/LukulukuLook.plugin ]; then
  mkdir -p "$STAGE/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore"
  cp -R engine/build/LukulukuLook.plugin "$STAGE/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/"
fi
cp "$OUT/ColoredLens-Premiere-$VERSION.ccx" "$STAGE/Library/Application Support/ColoredLens/"
# Signing is switched on by adding the Apple certificates as GitHub secrets (see docs/RELEASING.md).
SIGN_ARGS=(); if [ -n "${MAC_INSTALLER_IDENTITY:-}" ]; then SIGN_ARGS=(--sign "$MAC_INSTALLER_IDENTITY"); fi
if [ -n "${MAC_APP_IDENTITY:-}" ]; then
  find "$STAGE" \( -name "*.ofx.bundle" -o -name "*.plugin" \) -maxdepth 8 -print0 | xargs -0 -I{} codesign --force --deep --options runtime --timestamp --sign "$MAC_APP_IDENTITY" "{}"
fi
pkgbuild --root "$STAGE" --identifier com.designpraise.coloredlensstudio --version "$VERSION" --scripts installer/mac/scripts --install-location / "$OUT/component.pkg"
productbuild --identifier com.designpraise.coloredlensstudio --version "$VERSION" --package "$OUT/component.pkg" ${SIGN_ARGS[@]+"${SIGN_ARGS[@]}"} "$OUT/ColoredLensStudio-$VERSION-mac.pkg"
rm "$OUT/component.pkg"
if [ -n "${APPLE_ID:-}" ] && [ -n "${MAC_INSTALLER_IDENTITY:-}" ]; then
  xcrun notarytool submit "$OUT/ColoredLensStudio-$VERSION-mac.pkg" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" --wait
  xcrun stapler staple "$OUT/ColoredLensStudio-$VERSION-mac.pkg"
fi
echo "built $OUT/ColoredLensStudio-$VERSION-mac.pkg"

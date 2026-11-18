#!/usr/bin/env bash
# Signs the After Effects (CEP) panel as dist/release/ColoredLens-AfterEffects-<version>.zxp. Run on macOS: Adobe's
# notes (CEP-Resources, ZXPSignCMD/KnownIssue2024.md) say a ZXP should be signed on the platform it will run on, and
# must hold no symlinks. A self-signed certificate is made for each build; CEP checks that the files are the ones
# signed, not who signed them. On any failure this warns and leaves the panel unsigned (the installer still copies it).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
V="$(node -p "require('./package.json').version")"; SRC="dist/cep"; OUT="dist/release/ColoredLens-AfterEffects-$V.zxp"
[ -f "$SRC/CSXS/manifest.xml" ] || { echo "::warning::dist/cep is missing: build it with tools/build_hosts.mjs cep"; exit 0; }
find "$SRC" \( -name .DS_Store -o -name __MACOSX \) -exec rm -rf {} + 2>/dev/null
if [ -n "$(find "$SRC" -type l)" ]; then echo "::warning::dist/cep contains symlinks; a signed ZXP with symlinks fails to load"; exit 0; fi
T="$(mktemp -d)"; Z="$T/ZXPSignCmd"
curl -fsSL -o "$Z" "https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.3/macOS/ZXPSignCmd" || { echo "::warning::could not download ZXPSignCmd; the After Effects panel is unsigned"; exit 0; }
chmod +x "$Z"; xattr -dr com.apple.quarantine "$Z" 2>/dev/null
P="cl-$(date +%s)-$RANDOM"
"$Z" -selfSignedCert NG Lagos DesignPraise "Colored Lens" "$P" "$T/cert.p12" >/dev/null || { echo "::warning::ZXPSignCmd could not make a certificate; unsigned"; exit 0; }
mkdir -p dist/release; rm -f "$OUT"
"$Z" -sign "$SRC" "$OUT" "$T/cert.p12" "$P" -tsa http://timestamp.digicert.com >/dev/null \
  || "$Z" -sign "$SRC" "$OUT" "$T/cert.p12" "$P" >/dev/null \
  || { echo "::warning::ZXPSignCmd could not sign the panel; unsigned"; rm -f "$OUT"; exit 0; }
"$Z" -verify "$OUT" && echo "signed $OUT"
rm -rf "$T"

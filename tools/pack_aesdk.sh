#!/usr/bin/env bash
# Re-packs a newer After Effects SDK for CI: keeps only Examples/{Headers,Util,Resources}, encrypts it with AES-256,
# and writes engine/sdk/aesdk.tar.gz.gpg. Then update the AE_SDK_PASSPHRASE secret if you changed the passphrase.
# Usage: tools/pack_aesdk.sh AfterEffectsSDK_xx_mac.zip   (asks for the passphrase)
set -euo pipefail
ZIP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"
cd "$T" && unzip -q "$ZIP" && D="$(dirname "$(find . -path '*Examples/Headers/AE_Effect.h' | head -1)")/.."
tar -czf sdk.tar.gz -C "$D/../.." "$(basename "$(cd "$D/.." && pwd)")/Examples/Headers" "$(basename "$(cd "$D/.." && pwd)")/Examples/Util" "$(basename "$(cd "$D/.." && pwd)")/Examples/Resources"
gpg --symmetric --cipher-algo AES256 -o "$ROOT/engine/sdk/aesdk.tar.gz.gpg" sdk.tar.gz
rm -rf "$T"; echo "wrote engine/sdk/aesdk.tar.gz.gpg"

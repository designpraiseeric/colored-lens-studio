#!/usr/bin/env bash
# Builds the Colored Lens Helper as a universal binary. For each architecture it tries the fullest Apple
# Intelligence variant the installed SDK can compile (image input, then text only, then bridge only).
set -uo pipefail
cd "$(dirname "$0")"; OUT="${1:-build}"; VERSION="${2:-0.0.0}"; mkdir -p "$OUT"
echo "let helperVersion = \"$VERSION\"" > "$OUT/version.swift"
echo "Xcode: $(xcodebuild -version 2>/dev/null | tr '\n' ' ')  SDK: $(xcrun --show-sdk-version 2>/dev/null)"
for ARCH in arm64 x86_64; do
  BUILT=""
  for V in image text none; do
    if xcrun swiftc -O -parse-as-library -target "$ARCH-apple-macos13.0" main_entry.swift main.swift "ai_$V.swift" "$OUT/version.swift" -o "$OUT/helper-$ARCH" 2> "$OUT/err-$ARCH-$V.txt"; then BUILT="$V"; break
    else echo "-- $ARCH: variant '$V' did not compile:"; head -12 "$OUT/err-$ARCH-$V.txt"; fi
  done
  [ -n "$BUILT" ] || { echo "The helper did not build for $ARCH"; exit 1; }
  echo "HELPER $ARCH variant: $BUILT"
done
lipo -create "$OUT/helper-arm64" "$OUT/helper-x86_64" -output "$OUT/ColoredLensHelper" && codesign --force --sign - "$OUT/ColoredLensHelper" && echo "built $OUT/ColoredLensHelper"

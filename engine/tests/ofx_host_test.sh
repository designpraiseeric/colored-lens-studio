#!/usr/bin/env bash
# Loads the built OFX plugin in the OpenFX reference host, renders a real frame with a look, and checks the result.
# Usage: engine/tests/ofx_host_test.sh <input 720x576 P6 ppm>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ENGINE="$HERE/.."
cmake -S "$HERE/ofxhost" -B "$HERE/ofxhost/build" >/dev/null && cmake --build "$HERE/ofxhost/build" -j4 >/dev/null
WORK="$(mktemp -d)"; cd "$WORK"
LK_INPUT="$1" LK_PARAMS="color=2,medium=2,diffusion=1,skinGuard=1,aspect=10" OFX_PLUGIN_PATH="$ENGINE/build" "$HERE/ofxhost/build/ofxtesthost" > host.log 2>&1 || { cat host.log; exit 1; }
grep -q "com.designpraise.lukuluku.look" host.log || { echo "FAIL: plugin not found by the host"; exit 1; }
test -s Output.0.ppm || { echo "FAIL: no output image"; exit 1; }
python3 - "$1" Output.0.ppm <<'PY'
import sys
def load(p):
    t = open(p, 'rb').read()
    if t[:2] == b'P6':
        parts = t.split(maxsplit=4); return list(parts[4][:720*576*3])
    vals = [int(x) for line in t.decode().splitlines()[4:] for x in line.split()[:3]]; return vals
a, b = load(sys.argv[1]), load(sys.argv[2])
assert len(b) >= 720*576*3, 'short output'
diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)
top = sum(b[:720*3*40]) / (720*3*40)   # 2.39 matte: the top band must be near black (0.035 -> ~9)
print(f'mean abs change {diff:.1f}, matte band level {top:.1f}')
assert diff > 3, 'the look did nothing'
assert top < 15, 'matte missing or image flipped'
print('PASS: OFX plugin loads, takes parameters and renders in the OpenFX reference host')
PY

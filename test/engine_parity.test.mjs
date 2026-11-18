// The C++ Look Engine and the JS port (core/look.js) must agree on the per-pixel transform,
// so a .cube baked by a panel looks the same as the effect. Skips if the engine is not built.
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseCode, makePixelFn, lutFromBin, lookToEngineParams, fullGrade } from '../core/look.js';
const bin = fileURLToPath(new URL('../engine/build/lkpixel', import.meta.url));
const looks = JSON.parse(fs.readFileSync(new URL('../site/content/looks.json', import.meta.url))), cat = looks.catalog;
const luts = {}; for (const id of Object.keys(looks.luts)) luts[id] = lutFromBin(fs.readFileSync(new URL(`../site/content/luts/${id}.bin`, import.meta.url)));
const CASES = [
  ['neutral', 'C0', {}, {}],
  ['print film + 35mm', 'K1·D1·C1·M2', {}, {}],
  ['bleach + grade', 'K0·D0·C2·M6', { exp: 0.5, sat: 1.3, temp: 0.3, tint: -0.2, hi: -0.4, sh: 0.3, wh: 0.2, bk: -0.3, hue: 12, vib: 0.4, con: 1.2, bri: 0.05, gam: 1.1, lutMix: 0.7 }, {}],
  ['wheels', 'C5', { pw: { lift: [0.2, -0.1, 0.1, 1.1], gamma: [-0.1, 0.2, -0.1, 0.9], gain: [0.1, 0.1, 0.2, 1.2], offset: [0.05, -0.05, 0, 1] }, lw: { sh: [0.1, 0.2, 0.1, 1], mid: [0, -0.1, 0, 1.1], hi: [-0.1, 0, 0.1, 0.9] } }, {}],
  ['wheels after look', 'C9·M7', { wpost: true, pw: { lift: [0.1, 0.1, 0, 1], gamma: [0, 0, 0.2, 1], gain: [0, -0.2, 0, 1], offset: [0, 0, 0, 1.2] } }, {}],
  ['skin guard + match', 'C6·M9', { sat: 0.6 }, { skinGuard: 1, skinHue: 0.9, skinDensity: 0.8, skinLight: 0.6, matchAmt: 0.8, mLg: 1.2, mLo: -0.05, mA: 0.01, mB: 0.02, mCg: 1.3 }],
  ['colour zones + ambience', 'C1·M2', { sat: 1.1 }, { z1Amt: 1, z1Hue: 140, z1Wid: 30, z1Cmin: 0.04, z1Cmax: 0.4, z1ToHue: 30, z1ToC: 0.14, z1dL: 0.05, z2Amt: 0.8, z2Cmin: 0, z2Cmax: 0.03, z2Lmin: 0.6, z2Lmax: 1, z2ToHue: 250, z2ToC: 0.08, z2dL: -0.04, z3Amt: 0.6, z3Hue: 20, z3Wid: 18, z3ToHue: 330, z3ToC: 0.2, z6Amt: 0.9, z6Hue: 210, z6Wid: 40, z6Cmin: 0.02, z6ToHue: 60, z6ToC: 0.12, z6dL: -0.06, z8Amt: 0.5, z8Cmin: 0, z8Cmax: 0.03, z8Lmin: 0, z8Lmax: 0.3, z8ToHue: 280, z8ToC: 0.05, ambHue: 85, ambAmt: 0.6, skinGuard: 0.5 }],
];
// Zones with a place in the frame, checked inside the box, on its soft edge, far outside, and with no position (a
// baked LUT, where a boxed zone must do nothing).
const BOXED = { z1Amt: 1, z1Hue: 120, z1Wid: 40, z1Cmin: 0.03, z1Cmax: 0.4, z1ToHue: 30, z1ToC: 0.12, z1dL: 0.05, z1X: 0.3, z1Y: 0.6, z1BW: 0.15, z1BH: 0.25,
  z5Amt: 0.8, z5Cmin: 0, z5Cmax: 0.03, z5ToHue: 250, z5ToC: 0.06, z5X: 0.8, z5Y: 0.2, z5BW: 0.1, z5BH: 0.1, z2Amt: 0.5, z2Hue: 30, z2Wid: 30, z2ToHue: 60, z2ToC: 0.1, skinGuard: 0.5 };
for (const [where, u, v] of [['inside its box', 0.32, 0.55], ['on the soft edge', 0.3 + 0.15 * 1.15, 0.6], ['far outside', 0.95, 0.95], ['without a position', undefined, undefined]])
  CASES.push([`zones with a place, ${where}`, 'C1·M2', {}, BOXED, u, v]);
// a zone that keeps OUT of its place (the forest going slate everywhere except the vest)
const HOLE = { ...BOXED, z2X: 0.3, z2Y: 0.6, z2BW: 0.15, z2BH: 0.25, z2Out: 1 };
for (const [where, u, v] of [['inside the hole', 0.32, 0.55], ['on the hole\'s edge', 0.3 + 0.15 * 0.85, 0.6], ['away from the hole', 0.95, 0.95], ['without a position', undefined, undefined]])
  CASES.push([`a zone keeping out of its place, ${where}`, 'C1·M2', {}, HOLE, u, v]);
for (const [name, code, G, extra, u, v] of CASES) test(`engine parity: ${name}`, { skip: !fs.existsSync(bin) && 'engine not built' }, () => {
  const look = parseCode(code, cat); look.G = fullGrade(G);
  const params = lookToEngineParams(look, cat, { params: extra });
  const args = ['9', ...Object.entries(params).map(([k, x]) => `${k}=${+x}`), ...(u != null ? [`@u=${u}`, `@v=${v}`] : [])];
  const cpp = execFileSync(bin, args, { encoding: 'utf8' }).trim().split('\n').map(l => l.split(' ').map(Number));
  const fn = makePixelFn(look, cat, luts, { keepExposure: true, extra: { ...extra, skinHue: extra.skinHue ?? 0.8, skinDensity: extra.skinDensity ?? 0.7, skinLight: extra.skinLight ?? 0.5 } });
  let i = 0, worst = 0;
  for (let b = 0; b < 9; b++) for (let g = 0; g < 9; g++) for (let r = 0; r < 9; r++) { const js = fn([r / 8, g / 8, b / 8], u, v); for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(js[c] - cpp[i][c])); i++; }
  assert.ok(worst < 2e-3, `max difference ${worst.toFixed(5)} (must be < 0.002, about half an 8-bit step)`);
});

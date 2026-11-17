// Lukuluku looks: codes, share links, effect parameters and a CPU copy of the per-pixel pipeline.
// The per-pixel part below is a line-for-line port of Lukuluku's FS_COMP shader (the same subset its
// .cube export uses), so a LUT baked here matches a LUT exported from the Lukuluku web app.
// Two new stages are added at the end: Match to Reference (before the look) and Skin Guard (after).
import { srgb2lin, lin2log, log2lin, linToOklab, oklabToLin, lin2srgb, toLCh, srgbToOklab } from './color.js';

export const AXES = ['L', 'O', 'H', 'K', 'D', 'C', 'M', 'A'];
export const FOOTAGE_AXES = ['K', 'D', 'C', 'M', 'A']; // L, O, H are baked into Lukuluku's camera plates
const FLAT = [[0, 0], [1, 1]], HFLAT = [[0, 0.5], [1, 0.5]];
export const GRADE0 = {
  exp: 0, con: 1, bri: 0, gam: 1, hi: 0, sh: 0, wh: 0, bk: 0, lutMix: 1, grainK: 1, halK: 1, diffK: 1, vigK: 1, temp: 0, tint: 0, sat: 1, vib: 0, hue: 0, sharp: 0,
  curve: { m: FLAT, r: FLAT, g: FLAT, b: FLAT, hvh: HFLAT, hvs: HFLAT }, pivot: 0.45, wpost: false, lowR: 0.33, highR: 0.62,
  pw: { lift: [0, 0, 0, 1], gamma: [0, 0, 0, 1], gain: [0, 0, 0, 1], offset: [0, 0, 0, 1] }, lw: { sh: [0, 0, 0, 1], mid: [0, 0, 0, 1], hi: [0, 0, 0, 1] },
};
const clone = o => JSON.parse(JSON.stringify(o));
export function fullGrade(G) {
  const d = clone(GRADE0), g = Object.assign(d, clone(G || {}));
  g.curve = Object.assign(clone(GRADE0.curve), (G && G.curve) || {}); g.pw = Object.assign(clone(GRADE0.pw), (G && G.pw) || {}); g.lw = Object.assign(clone(GRADE0.lw), (G && G.lw) || {});
  return g;
}
export const hasCurves = G => { const g = fullGrade(G); return ['m', 'r', 'g', 'b'].some(k => JSON.stringify(g.curve[k]) !== JSON.stringify(FLAT)) || ['hvh', 'hvs'].some(k => JSON.stringify(g.curve[k]) !== JSON.stringify(HFLAT)); };

/** "L10·O6·H1·K1·D1·C1·M2·2.39" (also accepts _ - . or spaces as separators, and partial codes) */
export function parseCode(str, cat) {
  const look = { L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C0', M: 'M0', A: '2.39' };
  const toks = String(str).trim().split(/[·_\s,;|/]+|(?<=\d)-(?=[A-Z])/).filter(Boolean);
  let found = 0;
  for (const t of toks) {
    const m = t.match(/^([LOHKDCM])(\d{1,2})$/i);
    if (m) { look[m[1].toUpperCase()] = m[1].toUpperCase() + m[2]; found++; continue; }
    if (/^\d\.\d\d$/.test(t)) { look.A = t; found++; }
  }
  if (!found) throw new Error('That does not look like a Lukuluku look code (e.g. L10·O6·H1·K1·D1·C1·M2·2.39)');
  if (cat) for (const [k, table] of Object.entries({ K: cat.lens, D: cat.diffusion, C: cat.color, M: cat.medium })) if (!table[look[k]]) throw new Error(`Unknown ${k} value ${look[k]}`);
  return { ...look, G: clone(GRADE0) };
}
export const formatCode = l => AXES.map(k => l[k]).join('·');

/** Decode a Lukuluku share link (…/lukuluku/#look=<base64url JSON>) or a bare code. */
export function parseLookInput(input, cat) {
  const s = String(input).trim(), i = s.indexOf('#look=');
  if (i < 0 && !s.startsWith('look=')) return parseCode(s, cat);
  const b64 = decodeURIComponent(s.slice(i >= 0 ? i + 6 : 5)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  const o = JSON.parse(json), look = { L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C0', M: 'M0', A: '2.39' };
  if (o.a) for (const k of AXES) if (o.a[k] != null) look[k] = String(o.a[k]);
  look.G = fullGrade(o.G || {});
  return look;
}

// ------------------------------------------------------------------ wheels (Lukuluku wheelUniforms)
const puckRGB = (x, y) => [1.14 * y, -0.395 * x - 0.581 * y, 2.032 * x];
export function wheelUniforms(G) {
  const P = G.pw, L = G.lw, add = (a, b, k) => a.map((v, i) => v + b[i] * k), c = w => puckRGB(w[0], w[1]);
  return {
    lift: add([P.lift[2] * 0.3, P.lift[2] * 0.3, P.lift[2] * 0.3], c(P.lift), 0.18),
    gamE: c(P.gamma).map(v => Math.pow(2, -(v * 0.5 + P.gamma[2] * 0.8))),
    gainM: c(P.gain).map(v => Math.pow(2, P.gain[2]) * (1 + v * 0.35)),
    off: add([P.offset[2] * 0.15, P.offset[2] * 0.15, P.offset[2] * 0.15], c(P.offset), 0.08),
    satR: [P.lift[3], P.gamma[3], P.gain[3]],
    LS: add([L.sh[2] * 0.15, L.sh[2] * 0.15, L.sh[2] * 0.15], c(L.sh), 0.1), LM: add([L.mid[2] * 0.15, L.mid[2] * 0.15, L.mid[2] * 0.15], c(L.mid), 0.1),
    LH: add([L.hi[2] * 0.15, L.hi[2] * 0.15, L.hi[2] * 0.15], c(L.hi), 0.1), LSat: [L.sh[3], L.mid[3], L.hi[3]],
    lowR: G.lowR, highR: G.highR, pivot: G.pivot, post: !!G.wpost,
  };
}

// ------------------------------------------------------------------ curves (Lukuluku evalCurve, monotone cubic)
export function evalCurve(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0]), n = p.length, out = new Float32Array(256), xs = p.map(q => q[0]), ys = p.map(q => q[1]), d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(xs[i + 1] - xs[i], 1e-6));
  m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b; if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  for (let k = 0; k < 256; k++) { const x = k / 255; let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = Math.max(xs[i + 1] - xs[i], 1e-6), t = Math.min(Math.max((x - xs[i]) / h, 0), 1), t2 = t * t, t3 = t2 * t;
    let y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    if (x < xs[0]) y = ys[0]; if (x > xs[n - 1]) y = ys[n - 1]; out[k] = Math.min(Math.max(y, 0), 1); }
  return out;
}
function curveTables(G) {
  const M = evalCurve(G.curve.m), R = evalCurve(G.curve.r), Gc = evalCurve(G.curve.g), B = evalCurve(G.curve.b);
  const look = (arr, v) => { const f = v * 255, i = Math.min(254, Math.floor(f)), t = f - i; return arr[i] * (1 - t) + arr[i + 1] * t; };
  const rgb = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let k = 0; k < 256; k++) { const m = M[k]; rgb[0][k] = look(R, m); rgb[1][k] = look(Gc, m); rgb[2][k] = look(B, m); }
  return { rgb, hue: evalCurve(G.curve.hvh), sat: evalCurve(G.curve.hvs), hueOn: hasCurves({ curve: { ...G.curve, m: FLAT, r: FLAT, g: FLAT, b: FLAT } }) };
}
// GPU-style 1D texture fetch (256 texels, linear filter, clamp) at coordinate u
function tex1D(arr, u) { const x = u * 256 - 0.5, i = Math.floor(x), t = x - i, a = arr[Math.min(255, Math.max(0, i))], b = arr[Math.min(255, Math.max(0, i + 1))]; return a + (b - a) * t; }

// ------------------------------------------------------------------ 3D LUTs (Lukuluku luts/*.bin, 33³ uint16 LE, r fastest)
export function lutFromBin(buf, n = 33) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0), f = new Float32Array(n * n * n * 3);
  for (let i = 0; i < f.length; i++) f[i] = dv.getUint16(2 * i, true) / 65535; return { n, data: f };
}
export function lutSample(lut, r, g, b) {
  const n = lut.n, d = lut.data, cl = v => Math.min(1, Math.max(0, v)) * (n - 1);
  const x = cl(r), y = cl(g), z = cl(b), x0 = Math.min(n - 2, Math.floor(x)), y0 = Math.min(n - 2, Math.floor(y)), z0 = Math.min(n - 2, Math.floor(z));
  const fx = x - x0, fy = y - y0, fz = z - z0, out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const at = (i, j, k) => d[((k * n + j) * n + i) * 3 + c];
    const c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx, c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
    const c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx, c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
    out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }
  return out;
}

/**
 * Rec.709 footage is already a finished display image, but Lukuluku's colour LUTs include a film-style tone
 * curve meant for log camera plates. In Rec.709 mode we cancel the baseline (C0) curve with its inverse, so the
 * neutral look is a true pass-through and every other look keeps only its difference from neutral.
 * Returns v -> v' for one channel. Mirrored exactly in engine/src/look_engine.cpp (neutralInverse).
 */
const INV_N = 1024;
export function neutralInverse(lut0) {
  const f = new Float32Array(INV_N);
  for (let i = 0; i < INV_N; i++) { const g = lin2log(srgb2lin(i / (INV_N - 1))), o = lutSample(lut0, g, g, g); f[i] = (o[0] + o[1] + o[2]) / 3; if (i && f[i] < f[i - 1]) f[i] = f[i - 1]; }
  const y0 = f[0], y1 = f[INV_N - 1], inv = new Float32Array(INV_N); let j = 0;
  for (let k = 0; k < INV_N; k++) { const y = y0 + (y1 - y0) * k / (INV_N - 1); while (j < INV_N - 2 && f[j + 1] < y) j++;
    const d = f[j + 1] - f[j], t = d > 1e-9 ? Math.min(1, Math.max(0, (y - f[j]) / d)) : 0; inv[k] = (j + t) / (INV_N - 1); }
  const sLo = (inv[1] - inv[0]) / ((y1 - y0) / (INV_N - 1)), sHi = (inv[INV_N - 1] - inv[INV_N - 2]) / ((y1 - y0) / (INV_N - 1));
  return v => { if (v <= y0) return Math.max(0, inv[0] + (v - y0) * sLo); if (v >= y1) return Math.min(1, inv[INV_N - 1] + (v - y1) * sHi);
    const x = (v - y0) / (y1 - y0) * (INV_N - 1), i = Math.min(INV_N - 2, Math.floor(x)), t = x - i; return inv[i] + (inv[i + 1] - inv[i]) * t; };
}
const invCache = new WeakMap();
const neutralInverseCached = lut0 => { let f = invCache.get(lut0); if (!f) { f = neutralInverse(lut0); invCache.set(lut0, f); } return f; };

// ------------------------------------------------------------------ helpers mirroring GLSL
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const WV = [0.2126, 0.7152, 0.0722], dot = (c, w) => c[0] * w[0] + c[1] * w[1] + c[2] * w[2];
function rgb2hsv(c) { const K = [0, -1 / 3, 2 / 3, -1]; const p = c[2] > c[1] ? [c[2], c[1], K[3], K[2]] : [c[1], c[2], K[0], K[1]];
  const q = p[0] > c[0] ? [p[0], p[1], p[3], c[0]] : [c[0], p[1], p[2], p[0]]; const d = q[0] - Math.min(q[3], q[1]), e = 1e-6;
  return [Math.abs(q[2] + (q[3] - q[1]) / (6 * d + e)), d / (q[0] + e), q[0]]; }
function hsv2rgb(c) { const fr = x => x - Math.floor(x); return [0, 2 / 3, 1 / 3].map((o, i) => { const k = [1, 2 / 3, 1 / 3][i]; const p = Math.abs(fr(c[0] + k) * 6 - 3); return c[2] * (1 + (Math.min(1, Math.max(0, p - 1)) - 1) * c[1]); }); }
function wheels(x, W, con) {
  x = x.map((v, i) => v + W.lift[i] * (1 - v)); x = x.map((v, i) => v * W.gainM[i]); x = x.map((v, i) => Math.pow(Math.max(v, 0), W.gamE[i])); x = x.map((v, i) => v + W.off[i]);
  const Y = Math.min(1, Math.max(0, dot(x, WV))), wl = (1 - Y) * (1 - Y), wh = Y * Y, wm = Math.max(0, 1 - wl - wh);
  const k1 = 1 + wl * (W.satR[0] - 1) + wm * (W.satR[1] - 1) + wh * (W.satR[2] - 1); x = x.map(v => Y + (v - Y) * k1);
  const wS = 1 - smooth(W.lowR - 0.08, W.lowR + 0.08, Y), wH = smooth(W.highR - 0.08, W.highR + 0.08, Y), wM = Math.min(1, Math.max(0, 1 - wS - wH));
  x = x.map((v, i) => v + wS * W.LS[i] + wM * W.LM[i] + wH * W.LH[i]);
  const Y2 = dot(x, WV), k2 = 1 + wS * (W.LSat[0] - 1) + wM * (W.LSat[1] - 1) + wH * (W.LSat[2] - 1); x = x.map(v => Y2 + (v - Y2) * k2);
  return x.map(v => W.pivot + (v - W.pivot) * con);
}

// ------------------------------------------------------------------ Match to Reference + Skin Guard (new)
/** Statistics a match is computed from (Oklab means/spreads of a frame). */
export function matchStats(frame) {
  const n = frame.w * frame.h, step = Math.max(1, Math.floor(n / 20000)); let k = 0, sL = 0, sL2 = 0, sa = 0, sb = 0, sC = 0;
  for (let i = 0; i < n; i += step) { const lab = srgbToOklab(frame.data[i * 4] / 255, frame.data[i * 4 + 1] / 255, frame.data[i * 4 + 2] / 255);
    sL += lab[0]; sL2 += lab[0] * lab[0]; sa += lab[1]; sb += lab[2]; sC += Math.hypot(lab[1], lab[2]); k++; }
  const mL = sL / k; return { mL, sdL: Math.sqrt(Math.max(1e-6, sL2 / k - mL * mL)), ma: sa / k, mb: sb / k, mC: sC / k };
}
/** Parameters that move `src` toward `ref`. Clamped so a wild reference cannot wreck the shot. */
export function computeMatch(src, ref) {
  const cl = (v, a, b) => Math.min(b, Math.max(a, v)); const lg = cl(ref.sdL / src.sdL, 0.6, 1.6), cg = cl(ref.mC / Math.max(src.mC, 1e-3), 0.4, 2);
  return { matchAmt: 1, mLg: +lg.toFixed(4), mLo: +cl(ref.mL - src.mL * lg, -0.3, 0.3).toFixed(4), mA: +cl(ref.ma - src.ma * cg, -0.08, 0.08).toFixed(4), mB: +cl(ref.mb - src.mb * cg, -0.08, 0.08).toFixed(4), mCg: +cg.toFixed(4) };
}
export function applyMatch(rgb, p) { // display sRGB in/out
  if (!p.matchAmt) return rgb; const lab = srgbToOklab(...rgb);
  const L = lab[0] * p.mLg + p.mLo, a = lab[1] * p.mCg + p.mA, b = lab[2] * p.mCg + p.mB, t = p.matchAmt;
  const out = oklabToLin(lab[0] + (L - lab[0]) * t, lab[1] + (a - lab[1]) * t, lab[2] + (b - lab[2]) * t);
  return out.map(v => Math.min(1, Math.max(0, lin2srgb(v))));
}
/**
 * How much a source pixel counts as skin (soft edges; wide so deep skin is always included).
 * `cMin` is the colourfulness a pixel needs before it can read as skin at all. Skin Guard uses the default; colour
 * zones pass a lower floor, because skin in shadow is barely colourful and a neutral zone aims straight at it.
 */
export function skinWeight(lch, cMin = 0.012) {
  const [L, C, h] = lch; const soft = (x, lo, hi, e) => smooth(lo - e, lo + e, x) * (1 - smooth(hi - e, hi + e, x));
  return soft(h, 18, 92, 7) * soft(C, cMin, 0.17, 0.006) * soft(L, 0.15, 0.94, 0.05);
}
/** The look may add to skin, but cannot take away its hue, density or light beyond what you allow. */
export function applySkinGuard(src, out, p) {
  const lift = p.skinLift || 0;
  if (!p.skinGuard && !lift) return out;
  const so = toLCh(srgbToOklab(...src)), sw = skinWeight(so), w = sw * p.skinGuard;
  if (w <= 0.001 && Math.abs(lift) * sw <= 0.0005) return out;
  const go = toLCh(srgbToOklab(...out)); let [L, C, h] = go;
  // Lift (or settle) the face itself. A colour-qualified zone grabs a dark face's shadows least, because that is
  // where the colour is — so the one thing the reading most often asks for could not be done with a zone.
  // Two holds, both learned the hard way on 17 Nov: a lift is for SHADOWS, so a bright skin-coloured surface
  // (a warm wall, a wooden door — this frame has both) gets almost none of it, and whatever is left can never
  // push a pixel past the top. Without these, "lift the face" lifted the room with it and blew the highlights.
  if (lift > 0) { const shadowy = 1 - smooth(0.45, 0.85, so[0]);
    L += lift * sw * shadowy;
    const ceil = Math.max(so[0], 0.93); if (L > ceil) L = ceil;
  } else L += lift * sw;
  // Hue: a few degrees of drift is grading; twenty is skin that has stopped being skin. A proportional pull always
  // lets a strong enough look through — at guard 0.7 it gave back only 56% of the shift, which is how looks were
  // landing 13° to 22° off the line — so the drift is capped instead.
  let dh = so[2] - h; while (dh > 180) dh -= 360; while (dh < -180) dh += 360; h += dh * w * p.skinHue;
  { let d2 = so[2] - h; while (d2 > 180) d2 -= 360; while (d2 < -180) d2 += 360;
    const cap = 3 + (1 - w) * 27; if (Math.abs(d2) > cap) h = so[2] - (d2 < 0 ? -cap : cap); }
  // Colourfulness: put back what the look drained, and hold back what it piled on. Skin that reads as a cartoon is
  // the same failure as skin that reads as grey, and only the first half of it was ever guarded.
  C += Math.max(0, so[1] - C) * w * p.skinDensity;
  { const ceil = Math.max(so[1] * 1.35, 0.11); if (C > ceil) C -= (C - ceil) * w; }
  // Lightness: the look may still open up a dark face or settle a bright one — that is the whole point of a grade.
  // What it may not do is push skin into either end of the scale, where there is no detail left to grade.
  L += Math.max(0, so[0] - L) * w * p.skinLight;
  // These two are limits rather than preferences, so they bite harder than the guard's other pulls: skin at either
  // end of an 8-bit range is skin with no detail in it, whatever the look was going for.
  { const hi = Math.max(so[0], 0.93), lo = Math.min(so[0], 0.14);
    L += (Math.min(Math.max(L, lo), hi) - L) * Math.sqrt(w); }
  const r = h * Math.PI / 180, lin = oklabToLin(L, C * Math.cos(r), C * Math.sin(r));
  return lin.map(v => Math.min(1, Math.max(0, lin2srgb(v))));
}

/** Colour zones (mirrors applyZones in the C++ engine): pixels picked by their original colour move to a new colour. */
export const ZONE_KEYS = ['Amt', 'Hue', 'Wid', 'Cmin', 'Cmax', 'Lmin', 'Lmax', 'ToHue', 'ToC', 'dL'], ZONE_DEF = [0, 0, 25, 0.03, 0.4, 0, 1, 0, 0.1, 0];
export const ZONES = 8;
/** An sRGB hex for an OkLCh colour, so a control can show the colour it is about to pick or make. */
export function lchHex(h, C = 0.13, L = 0.72) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const rgb = oklabToLin(L, a, b).map(v => Math.round(Math.min(1, Math.max(0, lin2srgb(v))) * 255));
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}
/** Where the frame's colours actually sit, as 36 buckets of OkLCh hue (weighted by how colourful each pixel is). */
export function hueHistogram(frame, bins = 36) {
  const out = new Array(bins).fill(0), n = frame.w * frame.h, step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) { const lab = srgbToOklab(frame.data[i * 4] / 255, frame.data[i * 4 + 1] / 255, frame.data[i * 4 + 2] / 255);
    const C = Math.hypot(lab[1], lab[2]); if (C < 0.02) continue; let h = Math.atan2(lab[2], lab[1]) * 57.29578; if (h < 0) h += 360;
    out[Math.min(bins - 1, Math.floor(h / (360 / bins)))] += C; }
  const max = Math.max(1e-6, ...out); return out.map(v => v / max);
}
export const zoneDefaults = () => { const o = { ambHue: 0, ambAmt: 0 }; for (let i = 1; i <= ZONES; i++) ZONE_KEYS.forEach((k, j) => { o[`z${i}${k}`] = ZONE_DEF[j]; }); return o; };
export const zoneList = () => [1, 2, 3, 4, 5, 6, 7, 8];
export const hasZones = p => !!p && ((p.ambAmt || 0) > 0 || zoneList().some(i => (p[`z${i}Amt`] || 0) > 0));
export function applyZones(src, out, p) {
  if (!hasZones(p)) return out;
  const so = srgbToOklab(...src), go = srgbToOklab(...out), sC = Math.hypot(so[1], so[2]); let sh = Math.atan2(so[2], so[1]) * 57.29578; if (sh < 0) sh += 360;
  const oL = go[0];   // what the look left, before any zone moves it: the zones' own headroom is measured from here
  const room = 1 - smooth(0.82, 0.97, oL);   // how much room the picture still has at this pixel
  const soft = (x, lo, hi, e) => smooth(lo - e, lo + e, x) * (1 - smooth(hi - e, hi + e, x));
  // Ambience is the colour of the air. On a pixel with no room left it is not air, it is a pinned channel,
  // so it rolls off with the headroom exactly as a zone's colour does.
  if (p.ambAmt > 0) { const w = p.ambAmt * smooth(0.12, 0.55, go[0]) * room, h = p.ambHue * 0.01745329; go[1] += 0.07 * w * Math.cos(h); go[2] += 0.07 * w * Math.sin(h); }
  // Skin Guard holds faces back from the zones too. Without this a zone aimed at a wall paints the shadows on a face,
  // and the guard afterwards cannot see it: the guard only ever puts colour back, never takes away colour something added.
  const keep = p.skinGuard > 0 ? 1 - skinWeight([so[0], sC, sh], 0.017) * p.skinGuard : 1;
  for (let i = 1; i <= ZONES; i++) { const z = ZONE_KEYS.map((k, j) => p[`z${i}${k}`] ?? ZONE_DEF[j]); if (!(z[0] > 0)) continue;
    let dh = Math.abs(sh - z[1]); if (dh > 180) dh = 360 - dh;
    const wh = z[4] <= 0.03 ? 1 : 1 - smooth(z[2] * 0.6, z[2] * 1.2, dh), w = keep * z[0] * wh * soft(sC, z[3], z[4], 0.012) * soft(so[0], z[5], z[6], 0.05); if (w <= 0.001) continue;
    const ref = Math.max(0.02, (z[3] + z[4]) * 0.5), k = z[4] <= 0.03 ? 1 : Math.min(1.5, Math.max(0.5, sC / ref)), th = z[7] * 0.01745329, tc = z[8] * k;
    // Skin Guard holds a zone off a face's COLOUR. It does not hold it off a face's exposure: lifting an
    // underexposed face is the most ordinary thing a colourist does, and refusing it was why the plugin could
    // diagnose "the face is underexposed" and then have no way to act on it.
    const wl = w / Math.max(1e-6, keep);   // the same weight with the skin suppression taken back out
    // Piling colour onto a near-white pixel is what pins a channel at the top and twists the hues there, so a
    // zone that would ADD colour is rolled off as the picture runs out of room. Taking colour away is always safe.
    const tgA = tc * Math.cos(th), tgB = tc * Math.sin(th);
    const wc = Math.hypot(tgA, tgB) > Math.hypot(go[1], go[2]) ? w * room : w;
    go[1] += (tgA - go[1]) * wc; go[2] += (tgB - go[2]) * wc; go[0] += z[9] * wl; }
  // A zone must not spend headroom the picture does not have. It can brighten freely up to 0.93, and beyond
  // that only as far as the look or the source already reached — the same hold Skin Guard puts on a face.
  { const ceil = Math.max(oL, so[0], 0.93); if (go[0] > ceil) go[0] = ceil; }
  return oklabToLin(go[0], go[1], go[2]).map(v => Math.min(1, Math.max(0, lin2srgb(v))));
}

/** How much of a frame each colour zone actually reaches: [{zone, share}] (share of pixels moved at least a quarter of the way). */
export function zoneCoverage(frame, p) {
  const out = [], n = frame.w * frame.h, step = Math.max(1, Math.floor(n / 6000)), soft = (x, lo, hi, e) => smooth(lo - e, lo + e, x) * (1 - smooth(hi - e, hi + e, x));
  for (let i = 1; i <= ZONES; i++) { const z = ZONE_KEYS.map((k, j) => p[`z${i}${k}`] ?? ZONE_DEF[j]); if (!(z[0] > 0)) continue; let hit = 0, tot = 0;
    for (let q = 0; q < n; q += step) { const so = srgbToOklab(frame.data[q * 4] / 255, frame.data[q * 4 + 1] / 255, frame.data[q * 4 + 2] / 255), sC = Math.hypot(so[1], so[2]); let sh = Math.atan2(so[2], so[1]) * 57.29578; if (sh < 0) sh += 360;
      let dh = Math.abs(sh - z[1]); if (dh > 180) dh = 360 - dh; const wh = z[4] <= 0.03 ? 1 : 1 - smooth(z[2] * 0.6, z[2] * 1.2, dh);
      const keep = p.skinGuard > 0 ? 1 - skinWeight([so[0], sC, sh], 0.017) * p.skinGuard : 1;
      if (keep * wh * soft(sC, z[3], z[4], 0.012) * soft(so[0], z[5], z[6], 0.05) > 0.25) hit++; tot++; }
    out.push({ zone: i, share: tot ? hit / tot : 0 }); }
  return out;
}

// ------------------------------------------------------------------ the per-pixel pipeline
/**
 * Build an evaluator for one look. `cat` = Lukuluku catalog, `luts` = { C0: lut, Cn: lut }.
 * opts.input: 'rec709' (normal video) | 'logc3'. opts.extra: match / skin parameters.
 * The returned function maps one display/log RGB triplet (0..1) to display RGB (0..1).
 */
export function makePixelFn(look, cat, luts, opts = {}) {
  const G = fullGrade(look.G), M = cat.medium[look.M].fx, Dd = cat.diffusion[look.D].fx, K = cat.lens[look.K].fx, dk = G.diffK;
  const lut = luts[look.C], lut0 = luts.C0; if (!lut || !lut0) throw new Error('Colour LUT ' + look.C + ' is not loaded');
  const in709 = opts.input !== 'logc3', inv0 = in709 ? neutralInverseCached(lut0) : null, W = wheelUniforms(G), CT = curveTables(G), x = Object.assign({ matchAmt: 0, skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 }, opts.extra || {});
  const tk = G.temp * 0.25, tn = G.tint * 0.2; let wb = [1 + tk, 1 - tn, 1 - tk]; const wl = dot(wb, WV); wb = wb.map(v => v / wl);
  const expK = Math.pow(2, in709 && !opts.keepExposure ? 0 : G.exp);
  const lift = (Dd.lift || 0) * dk + (K.lift || 0), flatten = (Dd.flatten || 0) * dk + (K.veil || 0), con = M.con || 0, msat = M.sat != null ? M.sat : 1, clipv = M.clip || 0, warm = M.warm || [1, 1, 1];
  const uSat = G.sat * (G.pw && G.pw.offset ? G.pw.offset[3] : 1), uHue = G.hue * Math.PI / 180, cs = Math.cos(uHue), sn = Math.sin(uHue);
  return function (rgbIn) {
    let src = rgbIn, inp = in709 ? applyMatch(rgbIn, x) : rgbIn;
    let c = (in709 ? inp.map(srgb2lin) : inp.map(log2lin)).map((v, i) => Math.max(v, 0) * expK * wb[i]);
    c = c.map((v, i) => v * warm[i] + lift);
    let Yl = dot(c, WV); c = c.map(v => Math.max(Yl + (v - Yl) * msat, 0));
    if (uHue !== 0) { const Y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], I = 0.596 * c[0] - 0.274 * c[1] - 0.322 * c[2], Q = 0.211 * c[0] - 0.523 * c[1] + 0.312 * c[2];
      const I2 = cs * I - sn * Q, Q2 = sn * I + cs * Q; c = [Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2].map(v => Math.max(v, 0)); }
    { const Y2 = dot(c, WV), mx = Math.max(...c), mn = Math.min(...c), s0 = (mx - mn) / Math.max(mx, 1e-4); c = c.map(v => Math.max(Y2 + (v - Y2) * uSat * (1 + G.vib * (1 - s0)), 0)); }
    if (CT.hueOn) { const hv = rgb2hsv(c), fr = hv[0] - Math.floor(hv[0]), hx = tex1D(CT.hue, fr * 0.996 + 0.002), hy = tex1D(CT.sat, fr * 0.996 + 0.002);
      hv[0] = hv[0] + (hx - 0.5) * 0.5; hv[0] -= Math.floor(hv[0]); hv[1] = Math.min(1, Math.max(0, hv[1] * hy * 2)); c = hsv2rgb(hv); }
    let t = c.map(lin2log);
    t = t.map(v => v + (0.45 - v) * (flatten - con));
    t = t.map(v => v + G.hi * 0.12 * smooth(0.45, 0.85, v) + G.sh * 0.12 * (1 - smooth(0.15, 0.5, v)));
    if (!W.post) t = wheels(t, W, G.con);
    let col = lutSample(lut, t[0], t[1], t[2]);
    if (G.lutMix < 0.999) { const c0 = lutSample(lut0, t[0], t[1], t[2]); col = col.map((v, i) => c0[i] + (v - c0[i]) * G.lutMix); }
    if (inv0) col = col.map(inv0);
    if (clipv > 0) col = col.map(v => Math.min(v * (1 + clipv), 1));
    if (G.wh || G.bk) { const Yd = Math.min(1, Math.max(0, dot(col, WV))); col = col.map(v => Math.min(1, Math.max(0, v + G.wh * 0.22 * smooth(0.55, 1, Yd) + G.bk * 0.14 * (1 - smooth(0, 0.38, Yd))))); }
    col = col.map(v => Math.pow(Math.min(1, Math.max(0, v + G.bri * 0.2)), 1 / G.gam));
    if (W.post) col = wheels(col, W, G.con).map(v => Math.min(1, Math.max(0, v)));
    col = col.map((v, i) => tex1D(CT.rgb[i], v * 0.996 + 0.002));
    if (in709 && hasZones(x)) col = applyZones(src, col, x);
    if (in709 && (x.skinGuard || x.skinLift)) col = applySkinGuard(src, col, x);
    return col;
  };
}

/** A .cube LUT for this look (Rec.709 or LogC3 input), the same format Lukuluku exports. */
export function bakeCube(look, cat, luts, opts = {}) {
  const N = opts.size || 33, fn = makePixelFn(look, cat, luts, opts), in709 = opts.input !== 'logc3';
  const name = opts.name || `lukuluku_${formatCode(look).replace(/·/g, '_')}_${in709 ? 'Rec709in' : 'LogC3in'}`;
  const lines = [`TITLE "${name}"`, `# Colored Lens Studio / Lukuluku look ${formatCode(look)}. Input: ${in709 ? 'Rec.709 / sRGB display video' : 'ARRI LogC3 curve, Rec.709 primaries'}. Output: Rec.709 / sRGB display.`,
    opts.extra && opts.extra.skinGuard ? `# Skin Guard ${opts.extra.skinGuard}` : '', `LUT_3D_SIZE ${N}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'].filter(Boolean);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = fn([r / (N - 1), g / (N - 1), b / (N - 1)]); lines.push(o.map(v => Math.min(1, Math.max(0, v)).toFixed(6)).join(' '));
  }
  return { name, text: lines.join('\n') + '\n' };
}

/** Lukuluku look -> the Look Engine effect's parameter values (same names in OFX and Premiere). */
export function lookToEngineParams(look, cat, extra = {}) {
  const G = fullGrade(look.G), idx = (table, id) => Object.keys(table).sort((a, b) => +a.slice(1) - +b.slice(1)).indexOf(id);
  const aspects = Object.keys(cat.aspect).sort((a, b) => +a - +b);
  const W = G.pw, LW = G.lw;
  return {
    input: 0, lens: idx(cat.lens, look.K), diffusion: idx(cat.diffusion, look.D), color: idx(cat.color, look.C), medium: idx(cat.medium, look.M),
    aspect: extra.matte ? aspects.indexOf(look.A) + 1 : 0, streak: look.O === 'O4' ? 1 : 0,
    exp: G.exp, con: G.con, pivot: G.pivot, bri: G.bri, gam: G.gam, hi: G.hi, sh: G.sh, wh: G.wh, bk: G.bk, temp: G.temp, tint: G.tint, sat: G.sat, vib: G.vib, hue: G.hue, sharp: G.sharp,
    lutMix: G.lutMix, grainK: G.grainK, halK: G.halK, diffK: G.diffK, vigK: G.vigK,
    wpost: G.wpost ? 1 : 0, lowR: G.lowR, highR: G.highR,
    liftX: W.lift[0], liftY: W.lift[1], liftL: W.lift[2], liftS: W.lift[3], gammaX: W.gamma[0], gammaY: W.gamma[1], gammaL: W.gamma[2], gammaS: W.gamma[3],
    gainX: W.gain[0], gainY: W.gain[1], gainL: W.gain[2], gainS: W.gain[3], offX: W.offset[0], offY: W.offset[1], offL: W.offset[2], offS: W.offset[3],
    shX: LW.sh[0], shY: LW.sh[1], shL: LW.sh[2], shS: LW.sh[3], midX: LW.mid[0], midY: LW.mid[1], midL: LW.mid[2], midS: LW.mid[3], hiX: LW.hi[0], hiY: LW.hi[1], hiL: LW.hi[2], hiS: LW.hi[3],
    skinGuard: 0, skinLift: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1, grainAnim: 1, bypass: 0, ...zoneDefaults(),
    ...extra.params,
  };
}

/** A Lukuluku share link that opens this exact look in the web app. */
export function shareLink(look, appUrl = 'https://designpraiseeric.github.io/lukuluku/') {
  const G = fullGrade(look.G), diff = {};
  for (const [k, v] of Object.entries(G)) if (JSON.stringify(v) !== JSON.stringify(GRADE0[k])) diff[k] = v;
  const snap = { s: ['S1b'], a: Object.fromEntries(AXES.map(k => [k, look[k]])), G: diff, cam: {} };
  // by hand: TextEncoder and btoa are not in every panel runtime
  const bin = unescape(encodeURIComponent(JSON.stringify(snap))), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let raw = '';
  for (let i = 0; i < bin.length; i += 3) { const x = bin.charCodeAt(i), y = bin.charCodeAt(i + 1), z = bin.charCodeAt(i + 2), t = (x << 16) | ((y || 0) << 8) | (z || 0);
    raw += A[(t >> 18) & 63] + A[(t >> 12) & 63] + (isNaN(y) ? '=' : A[(t >> 6) & 63]) + (isNaN(z) ? '=' : A[t & 63]); }
  const b64 = raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return appUrl + '#look=' + b64;
}

/** Engine popup index -> look id, using the generated order (keeps panels and effect in step). */
export function engineParamsToLook(params, cat) {
  const byNum = o => Object.keys(o).sort((a, b) => +a.replace(/\D/g, '') - +b.replace(/\D/g, ''));
  return { L: 'L1', O: params.streak ? 'O4' : 'O1', H: 'H0', K: byNum(cat.lens)[params.lens] || 'K0', D: byNum(cat.diffusion)[params.diffusion] || 'D0',
    C: byNum(cat.color)[params.color] || 'C0', M: byNum(cat.medium)[params.medium] || 'M0', A: params.aspect ? Object.keys(cat.aspect).sort((a, b) => +a - +b)[params.aspect - 1] : '2.39' };
}

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
/** How much a source pixel counts as skin (soft edges; wide so deep skin is always included). */
export function skinWeight(lch) {
  const [L, C, h] = lch; const soft = (x, lo, hi, e) => smooth(lo - e, lo + e, x) * (1 - smooth(hi - e, hi + e, x));
  return soft(h, 30, 86, 7) * soft(C, 0.025, 0.17, 0.012) * soft(L, 0.17, 0.93, 0.05);
}
/** The look may add to skin, but cannot take away its hue, density or light beyond what you allow. */
export function applySkinGuard(src, out, p) {
  if (!p.skinGuard) return out; const so = toLCh(srgbToOklab(...src)), w = skinWeight(so) * p.skinGuard; if (w <= 0.001) return out;
  const go = toLCh(srgbToOklab(...out)); let [L, C, h] = go;
  let dh = so[2] - h; while (dh > 180) dh -= 360; while (dh < -180) dh += 360; h += dh * w * p.skinHue;
  C += Math.max(0, so[1] - C) * w * p.skinDensity; L += Math.max(0, so[0] - L) * w * p.skinLight;
  const r = h * Math.PI / 180, lin = oklabToLin(L, C * Math.cos(r), C * Math.sin(r));
  return lin.map(v => Math.min(1, Math.max(0, lin2srgb(v))));
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
  const in709 = opts.input !== 'logc3', W = wheelUniforms(G), CT = curveTables(G), x = Object.assign({ matchAmt: 0, skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 }, opts.extra || {});
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
    if (clipv > 0) col = col.map(v => Math.min(v * (1 + clipv), 1));
    if (G.wh || G.bk) { const Yd = Math.min(1, Math.max(0, dot(col, WV))); col = col.map(v => Math.min(1, Math.max(0, v + G.wh * 0.22 * smooth(0.55, 1, Yd) + G.bk * 0.14 * (1 - smooth(0, 0.38, Yd))))); }
    col = col.map(v => Math.pow(Math.min(1, Math.max(0, v + G.bri * 0.2)), 1 / G.gam));
    if (W.post) col = wheels(col, W, G.con).map(v => Math.min(1, Math.max(0, v)));
    col = col.map((v, i) => tex1D(CT.rgb[i], v * 0.996 + 0.002));
    if (in709 && x.skinGuard) col = applySkinGuard(src, col, x);
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
    skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1, grainAnim: 1,
    ...extra.params,
  };
}

/** A Lukuluku share link that opens this exact look in the web app. */
export function shareLink(look, appUrl = 'https://designpraiseeric.github.io/lukuluku/') {
  const G = fullGrade(look.G), diff = {};
  for (const [k, v] of Object.entries(G)) if (JSON.stringify(v) !== JSON.stringify(GRADE0[k])) diff[k] = v;
  const snap = { s: ['S1b'], a: Object.fromEntries(AXES.map(k => [k, look[k]])), G: diff, cam: {} };
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return appUrl + '#look=' + b64;
}

/** Engine popup index -> look id, using the generated order (keeps panels and effect in step). */
export function engineParamsToLook(params, cat) {
  const byNum = o => Object.keys(o).sort((a, b) => +a.replace(/\D/g, '') - +b.replace(/\D/g, ''));
  return { L: 'L1', O: params.streak ? 'O4' : 'O1', H: 'H0', K: byNum(cat.lens)[params.lens] || 'K0', D: byNum(cat.diffusion)[params.diffusion] || 'D0',
    C: byNum(cat.color)[params.color] || 'C0', M: byNum(cat.medium)[params.medium] || 'M0', A: params.aspect ? Object.keys(cat.aspect).sort((a, b) => +a - +b)[params.aspect - 1] : '2.39' };
}

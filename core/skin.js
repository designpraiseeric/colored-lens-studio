// Skin, Exposure & Equity (encyclopedia §7) as a working check.
// Detection is deliberately wide so deep skin is never excluded, and the editor can always
// click the skin to sample it instead of trusting the detector.
import { srgbToOklab, toLCh, hueDist, srgb2lin, luma, oklabToSrgb, rgbToHex } from './color.js';
import { downsample, makeFrame } from './image.js';
import { activeArea } from './analysis.js';

export const SKIN = { hueLo: 28, hueHi: 88, cLo: 0.022, cHi: 0.145, lLo: 0.16, lHi: 0.94, hueCentre: 56 };
const expectedChroma = L => 0.015 + 0.05 * L; // below this, skin reads grey / ashy / "muddy"

function pixelInfo(f) {
  const n = f.w * f.h, info = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = f.data[i * 4] / 255, g = f.data[i * 4 + 1] / 255, b = f.data[i * 4 + 2] / 255;
    const lab = srgbToOklab(r, g, b); info[i] = { lab, lch: toLCh(lab), y: luma(r, g, b) };
  }
  return info;
}
// Saturated oranges and yellows (cushions, lamps, sand) sit above real skin chroma for their lightness.
const looksLikeSkin = p => p.lch[2] >= SKIN.hueLo && p.lch[2] <= SKIN.hueHi && p.lch[1] >= SKIN.cLo && p.lch[1] <= Math.min(SKIN.cHi, 0.04 + 0.16 * p.lch[0]) && p.lch[0] >= SKIN.lLo && p.lch[0] <= SKIN.lHi && !(p.lch[2] > 72 && p.lch[1] > 0.1);

/** Mask from the detector, cleaned with a 3x3 majority filter so isolated pixels drop out. */
function detectMask(f, info) {
  const raw = info.map(looksLikeSkin), m = new Uint8Array(info.length);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < f.w && yy < f.h && raw[yy * f.w + xx]) c++; }
    m[y * f.w + x] = c >= 6 ? 1 : 0;
  }
  return m;
}
/** Mask grown from a clicked point: connected pixels close in colour to the sample. */
function sampleMask(f, info, sx, sy) {
  const x0 = Math.min(f.w - 1, Math.max(0, Math.round(sx * (f.w - 1)))), y0 = Math.min(f.h - 1, Math.max(0, Math.round(sy * (f.h - 1))));
  const seed = info[y0 * f.w + x0], m = new Uint8Array(info.length), q = [y0 * f.w + x0]; m[q[0]] = 1;
  const close = p => Math.abs(p.lch[0] - seed.lch[0]) < 0.16 && hueDist(p.lch[2], seed.lch[2]) < 16 && Math.abs(p.lch[1] - seed.lch[1]) < 0.05;
  while (q.length) { const i = q.pop(), x = i % f.w, y = (i / f.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= f.w || yy >= f.h) continue;
      const j = yy * f.w + xx; if (!m[j] && close(info[j])) { m[j] = 1; q.push(j); } } }
  return m;
}

function median(a) { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; }
function circMean(hs) { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); } let m = Math.atan2(y, x) * 180 / Math.PI; return m < 0 ? m + 360 : m; }

/**
 * Connected skin-like regions, kept only when they are face- or hand-sized: big warm areas (walls, wood, sand,
 * lamp-lit backgrounds) and specks are dropped. Returns the cleaned mask and the regions kept.
 */
function regions(f, mask, info) {
  const N = mask.length, lab = new Int32Array(N).fill(-1), kept = [], out = new Uint8Array(N); let dropped = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!mask[s0] || lab[s0] >= 0) continue;
    const id = s0, q = [s0], px = []; lab[s0] = id; let x0 = f.w, x1 = 0, y0 = f.h, y1 = 0;
    while (q.length) { const i = q.pop(), x = i % f.w, y = (i / f.w) | 0; px.push(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= f.w || yy >= f.h) continue; const j = yy * f.w + xx; if (mask[j] && lab[j] < 0) { lab[j] = id; q.push(j); } } }
    const area = px.length / N, bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = px.length / (bw * bh), aspect = bw / bh;
    if (area < 0.002) continue;
    const bigOk = area <= 0.2 || (area <= 0.45 && fill > 0.5 && bw < f.w * 0.62); // close-ups can fill a lot of frame, but compactly
    if (!bigOk || fill < 0.28 || aspect > 3 || aspect < 0.25 || bw > f.w * 0.7) { dropped += area; continue; }
    for (const i of px) out[i] = 1;
    kept.push({ area, L: median(px.map(i => info[i].lab[0])) });
  }
  return { mask: out, kept: kept.sort((a, b) => b.area - a.area), dropped };
}

/**
 * Check skin in a frame.
 * opts.sample = [x, y] in 0..1 to sample skin at a clicked point instead of detecting it.
 * opts.input = 'rec709' | 'logc3' (log skin is always pale and grey before a look, so colour checks wait).
 * opts.lowKey = true when the editor said the scene is meant to be dark.
 * Returns findings in plain language, numbers, a mask preview, a confidence and suggested fixes.
 */
export function checkSkin(frame, opts = {}) {
  const full = downsample(frame, 220), a = activeArea(full), f = crop(full, a), info = pixelInfo(f);
  let mask, kept = [], dropped = 0;
  if (opts.sample) { // the click is on the full frame; map it into the picture area
    const sx = (opts.sample[0] * full.w - a.x0) / (a.x1 - a.x0 + 1), sy = (opts.sample[1] * full.h - a.y0) / (a.y1 - a.y0 + 1);
    mask = sampleMask(f, info, Math.min(1, Math.max(0, sx)), Math.min(1, Math.max(0, sy))); }
  else ({ mask, kept, dropped } = regions(f, detectMask(f, info), info));
  const pts = []; for (let i = 0; i < mask.length; i++) if (mask[i]) pts.push(info[i]);
  const coverage = pts.length / mask.length;
  const result = { coverage, mode: opts.sample ? 'sampled' : 'detected', findings: [], fixes: [], ok: true, regions: kept.length, found: false,
    confidence: opts.sample ? 'high' : kept.length ? 'medium' : 'none' }; // detection by colour alone is a hint; a click makes it sure
  if (pts.length < 25) {
    result.findings.push({ level: 'info', title: 'No face found', text: opts.sample ? 'The point you clicked did not grow into a skin region. Try the middle of a cheek or forehead.'
      : `No face-sized skin region was found${dropped > 0.05 ? ' (large warm areas such as walls, wood or lamplight were ignored)' : ''}. If there is a person in the shot, click their face in the picture.` });
    result.mask = maskPreview(f, mask); return result;
  }
  result.found = true;
  const Ls = pts.map(p => p.lab[0]), Cs = pts.map(p => p.lch[1]), Hs = pts.map(p => p.lch[2]), Ys = pts.map(p => p.y);
  const L = median(Ls), C = median(Cs), H = circMean(Hs), Y = median(Ys);
  const crushed = Ys.filter(y => y < 0.07).length / Ys.length, clipped = Ys.filter(y => y > 0.97).length / Ys.length;
  const detail = Math.sqrt(Ls.reduce((s, v) => s + (v - L) ** 2, 0) / Ls.length);
  const mix = kept.length >= 2 && kept[1].area >= 0.004 && Math.abs(kept[0].L - kept[1].L) > 0.18 ? { light: Math.max(kept[0].L, kept[1].L), dark: Math.min(kept[0].L, kept[1].L) } : null;
  Object.assign(result, { L, C, H, ire: Math.round(Y * 100), crushed, clipped, detail, complexions: mix,
    swatch: rgbToHex(...oklabToSrgb(L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180))) });
  const add = (level, title, text) => { result.findings.push({ level, title, text }); if (level === 'warn') result.ok = false; };
  if (dropped > 0.08 && !opts.sample) add('info', 'Only face-sized regions were checked', 'Large warm areas (walls, wood, sand, lamplight) look like skin to a colour detector, so they were left out. Click a face to check it directly.');

  if (opts.input === 'logc3') {
    add('info', 'Log footage: check skin after the look', `Skin found at about ${result.ire} IRE in the log image. Log skin always looks pale and grey; Colored Lens checks colour and exposure on the preview once a look is applied.`);
    result.mask = maskPreview(f, mask); result.guard = { hueCentre: H, L, C }; return result;
  }

  // 1. Exposure, against the usual range for a key-lit face in Rec.709 (about 40-75 IRE).
  const ire = result.ire;
  if (ire < 35 || crushed > 0.12) {
    const targetL = 0.5, stops = Math.log2(srgb2lin(lStar(targetL)) / Math.max(1e-4, srgb2lin(lStar(L))));
    if (opts.lowKey) add('info', 'The face is dark, as the mood asks', `Median skin is about ${ire} IRE (a key-lit face usually sits at 40–75). That suits the dark mood you set; keep the eyes readable.`);
    else {
      add('warn', 'The face is underexposed', `Median skin is about ${ire} IRE; a key-lit face usually sits at 40–75 IRE${crushed > 0.05 ? `, and ${(crushed * 100).toFixed(0)}% of it is crushed toward black` : ''}. Lifting it in the grade adds noise; if you can, expose for the face.`);
      result.fixes.push({ kind: 'exposure', label: `Lift exposure about +${Math.min(2, stops).toFixed(1)} EV`, params: { exp: +Math.min(2, Math.max(0.2, stops)).toFixed(2) } });
    }
  } else if (ire < 40) add('info', 'The face is on the dark side', `Median skin is about ${ire} IRE, just under the usual 40–75 for a key-lit face. Fine for a moody scene.`);
  else if (ire > 80 || clipped > 0.08) add('warn', 'The face is running hot', `Median skin is about ${ire} IRE${clipped > 0.05 ? ` and ${(clipped * 100).toFixed(0)}% of it is clipping` : ''}. Above about 75 IRE skin loses its modelling; sheen is good, flat white patches are not.`);
  else add('good', 'Exposure suits the face', `Median skin is about ${ire} IRE, inside the usual 40–75 for a key-lit face.`);

  // 2. Density / mud: chroma that has drained away reads grey or ashy.
  if (C < expectedChroma(L)) {
    add('warn', 'Skin is losing its colour (grey / ashy)', 'Saturation in the skin is low for its brightness. Cool, bleach-bypass and cyan looks flatten dark skin first; Skin Guard limits how far a look reaches it.');
    result.fixes.push({ kind: 'guard', label: 'Turn on Skin Guard (protect density)', params: { skinGuard: 0.75, skinDensity: 0.6 } });
  } else add('good', 'Skin keeps its density', 'Skin chroma is healthy for its brightness.');

  // 3. Hue: is it on the skin line?
  const off = signedHue(H, SKIN.hueCentre);
  if (Math.abs(off) > 16) {
    add('warn', off < 0 ? 'Skin is drifting red / magenta' : 'Skin is drifting yellow / olive', off > 0 ? 'Green spikes from low-CRI LEDs or fluorescents turn deep skin olive or grey. Correct the light with minus-green, or pull the hue back with Skin Guard.' : 'Skin has moved toward magenta-red; check the white balance and the look.');
    result.fixes.push({ kind: 'hue', label: 'Pull skin back to the skin line', params: { skinGuard: 0.6, skinHue: 0.8 } });
  } else add('good', 'Skin sits on the skin line', `Skin hue is within ${Math.abs(off).toFixed(0)}° of the skin line.`);

  // 4. Mixed complexions: two separate faces with clearly different lightness.
  if (mix) add('info', 'Two complexions share this frame', 'Two faces sit far apart in lightness. Light for the darker face and flag or net the lighter one, rather than exposing for the middle.');
  if (detail < 0.025 && pts.length > 200) add('info', 'Skin detail is very flat', 'Little tonal variation across the face. Shape it with specular highlights and large soft sources for wrap.');

  result.mask = maskPreview(f, mask);
  result.guard = { hueCentre: H, L, C };
  return result;
}
function crop(f, a) {
  if (!a.bars) return f; const w = a.x1 - a.x0 + 1, h = a.y1 - a.y0 + 1, out = makeFrame(w, h);
  for (let y = 0; y < h; y++) out.data.set(f.data.subarray(((y + a.y0) * f.w + a.x0) * 4, ((y + a.y0) * f.w + a.x1 + 1) * 4), y * w * 4);
  return out;
}
function signedHue(h, c) { let d = h - c; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function lStar(L) { return oklabToSrgb(L, 0, 0)[0]; } // grey with Oklab lightness L, in display terms

function maskPreview(f, mask) {
  const out = makeFrame(f.w, f.h);
  for (let i = 0; i < mask.length; i++) { const k = mask[i] ? 1 : 0.28;
    out.data[i * 4] = f.data[i * 4] * k; out.data[i * 4 + 1] = f.data[i * 4 + 1] * k; out.data[i * 4 + 2] = f.data[i * 4 + 2] * k + (mask[i] ? 0 : 20); out.data[i * 4 + 3] = 255; }
  return out;
}

/** A small vectorscope (Rec.709 CbCr) with the skin line drawn, as a Frame. */
export function vectorscope(frame, size = 150) {
  const f = downsample(frame, 200), out = makeFrame(size, size), acc = new Float32Array(size * size * 3), c = size / 2;
  for (let i = 0; i < f.w * f.h; i++) {
    const r = f.data[i * 4] / 255, g = f.data[i * 4 + 1] / 255, b = f.data[i * 4 + 2] / 255, y = luma(r, g, b);
    const cb = (b - y) / 1.8556, cr = (r - y) / 1.5748; const x = Math.round(c + cb * size * 0.9), yy = Math.round(c - cr * size * 0.9);
    if (x < 0 || yy < 0 || x >= size || yy >= size) continue; const o = (yy * size + x) * 3; acc[o] += r; acc[o + 1] += g; acc[o + 2] += b;
  }
  for (let i = 0; i < size * size; i++) { const o = i * 3, n = acc[o] + acc[o + 1] + acc[o + 2], k = n > 0 ? Math.min(1, 0.35 + n / 6) : 0;
    out.data[i * 4] = 12 + k * Math.min(255, acc[o] / Math.max(n, 1e-6) * 600); out.data[i * 4 + 1] = 12 + k * Math.min(255, acc[o + 1] / Math.max(n, 1e-6) * 600); out.data[i * 4 + 2] = 14 + k * Math.min(255, acc[o + 2] / Math.max(n, 1e-6) * 600); out.data[i * 4 + 3] = 255; }
  // graticule: circle + skin line (~123° in the usual scope orientation, i.e. toward red-yellow)
  const plot = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= size || y >= size) return; const o = (y * size + x) * 4; out.data[o] = Math.max(out.data[o], v[0]); out.data[o + 1] = Math.max(out.data[o + 1], v[1]); out.data[o + 2] = Math.max(out.data[o + 2], v[2]); };
  for (let a = 0; a < 360; a += 1) plot(c + Math.cos(a * Math.PI / 180) * c * 0.92, c + Math.sin(a * Math.PI / 180) * c * 0.92, [70, 70, 78]);
  const ang = 123 * Math.PI / 180; for (let t = 0; t < c * 0.92; t += 0.5) plot(c + Math.cos(ang) * t, c - Math.sin(ang) * t, [227, 160, 90]);
  return out;
}

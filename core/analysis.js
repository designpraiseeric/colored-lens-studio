// "Read my frame": describes a frame in the encyclopedia's own terms.
// Everything here is plain maths on pixels; the words and references come from encyclopedia.json,
// so when the encyclopedia changes, the readings change with it.
import { srgbToOklab, toLCh, hueDist, hexToOklab, oklabToSrgb, rgbToHex, oklabDist } from './color.js';
import { downsample } from './image.js';

export const CHROMA_MIN = 0.035; // below this a pixel reads as neutral

/**
 * The picture area of a (downsampled) frame: letterbox / pillarbox bars are found and left out, so black bars
 * never count as "the colour of the shot".
 */
export function activeArea(f) {
  const lum = i => (0.2126 * f.data[i * 4] + 0.7152 * f.data[i * 4 + 1] + 0.0722 * f.data[i * 4 + 2]) / 255;
  const dark = (n, at) => { let s = 0, mx = 0, mn = 1; for (let k = 0; k < n; k++) { const l = lum(at(k)); s += l; if (l > mx) mx = l; if (l < mn) mn = l; } return s / n < 0.03 && mx < 0.08 && mx - mn < 0.035; }; // bars: black and flat
  let y0 = 0, y1 = f.h - 1, x0 = 0, x1 = f.w - 1;
  while (y0 < f.h * 0.3 && dark(f.w, x => y0 * f.w + x)) y0++;
  while (y1 > f.h * 0.7 && dark(f.w, x => y1 * f.w + x)) y1--;
  while (x0 < f.w * 0.3 && dark(f.h, y => y * f.w + x0)) x0++;
  while (x1 > f.w * 0.7 && dark(f.h, y => y * f.w + x1)) x1--;
  const bars = y0 + (f.h - 1 - y1) > f.h * 0.04 ? 'letterbox' : x0 + (f.w - 1 - x1) > f.w * 0.04 ? 'pillarbox' : null;
  if (!bars) { y0 = 0; y1 = f.h - 1; x0 = 0; x1 = f.w - 1; }
  return { x0, y0, x1, y1, bars, share: ((x1 - x0 + 1) * (y1 - y0 + 1)) / (f.w * f.h) };
}

/**
 * Frame -> Oklab triplets of the picture area (downsampled), plus a weight per pixel that favours the centre of
 * the frame, where the subject usually is (edges count about a third as much as the middle).
 */
export function labPixels(frame, max = 160) {
  const f = downsample(frame, max), area = activeArea(f), w = area.x1 - area.x0 + 1, h = area.y1 - area.y0 + 1, n = w * h;
  const lab = new Float32Array(n * 3), wt = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = (y + area.y0) * f.w + x + area.x0;
    const o = srgbToOklab(f.data[j * 4] / 255, f.data[j * 4 + 1] / 255, f.data[j * 4 + 2] / 255);
    lab[i * 3] = o[0]; lab[i * 3 + 1] = o[1]; lab[i * 3 + 2] = o[2];
    const dx = (x + 0.5) / w * 2 - 1, dy = (y + 0.5) / h * 2 - 1; wt[i] = 0.35 + 0.65 * Math.exp(-(dx * dx + dy * dy) * 1.4);
  }
  return { lab, w, h, n, wt, area };
}
export const SHADOW_L = 0.18, HIGHLIGHT_L = 0.965; // below / above these, a pixel carries tone, not colour

/** Deterministic k-means in Oklab. Returns clusters sorted by share. */
export function dominantColors(px, k = 7, iters = 12) {
  const { lab, n } = px; if (!n) return [];
  const step = Math.max(1, Math.floor(n / 4000)), idx = []; for (let i = 0; i < n; i += step) idx.push(i);
  const pt = i => [lab[i * 3], lab[i * 3 + 1] * 1.6, lab[i * 3 + 2] * 1.6]; // weight chroma so hues separate
  const cents = [pt(idx[0])];
  while (cents.length < k) { // farthest-point init (deterministic)
    let best = -1, bi = 0;
    for (const i of idx) { const p = pt(i); let d = Infinity; for (const c of cents) d = Math.min(d, oklabDist(p, c)); if (d > best) { best = d; bi = i; } }
    if (best < 0.02) break; cents.push(pt(bi));
  }
  let assign = new Int32Array(idx.length);
  for (let it = 0; it < iters; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    idx.forEach((i, j) => { const p = pt(i); let bd = Infinity, b = 0; cents.forEach((c, ci) => { const d = oklabDist(p, c); if (d < bd) { bd = d; b = ci; } }); assign[j] = b; const s = sums[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    sums.forEach((s, ci) => { if (s[3]) cents[ci] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const counts = cents.map(() => 0); assign.forEach(a => counts[a]++);
  return cents.map((c, i) => {
    const l = [c[0], c[1] / 1.6, c[2] / 1.6], lch = toLCh(l), rgb = oklabToSrgb(...l);
    return { lab: l, lch, hex: rgbToHex(...rgb), share: counts[i] / idx.length };
  }).filter(c => c.share > 0.005).sort((a, b) => b.share - a.share);
}

/** Global statistics used by several readings. */
export function frameStats(px) {
  const { lab, n } = px, Ls = new Float32Array(n);
  let sumC = 0, chromatic = 0, warm = 0, cool = 0, sumB = 0, sumA = 0, neuC = 0, lit = 0;
  for (let i = 0; i < n; i++) {
    const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2], C = Math.hypot(a, b); Ls[i] = L; sumC += C; sumA += a; sumB += b;
    if (L < SHADOW_L) continue; lit++; // deep shadow carries no readable colour
    if (C <= CHROMA_MIN) neuC += C; if (C > CHROMA_MIN) { chromatic++; const h = toLCh([L, a, b])[2]; if (h >= 20 && h < 110) warm += C; else if (h >= 170 && h < 290) cool += C; }
  }
  const sorted = Float32Array.from(Ls).sort(), q = p => sorted[Math.min(n - 1, Math.floor(p * n))];
  const p5 = q(0.05), p50 = q(0.5), p95 = q(0.95);
  const meanC = sumC / n, temp = warm + cool > 0 ? (warm - cool) / (warm + cool) : 0;
  return {
    p5, p50, p95, contrast: p95 - p5, meanC, neutralC: lit - chromatic > 0 ? neuC / (lit - chromatic) : 0, chromaticShare: lit ? chromatic / lit : 0, litShare: lit / n, temperature: temp, meanA: sumA / n, meanB: sumB / n,
    key: p50 > 0.72 ? 'high-key' : p50 < 0.38 ? 'low-key' : 'mid-key',
    saturation: meanC < 0.025 ? 'near-neutral' : meanC < 0.06 ? 'muted' : meanC < 0.11 ? 'moderate' : 'saturated',
    warmth: temp > 0.35 ? 'warm' : temp < -0.35 ? 'cool' : 'balanced',
    blacks: p5 > 0.18 ? 'lifted' : p5 < 0.06 ? 'crushed' : 'normal',
  };
}

/** Chroma-weighted hue histogram, 36 bins of 10°. */
export function hueHistogram(px, weighted = false) {
  const bins = new Float64Array(36); let tot = 0; const { lab, n } = px;
  for (let i = 0; i < n; i++) { const a = lab[i * 3 + 1], b = lab[i * 3 + 2], C = Math.hypot(a, b); if (C <= CHROMA_MIN) continue;
    if (weighted && lab[i * 3] < SHADOW_L) continue;
    const k = C * (weighted ? px.wt[i] : 1); let h = Math.atan2(b, a) * 180 / Math.PI; if (h < 0) h += 360; bins[Math.floor(h / 10) % 36] += k; tot += k; }
  return { bins: Array.from(bins, v => (tot ? v / tot : 0)), total: tot };
}
/** Groups the hue histogram into hue families (circular runs of populated bins). */
export function hueGroups(hist, minBin = 0.012, minMass = 0.06) {
  const b = hist.bins, on = b.map(v => v >= minBin); if (on.every(Boolean)) return [{ hue: 0, mass: 1, span: 360 }];
  let s0 = on.findIndex(v => !v); const groups = []; let cur = null;
  for (let k = 1; k <= 36; k++) { const i = (s0 + k) % 36;
    if (on[i]) { if (!cur) cur = { bins: [] }; cur.bins.push(i); } else if (cur) { groups.push(cur); cur = null; } }
  if (cur) groups.push(cur);
  return groups.map(g => { let x = 0, y = 0, m = 0; for (const i of g.bins) { const a = (i * 10 + 5) * Math.PI / 180; x += Math.cos(a) * b[i]; y += Math.sin(a) * b[i]; m += b[i]; }
    let h = Math.atan2(y, x) * 180 / Math.PI; if (h < 0) h += 360; return { hue: h, mass: m, span: g.bins.length * 10 }; })
    .filter(g => g.mass >= minMass).sort((a, b) => b.mass - a.mass);
}

// ---------------- encyclopedia lookups ----------------
let protoCache = null;
function hueProtos(enc) {
  if (protoCache && protoCache.enc === enc) return protoCache.p;
  const p = [];
  for (const h of enc.HUES) {
    if (['white', 'black', 'grey', 'bw'].includes(h.id)) continue;
    for (const hex of [h.hex, ...(h.pal || [])]) { const lab = hexToOklab(hex), lch = toLCh(lab); if (lch[1] > 0.05) p.push({ id: h.id, lab, lch }); }
  }
  protoCache = { enc, p }; return p;
}
/** Which encyclopedia hue (red, teal, amber…) a colour belongs to. */
export function classifyHue(enc, lab) {
  const lch = toLCh(lab);
  if (lch[1] < CHROMA_MIN) return lch[0] > 0.86 ? 'white' : lch[0] < 0.22 ? 'black' : 'grey';
  let best = null, bd = Infinity;
  for (const pr of hueProtos(enc)) {
    const d = hueDist(lch[2], pr.lch[2]) / 60 + Math.abs(lch[0] - pr.lch[0]) * 0.9 + Math.abs(lch[1] - pr.lch[1]) * 1.5;
    if (d < bd) { bd = d; best = pr.id; }
  }
  return best;
}

/**
 * Colour shares of the frame, by encyclopedia hue, classified pixel by pixel (memoised) and weighted toward the
 * centre. Deep shadow and blown highlights carry tone, not colour, so they are reported separately in `tones`
 * instead of outvoting the subject ("Black 80%" on a lamp-lit room).
 */
export function hueShares(px, enc) {
  const memo = new Map(), out = {}; const { lab, n, wt } = px; let tot = 0, all = 0, shadow = 0, high = 0;
  for (let i = 0; i < n; i++) { const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2], w = wt ? wt[i] : 1; all += w;
    if (L < SHADOW_L) { shadow += w; continue; } if (L > HIGHLIGHT_L && Math.hypot(a, b) < CHROMA_MIN) { high += w; continue; }
    const key = (Math.round(L * 24) << 16) | (Math.round(a * 80 + 64) << 8) | Math.round(b * 80 + 64);
    let id = memo.get(key); if (id === undefined) { id = classifyHue(enc, [L, a, b]); memo.set(key, id); }
    out[id] = (out[id] || 0) + w; tot += w; }
  for (const k of Object.keys(out)) out[k] /= tot || 1;
  return { shares: out, tones: { shadow: shadow / (all || 1), highlight: high / (all || 1), readable: tot / (all || 1) } };
}

/** Palette structure, as one of the encyclopedia's PALS ids, with the reasons. */
export function classifyPalette(stats, hist, swatches) {
  const G = hueGroups(hist), why = [];
  if (stats.chromaticShare < 0.015 || !G.length) return { id: 'pal-achro', confidence: 0.9, why: ['Almost no pixels carry colour; the frame works in value alone.'] };
  if (stats.chromaticShare < 0.22 && (stats.meanC < 0.03 || (G.length <= 2 && G[0].mass > 0.6))) {
    const pure = stats.neutralC < 0.009;
    return pure ? { id: 'pal-select', confidence: 0.75, why: [`Only ${(stats.chromaticShare * 100).toFixed(0)}% of the frame carries colour, isolated in one hue against an otherwise colourless image.`] }
      : { id: 'pal-accent', confidence: 0.7, why: [`A largely neutral frame (${(100 - stats.chromaticShare * 100).toFixed(0)}% near-neutral) with one colour accent.`] };
  }
  why.push(`Hue families at ${G.map(g => Math.round(g.hue) + '° (' + Math.round(g.mass * 100) + '%)').join(', ')}.`);
  const H = G.map(g => g.hue), n = H.length;
  if (n === 1) return G[0].span <= 30 ? { id: 'pal-mono', confidence: 0.85, why: [...why, 'One hue family; variety comes from value and saturation.'] }
    : G[0].span <= 100 ? { id: 'pal-analog', confidence: 0.7, why: [...why, 'Neighbouring hues spread across one side of the wheel.'] }
    : { id: 'pal-disc', confidence: 0.4, why: [...why, 'Colour spread right round the wheel.'] };
  const d = (a, b) => hueDist(a, b);
  if (n === 2) { const x = d(H[0], H[1]);
    if (x >= 130) return { id: 'pal-comp', confidence: 0.8, why: [...why, 'Two opposite hues, each strengthening the other.'] };
    if (x <= 70) return { id: 'pal-analog', confidence: 0.7, why: [...why, 'Two neighbouring hues.'] };
    return { id: 'pal-split', confidence: 0.4, why: [...why, 'Two hues a third of the wheel or more apart, short of complementary.'] }; }
  if (n === 3) { const [a, b, c] = H, ds = [d(a, b), d(b, c), d(a, c)];
    if (ds.every(x => x >= 85)) return { id: 'pal-triad', confidence: 0.65, why: [...why, 'Three hues spread evenly round the wheel.'] };
    for (const [base, p, q] of [[a, b, c], [b, a, c], [c, a, b]]) if (d(p, q) <= 90 && d(base, p) >= 110 && d(base, q) >= 110) return { id: 'pal-split', confidence: 0.65, why: [...why, 'One hue set against the two neighbours of its complement.'] };
    if (Math.max(...ds) <= 100) return { id: 'pal-analog', confidence: 0.55, why: [...why, 'Three neighbouring hues.'] };
    return { id: 'pal-disc', confidence: 0.5, why: [...why, 'Three hues that clash rather than follow a classic harmony.'] }; }
  const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d(H[i], H[j]) >= 130) pairs.push([i, j]);
  const disjoint = pairs.some(p => pairs.some(q => q[0] !== p[0] && q[0] !== p[1] && q[1] !== p[0] && q[1] !== p[1]));
  if (disjoint) return { id: 'pal-tetra', confidence: 0.6, why: [...why, 'Two complementary pairs.'] };
  return { id: 'pal-disc', confidence: 0.55, why: [...why, 'Many competing hues with no clear harmony.'] };
}

/** Itten's seven contrasts, scored 0..1. */
export function ittenContrasts(stats, hist, swatches, pal) {
  const peaks = hueGroups(hist), col = swatches.filter(s => s.lch[1] > CHROMA_MIN);
  const chromas = col.map(s => s.lch[1]), cSpread = chromas.length ? Math.max(...chromas) - Math.min(...chromas) : 0;
  const warmMass = hist.bins.slice(2, 11).reduce((a, b) => a + b, 0), coolMass = hist.bins.slice(17, 29).reduce((a, b) => a + b, 0);
  const shares = col.map(s => s.share), ext = shares.length > 1 ? 1 - Math.min(...shares) / Math.max(...shares) : 0;
  const scores = {
    'Contrast of hue': Math.min(1, Math.max(0, peaks.length - 1) / 3) * Math.min(1, stats.meanC / 0.08),
    'Light–dark': Math.min(1, Math.max(0, stats.contrast - 0.25) / 0.5),
    'Cold–warm': Math.min(1, 4 * Math.min(warmMass, coolMass)),
    'Complementary': ['pal-comp', 'pal-split', 'pal-tetra'].includes(pal.id) ? pal.confidence : 0,
    'Simultaneous': stats.chromaticShare < 0.5 && stats.meanC > 0.02 && col.length ? 0.35 : 0.05,
    'Saturation': Math.min(1, cSpread / 0.15),
    'Extension (proportion)': col.length > 1 ? ext * 0.9 : 0,
  };
  return Object.entries(scores).map(([n, s]) => ({ n, score: +s.toFixed(2) })).sort((a, b) => b.score - a.score);
}

/** Frame-level hints at narrative devices; the Script tab adds sequence-level ones. */
export function narrativeHints(stats, pal, hues) {
  const out = [];
  if (pal.id === 'pal-select' || pal.id === 'pal-accent') out.push({ n: 'Omen / foreshadowing', why: 'A lone saturated element in a neutral frame is how films plant an omen (the red coat in Don\'t Look Now).' });
  if (stats.warmth !== 'balanced') out.push({ n: 'Emotional thermometer', why: `The frame reads ${stats.warmth}; tracked across scenes, temperature can map the emotional arc.` });
  if (hues[0] && hues[0].share > 0.45) out.push({ n: 'Location coding', why: `${cap(hues[0].id)} dominates the frame; holding it for one place lets it orient the audience.` });
  if (stats.saturation === 'near-neutral') out.push({ n: 'Withholding a color', why: 'A world kept near neutral makes the first strong colour land hard.' });
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Compact signature for reference matching (also computed for every encyclopedia frame at build time). */
export function signature(px) {
  const st = frameStats(px), hist = hueHistogram(px), sw = dominantColors(px, 5, 8);
  const Lh = new Array(8).fill(0); for (let i = 0; i < px.n; i++) Lh[Math.min(7, Math.floor(px.lab[i * 3] * 8))]++;
  return { L: Lh.map(v => +(v / px.n).toFixed(4)), H: hist.bins.map(v => +v.toFixed(4)), C: +st.meanC.toFixed(4), T: +st.temperature.toFixed(3),
    K: +st.contrast.toFixed(3), S: +st.chromaticShare.toFixed(3), sw: sw.map(s => [s.hex, +s.share.toFixed(3)]) };
}
export function signatureDistance(a, b) {
  let dL = 0, dH = 0; for (let i = 0; i < 8; i++) dL += Math.abs(a.L[i] - b.L[i]);
  for (let i = 0; i < 36; i++) { let m = 0; for (let k = -1; k <= 1; k++) m = Math.max(m, Math.min(a.H[i], b.H[(i + k + 36) % 36])); dH += m; }
  const colourWeight = Math.min(1, (a.S + b.S) * 2);
  return 0.45 * dL + colourWeight * 0.9 * (1 - dH) + 3 * Math.abs(a.C - b.C) + 0.35 * Math.abs(a.T - b.T) + 0.6 * Math.abs(a.K - b.K);
}

/** How sure a reading is, in words the panel can show. */
function readingConfidence(tones, pal, area) {
  const why = [];
  if (tones.readable < 0.2) why.push(`Only ${Math.round(tones.readable * 100)}% of the picture is lit enough to carry colour, so the colour reading rests on a small area.`);
  if (pal.confidence < 0.55) why.push('The palette sits between two structures.');
  const level = tones.readable < 0.12 ? 'low' : why.length ? 'medium' : 'high';
  return { level, why };
}

/** The full reading of a frame. `refs` is content/refs.json (frame signatures + readings). */
export function readFrame(frame, enc, refs) {
  const px = labPixels(frame), stats = frameStats(px), hist = hueHistogram(px, true), swatches = dominantColors(px);
  const { shares, tones } = hueShares(px, enc);
  const hues = Object.entries(shares).map(([id, share]) => ({ id, share, entry: enc.HUES.find(h => h.id === id) })).sort((a, b) => b.share - a.share);
  const pal = classifyPalette(stats, hist, swatches);
  const palEntry = enc.PALS.find(p => p.id === pal.id);
  const itten = ittenContrasts(stats, hist, swatches, pal);
  const sig = signature(px);
  let matches = [];
  if (refs && refs.frames) {
    matches = refs.frames.map(r => ({ ...r, d: signatureDistance(sig, r.sig) })).sort((a, b) => a.d - b.d).slice(0, 6)
      .map(r => ({ id: r.id, kind: r.kind, title: r.title, reading: r.reading, section: r.section, looks: r.looks || [], thumb: r.thumb, link: r.link, score: Math.max(0, 1 - r.d / 1.6) }));
  }
  const auteurs = [];
  for (const m of matches) if (m.kind === 'aut' && !auteurs.find(a => a.n === m.title)) { const a = enc.AUTS.find(x => x.n === m.title); if (a) auteurs.push(a); }
  const lead = hues.find(h => h.entry && !NEUTRAL_IDS.includes(h.id) && h.share >= 0.08) || null;
  const looks = [...new Set([...(lead ? lead.entry.looks : []), ...(palEntry ? palEntry.looks : []), ...matches.flatMap(m => m.looks)])].slice(0, 8);
  const confidence = readingConfidence(tones, pal, px.area);
  return { stats, swatches, hues, lead, tones, area: px.area, confidence, pal: { ...pal, entry: palEntry, reading: enc.PALI[pal.id] }, itten, narrative: [], matches, auteurs, looks, sig };
}
export const NEUTRAL_IDS = ['grey', 'black', 'white', 'bw'];

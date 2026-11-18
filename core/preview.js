// Fast previews of a look on the editor's own frame, inside the panel.
// The exact per-pixel pipeline (core/look.js) is baked into a small 3D LUT once per look, then applied to a
// preview-sized frame. Grain and vignette are approximated so their sliders visibly do something; halation and
// diffusion glow are spatial effects that only the real effect renders ("Try on clip").
import { makePixelFn, hasBoxedZones, zonePlace, ZONE_KEYS, ZONE_DEF, zoneList } from './look.js';
import { makeFrame, downsample } from './image.js';

const N = 25;
/** Bakes `fn` (rgb 0..1 -> rgb 0..1) into an N³ table. */
export function bakeTable(fn, n = N) {
  const t = new Float32Array(n * n * n * 3);
  for (let b = 0, o = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++, o += 3) {
    const c = fn([r / (n - 1), g / (n - 1), b / (n - 1)]); t[o] = c[0]; t[o + 1] = c[1]; t[o + 2] = c[2];
  }
  return { n, t };
}
function sample(tab, r, g, b, out) {
  const n = tab.n, t = tab.t, x = r * (n - 1), y = g * (n - 1), z = b * (n - 1);
  const x0 = Math.min(n - 2, x | 0), y0 = Math.min(n - 2, y | 0), z0 = Math.min(n - 2, z | 0), fx = x - x0, fy = y - y0, fz = z - z0;
  for (let c = 0; c < 3; c++) {
    const at = (i, j, k) => t[((k * n + j) * n + i) * 3 + c];
    const c00 = at(x0, y0, z0) + (at(x0 + 1, y0, z0) - at(x0, y0, z0)) * fx, c10 = at(x0, y0 + 1, z0) + (at(x0 + 1, y0 + 1, z0) - at(x0, y0 + 1, z0)) * fx;
    const c01 = at(x0, y0, z0 + 1) + (at(x0 + 1, y0, z0 + 1) - at(x0, y0, z0 + 1)) * fx, c11 = at(x0, y0 + 1, z0 + 1) + (at(x0 + 1, y0 + 1, z0 + 1) - at(x0, y0 + 1, z0 + 1)) * fx;
    out[c] = (c00 + (c10 - c00) * fy) + ((c01 + (c11 - c01) * fy) - (c00 + (c10 - c00) * fy)) * fz;
  }
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

/** Texture amounts for a look (approximate, for the preview only). */
export function textureOf(look, cat) {
  const M = (cat.medium[look.M] || {}).fx || {}, K = (cat.lens[look.K] || {}).fx || {}, G = look.G || {};
  return { grain: (M.grain || 0) * (G.grainK ?? 1), gsize: M.gsize || 1, vig: Math.min(1, ((M.vig || 0) + (K.vig || 0)) * (G.vigK ?? 1)) };
}

/** Applies a baked table (+ approximate texture) to a frame. */
export function applyTable(frame, tab, tex = { grain: 0, vig: 0, gsize: 1 }, fullWidth = 1920, exact = null) {
  const out = makeFrame(frame.w, frame.h), d = frame.data, o = out.data, c = [0, 0, 0];
  const scale = frame.w / fullWidth, gAmp = tex.grain * 2.2 * Math.sqrt(Math.min(1, tex.gsize * 0.6 / Math.max(scale, 0.05))) * 255; // grain averages out at preview size
  for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
    const i = (y * frame.w + x) * 4, u = (x + 0.5) / frame.w, v = (y + 0.5) / frame.h;
    // A colour zone with a place in the frame cannot live in a table (a table has no idea where a pixel is), so
    // pixels a boxed zone can reach go through the exact pipeline with their position; everything else uses the table.
    if (exact && exact.boxes.some(z => zonePlace(z, u, v) > 0)) { const r = exact.fn([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], u, v); c[0] = r[0]; c[1] = r[1]; c[2] = r[2]; }
    else sample(tab, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, c);
    let k = 1;
    if (tex.vig > 0) { const dx = (x + 0.5) / frame.w - 0.5, dy = ((y + 0.5) / frame.h - 0.5) * 0.8, v = Math.hypot(dx, dy) / 0.62, t = Math.min(1, Math.max(0, (v - 0.55) / 0.45)); k = 1 - tex.vig * t * t * (3 - 2 * t); }
    let gr = 0; if (gAmp > 0) { const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; gr = (hash(x, y) - 0.5) * gAmp * (0.55 + 1.6 * Y * (1 - Y)); }
    o[i] = c[0] * 255 * k + gr; o[i + 1] = c[1] * 255 * k + gr; o[i + 2] = c[2] * 255 * k + gr; o[i + 3] = 255;
  }
  return out;
}

/** Composites before | after at `pos` (0..1) with a thin divider; view = 'split' | 'before' | 'after'. */
export function wipe(before, after, pos = 0.5, view = 'split') {
  if (view === 'before') return before; if (view === 'after') return after;
  const out = makeFrame(before.w, before.h), cut = Math.round(pos * before.w);
  for (let y = 0; y < before.h; y++) for (let x = 0; x < before.w; x++) {
    const i = (y * before.w + x) * 4, src = x < cut ? before.data : after.data;
    if (Math.abs(x - cut) < 1) { out.data[i] = 255; out.data[i + 1] = 255; out.data[i + 2] = 255; out.data[i + 3] = 255; continue; }
    out.data[i] = src[i]; out.data[i + 1] = src[i + 1]; out.data[i + 2] = src[i + 2]; out.data[i + 3] = 255;
  }
  return out;
}

/**
 * A previewer bound to one frame. render(look, extra, input, size) -> Frame. Tables are cached per look, so
 * dragging the wipe or switching between directions is instant after the first render.
 */
export function previewer(frame, cat, getLuts) {
  const sizes = {}, cache = new Map();
  const base = size => sizes[size] || (sizes[size] = downsample(frame, size));
  return {
    before: size => base(size),
    async table(look, extra, input) {
      const key = JSON.stringify([look, extra, input]); let t = cache.get(key); if (t) return t;
      const fn = makePixelFn(look, cat, await getLuts(look), { input, keepExposure: true, extra });
      t = bakeTable(fn); if (cache.size > 40) cache.delete(cache.keys().next().value); cache.set(key, t); return t;
    },
    async render(look, extra, input, size = 640) {
      let exact = null;
      if (hasBoxedZones(extra)) {
        const boxes = zoneList().map(i => ZONE_KEYS.map((k, j) => extra[`z${i}${k}`] ?? ZONE_DEF[j])).filter(z => z[0] > 0 && z[12] > 0 && z[13] > 0);
        exact = { boxes, fn: makePixelFn(look, cat, await getLuts(look), { input, keepExposure: true, extra }) };
      }
      return applyTable(base(size), await this.table(look, extra, input), textureOf(look, cat), frame.w, exact);
    },
  };
}

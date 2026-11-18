// Places that follow the subject. A colour zone can be limited to a box in the frame (0.17.0), but the box is placed
// for the one frame that was read: when the boy walks, his vest leaves it. This follows each box through frames
// sampled across the shot, by matching what is inside it (its pattern of light and its colour), and returns where it
// is at each of those times so a host can keyframe the zone's place.
//
// Deliberately simple and honest: translation only (no rotation or scale), a search window around where the item was
// last seen, and a confidence for every step. When the match gets weak the track stops there instead of wandering
// off onto the background, and the caller is told how far it got.
import { srgbToOklab } from './color.js';
import { downsample } from './image.js';

export const TRACK_W = 192;          // frames are matched at this width
const MIN_SCORE = 0.7;               // below this the item is considered lost (a random background patch can reach ~0.5)

/** A frame reduced to three planes (OkLab L, a, b) at TRACK_W wide. Chroma is scaled up so colour counts as much as light. */
export function planes(frame) {
  const f = frame.w > TRACK_W ? downsample(frame, TRACK_W) : frame, n = f.w * f.h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = srgbToOklab(f.data[i * 4] / 255, f.data[i * 4 + 1] / 255, f.data[i * 4 + 2] / 255); L[i] = o[0]; A[i] = o[1] * 4; B[i] = o[2] * 4; }
  return { w: f.w, h: f.h, L, A, B };
}

/** The template: the core of the box (the outer 15% is likely to be background), as pixel coordinates and values. */
function template(p, box) {
  const x0 = Math.round((box.x0 + (box.x1 - box.x0) * 0.15) * p.w), x1 = Math.round((box.x1 - (box.x1 - box.x0) * 0.15) * p.w);
  const y0 = Math.round((box.y0 + (box.y1 - box.y0) * 0.15) * p.h), y1 = Math.round((box.y1 - (box.y1 - box.y0) * 0.15) * p.h);
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 900)));   // at most ~900 samples
  const pts = [];
  for (let y = Math.max(0, y0); y < Math.min(p.h, y1); y += step) for (let x = Math.max(0, x0); x < Math.min(p.w, x1); x += step) { const i = y * p.w + x; pts.push([x, y, p.L[i], p.A[i], p.B[i]]); }
  const mean = [2, 3, 4].map(k => pts.reduce((s, q) => s + q[k], 0) / Math.max(1, pts.length));
  let norm = 0; for (const q of pts) for (let k = 0; k < 3; k++) { q[k + 2] -= mean[k]; norm += q[k + 2] * q[k + 2]; }
  return { pts, norm: Math.sqrt(norm), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Normalised correlation of the template moved by (dx, dy) pixels in plane set q. 1 = identical pattern. */
function score(t, q, dx, dy) {
  let s = 0, m = [0, 0, 0], n = 0;
  const vals = [];
  for (const p of t.pts) { const x = p[0] + dx, y = p[1] + dy; if (x < 0 || y < 0 || x >= q.w || y >= q.h) return -1; const i = y * q.w + x; vals.push(q.L[i], q.A[i], q.B[i]); m[0] += q.L[i]; m[1] += q.A[i]; m[2] += q.B[i]; n++; }
  if (!n) return -1; m = m.map(v => v / n);
  let nq = 0;
  for (let j = 0; j < t.pts.length; j++) for (let k = 0; k < 3; k++) { const v = vals[j * 3 + k] - m[k]; s += t.pts[j][k + 2] * v; nq += v * v; }
  return t.norm > 1e-6 && nq > 1e-6 ? s / (t.norm * Math.sqrt(nq)) : -1;
}

/**
 * Where the box from frame `a` is in frame `b` (both from planes()). Searches a window around it, coarse then fine.
 * Returns { box, score, dx, dy } with the box in frame fractions.
 */
export function follow(a, b, box, opts = {}) {
  const t = template(a, box); if (t.pts.length < 12 || t.norm < 0.02) return { box, score: 0, dx: 0, dy: 0, flat: true };
  const rx = Math.round(Math.max((box.x1 - box.x0) * 0.6, opts.reach || 0.12) * a.w), ry = Math.round(Math.max((box.y1 - box.y0) * 0.6, opts.reach || 0.12) * a.h);
  let best = { s: -2, dx: 0, dy: 0 };
  for (let dy = -ry; dy <= ry; dy += 3) for (let dx = -rx; dx <= rx; dx += 3) { const s = score(t, b, dx, dy); if (s > best.s) best = { s, dx, dy }; }
  const c = best; for (let dy = c.dy - 2; dy <= c.dy + 2; dy++) for (let dx = c.dx - 2; dx <= c.dx + 2; dx++) { const s = score(t, b, dx, dy); if (s > best.s) best = { s, dx, dy }; }
  // sub-pixel: fit a parabola through the scores either side, so errors do not pile up a pixel per step
  const para = (m, z, pl) => { const d = m - 2 * z + pl; return Math.abs(d) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (m - pl) / d)) : 0; };
  const sx = para(score(t, b, best.dx - 1, best.dy), best.s, score(t, b, best.dx + 1, best.dy)), sy = para(score(t, b, best.dx, best.dy - 1), best.s, score(t, b, best.dx, best.dy + 1));
  const ux = (best.dx + sx) / a.w, uy = (best.dy + sy) / a.h;
  const clamp = v => Math.min(1, Math.max(0, v));
  return { box: { x0: clamp(box.x0 + ux), y0: clamp(box.y0 + uy), x1: clamp(box.x1 + ux), y1: clamp(box.y1 + uy) }, score: +best.s.toFixed(3), dx: ux, dy: uy };
}

/**
 * Follows `box` through `frames` (an array of { t, planes }, in time order) starting from index `from` (the frame the
 * box was drawn on), forwards and backwards. Returns { keys: [{ t, box, score }], lostAt: [t...] } where keys covers
 * only the times the item was found; after a weak match the track stops in that direction.
 */
export function trackBox(frames, from, box, opts = {}) {
  const keys = [{ t: frames[from].t, box, score: 1 }], lostAt = [], lostScore = [], min = opts.min ?? MIN_SCORE;
  for (const dir of [1, -1]) {
    let cur = box;
    for (let i = from + dir; i >= 0 && i < frames.length; i += dir) {
      const r = follow(frames[i - dir].planes, frames[i].planes, cur, opts);
      if (r.flat) { lostAt.push(frames[i].t); lostScore.push(null); break; }
      if (r.score < min) { lostAt.push(frames[i].t); lostScore.push(r.score); break; }
      cur = r.box; keys.push({ t: frames[i].t, box: cur, score: r.score });
    }
  }
  keys.sort((x, y) => x.t - y.t);
  return { keys, lostAt, lostScore };
}

/** Keyframes for a zone's place from a track: [{ t, X, Y }] (centre of the box; its size stays as it was). */
export const placeKeys = track => track.keys.map(k => ({ t: k.t, X: +((k.box.x0 + k.box.x1) / 2).toFixed(4), Y: +((k.box.y0 + k.box.y1) / 2).toFixed(4) }));

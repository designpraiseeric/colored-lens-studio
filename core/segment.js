// AI masks for colour zones. A box and a colour window cannot tell a woman's olive-brown camo from the golden-brown
// hair falling over it (seen 18 Nov on the forest shot), so a placed zone can also carry a segmentation mask of the
// item itself, from a model that can draw one (Gemini returns a box and a probability mask per thing it names).
//
// A mask lives in the frame's 0..1 coordinates: { box: {x0,y0,x1,y1}, w, h, a: Float32Array of 0..1 }. maskAt reads it
// with a soft edge. maskOutline turns it into a polygon, which is what travels to the effect on the clip.
import { decodeImage } from './image.js';

export const SEGMENT_SYSTEM = 'You are a precise image segmentation model. Answer with JSON only.';

/** The request: one mask per named item, in Gemini's documented segmentation format. */
export function buildSegment(labels) {
  const list = labels.map(l => `"${String(l).replace(/"/g, "'")}"`).join(', ');
  return `Give the segmentation masks for these items in the picture: ${list}. Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d" (as [ymin, xmin, ymax, xmax] on a 0-1000 scale), the segmentation mask in key "mask" (a base64 PNG of the box region), and the text label in the key "label", using exactly the item names given. Mask only the item itself: not hair, skin or other clothing that overlaps it.`;
}

/** Reads the model's answer into masks: [{ label, box, w, h, a }]. Entries that do not decode are dropped. */
export function parseSegments(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, ''), a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  let list; try { list = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    try {
      const bx = e && (e.box_2d || e.box); if (!Array.isArray(bx) || bx.length !== 4) continue;
      const [y0, x0, y1, x1] = bx.map(Number), sc = Math.max(...bx.map(Number)) > 1.5 ? 1000 : 1;
      const box = { x0: x0 / sc, y0: y0 / sc, x1: x1 / sc, y1: y1 / sc }; if (!(box.x1 > box.x0 && box.y1 > box.y0)) continue;
      const b64 = String(e.mask || '').replace(/^data:image\/\w+;base64,/, ''); if (!b64) continue;
      const img = decodeImage(b64ToBytes(b64)); const n = img.w * img.h, al = new Float32Array(n);
      for (let p = 0; p < n; p++) al[p] = img.data[p * 4] / 255;   // greyscale probability
      out.push({ label: String(e.label || ''), box, w: img.w, h: img.h, a: al });
    } catch { /* one bad mask does not spoil the rest */ }
  }
  return out;
}

function b64ToBytes(b64) {
  if (typeof atob === 'function') { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much of the item is at (u, v): the mask's probability, bilinear, with a soft edge around one half. */
export function maskAt(m, u, v) {
  if (!m || u == null || u < 0) return 0;
  const { box } = m; if (u < box.x0 || u > box.x1 || v < box.y0 || v > box.y1) return 0;
  const fx = (u - box.x0) / (box.x1 - box.x0) * m.w - 0.5, fy = (v - box.y0) / (box.y1 - box.y0) * m.h - 0.5;
  const x0 = Math.max(0, Math.min(m.w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(m.h - 1, Math.floor(fy)));
  const x1 = Math.min(m.w - 1, x0 + 1), y1 = Math.min(m.h - 1, y0 + 1), tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  const at = (x, y) => m.a[y * m.w + x];
  const p = (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  return smooth(0.3, 0.7, p);
}

/** Which label in `masks` belongs to an item name (exact first, then the best shared-word match). */
export function matchMask(masks, item) {
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const want = norm(item); let best = null, bs = 0;
  for (const m of masks) { if (m.label.toLowerCase() === String(item).toLowerCase()) return m;
    const have = new Set(norm(m.label)), sc = want.filter(w => have.has(w)).length / Math.max(1, want.length); if (sc > bs) { bs = sc; best = m; } }
  return bs >= 0.5 ? best : null;
}

/**
 * The mask's outline as a polygon in frame coordinates, at most `max` points: the largest region's boundary
 * (marching squares at 0.5), simplified. This is what goes to the effect on the clip.
 */
export function maskOutline(m, max = 32) {
  const W = m.w, H = m.h, on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.a[y * W + x] >= 0.5;
  // trace the outer boundary of the largest connected region (Moore neighbourhood)
  const seen = new Uint8Array(W * H); let bestStart = -1, bestSize = 0;
  for (let p = 0; p < W * H; p++) { if (seen[p] || m.a[p] < 0.5) continue; let size = 0; const st = [p]; seen[p] = 1;
    while (st.length) { const q = st.pop(); size++; const x = q % W, y = (q / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nq = ny * W + nx; if (on(nx, ny) && !seen[nq]) { seen[nq] = 1; st.push(nq); } } }
    if (size > bestSize) { bestSize = size; bestStart = p; } }
  if (bestStart < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  // flood the largest region again to mark it, so the tracer stays on it
  const mine = new Uint8Array(W * H); { const st = [bestStart]; mine[bestStart] = 1; while (st.length) { const q = st.pop(), x = q % W, y = (q / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nq = ny * W + nx; if (on(nx, ny) && !mine[nq]) { mine[nq] = 1; st.push(nq); } } } }
  const inR = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mine[y * W + x];
  const sx = bestStart % W, sy = (bestStart / W) | 0, pts = [[sx, sy]]; let cx = sx, cy = sy, back = 4;
  for (let guard = 0; guard < W * H * 4; guard++) {
    let moved = false;
    for (let k = 0; k < 8; k++) { const d = (back + 1 + k) % 8, nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (inR(nx, ny)) { cx = nx; cy = ny; back = (d + 4) % 8; moved = true; break; } }
    if (!moved || (cx === sx && cy === sy)) break; pts.push([cx, cy]);
  }
  // simplify (Ramer–Douglas–Peucker) until it fits in `max` points
  let eps = 0.5, poly = pts;
  const rdp = (P, e) => { if (P.length < 3) return P; const [a, b] = [P[0], P[P.length - 1]]; let id = 0, dm = 0;
    for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((b[1] - a[1]) * P[i][0] - (b[0] - a[0]) * P[i][1] + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); if (d > dm) { dm = d; id = i; } }
    return dm > e ? rdp(P.slice(0, id + 1), e).slice(0, -1).concat(rdp(P.slice(id), e)) : [a, b]; };
  while (true) { const half = Math.floor(pts.length / 2); poly = rdp(pts.slice(0, half + 1), eps).slice(0, -1).concat(rdp(pts.slice(half).concat([pts[0]]), eps).slice(0, -1)); if (poly.length <= max) break; eps *= 1.4; }
  const { box } = m;
  return poly.map(([x, y]) => ({ x: box.x0 + (x + 0.5) / W * (box.x1 - box.x0), y: box.y0 + (y + 0.5) / H * (box.y1 - box.y0) }));
}

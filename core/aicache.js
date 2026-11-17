// Remembering what the AI said about a shot.
//
// A study takes one to two minutes and suggestions another one to two. Reading the same shot again — after an
// undo, after a Premiere restart, a few frames later — used to pay all of it again. The AI's reading of a shot does
// not change because the playhead moved half a second, so it is kept, keyed by what the picture looks like (not by
// file names, which a nested sequence and a re-link both change) and by what the AI was asked to look at.
import { downsample } from './image.js';
import { srgbToOklab } from './color.js';

const W = 12;

/** A tiny lightness thumbnail: enough to tell one shot from another, blind to grain and small movement. */
export function fingerprint(frame) {
  const s = downsample(frame, W), L = [];
  for (let p = 0; p < s.w * s.h; p++) { const i = p * 4; L.push(Math.round(srgbToOklab(s.data[i] / 255, s.data[i + 1] / 255, s.data[i + 2] / 255)[0] * 255)); }
  return { w: s.w, h: s.h, L };
}

/** Mean lightness difference, 0–255. Same shot a second later: a few units. A different shot: tens. */
export function distance(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h || a.L.length !== b.L.length) return Infinity;
  let d = 0; for (let i = 0; i < a.L.length; i++) d += Math.abs(a.L[i] - b.L[i]); return d / a.L.length;
}

export const SAME_SHOT = 9, KEEP = 8;

/** Find the remembered reading for this picture under this scope, or null. */
export function lookup(list, fp, scope) {
  let best = null, bd = SAME_SHOT;
  for (const e of list || []) { if (e.scope !== scope) continue; const d = distance(e.fp, fp); if (d < bd) { bd = d; best = e; } }
  return best;
}

/** Store or replace an entry; newest first, at most KEEP. Returns the new list. */
export function remember(list, fp, scope, data, now = Date.now()) {
  const rest = (list || []).filter(e => !(e.scope === scope && distance(e.fp, fp) < SAME_SHOT));
  return [{ fp, scope, t: now, ...data }, ...rest].slice(0, KEEP);
}

/** "3 min ago", for the line that says a reading was restored. */
export function ago(t, now = Date.now()) {
  const m = Math.round((now - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 60 * 24 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

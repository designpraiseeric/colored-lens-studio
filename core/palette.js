/**
 * Palette structures as a working surface.
 *
 * The encyclopedia already holds ten palette structures, each with five swatches. Until now they were
 * something to read. This turns them into something to use: point at an item in the shot, point at a
 * swatch, and the colour zone that owns that item is retargeted to it. Or hand the whole structure to
 * several items at once and let it be dealt across them — then re-dealt, as often as you like.
 *
 * Two rules keep a deal from being a lottery:
 *   1. It is CONSTRAINED. A palette structure has roles: the most colourful swatch is an accent, and an
 *      accent on the largest surface in the frame is how a structure reads as a mistake. Area decides.
 *   2. It is SCORED. Every deal is measured by core/quality.js before it is offered, and one that damages
 *      the picture is thrown away rather than shown. Otherwise the user does the filtering, every time.
 */
import { srgbToOklab, toLCh } from './color.js';
import { ZONES } from './look.js';

const hex2rgb = h => { const s = String(h || '').replace('#', ''); const v = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return Number.isFinite(v) ? [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] : null; };

/** OkLCh of a hex, or null. */
export function lchOf(hex) { const r = hex2rgb(hex); if (!r) return null; const [L, C, h] = toLCh(srgbToOklab(...r)); return { L, C, h }; }

/** The encyclopedia's palette structures, in the shape the panel needs. */
export function structures(enc) {
  const list = (enc && enc.PALS) || [];
  return list.map(p => ({ id: p.id, name: p.n, about: p.t || '', pal: (p.pal || []).filter(Boolean) })).filter(p => p.pal.length >= 2);
}

/**
 * The accent of a structure, or null if it has none.
 * A swatch is only an accent if it is genuinely colourful AND clearly more so than the rest — otherwise
 * every swatch in a saturated structure is an "accent" and the rule stops meaning anything.
 */
export function accentOf(sw) {
  if (sw.length < 2) return null;
  const sorted = sw.slice().sort((a, b) => b.C - a.C);
  return sorted[0].C > 0.02 && sorted[0].C >= sorted[1].C * 1.25 ? sorted[0] : null;
}

/** A small seeded generator, so a deal the user liked can be returned to by its number. */
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * The items a deal can be dealt to: every live colour zone, with how much of the frame it reaches.
 * `cov` is zoneCoverage()'s output; without it every item is treated as the same size.
 */
export function zoneItems(extra, cov = [], names = {}) {
  const out = [];
  for (let i = 1; i <= ZONES; i++) {
    if (!(extra[`z${i}Amt`] > 0)) continue;
    const c = cov.find(x => x.zone === i);
    out.push({ zone: i, name: names[i] || `Zone ${i}`, area: c ? c.share : 0,
      toHue: extra[`z${i}ToHue`] || 0, toC: extra[`z${i}ToC`] || 0 });
  }
  return out;
}

/**
 * Deal a structure's swatches across items.
 *
 * Constraint: the most colourful swatch is the accent, and it never lands on the largest item unless
 * there is nothing else it could land on. Everything else is shuffled.
 * Returns [{ zone, hex, role }] — one per item, swatches reused when there are more items than swatches.
 */
export function dealPalette(items, pal, seed = 1) {
  if (!items.length || !pal.length) return [];
  const rand = rng(seed);
  const sw = pal.map(hex => ({ hex, ...(lchOf(hex) || { L: 0.5, C: 0, h: 0 }) }));
  const accent = accentOf(sw);
  const byArea = items.slice().sort((a, b) => b.area - a.area);

  // Build a pool big enough for every item. Each batch is shuffled BEFORE it is added: taking the
  // structure's swatches in order and then truncating meant that with two items only the first two
  // swatches of a five-colour structure could ever appear, and the other three were unreachable.
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pool = [];
  while (pool.length < items.length) pool.push(...shuffle(sw.slice()));
  pool.length = items.length;
  shuffle(pool);

  // byArea[0] is the largest surface in the frame, byArea[last] the smallest.
  const deal = byArea.map((it, i) => ({ zone: it.zone, swatch: pool[i] }));
  // The accent belongs on the smallest surface, never the largest. One swap is all it takes.
  // A structure with no accent (Monochromatic, a row of greys) gets no swap: inventing one out of
  // floating-point dust would make every deal identical and the reroll button a lie.
  if (accent && deal.length > 1 && deal[0].swatch.hex === accent.hex) {
    const last = deal[deal.length - 1], t = deal[0].swatch;
    deal[0].swatch = last.swatch; last.swatch = t;
  }
  return deal.map(d => ({ zone: d.zone, hex: d.swatch.hex,
    role: accent && d.swatch.hex === accent.hex ? 'accent' : d.swatch.L >= 0.75 ? 'light' : d.swatch.L <= 0.35 ? 'deep' : 'body' }));
}

/** Write a deal into an `extra` object, leaving everything else as it was. */
export function applyDeal(extra, deal) {
  const out = { ...extra };
  for (const d of deal) { const c = lchOf(d.hex); if (!c) continue;
    out[`z${d.zone}ToHue`] = +c.h.toFixed(2); out[`z${d.zone}ToC`] = +c.C.toFixed(4); }
  return out;
}

/** Retarget one zone to one colour — the single-item eyedrop. */
export function assign(extra, zone, hex) { return applyDeal(extra, [{ zone, hex }]); }

/**
 * Deal, score, and keep the ones worth showing.
 *
 * `score(extra)` must return { faults, suits } for a candidate — the caller owns rendering, because only
 * it knows the look, the LUTs and the frame. Deals that carry faults are dropped; if every deal is faulty
 * the least-faulty is returned anyway, flagged, because showing nothing is worse than showing a caveat.
 */
export function bestDeal(items, pal, score, opts = {}) {
  const tries = opts.tries || 6, from = opts.seed || 1;
  const key = d => d.map(x => `${x.zone}:${x.hex}`).join('|');
  const avoid = opts.avoid && opts.avoid.length ? key(opts.avoid) : '';
  let best = null, sawAvoided = false;
  for (let i = 0; i < tries; i++) {
    const seed = from + i, deal = dealPalette(items, pal, seed);
    if (!deal.length) break;
    // A reroll that hands back the deal already on screen reads as a broken button.
    if (avoid && key(deal) === avoid) { sawAvoided = true; continue; }
    let r; try { r = score(deal) || {}; } catch { r = { faults: [], suits: true }; }
    const n = (r.faults || []).length, cand = { deal, seed, faults: r.faults || [], suits: r.suits !== false, clean: n === 0 && r.suits !== false };
    if (cand.clean) return cand;
    if (!best || n < best.faults.length) best = cand;
  }
  // Every seed gave back the deal already showing — few items and few swatches leave little room, and
  // saying so is better than pretending the button did something.
  if (!best && sawAvoided) return { deal: opts.avoid, seed: from, faults: [], suits: true, clean: true, exhausted: true };
  return best || { deal: [], seed: from, faults: [], suits: true, clean: true };
}

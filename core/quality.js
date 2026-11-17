// What a grade did to a picture, judged the way a colourist would judge it at full size.
//
// This exists because of a real failure on 17 Nov 2026. Five AI suggestions were put in front of the founder and
// measured by mean lightness on the subject's cheek; two of them "improved" it, and both were in fact clipping her
// forehead to white and dragging her skin off the skin-tone line. A mean is the wrong instrument: it rises just as
// happily when the highlights blow. So nothing here looks at an average.
//
// The face is the first thing to protect but it is not the only thing. A grade is also wrong when it destroys
// detail anywhere in the frame, twists hues by clipping a channel, combs the histogram into banding, flattens the
// picture, or amplifies the blocking in a compressed source. That last one is the standard for poor footage: a weak
// source sets a ceiling on what is obtainable, and the plugin's job is to reach that ceiling, never to go below it.
import { srgbToOklab } from './color.js';
import { downsample } from './image.js';
import { checkSkin, SKIN } from './skin.js';

const BLOWN = 0.88, CRUSHED = 0.06;

const lchAt = (d, i) => { const lab = srgbToOklab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
  let h = Math.atan2(lab[2], lab[1]) * 57.29578; if (h < 0) h += 360; return [lab[0], Math.hypot(lab[1], lab[2]), h]; };
const hueGap = (a, b) => { if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return 0;
  const d = Math.abs(a - b); return d > 180 ? 360 - d : d; };

/** Lightness percentiles, what is blown or crushed, and the mean colour of whatever is actually coloured. */
function stats(f, pick) {
  const L = [], C = []; let hx = 0, hy = 0;
  for (let p = 0; p < f.w * f.h; p++) { if (pick && !pick(p)) continue;
    const [l, c, h] = lchAt(f.data, p * 4); L.push(l); C.push(c);
    if (c > 0.02) { const r = h * 0.01745329; hx += Math.cos(r) * c; hy += Math.sin(r) * c; } }
  if (!L.length) return null;
  L.sort((a, b) => a - b);
  const at = q => L[Math.min(L.length - 1, Math.floor(L.length * q))];
  let hue = (hx || hy) ? Math.atan2(hy, hx) * 57.29578 : null; if (hue !== null && hue < 0) hue += 360;
  return { n: L.length, p1: at(0.01), p10: at(0.1), p50: at(0.5), p90: at(0.9), p99: at(0.99),
    blown: L.filter(x => x > BLOWN).length / L.length, crushed: L.filter(x => x < CRUSHED).length / L.length,
    chroma: C.reduce((a, b) => a + b, 0) / C.length, hue };
}

/** The lightness plane, plus where the picture is flat enough that any texture in it is noise or blocking. */
function planes(f) {
  const L = new Float32Array(f.w * f.h);
  for (let p = 0; p < L.length; p++) L[p] = lchAt(f.data, p * 4)[0];
  return L;
}
/** Mean absolute second difference: how much local detail the picture carries. */
function detail(L, w, h, pick) {
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = y * w + x; if (pick && !pick(p)) continue;
    s += Math.abs(4 * L[p] - L[p - 1] - L[p + 1] - L[p - w] - L[p + w]); n++; }
  return n ? s / n : 0;
}
/** How many of the 256 levels the picture actually occupies: a combed histogram is banding waiting to happen. */
function levels(f) {
  const seen = new Uint8Array(256); let lo = 255, hi = 0;
  for (let p = 0; p < f.w * f.h; p++) { const i = p * 4;
    const y = Math.round(0.2126 * f.data[i] + 0.7152 * f.data[i + 1] + 0.0722 * f.data[i + 2]);
    seen[y] = 1; if (y < lo) lo = y; if (y > hi) hi = y; }
  let used = 0; for (let v = lo; v <= hi; v++) if (seen[v]) used++;
  return hi > lo ? used / (hi - lo + 1) : 1;
}
/** Any channel pinned at the ceiling or the floor: where hues twist because one primary ran out of room. */
function pinned(f) {
  let hi = 0, lo = 0;
  for (let p = 0; p < f.w * f.h; p++) { const i = p * 4;
    if (f.data[i] >= 254 || f.data[i + 1] >= 254 || f.data[i + 2] >= 254) hi++;
    else if (f.data[i] <= 1 || f.data[i + 1] <= 1 || f.data[i + 2] <= 1) lo++; }
  return { hi: hi / (f.w * f.h), lo: lo / (f.w * f.h) };
}
/**
 * Detail the grade destroyed, wherever it sits on the curve.
 * Two neighbours the source could tell apart that the output cannot are information that is gone for good — and
 * unlike "crushed to black", this says nothing about whether a look is dark or bright, so a low-key look and a
 * high-key one are held to the same standard. This is the measure that no style excuses.
 */
function lostDetail(sL, oL, w, h, pick) {
  let had = 0, lost = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x;
    if (pick && !(pick(p) && pick(p + 1))) continue;
    if (Math.abs(sL[p] - sL[p + 1]) <= 0.012) continue; had++;
    if (Math.abs(oL[p] - oL[p + 1]) < 0.0025) lost++; }
  return had > (pick ? 60 : 200) ? lost / had : 0;
}

/**
 * Compare a graded frame against the one it came from. `src` and `out` must be the same size.
 * Returns the face report when a face is found, the whole-picture report, and what changed between them.
 */
export function gradeReport(src, out, opts = {}) {
  const shrink = f => (f.w > 240 ? downsample(f, 240) : f);
  // `tonal` is the same look with its grain and texture turned off. Measuring noise and detail on a grainy render
  // cannot tell grain the look added on purpose from blocking it amplified out of a weak source.
  const s = shrink(src), o = shrink(out), t = shrink(opts.tonal || out);
  const skin = opts.skin || checkSkin(src);
  // The face is taken from the lead region's own box on the SOURCE, so both sides are judged on the same pixels.
  const face = new Set();
  const lead = skin && skin.faces && skin.faces.length ? skin.faces[Math.max(0, Math.min(skin.lead || 0, skin.faces.length - 1))] : null;
  if (lead && lead.box) { const [x0, y0, x1, y1] = lead.box;
    for (let y = Math.floor(y0 * s.h); y < Math.ceil(y1 * s.h); y++) for (let x = Math.floor(x0 * s.w); x < Math.ceil(x1 * s.w); x++) {
      const p = y * s.w + x; if (p < 0 || p >= s.w * s.h) continue; const [l, c, hh] = lchAt(s.data, p * 4);
      if (c >= SKIN.cLo && c <= SKIN.cHi && hh >= SKIN.hueLo && hh <= SKIN.hueHi && l >= SKIN.lLo && l <= SKIN.lHi) face.add(p); } }
  const hasFace = face.size > s.w * s.h * 0.004;
  const inFace = hasFace ? p => face.has(p) : null, offFace = hasFace ? p => !face.has(p) : null;

  const sL = planes(s), oL = planes(o), tL = planes(t);
  // "Flat" is decided on the source: wherever the source carries no real detail, new texture there is noise.
  const flat = new Set(); const dAll = detail(sL, s.w, s.h, null);
  for (let y = 1; y < s.h - 1; y++) for (let x = 1; x < s.w - 1; x++) { const p = y * s.w + x;
    if (Math.abs(4 * sL[p] - sL[p - 1] - sL[p + 1] - sL[p - s.w] - sL[p + s.w]) < dAll * 0.35) flat.add(p); }
  const inFlat = p => flat.has(p);

  const r = {
    face: hasFace ? { before: stats(s, inFace), after: stats(o, inFace) } : null,
    picture: { before: stats(s, null), after: stats(o, null) },
    back: hasFace ? { before: stats(s, offFace), after: stats(o, offFace) } : null,
  };
  // whole picture
  r.blownAdded = r.picture.after.blown - r.picture.before.blown;
  r.crushedAdded = r.picture.after.crushed - r.picture.before.crushed;
  { const a = pinned(s), b = pinned(o);
    // On a picture that is already mostly at the ceiling there is little left to protect, so the measure is scaled
    // by the room the source still had. Otherwise every warm push on a high-key frame reads as a catastrophe.
    r.pinnedHighAdded = (b.hi - a.hi) * Math.max(0, 1 - a.hi * 2); r.pinnedLowAdded = b.lo - a.lo; }
  r.lostDetail = lostDetail(sL, tL, s.w, s.h);
  r.detailRatio = detail(sL, s.w, s.h, null) > 0 ? detail(tL, t.w, t.h, null) / detail(sL, s.w, s.h, null) : 1;
  r.flatNoiseRatio = flat.size > 50 && detail(sL, s.w, s.h, inFlat) > 1e-5
    ? detail(tL, t.w, t.h, inFlat) / detail(sL, s.w, s.h, inFlat) : 1;
  r.grainAdded = flat.size > 50 && detail(tL, t.w, t.h, inFlat) > 1e-6
    ? detail(oL, o.w, o.h, inFlat) / detail(tL, t.w, t.h, inFlat) : 1;
  r.levelsBefore = levels(s); r.levelsAfter = levels(o);
  r.rangeBefore = r.picture.before.p99 - r.picture.before.p1;
  r.rangeAfter = r.picture.after.p99 - r.picture.after.p1;
  // neutrals that were grey in the source and came back wearing a colour
  { let n = 0, gained = 0;
    for (let p = 0; p < s.w * s.h; p++) { const a = lchAt(s.data, p * 4); if (a[1] > 0.02) continue;
      n++; gained += Math.max(0, lchAt(o.data, p * 4)[1] - a[1]); }
    r.neutralCast = n > s.w * s.h * 0.01 ? gained / n : 0; }
  // the face
  if (r.face) {
    r.faceBlownAdded = r.face.after.blown - r.face.before.blown;
    r.faceCrushedAdded = r.face.after.crushed - r.face.before.crushed;
    r.faceShadowLift = r.face.after.p10 - r.face.before.p10;
    r.faceHighlightLift = r.face.after.p90 - r.face.before.p90;
    r.faceDetailRatio = detail(sL, s.w, s.h, inFace) > 1e-6 ? detail(tL, t.w, t.h, inFace) / detail(sL, s.w, s.h, inFace) : 1;
    r.faceLostDetail = lostDetail(sL, tL, s.w, s.h, inFace);
    r.skinHueShift = hueGap(r.face.after.hue, r.face.before.hue);
    r.skinChroma = r.face.after.chroma;
    // A lift that lands on the highlights is not a lift, it is clipping with extra steps.
    r.liftBalance = r.faceHighlightLift > 0.01 ? r.faceShadowLift / r.faceHighlightLift : null;
    if (r.back) r.separationChange = (r.back.after.p50 - r.face.after.p50) - (r.back.before.p50 - r.face.before.p50);
  }
  return r;
}

/** What a look has to clear before it is fit to put in front of an editor. */
export const BAR = {
  // the subject — nothing excuses these
  faceBlownAdded: 0.02, faceCrushedAdded: 0.03, faceLostDetail: 0.12, skinHueShift: 12, skinChroma: 0.17,
  liftBalance: 0.45, faceDetailRatio: 0.72,
  // the rest of the picture
  lostDetail: 0.16,         // information a style cannot give back
  blownAdded: 0.05, crushedAdded: 0.10,
  pinnedHighAdded: 0.10,    // a channel running out of room at the top, where the source still had detail
  // (pinning at the BOTTOM is not listed: it is what saturation does to dark colour, and where it actually costs
  //  anything the loss already shows up in lostDetail. Counting it again was punishing looks twice for one thing.)
  detailRatio: 0.70,        // below this the picture has been flattened
  flatNoiseRatio: 2.6,      // the grade amplifying the source's own noise and blocking, grain excluded
  grainAdded: 4.5,          // and the grain it adds on purpose, which is allowed but not without limit
  levelsDrop: 0.22,         // losing this much of the occupied levels is banding
  rangeDrop: 0.25,          // the usable tonal range collapsing
  neutralCast: 0.035,       // greys picking up a colour nobody asked for
};

/**
 * What a look is allowed to do on purpose. Each one relaxes exactly one axis and nothing else, so a look that
 * declares itself monochrome still has to keep the face's detail, and a look built on deep blacks still has to
 * leave something in the shadows of a face.
 *   mono   skin has no hue to hold, and neutrals are tinted by definition
 *   tint   the greys are meant to carry a colour
 *   soft   diffusion is the point, so local detail is meant to drop
 *   crush  deep blacks are the point, in the picture — never in the subject's face
 *   grain  the look adds its own texture, so flat-area noise is not the grade amplifying the source
 */
export const ALLOWS = ['mono', 'tint', 'soft', 'crush', 'grain'];

/**
 * Everything wrong with a grade, in plain words, worst first. An empty list means it is fit to show.
 * `claims` holds a suggestion to its own promises; `intent` excuses the ones a look is allowed to make on purpose
 * (`{ tint: true }` for a look whose whole point is a colour wash, `{ soft: true }` for diffusion).
 */
export function faults(r, opts = {}) {
  const bar = { ...BAR, ...(opts.bar || {}) }, out = [];
  const may = new Set(opts.allows || []);
  const pc = x => `${(x * 100).toFixed(1)}%`;
  const add = (id, weight, say) => out.push({ id, weight, say });

  if (r.face) {
    if (r.faceBlownAdded > bar.faceBlownAdded) add('face-blown', 4, `blows ${pc(r.faceBlownAdded)} more of the face to white`);
    if (r.faceCrushedAdded > bar.faceCrushedAdded) add('face-crushed', 4, `crushes ${pc(r.faceCrushedAdded)} more of the face to black`);
    if (r.faceLostDetail > bar.faceLostDetail) add('face-detail-lost', 4, `loses ${pc(r.faceLostDetail)} of the detail the face had`);
    if (!may.has('mono') && r.skinHueShift > bar.skinHueShift) add('skin-hue', 4, `swings skin ${r.skinHueShift.toFixed(0)}° off the skin-tone line`);
    if (r.skinChroma > bar.skinChroma) add('skin-chroma', 3, `leaves skin at ${r.skinChroma.toFixed(3)} colourfulness, past what skin reads as`);
    if (!may.has('soft') && r.faceDetailRatio < bar.faceDetailRatio) add('face-flat', 3, `takes ${pc(1 - r.faceDetailRatio)} of the modelling out of the face`);
    if (r.liftBalance !== null && r.liftBalance < bar.liftBalance && r.faceHighlightLift > 0.04)
      add('top-heavy', 3, `brightens the face from the top end (${r.faceShadowLift.toFixed(3)} in the shadows against ${r.faceHighlightLift.toFixed(3)} in the highlights)`);
  }
  if (r.lostDetail > bar.lostDetail) add('detail-lost', 4, `loses ${pc(r.lostDetail)} of the detail the source had`);
  if (r.blownAdded > bar.blownAdded) add('picture-blown', 3, `blows ${pc(r.blownAdded)} more of the picture to white`);
  if (!may.has('crush') && r.crushedAdded > bar.crushedAdded) add('picture-crushed', 3, `crushes ${pc(r.crushedAdded)} more of the picture to black`);
  if (r.pinnedHighAdded > bar.pinnedHighAdded) add('channel-clip-high', 3, `pins a channel at the top on ${pc(r.pinnedHighAdded)} more of the picture, which twists the hues there`);
  if (!may.has('soft') && r.detailRatio < bar.detailRatio) add('flat', 3, `flattens the picture, losing ${pc(1 - r.detailRatio)} of its local detail`);
  if (!may.has('grain') && r.flatNoiseRatio > bar.flatNoiseRatio) add('noise-up', 2, `amplifies the source's own grain and blocking ${r.flatNoiseRatio.toFixed(1)}× in the flat areas`);
  if (r.grainAdded > bar.grainAdded) add('grain-heavy', 2, `lays grain ${r.grainAdded.toFixed(1)}× over the flat areas, past what the picture can carry`);
  if (!may.has('soft') && r.levelsBefore - r.levelsAfter > bar.levelsDrop) add('banding', 3, `combs the histogram (${pc(r.levelsBefore)} of levels used down to ${pc(r.levelsAfter)}), which bands on a gradient`);
  if (!may.has('soft') && r.rangeBefore - r.rangeAfter > bar.rangeDrop) add('range-collapse', 2, `collapses the tonal range from ${r.rangeBefore.toFixed(2)} to ${r.rangeAfter.toFixed(2)}`);
  if (!may.has('tint') && !may.has('mono') && r.neutralCast > bar.neutralCast) add('neutral-cast', 2, `puts a colour cast on the greys (${r.neutralCast.toFixed(3)} where they had none)`);

  if (opts.claims) {
    const c = opts.claims;
    if (c.brightensFace && r.face && r.faceShadowLift < 0.01 && r.face.after.p50 <= r.face.before.p50)
      add('broken-promise', 4, 'says it brightens the face and does not');
    if (c.focusesFace && (r.separationChange || 0) > 0.01)
      add('broken-promise', 4, 'says it centres attention on the face and pushes the background further ahead of it');
    if (c.cleansCast && r.neutralCast > bar.neutralCast)
      add('broken-promise', 4, 'says it cleans the cast off the neutrals and leaves one there');
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** One line an editor can read, or null when there is nothing to say. */
export const verdict = f => f.length ? `Not fit to show: it ${f.map(x => x.say).join('; ')}.` : null;

/** The headline numbers, for a report or a handoff note. */
export const summarise = r => ({
  face: r.face ? { blownAdded: +r.faceBlownAdded.toFixed(4), shadowLift: +r.faceShadowLift.toFixed(3),
    highlightLift: +r.faceHighlightLift.toFixed(3), skinHueShift: +r.skinHueShift.toFixed(1),
    skinChroma: +r.skinChroma.toFixed(3), detail: +r.faceDetailRatio.toFixed(2), lostDetail: +r.faceLostDetail.toFixed(3) } : null,
  picture: { lostDetail: +r.lostDetail.toFixed(3), blownAdded: +r.blownAdded.toFixed(4), crushedAdded: +r.crushedAdded.toFixed(4),
    pinnedHigh: +r.pinnedHighAdded.toFixed(3), pinnedLow: +r.pinnedLowAdded.toFixed(3), detail: +r.detailRatio.toFixed(2),
    flatNoise: +r.flatNoiseRatio.toFixed(2), grain: +r.grainAdded.toFixed(2), levels: +r.levelsAfter.toFixed(2),
    range: +r.rangeAfter.toFixed(2), neutralCast: +r.neutralCast.toFixed(3) },
});

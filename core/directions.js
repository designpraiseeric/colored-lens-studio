// Directions: from "what is this shot for?" + what the frame already is, to a handful of concrete, previewable
// recipes. A recipe = a palette structure (the encyclopedia), a colour configuration (grade) and a Lukuluku
// configuration (lens, diffusion, colour science, medium), plus the reasons it was suggested.
// Everything here is rules: free, offline, instant and repeatable. The encyclopedia supplies the meanings.
import { fullGrade } from './look.js';
import { srgbToOklab, toLCh, hueDist, oklabToSrgb } from './color.js';
import { NEUTRAL_IDS } from './analysis.js';

export const GENRES = [
  { id: 'drama', n: 'Drama / film' }, { id: 'thriller', n: 'Thriller / horror' }, { id: 'commercial', n: 'Commercial / brand' },
  { id: 'music', n: 'Music video' }, { id: 'doc', n: 'Documentary' }, { id: 'explainer', n: 'Explainer / corporate' }, { id: 'social', n: 'Social / short-form' },
];
export const FEELINGS = [
  { id: 'tense', n: 'Tense' }, { id: 'menacing', n: 'Menacing' }, { id: 'melancholy', n: 'Melancholy' }, { id: 'lonely', n: 'Lonely' },
  { id: 'tender', n: 'Tender / intimate' }, { id: 'nostalgic', n: 'Nostalgic' }, { id: 'joyful', n: 'Joyful' }, { id: 'energetic', n: 'Energetic' },
  { id: 'hopeful', n: 'Hopeful' }, { id: 'dreamlike', n: 'Dreamlike' }, { id: 'mysterious', n: 'Mysterious' }, { id: 'clinical', n: 'Cold / clinical' },
  { id: 'gritty', n: 'Raw / gritty' }, { id: 'luxurious', n: 'Luxurious' }, { id: 'natural', n: 'Natural / true to life' },
];
export const ROLES = [
  { id: 'place', n: 'Establishing / place' }, { id: 'face', n: 'Face / character' }, { id: 'dialogue', n: 'Dialogue' },
  { id: 'product', n: 'Product / hero object' }, { id: 'action', n: 'Action / movement' }, { id: 'graphic', n: 'Title / screen / graphic' },
];
export const DARK_FEELINGS = ['tense', 'menacing', 'melancholy', 'lonely', 'mysterious'];
/** Every answer can hold up to two choices, primary first. Older saved answers were single strings. */
export const answers = v => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean).slice(0, 2);
export const isDark = intent => answers(intent.feeling).some(f => DARK_FEELINGS.includes(f)) && !answers(intent.feeling).some(f => ['joyful', 'energetic', 'hopeful'].includes(f));
const label = (list, id) => (list.find(x => x.id === id) || {}).n || '';

// The recipe library. `feel` = feelings it serves; `hues` = encyclopedia hues it leans on; `pal` = palette structure.
// `bold` recipes are strong period/stylised looks (penalised for documentary and corporate work).
export const RECIPES = [
  { id: 'cold-steel', name: 'Cold steel', feel: ['tense', 'clinical', 'lonely'], hues: ['blue', 'teal'], pal: 'pal-mono', look: { K: 'K0', D: 'D0', C: 'C13', M: 'M2' }, G: { con: 1.12, sat: 0.82, temp: -0.12, sh: -0.12 }, allows: ['crush'], line: 'Cool, hard and drained: tension through distance.' },
  { id: 'fluorescent-dread', name: 'Fluorescent dread', feel: ['tense', 'menacing', 'mysterious'], hues: ['green', 'teal'], pal: 'pal-analog', look: { K: 'K0', D: 'D0', C: 'C6', M: 'M6' }, G: { con: 1.1, sat: 0.85 }, bold: true, allows: ['crush', 'tint'], line: 'The sick green of strip lights: something is wrong in this room.' },
  { id: 'silver-edge', name: 'Silver edge', feel: ['tense', 'gritty'], hues: ['grey'], pal: 'pal-achro', look: { K: 'K0', D: 'D0', C: 'C2', M: 'M6' }, G: { con: 1.08 }, allows: ['crush'], line: 'Bleach bypass: silvery, harsh, no comfort in the colour.' },
  { id: 'blood-and-shadow', name: 'Blood and shadow', feel: ['menacing', 'tense'], hues: ['red', 'black'], pal: 'pal-accent', look: { K: 'K0', D: 'D0', C: 'C9', M: 'M6' }, G: { exp: -0.25, con: 1.15, sh: -0.2, sat: 0.95 }, bold: true, allows: ['crush', 'tint'], line: 'Deep blacks with red left alive: danger as the only colour that speaks.' },
  { id: 'false-night', name: 'False night', feel: ['menacing', 'mysterious', 'lonely'], hues: ['blue'], pal: 'pal-mono', look: { K: 'K0', D: 'D0', C: 'C16', M: 'M2' }, G: {}, bold: true, allows: ['crush', 'tint'], line: 'Day-for-night: underexposed blue, the world after dark.' },
  { id: 'nordic-grey', name: 'Nordic grey', feel: ['melancholy', 'lonely', 'clinical'], hues: ['blue', 'grey'], pal: 'pal-achro', look: { K: 'K0', D: 'D1', C: 'C13', M: 'M2' }, G: { sat: 0.75, temp: -0.15, bk: 0.05 }, allows: ['tint'], line: 'Desaturated and cool with lifted blacks: grief that has settled in.' },
  { id: 'faded-eterna', name: 'Faded Eterna', feel: ['melancholy', 'natural', 'lonely'], hues: ['teal', 'green'], pal: 'pal-analog', look: { K: 'K0', D: 'D1', C: 'C11', M: 'M2' }, G: { sat: 0.85, con: 0.94 }, line: 'Low contrast, cool shadows, greens toward cyan: quiet and unresolved.' },
  { id: 'warm-print', name: 'Warm print', feel: ['tender', 'nostalgic', 'hopeful'], hues: ['amber', 'orange'], pal: 'pal-analog', look: { K: 'K0', D: 'D1', C: 'C1', M: 'M2' }, G: { temp: 0.12 }, line: 'Kodak print warmth and dense blacks: closeness, memory, home.' },
  { id: 'glow-close', name: 'Glow close-up', feel: ['tender', 'dreamlike', 'luxurious'], hues: ['pink', 'orange'], pal: 'pal-analog', look: { K: 'K0', D: 'D4', C: 'C1', M: 'M1' }, G: { temp: 0.08, hi: -0.12 }, skin: 0.6, allows: ['soft'], line: 'A glamour-net glow on skin: the classic star close-up, soft and adored.' },
  { id: 'technicolor', name: 'Technicolor joy', feel: ['joyful', 'energetic', 'hopeful'], hues: ['red', 'yellow', 'blue'], pal: 'pal-triad', look: { K: 'K0', D: 'D0', C: 'C3', M: 'M1' }, G: { sat: 1.1 }, bold: true, line: 'Separated, saturated primaries: a world in full voice.' },
  { id: 'giallo-pop', name: 'Pop primaries', feel: ['energetic', 'joyful'], hues: ['red', 'blue', 'green'], pal: 'pal-comp', look: { K: 'K0', D: 'D0', C: 'C9', M: 'M0' }, G: { sat: 1.08, con: 1.08 }, bold: true, allows: ['crush'], line: 'Strong reds, blues and greens on deep blacks: loud and confident.' },
  { id: 'clean-vivid', name: 'Clean and vivid', feel: ['joyful', 'energetic', 'hopeful', 'natural'], hues: [], pal: 'pal-analog', look: { K: 'K0', D: 'D0', C: 'C0', M: 'M0' }, G: { sat: 1.12, vib: 0.3, con: 1.05 }, line: 'No film character at all, just clean, lively colour that sells.' },
  { id: 'blockbuster', name: 'Teal and orange', feel: ['energetic', 'tense', 'luxurious'], hues: ['teal', 'orange'], pal: 'pal-comp', look: { K: 'K0', D: 'D0', C: 'C5', M: 'M2' }, G: { con: 1.06 }, skin: 0.5, allows: ['crush'], line: 'Warm skin against teal shadows: scale, polish, momentum.' },
  { id: 'amber-memory', name: 'Amber memory', feel: ['nostalgic', 'melancholy', 'dreamlike'], hues: ['amber'], pal: 'pal-mono', look: { K: 'K1', D: 'D1', C: 'C8', M: 'M3' }, G: { lutMix: 0.7 }, bold: true, allows: ['tint', 'grain'], line: 'Hues collapse toward amber, with 16 mm texture: this already happened.' },
  { id: 'super8-summer', name: 'Super 8 summer', feel: ['nostalgic', 'joyful', 'tender'], hues: ['orange', 'yellow'], pal: 'pal-analog', look: { K: 'K1', D: 'D0', C: 'C1', M: 'M4' }, G: { temp: 0.15 }, bold: true, allows: ['tint', 'grain'], line: 'Coarse grain, warm gate, soft edges: the home movie of a good year.' },
  { id: 'silent-tint', name: 'Silent-era tint', feel: ['nostalgic', 'mysterious'], hues: ['amber'], pal: 'pal-mono', look: { K: 'K1', D: 'D0', C: 'C14', M: 'M3' }, G: {}, bold: true, allows: ['mono', 'tint', 'grain'], line: 'Monochrome dyed amber: the deep past, or a story told about it.' },
  { id: 'pastel-mist', name: 'Pastel mist', feel: ['dreamlike', 'tender', 'hopeful'], hues: ['pink', 'purple'], pal: 'pal-analog', look: { K: 'K0', D: 'D2', C: 'C7', M: 'M2' }, G: {}, allows: ['soft'], line: 'Lifted blacks, soft pastels, glowing highlights: a memory or a wish.' },
  { id: 'cross-dream', name: 'Cross-processed', feel: ['dreamlike', 'energetic', 'mysterious'], hues: ['green', 'yellow', 'blue'], pal: 'pal-disc', look: { K: 'K0', D: 'D1', C: 'C12', M: 'M3' }, G: {}, bold: true, allows: ['tint'], line: 'Yellow-green highlights, blue shadows, high contrast: reality slightly off.' },
  { id: 'fogbound', name: 'Fogbound', feel: ['mysterious', 'lonely', 'melancholy'], hues: ['grey', 'teal'], pal: 'pal-achro', look: { K: 'K0', D: 'D3', C: 'C11', M: 'M2' }, G: { sat: 0.85 }, allows: ['soft'], line: 'A veil over everything: what you cannot see matters most.' },
  { id: 'golden-green', name: 'Golden green', feel: ['hopeful', 'natural', 'joyful'], hues: ['yellow', 'green'], pal: 'pal-analog', look: { K: 'K0', D: 'D1', C: 'C15', M: 'M2' }, G: {}, allows: ['tint'], line: 'Warm yellow-green, rich reds and greens: growth and late-afternoon light.' },
  { id: 'soft-dawn', name: 'Soft dawn', feel: ['hopeful', 'tender'], hues: ['amber', 'pink'], pal: 'pal-analog', look: { K: 'K0', D: 'D1', C: 'C1', M: 'M1' }, G: { temp: 0.08, sh: 0.1, con: 0.95 }, allows: ['soft'], line: 'Gentle warmth and open shadows: the morning after.' },
  { id: 'clinical-white', name: 'Clinical white', feel: ['clinical', 'tense'], hues: ['teal', 'white'], pal: 'pal-accent', look: { K: 'K0', D: 'D0', C: 'C13', M: 'M0' }, G: { sat: 0.85, con: 1.04, hi: 0.1 }, line: 'Clean, cool, bright: precision, institutions, sterility.' },
  { id: 'push-grit', name: 'Pushed grit', feel: ['gritty', 'tense', 'energetic'], hues: ['grey', 'amber'], pal: 'pal-achro', look: { K: 'K1', D: 'D0', C: 'C2', M: 'M6' }, G: { con: 1.12 }, allows: ['crush', 'grain'], line: 'Pushed 35 mm: coarse grain, hard contrast, nothing polished.' },
  { id: 'doc-16', name: 'Documentary 16 mm', feel: ['gritty', 'natural', 'melancholy'], hues: [], pal: 'pal-analog', look: { K: 'K0', D: 'D0', C: 'C11', M: 'M3' }, G: { lutMix: 0.8 }, allows: ['grain'], line: 'Muted Eterna colour on 16 mm: observed, not staged.' },
  { id: 'rich-print', name: 'Rich print', feel: ['luxurious', 'tender'], hues: ['amber', 'red'], pal: 'pal-analog', look: { K: 'K0', D: 'D1', C: 'C1', M: 'M1' }, G: { con: 1.06, sat: 1.04, bk: -0.08 }, allows: ['crush'], line: '65 mm fineness, deep blacks and warm print colour: expensive, unhurried.' },
  { id: 'mono-elegance', name: 'Monochrome elegance', feel: ['luxurious', 'melancholy', 'mysterious'], hues: ['bw'], pal: 'pal-achro', look: { K: 'K0', D: 'D1', C: 'C4', M: 'M1' }, G: {}, bold: true, allows: ['mono'], line: 'Black and white with red-filter skin: timeless, abstract, considered.' },
  { id: 'true-neutral', name: 'Natural', feel: ['natural'], hues: [], pal: null, look: { K: 'K0', D: 'D0', C: 'C0', M: 'M0' }, G: {}, line: 'Leave the colour as it is; only clean it up. A look is a choice, so is none.' },
  { id: 'gentle-film', name: 'Gentle film', feel: ['natural', 'tender', 'nostalgic'], hues: [], pal: 'pal-analog', look: { K: 'K0', D: 'D0', C: 'C11', M: 'M1' }, G: { lutMix: 0.55 }, line: 'A light film response and fine grain: real, with a little warmth of craft.' },
];

const WARM = ['red', 'orange', 'yellow', 'amber', 'pink'], COOL = ['blue', 'teal', 'green', 'purple'];
const WARM_FEEL = ['tender', 'nostalgic', 'joyful', 'hopeful', 'luxurious'], COOL_FEEL = ['clinical', 'lonely', 'melancholy', 'tense'];

/** Genre and role shape every recipe: corporate work stays cleaner, music videos go further, faces get guarded. */
function shape(r, intent, ctx) {
  const G = { ...r.G }, extra = {}; const genres = answers(intent.genre), roles = answers(intent.role), g = genres[0], notes = [];
  const has = id => roles.includes(id), role = roles[0];
  const scale = (k, f, d = 1) => { G[k] = (G[k] ?? d) * f; };
  if (genres.some(x => ['commercial', 'explainer', 'social'].includes(x))) { scale('grainK', 0.5); scale('halK', 0.7); scale('lutMix', 0.85); }
  if (genres.includes('doc')) { scale('lutMix', 0.7); scale('grainK', 0.8); }
  if (g === 'music') { scale('sat', 1.04); }
  if (has('product')) { scale('grainK', 0.5); G.vib = Math.max(G.vib || 0, 0.2); notes.push('Grain is halved and vibrance raised so the product stays crisp and true.'); }
  if (has('graphic')) { scale('lutMix', 0.5); notes.push('This shot carries graphics or a screen: the look runs at half strength so brand colours and text stay legible.'); }
  if (has('place')) scale('vigK', 1.2);
  // faces: guard skin whenever a face may be present and the recipe would move it
  let skin = r.skin || 0;
  const faceShot = has('face') || has('dialogue');
  if (ctx.skinFound || faceShot) skin = Math.max(skin, faceShot ? 0.7 : 0.5);
  if (skin) Object.assign(extra, { skinGuard: skin, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 });
  // exposure: lift an underexposed face unless the mood wants it dark
  const faceSure = ctx.skin && ctx.skin.found && (ctx.skin.confidence === 'high' || faceShot);
  if (faceSure && ctx.skin.ire < 35 && !isDark(intent) && ctx.input !== 'logc3') {
    const fix = (ctx.skin.fixes || []).find(f => f.kind === 'exposure'); if (fix) { G.exp = +((G.exp || 0) + fix.params.exp * 0.7).toFixed(2); notes.push(`The face sits at ${ctx.skin.ire} IRE, so exposure is lifted ${G.exp > 0 ? '+' : ''}${G.exp} EV.`); }
  }
  return { G, extra, notes };
}

function score(r, intent, reading) {
  let s = 0; const fs = answers(intent.feeling), gs = answers(intent.genre), g = gs[0], lead = reading && reading.lead ? reading.lead.id : null;
  const fit = f => r.feel.includes(f) ? 4 - r.feel.indexOf(f) * 0.5 : null;
  if (fs.length) { // the primary feeling counts fully, the secondary about two thirds; a recipe that serves both gets a bonus
    const a = fit(fs[0]), b = fs[1] ? fit(fs[1]) : null;
    if (a == null && b == null) s -= 3; else s += Math.max(a ?? 0, (b ?? 0) * 0.65) + (a != null && b != null ? 1.2 : 0);
  }
  const gw = (id, w) => {
    if (r.bold && ['doc', 'explainer', 'commercial'].includes(id)) s -= 1.5 * w;
    if (r.bold && ['music', 'thriller'].includes(id)) s += 0.6 * w;
    if (id === 'thriller' && r.feel.some(x => ['tense', 'menacing', 'mysterious'].includes(x))) s += 0.8 * w;
    if (['commercial', 'social', 'explainer'].includes(id) && ['clean-vivid', 'true-neutral', 'rich-print', 'blockbuster', 'golden-green', 'soft-dawn', 'clinical-white'].includes(r.id)) s += 0.8 * w;
    if (id === 'doc' && ['doc-16', 'true-neutral', 'gentle-film', 'faded-eterna'].includes(r.id)) s += 1 * w;
  };
  gs.forEach((id, i) => gw(id, i ? 0.5 : 1));
  if (lead && r.hues.includes(lead)) s += 0.7; // leans into what is already there
  if (!fs.length && reading) { const w = reading.stats.warmth; if (w === 'warm' && r.hues.some(h => WARM.includes(h))) s += 0.5; if (w === 'cool' && r.hues.some(h => COOL.includes(h))) s += 0.5; }
  return s;
}

/**
 * Picks 4-6 directions. ctx = { reading, skin, input }. Returns recipes shaped by the intent, with kind:
 * 'lean' (works with the frame's existing colour), 'counter' (pushes against it), 'natural' (minimal).
 */
export function pickDirections(intent, ctx, n = 5) {
  const reading = ctx.reading, lead = reading && reading.lead ? reading.lead.id : null;
  const ranked = RECIPES.map(r => ({ r, s: score(r, intent, reading) })).sort((a, b) => b.s - a.s);
  const out = [], usedC = new Set();
  const take = r => { if (out.find(o => o.r.id === r.id)) return; out.push({ r }); usedC.add(r.look.C); };
  for (const { r } of ranked) { if (out.length >= n - 1) break; if (usedC.has(r.look.C) && out.length < 3) continue; take(r); }
  // always one minimal option, so "do less" is on the table
  const minimal = ['doc', 'explainer'].includes(answers(intent.genre)[0]) || answers(intent.feeling)[0] === 'natural' ? 'true-neutral' : 'gentle-film';
  take(RECIPES.find(r => r.id === minimal));
  // make sure one option pushes against the frame when everything leans the same way
  const isWarm = r => r.hues.some(h => WARM.includes(h)), isCool = r => r.hues.some(h => COOL.includes(h));
  if (reading && out.length >= 3 && answers(intent.feeling).length) {
    const w = reading.stats.warmth, all = out.filter(o => o.r.look.C !== 'C0');
    const sameWay = w === 'warm' ? all.every(o => isWarm(o.r)) : w === 'cool' ? all.every(o => isCool(o.r)) : false;
    if (sameWay) { const c = ranked.find(x => x.s > -1 && !out.find(o => o.r.id === x.r.id) && (w === 'warm' ? isCool(x.r) : isWarm(x.r))); if (c) { out.splice(out.length - 1, 0, { r: c.r }); } }
  }
  return out.slice(0, n + 1).map(({ r }) => {
    const sh = shape(r, intent, { ...ctx, skinFound: ctx.skin && ctx.skin.found });
    const kind = r.id === 'true-neutral' || r.id === 'gentle-film' ? 'natural' : !r.hues.length ? 'clean'
      : lead && (r.hues.includes(lead) || (WARM.includes(lead) && isWarm(r)) || (COOL.includes(lead) && isCool(r))) ? 'lean' : reading && lead ? 'counter' : 'lean';
    return { id: r.id, name: r.name, line: r.line, kind, pal: r.pal, hues: r.hues, feel: r.feel,
      look: { L: 'L1', O: 'O1', H: 'H0', A: '2.39', ...r.look, G: fullGrade(sh.G) }, extra: sh.extra, notes: sh.notes };
  });
}

/**
 * Smart mode's picks as directions: the recipe, shaped by the editor's answers like any other direction, with the
 * model's small adjustments on top (already validated against TWEAKS) and its reason for this frame.
 */
const TWEAK_NAMES = { exp: 'exposure', con: 'contrast', sat: 'saturation', vib: 'vibrance', temp: 'temperature', tint: 'tint', hi: 'highlights', sh: 'shadows', bk: 'blacks', wh: 'whites',
  lutMix: 'colour look strength', grainK: 'grain', halK: 'halation', diffK: 'diffusion glow', vigK: 'vignette', skinGuard: 'Skin Guard' };
/**
 * Exposure is the whole picture. Asked to fix "the face is underexposed", a model reaches for it — on 17 Nov it asked
 * for +1.2 stops on a dark face in front of a bright wall, which blew 31% of the picture to white and lifted her
 * highlights five times more than her shadows. No strength fixes that: the fitter could only refuse it.
 * So beyond a small amount, a positive exposure push on a shot with a dark face is handed to skinLift, which lifts
 * the face's shadows by skin weight and leaves the wall alone. The face gets about the brightening that was asked for
 * (L scales with the cube root of linear light, so e stops is L·(2^(e/3) − 1)); the rest of the frame keeps its room.
 */
// None of it stays on the picture: measured on the founder's frame, even 0.15 stops blew 5% of a wall that was already
// at the ceiling, while the same brightening through skinLift blew nothing.
export const EXP_CAP_FACE = 0;
/** A tweak that changes nothing ("exposure 0", "contrast 1") is not worth telling the editor about. */
const NEUTRAL_TWEAK = { exp: 0, temp: 0, tint: 0, con: 1, sat: 1, vib: 0, hi: 0, sh: 0, bk: 0, wh: 0, bri: 0, gam: 0 };
const isNoOp = (k, v) => NEUTRAL_TWEAK[k] != null && Math.abs(+v - NEUTRAL_TWEAK[k]) < 0.005;
export function routeExposure(tweaks, skin) {
  const t = { ...(tweaks || {}) }, e = +t.exp || 0;
  const f = skin && skin.found && skin.faces && skin.faces.length ? skin.faces[Math.max(0, Math.min(skin.lead || 0, skin.faces.length - 1))] : null;
  if (!(e > EXP_CAP_FACE) || !f || !(f.L < 0.6)) return { tweaks: t, lift: 0, moved: 0 };
  const lift = Math.min(0.25, f.L * (Math.pow(2, (e - EXP_CAP_FACE) / 3) - 1));
  t.exp = EXP_CAP_FACE; return { tweaks: t, lift: +lift.toFixed(4), moved: +(e - EXP_CAP_FACE).toFixed(2) };
}
export function directionsFromPicks(picks, intent, ctx) {
  return picks.map(p => {
    const r = RECIPES.find(x => x.id === p.recipe); if (!r) return null;
    const sh = shape(r, intent, { ...ctx, skinFound: ctx.skin && ctx.skin.found }), G = { ...sh.G }, extra = { ...sh.extra };
    const ex = routeExposure(p.tweaks, ctx.skin), notes = [];
    if (ex.lift > 0) { extra.skinLift = Math.max(extra.skinLift || 0, ex.lift);
      notes.push(`The AI asked for ${(+p.tweaks.exp).toFixed(2)} stops of exposure to brighten the face. That much on the whole picture blows what is already bright, so it went to “Lift the face” instead.`); }
    for (const [k, v] of Object.entries(ex.tweaks)) { if (k === 'skinGuard') Object.assign(extra, { skinGuard: v, skinHue: extra.skinHue ?? 0.8, skinDensity: extra.skinDensity ?? 0.7, skinLight: extra.skinLight ?? 0.5 }); else G[k] = v; }
    return { id: r.id, name: r.name, line: p.why || r.line, kind: 'smart', pal: r.pal, hues: r.hues, feel: r.feel, smartWhy: p.why,
      look: { L: 'L1', O: 'O1', H: 'H0', A: '2.39', ...r.look, G: fullGrade(G) }, extra, notes: [...(Object.entries(ex.tweaks).filter(([k, v]) => !isNoOp(k, v)).length ? [`Adjusted for this frame: ${Object.entries(ex.tweaks).filter(([k, v]) => !isNoOp(k, v)).map(([k, v]) => `${TWEAK_NAMES[k] || k} ${+v.toFixed(2)}`).join(', ')}.`] : []), ...notes] };
  }).filter(Boolean);
}

/**
 * What a direction does to this frame, in words: measured by running the look on the frame's own dominant
 * colours (and its skin, if any). fn = the look's per-pixel function.
 */
export function describeEffect(fn, reading, skin) {
  if (!reading) return [];
  const sw = reading.swatches.filter(s => s.share > 0.03).slice(0, 6); if (!sw.length) return [];
  let dL = 0, cIn = 0, cOut = 0, bIn = 0, bOut = 0, tot = 0;
  for (const s of sw) { const rgb = hexRgb(s.hex), o = srgbToOklab(...fn(rgb)), i = s.lab, w = s.share; dL += (o[0] - i[0]) * w; cIn += Math.hypot(i[1], i[2]) * w; cOut += Math.hypot(o[1], o[2]) * w; bIn += i[2] * w; bOut += o[2] * w; tot += w; }
  dL /= tot; const cr = cOut / Math.max(cIn, 1e-4), dT = (bOut - bIn) / tot, out = [];
  const parts = [];
  if (dT > 0.006) parts.push('warms the image'); else if (dT < -0.006) parts.push('cools the image');
  if (cr < 0.85) parts.push(`drains about ${Math.round((1 - cr) * 100)}% of its colour`); else if (cr > 1.15) parts.push(`adds about ${Math.round((cr - 1) * 100)}% more colour`);
  if (dL < -0.025) parts.push('darkens it'); else if (dL > 0.025) parts.push('brightens it');
  out.push(parts.length ? 'On this frame it ' + joinAnd(parts) + '.' : 'On this frame the change is subtle: mostly texture and tone, not colour.');
  if (skin && skin.found && skin.guard) {
    const g = skin.guard, r = Math.PI / 180 * g.hueCentre, src = labToRgb(g.L, g.C * Math.cos(r), g.C * Math.sin(r)), o = toLCh(srgbToOklab(...fn(src)));
    const dh = hueDist(o[2], g.hueCentre), dc = o[1] / Math.max(g.C, 1e-4);
    const harm = [dh > 6 && `move ${Math.round(dh)}° off the skin line`, dc < 0.8 && `lose ${Math.round((1 - dc) * 100)}% of its colour`].filter(Boolean);
    if (harm.length) out.push(`Skin would ${harm.join(' and ')}; raise Skin Guard in Tweak if faces matter here.`);
    else out.push('Faces keep their colour (Skin Guard is on).');
  }
  return out;
}
/** How a look moves the picture's warmth (Oklab b), colourfulness (chroma ratio) and lightness, on this frame's own colours. */
export function effectDeltas(fn, reading) {
  const sw = reading.swatches.filter(s => s.share > 0.03).slice(0, 6); if (!sw.length || !fn) return { db: 0, cr: 1, dL: 0 };
  let dL = 0, cIn = 0, cOut = 0, db = 0, tot = 0;
  for (const s of sw) { const o = srgbToOklab(...fn(hexRgb(s.hex))), i = s.lab, w = s.share; dL += (o[0] - i[0]) * w; cIn += Math.hypot(i[1], i[2]) * w; cOut += Math.hypot(o[1], o[2]) * w; db += (o[2] - i[2]) * w; tot += w; }
  return { db: db / tot, cr: cOut / Math.max(cIn, 1e-4), dL: dL / tot };
}
/** The picture numbers continuity is judged on. */
export const pictureOf = stats => ({ b: stats.meanB, C: stats.meanC, L: stats.p50 });
/**
 * Continuity with the shots either side: how this shot (with the look `fn`, or as it is when fn is null) will sit
 * next to them. neighbours = [{ side: 'before' | 'after', name, pic }].
 */
export function continuity(fn, reading, neighbours) {
  if (!reading || !neighbours || !neighbours.length) return '';
  const cur = pictureOf(reading.stats), n = neighbours.length;
  const ref = { b: neighbours.reduce((a, x) => a + x.pic.b, 0) / n, C: neighbours.reduce((a, x) => a + x.pic.C, 0) / n, L: neighbours.reduce((a, x) => a + x.pic.L, 0) / n };
  const diffs = p => { const out = [];
    if (p.b - ref.b > 0.012) out.push('warmer'); else if (p.b - ref.b < -0.012) out.push('cooler');
    if (p.C / Math.max(ref.C, 1e-4) > 1.3) out.push('more colourful'); else if (p.C / Math.max(ref.C, 1e-4) < 0.75) out.push('more muted');
    if (p.L - ref.L > 0.07) out.push('brighter'); else if (p.L - ref.L < -0.07) out.push('darker');
    return out; };
  const now = diffs(cur), who = n === 2 ? 'the shots either side' : `the shot ${neighbours[0].side}`;
  if (!fn) return now.length ? `Right now it is ${joinAnd(now)} than ${who}.` : `Already sits in line with ${who}.`;
  const d = effectDeltas(fn, reading), parts = diffs({ b: cur.b + d.db, C: cur.C * d.cr, L: cur.L + d.dL });
  if (!parts.length) return now.length ? `Brings it in line with ${who}.` : `Keeps it in line with ${who}.`;
  // the look moves the shot toward its neighbours but not far enough: it "stays"; otherwise it "lands"
  if (parts.every(x => now.includes(x))) return `Even with this look it stays ${joinAnd(parts)} than ${who}.`;
  return `With this look it lands ${joinAnd(parts)} than ${who}; fine for a deliberate change, otherwise apply it to the scene.`;
}
const joinAnd = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
const labToRgb = (L, a, b) => oklabToSrgb(L, a, b);

/** The short "why" for a direction, tied to the intent and the encyclopedia's meanings. */
export function whyFor(d, intent, enc) {
  const out = [], names = (list, v) => answers(v).map(id => label(list, id).toLowerCase()).filter(Boolean);
  const f = names(FEELINGS, intent.feeling).join(' and '), g = names(GENRES, intent.genre).join(' and '), role = names(ROLES, intent.role).map(x => x.split(' / ')[0]).join(' and ');
  const pal = d.pal ? enc.PALS.find(p => p.id === d.pal) : null, hue = d.hues.map(id => enc.HUES.find(h => h.id === id)).find(Boolean);
  const what = [f && `a ${f} scene`, role && `this ${role} shot`].filter(Boolean).join(', ');
  const forWhat = what ? what + (g ? ` in a ${g} piece` : '') : g ? `a ${g} piece` : '';
  const fs = answers(intent.feeling), both = fs.length === 2 && fs.every(x => d.feel.includes(x));
  out.push(forWhat ? `For ${forWhat}: ${d.line.charAt(0).toLowerCase() + d.line.slice(1)}${both ? ' It serves both feelings.' : ''}` : d.line);
  if (hue || pal) out.push([hue && `${hue.name}: ${hue.tag.toLowerCase()}`, pal && `${pal.n} palette`].filter(Boolean).join(' · '));
  return { lines: out, hue, pal };
}

/** One sentence that says what the frame is doing now, in the encyclopedia's words. */
export function frameSummary(reading, enc) {
  if (!reading) return '';
  const st = reading.stats, lead = reading.lead, pal = reading.pal.entry;
  const tone = `${st.key}, ${st.warmth === 'balanced' ? 'neutral in temperature' : st.warmth}, ${st.saturation}`;
  const colour = lead ? `${lead.entry.name.split(' / ')[0]} leads (${Math.round(lead.share * 100)}% of the lit picture)` : 'no single colour leads';
  const pn = pal ? pal.n.toLowerCase() : '';
  return `${cap(tone)}; ${colour}${pal ? `, in ${/^[aeiou]/.test(pn) ? 'an' : 'a'} ${pn} structure` : ''}.`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export { label as intentLabel };
export const KIND_LABEL = { lean: 'Works with your frame', counter: 'Pushes against it', natural: 'Minimal', clean: 'Clean', smart: 'Smart pick' };
export const isNeutralHue = id => NEUTRAL_IDS.includes(id);

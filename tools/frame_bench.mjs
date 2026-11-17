// Measure suggestions on a real frame, the way the panel builds them.
//
//   node tools/frame_bench.mjs <frame.png|jpg> [suggestions.json]
//
// The frame is the file the panel exported (on a Mac: ~/Library/Application Support/ColoredLens/cl_frame_*.png).
// It is read from wherever it is and never copied into the repo: it is somebody's footage.
// suggestions.json (optional) is { study: { items: [{name, hex}] }, suggestions: [{ title, recipe, tweaks, ambience,
// items: [{item, colour, hex}] }] } — the AI's own shape. Without it, a built-in set exercises the hard cases found
// on 17 Nov 2026: a face asked to be brighter through exposure, on a shot whose wall is already near white.
// Each line: the fitted strength, whether it suits the shot, what the face did, and anything the gate flags.
// Kept in tools/, not scratch/: scratch/ is untracked, and the 17 Nov bench was lost with the session that wrote it.
import fs from 'node:fs';
import { decodeImage, downsample } from '../core/image.js';
import { lutFromBin, parseCode, makePixelFn, fullGrade, GRADE0, zoneDefaults } from '../core/look.js';
import { checkSkin } from '../core/skin.js';
import { readFrame } from '../core/analysis.js';
import { RECIPES, directionsFromPicks } from '../core/directions.js';
import { gradeReport, faults, fitStrength, scaleLook, renderWith, summarise } from '../core/quality.js';
import { zonesFor } from '../core/smart.js';

const [framePath, sgPath] = process.argv.slice(2);
if (!framePath) { console.error('usage: node tools/frame_bench.mjs <frame> [suggestions.json]'); process.exit(1); }
const site = p => new URL('../site/content/' + p, import.meta.url);
const looks = JSON.parse(fs.readFileSync(site('looks.json'))), cat = looks.catalog, enc = JSON.parse(fs.readFileSync(site('encyclopedia.json')));
const luts = Object.fromEntries(Object.keys(looks.luts).map(id => [id, lutFromBin(fs.readFileSync(site(`luts/${id}.bin`)))]));
const XDEF = { skinGuard: 0, skinLift: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1, ...zoneDefaults() };
const NEUTRAL = () => ({ L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C0', M: 'M0', A: '2.39', G: fullGrade({}) });

const frame = decodeImage(fs.readFileSync(framePath)), f240 = downsample(frame, 240), skin = checkSkin(frame), reading = readFrame(frame, enc);
const lead = skin.faces[skin.lead || 0];
console.log(`frame ${frame.w}×${frame.h}; ${skin.faces.length} face(s)${lead ? `, lead L ${lead.L.toFixed(3)} C ${lead.C.toFixed(4)} H ${lead.H.toFixed(1)}°, ${lead.ire} IRE` : ''}`);

/** Exactly the panel's "Try this on my frame": this suggestion's own look and tweaks, its zones, then the fitter. */
function build(sg, study) {
  const d = sg.recipe ? directionsFromPicks([{ recipe: sg.recipe, tweaks: sg.tweaks }], {}, { skin, reading })[0] : null;
  const base = d ? { look: d.look, extra: { ...XDEF, ...d.extra }, allows: d.allows } : { look: NEUTRAL(), extra: { ...XDEF }, allows: null };
  const z = zonesFor(sg, study, reading.swatches, downsample(frame, 160));
  const extra = { ...base.extra, ...zoneDefaults(), ...z.params, skinLift: Math.max(base.extra.skinLift || 0, z.params.skinLift || 0), skinGuard: Math.max(base.extra.skinGuard || 0, 0.7) };
  const mk = k => { const s = scaleLook(base.look, extra, k, GRADE0, fullGrade); return makePixelFn(s.look, cat, luts, { keepExposure: true, extra: s.extra }); };
  const fit = fitStrength(f240, mk, { skin: checkSkin(f240), allows: base.allows });
  const rep = gradeReport(frame, renderWith(frame, mk(fit.k)), { skin });
  return { z, fit, rep, f: faults(rep, { allows: base.allows }), notes: d ? d.notes : [] };
}

let input = sgPath ? JSON.parse(fs.readFileSync(sgPath)) : null;
if (!input) {
  const study = { items: [{ name: "Person's face and skin", hex: '#423735' }, { name: 'T-shirt', hex: '#d7e7dd' }, { name: 'Background wall', hex: '#76655f' }] };
  const items = [['T-shirt', '#1f8f8a'], ['Background wall', '#a0522d']].map(([item, hex]) => ({ item, colour: hex, hex }));
  input = { study, suggestions: [] };
  for (const recipe of ['true-neutral', 'gentle-film', 'warm-print', 'doc-16']) for (const tweaks of [{}, { exp: 0.4 }, { exp: 1.2 }])
    input.suggestions.push({ title: `${recipe} ${JSON.stringify(tweaks)}`, recipe, tweaks, ambience: { colour: 'warm', hex: '#f0b070' }, items });
}
for (const sg of input.suggestions) {
  const r = build(sg, input.study), s = summarise(r.rep);
  console.log(`${(sg.title || '').slice(0, 40).padEnd(40)} k ${String(r.fit.k).padEnd(4)} ${r.fit.suits ? 'suits' : 'NO   '}`
    + (s.face ? ` face sh ${s.face.shadowLift} hi ${s.face.highlightLift} blown ${s.face.blownAdded}` : ' (no face)')
    + ` picture blown ${s.picture.blownAdded}  ${r.f.map(x => x.id).join(',') || 'clean'}`);
}

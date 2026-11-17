// Every look that ships has to survive a picture, and a person in it.
//
// Added after the 17 Nov 2026 review. Five AI suggestions were put in front of the founder and all five damaged the
// subject: four clipped her forehead, one darkened her, two swung her skin off the skin-tone line, and two described
// themselves as doing the opposite of what they measurably did. Nothing in the suite caught any of it, because no
// test had ever asked what a look does to a picture. These do.
//
// Two kinds of check live here:
//   1. the measure itself works (absolute — these must always pass)
//   2. the catalogue measured against a recorded baseline (a ratchet — a look may never gain a new fault, and when
//      one is fixed the baseline is lowered so it can never come back)
// The baseline is not a target. It is the debt this plugin is carrying, written down so it cannot grow quietly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makePixelFn } from '../core/look.js';
import { checkSkin } from '../core/skin.js';
import { RECIPES } from '../core/directions.js';
import { gradeReport, faults, verdict, BAR } from '../core/quality.js';
import { scoreFrame, FRAMES, BASELINE, render, load, lookOf, SKIN_GUARD, cat, luts } from './quality_harness.mjs';

test('the measure finds the face it is meant to protect', () => {
  const frame = load('ext-mcu.jpg'), skin = checkSkin(frame);
  assert.ok(skin.faces.length, 'the fixture needs a face in it');
  const r = gradeReport(frame, frame, { skin });
  assert.ok(r.face, 'a frame with a face must produce a face report, or every check below passes for nothing');
  assert.equal(faults(r).length, 0, 'a frame against itself has nothing wrong with it');
});

test('the measure notices a grade that wrecks a face', () => {
  const frame = load('ext-mcu.jpg'), skin = checkSkin(frame);
  const bad = render(frame, ([r, g, b]) => [Math.min(1, r * 2.2 + 0.25), Math.min(1, g * 2.4 + 0.28), Math.min(1, b * 3.0 + 0.34)]);
  const f = faults(gradeReport(frame, bad, { skin }));
  assert.ok(f.some(x => x.id === 'face-blown'), 'it should notice the clipping: ' + JSON.stringify(f));
  assert.ok(f.length >= 2, 'and more than one thing wrong: ' + JSON.stringify(f));
  assert.ok(verdict(f).startsWith('Not fit to show'), 'and say so in a sentence');
});

test('the measure passes a grade that lifts a face properly', () => {
  const frame = load('ext-mcu.jpg'), skin = checkSkin(frame);
  const good = render(frame, ([r, g, b]) => [r, g, b].map(c => Math.min(1, c + (1 - c) * 0.10 * (1 - c))));
  assert.equal(faults(gradeReport(frame, good, { skin })).length, 0, 'a clean shadow lift should pass');
});

test('a declared intent excuses its own axis and nothing else', () => {
  const r = { face: { before: { p50: 0.4, blown: 0, crushed: 0 }, after: { p50: 0.4, blown: 0, crushed: 0 } },
    faceBlownAdded: 0.09, faceCrushedAdded: 0, faceLostDetail: 0, skinHueShift: 40, skinChroma: 0.1,
    faceDetailRatio: 1, liftBalance: null, faceHighlightLift: 0, lostDetail: 0, blownAdded: 0, crushedAdded: 0,
    pinnedHighAdded: 0, detailRatio: 1, flatNoiseRatio: 1, grainAdded: 1, levelsBefore: 1, levelsAfter: 1,
    rangeBefore: 1, rangeAfter: 1, neutralCast: 0 };
  const mono = faults(r, { allows: ['mono'] }).map(x => x.id);
  assert.ok(!mono.includes('skin-hue'), 'a monochrome look has no skin hue to hold');
  assert.ok(mono.includes('face-blown'), 'but it still may not blow the face: ' + JSON.stringify(mono));
});

test('Skin Guard is what holds skin on the skin-tone line', () => {
  const frame = load('ext-mcu.jpg'), skin = checkSkin(frame);
  const look = lookOf(RECIPES.find(x => x.id === 'fluorescent-dread'));
  const off = gradeReport(frame, render(frame, makePixelFn(look, cat, luts, { extra: { skinGuard: 0 } })), { skin });
  const on = gradeReport(frame, render(frame, makePixelFn(look, cat, luts, { extra: { ...SKIN_GUARD, skinGuard: 1 } })), { skin });
  assert.ok(on.skinHueShift <= off.skinHueShift + 0.5,
    `the guard should not make skin wander further (off ${off.skinHueShift.toFixed(1)}°, on ${on.skinHueShift.toFixed(1)}°)`);
});

test('no look gains a new fault against the recorded baseline', () => {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const grew = [], fixed = [];
  for (const name of FRAMES) {
    const { bad, said } = scoreFrame(name), was = base.frames[name] || {};
    for (const [id, ids] of Object.entries(bad)) {
      const added = ids.filter(x => !(was[id] || []).includes(x));
      if (added.length) grew.push(`${name} · ${id}: new ${added.join(', ')} — ${said[id]}`);
    }
    for (const [id, ids] of Object.entries(was)) {
      const gone = ids.filter(x => !(bad[id] || []).includes(x));
      if (gone.length) fixed.push(`${name} · ${id}: ${gone.join(', ')}`);
    }
  }
  if (fixed.length) console.log(`\n  ${fixed.length} fault(s) fixed since the baseline. Lower it: node scratch/quality_report.mjs --write\n  ` + fixed.join('\n  '));
  assert.equal(grew.length, 0, 'looks got worse:\n  ' + grew.join('\n  '));
});

// ---------------------------------------------------------------------------------------------------------------
// 17 Nov 2026, evening, on 0.13.0 in the founder's Premiere: two AI suggestions with different palettes were both
// refused by the fitter at every strength. Cause: asked to brighten an underexposed face, the model sent +1.2 stops
// of whole-frame exposure. On a dark face in front of a bright wall that blew 31% of the picture and lifted her
// highlights five times more than her shadows. These pin the four fixes. The founder's frame is not committed (it
// is his footage of a real person); a public dark-skin frame with its background pushed to a bright wall stands in.
import { directionsFromPicks, routeExposure } from '../core/directions.js';
import { scaleLook, fitStrength } from '../core/quality.js';
import { zonesFor } from '../core/smart.js';
import { GRADE0, fullGrade } from '../core/look.js';

/** A dark face against a near-white wall: the shot that exposure cannot fix. */
function darkFaceBrightWall() {
  const f = load('aut-barry-jenkins.jpg'), skin = checkSkin(f), lead = skin.faces[skin.lead || 0];
  const [x0, y0, x1, y1] = lead.box, out = { w: f.w, h: f.h, data: new Uint8ClampedArray(f.data) };
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const inBox = x >= x0 * f.w && x < x1 * f.w && y >= y0 * f.h && y < y1 * f.h;
    if (inBox) continue; const i = (y * f.w + x) * 4; const t = 0.85; // a warm off-white wall, most of the way to the ceiling
    out.data[i] = Math.round(out.data[i] * (1 - t) + 240 * t); out.data[i + 1] = Math.round(out.data[i + 1] * (1 - t) + 236 * t); out.data[i + 2] = Math.round(out.data[i + 2] * (1 - t) + 228 * t); }
  return out;
}

test('a request to brighten a dark face goes to the face, not to the whole picture', () => {
  const frame = darkFaceBrightWall(), skin = checkSkin(frame);
  assert.ok(skin.found, 'the stand-in needs its face');
  const r = routeExposure({ exp: 1.2, con: 1.05 }, skin);
  assert.equal(r.tweaks.exp, 0, 'no positive exposure is left on the picture');
  assert.equal(r.tweaks.con, 1.05, 'other tweaks pass through untouched');
  assert.ok(r.lift > 0.05 && r.lift <= 0.25, `the face gets the brightening instead (lift ${r.lift})`);
  assert.equal(routeExposure({ exp: -0.4 }, skin).tweaks.exp, -0.4, 'darkening is not touched');
  assert.equal(routeExposure({ exp: 0.8 }, { found: false }).tweaks.exp, 0.8, 'with no face there is nothing to route to');

  const [d] = directionsFromPicks([{ recipe: 'gentle-film', tweaks: { exp: 1.2 } }], {}, { skin });
  assert.equal(d.look.G.exp, 0); assert.ok(d.extra.skinLift > 0.05);
  const build = k => { const s = scaleLook(d.look, { ...SKIN_GUARD, ...d.extra }, k, GRADE0, fullGrade); return makePixelFn(s.look, cat, luts, { keepExposure: true, extra: s.extra }); };
  const fit = fitStrength(frame, build, { skin, allows: RECIPES.find(x => x.id === 'gentle-film').allows });
  assert.ok(fit.suits, `it must suit the shot now: ${verdict(fit.faults)}`);
  const rep = gradeReport(frame, render(frame, build(fit.k)), { skin });
  assert.ok(rep.blownAdded <= BAR.blownAdded, `the wall keeps its room (blown +${rep.blownAdded.toFixed(3)})`);
  assert.ok(rep.face.after.p50 - rep.face.before.p50 > 0.03, 'and the face does get brighter');

  // the old path, for the record: the same request as exposure is refused at every strength
  const [old] = directionsFromPicks([{ recipe: 'gentle-film', tweaks: { exp: 1.2 } }], {}, {});
  const oldBuild = k => { const s = scaleLook(old.look, { ...SKIN_GUARD, ...old.extra }, k, GRADE0, fullGrade); return makePixelFn(s.look, cat, luts, { keepExposure: true, extra: s.extra }); };
  assert.ok(old.look.G.exp > 1, 'without a face to route to, exposure is left as asked');
  assert.ok(faults(gradeReport(frame, render(frame, oldBuild(1)), { skin })).length, 'and on this shot that damages it');
});

test('Strength scales the face lift, so the fitter can bring it down', () => {
  const { extra } = scaleLook(lookOf(RECIPES[0]), { skinLift: 0.2, z7Amt: 0.8 }, 0.5, GRADE0, fullGrade);
  assert.equal(extra.skinLift, 0.1); assert.equal(extra.z7Amt, 0.4);
});

test('a burned-in caption is not given a colour zone', () => {
  const study = { items: [{ name: "Graphic text 'fact'", hex: '#f5c542' }, { name: 'Wall', hex: '#76655f' }] };
  const z = zonesFor({ items: [{ item: "Graphic text 'fact'", colour: 'amber', hex: '#e89a3c' }, { item: 'Wall', colour: 'sienna', hex: '#a0522d' }] }, study);
  assert.ok(z.skipped.some(s => /graphic text/i.test(s.item) && /own layer/.test(s.why)), 'the caption is skipped with a reason');
  assert.ok(z.mapped.some(m => m.item === 'Wall'), 'the wall still gets its zone');
});

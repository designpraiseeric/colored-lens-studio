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

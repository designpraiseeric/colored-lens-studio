// Scoring a look against a picture, and a person in it.
//
// Added after the 17 Nov 2026 review. Five AI suggestions were put in front of the founder and all five damaged the
// subject: four clipped her forehead, one darkened her, two swung her skin off the skin-tone line, and two described
// themselves as doing the opposite of what they measurably did. Nothing in the suite caught any of it, because no
// test had ever asked what a look does to a picture. These do.
//
// This file is the harness: the fixtures, the render, and the scoring. The checks that use it live in
// look_quality.test.mjs, and the human-readable scorecard in scratch/quality_report.mjs.
import fs from 'node:fs';
import { decodeImage, makeFrame, downsample } from '../core/image.js';
import { lutFromBin, parseCode, makePixelFn, fullGrade } from '../core/look.js';
import { checkSkin } from '../core/skin.js';
import { RECIPES } from '../core/directions.js';
import { gradeReport, faults, verdict } from '../core/quality.js';

const site = p => new URL('../site/content/' + p, import.meta.url);
const looks = JSON.parse(fs.readFileSync(site('looks.json'))), cat = looks.catalog;
const luts = Object.fromEntries(Object.keys(looks.luts).map(id => [id, lutFromBin(fs.readFileSync(site(`luts/${id}.bin`)))]));

// A spread of what the plugin actually meets: a well-exposed close-up, a low-key frame with dark skin (the hard case,
// and the one the founder's own footage resembles), and a bright high-key frame with little colour in it.
// Add a frame here whenever a real shot catches the plugin out.
export const FRAMES = ['ext-mcu.jpg', 'aut-barry-jenkins.jpg', 'aut-wes-anderson.jpg'];
const load = name => downsample(decodeImage(fs.readFileSync(site('frames/' + name))), 260);

const render = (frame, fn) => { const out = makeFrame(frame.w, frame.h);
  for (let p = 0; p < frame.w * frame.h; p++) { const i = p * 4;
    const [r, g, b] = fn([frame.data[i] / 255, frame.data[i + 1] / 255, frame.data[i + 2] / 255]);
    out.data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    out.data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    out.data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    out.data[i + 3] = 255; }
  return out; };

const SKIN_GUARD = { skinGuard: 0.7, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 };
const lookOf = r => { const l = parseCode(['L1', r.look.K, r.look.D, r.look.C, r.look.M].filter(Boolean).join('·'), cat);
  l.G = fullGrade(r.G || {}); return l; };

/** Run the whole catalogue over one frame. Returns the fault ids per look, and a sentence for each. */
export function scoreFrame(name) {
  const frame = load(name), skin = checkSkin(frame), bad = {}, said = {};
  for (const r of RECIPES) {
    const look = lookOf(r);
    const out = render(frame, makePixelFn(look, cat, luts, { extra: { ...SKIN_GUARD } }));
    // the same look with its grain and texture off, so blocking the grade amplified is told apart from grain it added
    const tonal = render(frame, makePixelFn(look, cat, luts, { extra: { ...SKIN_GUARD, grain: 0, halation: 0, diffusion: 0 } }));
    const f = faults(gradeReport(frame, out, { skin, tonal }), { allows: r.allows });
    if (f.length) { bad[r.id] = f.map(x => x.id).sort(); said[r.id] = verdict(f); }
  }
  return { bad, said };
}


export const BASELINE = new URL('./quality-baseline.json', import.meta.url);
export { render, load, lookOf, SKIN_GUARD, cat, luts };

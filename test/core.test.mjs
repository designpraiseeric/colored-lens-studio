// Unit tests for the shared core (no host, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodeImage, encodePNG, downsample, makeFrame } from '../core/image.js';
import { readFrame, classifyHue } from '../core/analysis.js';
import { checkSkin } from '../core/skin.js';
import { shotRecord, encodeShot, decodeShot, readSequence, scriptCSV } from '../core/script.js';
import { parseCode, parseLookInput, formatCode, shareLink, bakeCube, lutFromBin, computeMatch, matchStats, makePixelFn } from '../core/look.js';
import { cmpVersion, Updater } from '../core/updates.js';
import { hexToRgb } from '../core/color.js';

const site = p => new URL('../site/content/' + p, import.meta.url);
const enc = JSON.parse(fs.readFileSync(site('encyclopedia.json'))), looks = JSON.parse(fs.readFileSync(site('looks.json'))), cat = looks.catalog;
const luts = Object.fromEntries(Object.keys(looks.luts).map(id => [id, lutFromBin(fs.readFileSync(site(`luts/${id}.bin`)))]));
const fixture = decodeImage(fs.readFileSync(new URL('./fixtures/frame.bmp', import.meta.url)));
const solid = (w, h, fill) => { const f = makeFrame(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fill(x / w, y / h), i = (y * w + x) * 4; f.data[i] = c[0] * 255; f.data[i + 1] = c[1] * 255; f.data[i + 2] = c[2] * 255; f.data[i + 3] = 255; } return f; };

test('BMP fixture decodes', () => { assert.equal(fixture.w, 480); assert.equal(fixture.h, 268); });
test('PNG encoder writes a valid zlib stream', () => {
  const png = encodePNG(downsample(fixture, 64)); assert.deepEqual([...png.slice(1, 4)], [80, 78, 71]);
  let p = 8, idat = []; while (p < png.length) { const len = new DataView(png.buffer, png.byteOffset + p).getUint32(0), type = String.fromCharCode(...png.slice(p + 4, p + 8)); if (type === 'IDAT') idat.push(png.slice(p + 8, p + 8 + len)); p += 12 + len; }
  assert.ok(zlib.inflateSync(Buffer.concat(idat)).length > 0);
});
test('look codes and share links round-trip', () => {
  const l = parseCode('L10·O6·H1·K1·D1·C1·M2·2.39', cat); assert.equal(formatCode(l), 'L10·O6·H1·K1·D1·C1·M2·2.39');
  l.G.exp = 0.6; const back = parseLookInput(shareLink(l), cat); assert.equal(back.C, 'C1'); assert.equal(back.G.exp, 0.6);
  assert.throws(() => parseCode('hello', cat));
});
test('a neutral .cube has the right size and stays in range', () => {
  const c = bakeCube(parseCode('C0', cat), cat, luts, { size: 9 }); const rows = c.text.trim().split('\n').filter(r => /^[\d.]+ [\d.]+ [\d.]+$/.test(r));
  assert.equal(rows.length, 729); assert.ok(rows.every(r => r.split(' ').every(v => +v >= 0 && +v <= 1)));
});
test('Skin Guard gives back density that a bleach look took from skin', () => {
  const skin = hexToRgb('#5a3825'), look = parseCode('K0·D0·C2·M0', cat);
  const off = makePixelFn(look, cat, luts)(skin), on = makePixelFn(look, cat, luts, { extra: { skinGuard: 1, skinHue: 1, skinDensity: 1, skinLight: 1 } })(skin);
  const chroma = c => Math.max(...c) - Math.min(...c); assert.ok(chroma(on) > chroma(off) * 1.3, `${chroma(on)} vs ${chroma(off)}`);
});
test('match moves a frame toward its reference', () => {
  const dark = solid(40, 30, () => [0.1, 0.12, 0.2]), bright = solid(40, 30, () => [0.7, 0.6, 0.45]), m = computeMatch(matchStats(dark), matchStats(bright));
  assert.ok(m.mLo > 0 && m.mCg >= 0.4 && m.mCg <= 2);
});
test('hues are named in the encyclopedia\'s terms', () => {
  assert.equal(classifyHue(enc, [0.6, 0.2, 0.1]), 'red');
  assert.equal(classifyHue(enc, [0.5, 0.0, 0.0]), 'grey');
  assert.equal(classifyHue(enc, [0.55, -0.1, -0.15]), 'blue');
});
test('reading a frame returns a palette, hues and references', () => {
  const r = readFrame(fixture, enc, JSON.parse(fs.readFileSync(site('refs.json'))));
  assert.ok(enc.PALS.some(p => p.id === r.pal.id)); assert.ok(r.hues.length && r.matches.length === 6); assert.equal(r.matches[0].id, 'aut-barry-jenkins');
});
test('a single-hue frame reads as monochromatic, a grey one as achromatic', () => {
  assert.equal(readFrame(solid(60, 40, (x, y) => [0.1 + 0.3 * y, 0.2 + 0.4 * y, 0.5 + 0.5 * y]), enc).pal.id, 'pal-mono');
  assert.equal(readFrame(solid(60, 40, (x, y) => [y, y, y]), enc).pal.id, 'pal-achro');
});
test('skin check finds deep skin and flags it when underexposed', () => {
  const r = checkSkin(solid(120, 80, (x, y) => (x > 0.3 && x < 0.7 && y > 0.2 && y < 0.8 ? [0.2, 0.12, 0.08] : [0.05, 0.06, 0.08])));
  assert.ok(r.coverage > 0.1, 'skin found'); assert.ok(r.findings.some(f => f.title.includes('low in the exposure')));
  assert.ok(r.fixes.some(f => f.kind === 'exposure' && f.params.exp > 0));
});
test('clicking a point samples skin instead of detecting it', () => {
  const r = checkSkin(solid(120, 80, (x) => (x < 0.5 ? [0.45, 0.3, 0.22] : [0.1, 0.3, 0.5])), { sample: [0.2, 0.5] });
  assert.equal(r.mode, 'sampled'); assert.ok(r.coverage > 0.4 && r.coverage < 0.6);
});
test('color script: markers round-trip and the sequence is read', () => {
  const r = readFrame(fixture, enc), shots = [0, 1, 2, 3].map(i => shotRecord(r, { seconds: i, tags: ['Ada'] }));
  assert.deepEqual(decodeShot(encodeShot(shots[0])), shots[0]); assert.equal(decodeShot('a normal marker'), null);
  const seq = readSequence(shots, enc); assert.ok(seq.length >= 1 && seq.every(s => s.n));
  assert.match(scriptCSV(shots).split('\n')[0], /^timecode,/);
});
test('version comparison', () => { assert.equal(cmpVersion('0.2.0', '0.1.9'), 1); assert.equal(cmpVersion('v1.0.0', '1.0.0'), 0); assert.equal(cmpVersion('1.0.0', '1.0.10'), -1); });
test('content sync downloads only when the content version changed', async () => {
  const store = {}, fetched = [];
  const files = { 'content/manifest.json': JSON.stringify({ contentVersion: 'abc', core: ['encyclopedia.json'], files: { 'encyclopedia.json': 1, 'luts/C0.bin': 1 } }), 'content/encyclopedia.json': '{"HUES":[]}', 'content/luts/C0.bin': 'x' };
  const host = { version: '0.1.0', fetch: async url => { const k = url.split('/base/')[1].split('?')[0]; fetched.push(k); return { ok: k in files, json: async () => JSON.parse(files[k]), text: async () => files[k], arrayBuffer: async () => new TextEncoder().encode(files[k]).buffer }; },
    cache: { read: async n => store[n] || null, write: async (n, d) => { store[n] = typeof d === 'string' ? d : '[bin]'; } }, readBundled: async () => null };
  const up = new Updater(host, 'https://x/base/'); await up.load();
  assert.equal(await up.sync(), true); assert.ok(store['encyclopedia.json'] && store['luts/C0.bin'] && store['manifest.json']);
  fetched.length = 0; assert.equal(await up.sync(), false); assert.deepEqual(fetched, ['content/manifest.json']);
});

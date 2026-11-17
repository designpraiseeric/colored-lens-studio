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
import { pickDirections, answers, whyFor, continuity, pictureOf } from '../core/directions.js';
import { validate as smartValidate, parseReply, ask as smartAsk, resolveProvider, buildPrompt } from '../core/smart.js';
import { directionsFromPicks } from '../core/directions.js';
import { savePreset, presetCode, importPresetCode, listPresets } from '../core/presets.js';

const site = p => new URL('../site/content/' + p, import.meta.url);
const enc = JSON.parse(fs.readFileSync(site('encyclopedia.json'))), looks = JSON.parse(fs.readFileSync(site('looks.json'))), cat = looks.catalog;
const luts = Object.fromEntries(Object.keys(looks.luts).map(id => [id, lutFromBin(fs.readFileSync(site(`luts/${id}.bin`)))]));
const fixture = decodeImage(fs.readFileSync(new URL('./fixtures/frame.bmp', import.meta.url)));
const solid = (w, h, fill) => { const f = makeFrame(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fill(x / w, y / h), i = (y * w + x) * 4; f.data[i] = c[0] * 255; f.data[i + 1] = c[1] * 255; f.data[i + 2] = c[2] * 255; f.data[i + 3] = 255; } return f; };

test('BMP fixture decodes', () => { assert.equal(fixture.w, 480); assert.equal(fixture.h, 268); });
test('frame grabs decode whatever format the host writes (PNG, JPEG, BMP)', () => {
  const small = downsample(fixture, 64), png = decodeImage(encodePNG(small));
  assert.equal(png.w, small.w); assert.ok(png.data.every((v, i) => i % 4 === 3 || v === small.data[i]), 'PNG round-trips exactly');
  assert.equal(decodeImage(fs.readFileSync(new URL('./fixtures/frame.jpg', import.meta.url))).w, 480);
  assert.throws(() => decodeImage(new Uint8Array(64)), /first bytes/);
});
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
test('Skin Guard holds a colour zone off a face', () => {
  // A zone aimed at the neutrals used to paint the shadows on a face, and the guard could not take it back:
  // the guard only ever puts colour in, never removes colour a zone added. Zones now obey it directly.
  const skin = hexToRgb('#4a3a33'), look = parseCode('C0', cat); // deep skin in shadow: low enough in colour for a neutral zone to grab
  const zone = { z1Amt: 1, z1Cmin: 0, z1Cmax: 0.03, z1Lmin: 0, z1Lmax: 1, z1ToHue: 206, z1ToC: 0.32 };
  const free = makePixelFn(look, cat, luts, { extra: { ...zone } })(skin);
  const held = makePixelFn(look, cat, luts, { extra: { ...zone, skinGuard: 1, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 } })(skin);
  const blue = c => c[2] - c[0]; // the cyan the zone pushes in shows up as blue over red
  assert.ok(blue(free) > blue(held) + 0.05, `guarded skin should stay warmer: free ${blue(free).toFixed(3)} vs held ${blue(held).toFixed(3)}`);
  const wall = [0.42, 0.43, 0.44], w1 = makePixelFn(look, cat, luts, { extra: { ...zone } })(wall);
  const w2 = makePixelFn(look, cat, luts, { extra: { ...zone, skinGuard: 1, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5 } })(wall);
  assert.ok(Math.abs(blue(w1) - blue(w2)) < 0.02, 'a grey wall is not a face, so the zone still reaches it');
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
  assert.ok(r.coverage > 0.1, 'skin found'); assert.ok(r.findings.some(f => f.title.includes('underexposed')));
  assert.ok(r.fixes.some(f => f.kind === 'exposure' && f.params.exp > 0));
});
test('clicking a point samples skin instead of detecting it', () => {
  const r = checkSkin(solid(120, 80, (x) => (x < 0.5 ? [0.45, 0.3, 0.22] : [0.1, 0.3, 0.5])), { sample: [0.2, 0.5] });
  assert.equal(r.mode, 'sampled'); assert.ok(r.coverage > 0.4 && r.coverage < 0.6);
});
test('readings ignore letterbox bars and do not call deep shadow the colour of the shot', () => {
  const r = readFrame(solid(160, 90, (x, y) => (y < 0.15 || y > 0.85 ? [0, 0, 0] : x < 0.5 ? [0.75, 0.45, 0.2] : [0.045, 0.045, 0.05])), enc);
  assert.equal(r.area.bars, 'letterbox'); assert.ok(r.lead && ['orange', 'amber'].includes(r.lead.id), 'lead is the lit colour, got ' + (r.lead && r.lead.id));
  assert.ok(r.tones.shadow > 0.3);
});
test('a warm wall is not a face; a face-sized region is', () => {
  const wall = checkSkin(solid(160, 90, () => [0.62, 0.45, 0.32])); assert.equal(wall.found, false);
  const face = checkSkin(solid(160, 90, (x, y) => (Math.hypot(x - 0.5, (y - 0.45) * 0.6) < 0.08 ? [0.62, 0.45, 0.35] : [0.12, 0.14, 0.18]))); assert.equal(face.found, true);
});
test('directions follow the intent and each is a complete, previewable recipe', () => {
  const r = readFrame(fixture, enc), sk = checkSkin(fixture);
  const tense = pickDirections({ genre: 'drama', feeling: 'tense' }, { reading: r, skin: sk }), joy = pickDirections({ genre: 'commercial', feeling: 'joyful' }, { reading: r, skin: sk });
  assert.ok(tense.length >= 4 && joy.length >= 4);
  assert.notDeepEqual(tense.map(d => d.id), joy.map(d => d.id));
  for (const d of [...tense, ...joy]) { assert.ok(d.look.C && d.look.M && d.look.G && d.name && d.line); assert.ok(cat.color[d.look.C] && cat.medium[d.look.M]); }
  assert.ok(tense.concat(joy).some(d => d.kind === 'natural'), 'a minimal option is always offered');
});
test('two answers per question: both shape the directions, the first leads', () => {
  const r = readFrame(fixture, enc), sk = checkSkin(fixture);
  assert.deepEqual(answers('tense'), ['tense']); assert.deepEqual(answers(['a', 'b', 'c']), ['a', 'b']); assert.deepEqual(answers(''), []);
  const one = pickDirections({ feeling: ['tender'] }, { reading: r, skin: sk }), two = pickDirections({ feeling: ['tender', 'nostalgic'] }, { reading: r, skin: sk });
  assert.ok(two.some(d => d.feel.includes('tender') && d.feel.includes('nostalgic')), 'a recipe serving both feelings is offered');
  const d = two.find(x => x.feel.includes('tender') && x.feel.includes('nostalgic')); assert.match(whyFor(d, { feeling: ['tender', 'nostalgic'] }, enc).lines[0], /tender \/ intimate and nostalgic scene.*serves both/);
  assert.notDeepEqual(one.map(x => x.id), two.map(x => x.id));
  const roles = pickDirections({ role: ['product', 'face'] }, { reading: r, skin: sk }); assert.ok(roles.every(x => x.extra.skinGuard >= 0.7), 'a face as second role still guards skin');
});
test('several faces: each has its own reading, and the lead face drives the checks', () => {
  const f = solid(200, 112, (x, y) => (Math.hypot(x - 0.3, (y - 0.45) * 0.6) < 0.07 ? [0.7, 0.52, 0.42] : Math.hypot(x - 0.72, (y - 0.45) * 0.6) < 0.05 ? [0.3, 0.2, 0.14] : [0.1, 0.12, 0.16]));
  const a = checkSkin(f), b = checkSkin(f, { lead: 1 });
  assert.equal(a.faces.length, 2); assert.ok(a.faces[0].ire > 45 && a.faces[1].ire < 30);
  assert.ok(!a.findings.some(x => /underexposed/.test(x.title))); assert.ok(b.findings.some(x => /underexposed/.test(x.title)));
  assert.ok(a.findings.some(x => /Face 2 \(\d+ IRE\) and face 1/.test(x.text)));
});
test('continuity: a look is judged against the shots either side', () => {
  const r = readFrame(fixture, enc), me = pictureOf(r.stats);
  const same = [{ side: 'before', name: 'a', pic: me }, { side: 'after', name: 'b', pic: me }];
  assert.match(continuity(null, r, same), /Already sits in line with the shots either side/);
  const warmFn = c => [Math.min(1, c[0] * 1.25 + 0.05), c[1], c[2] * 0.75], cool = [{ side: 'before', name: 'a', pic: { ...me, b: me.b - 0.03 } }];
  assert.match(continuity(warmFn, r, cool), /warmer than the shot before/);
  assert.equal(continuity(warmFn, r, []), '');
});
test('presets save, share as a code and import', () => {
  const p = savePreset({ name: 'Test look', look: parseCode('K1·C1·M2'), extra: { skinGuard: 0.5 }, intent: { feeling: 'tender' } });
  const code = presetCode(p); assert.match(code, /^CLP1:/);
  const q = importPresetCode(code); assert.equal(q.look.C, 'C1'); assert.equal(q.extra.skinGuard, 0.5); assert.notEqual(q.id, p.id);
  assert.ok(listPresets().length >= 2);
});
test('neutral look is a true pass-through on Rec.709 footage', () => {
  const fn = makePixelFn(parseCode('C0'), cat, luts, { keepExposure: true });
  for (const c of [[0, 0, 0], [0.18, 0.18, 0.18], [0.5, 0.5, 0.5], [1, 1, 1], [0.8, 0.55, 0.4], [0.2, 0.4, 0.8]]) fn(c).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 0.004, `${c} -> ${fn(c)}`));
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

test('Smart mode keeps only valid picks, answers and adjustments', () => {
  const v = smartValidate(parseReply('```json\n{"sees":"a woman by a window","picks":[{"recipe":"warm-print","why":"warm the window light","tweaks":{"temp":5,"sat":0.9,"rm":1}},{"recipe":"made-up","why":"x"},{"recipe":"warm-print"}],"answers":{"feeling":["tender","bogus"],"genre":"drama"},"questions":["Is she alone?"]}\n```'));
  assert.equal(v.sees, 'a woman by a window'); assert.equal(v.picks.length, 1, 'unknown and duplicate recipes dropped');
  assert.deepEqual(v.picks[0].tweaks, { temp: 0.6, sat: 0.9 }, 'clamped, unknown keys dropped');
  assert.deepEqual(v.answers.feeling, ['tender']); assert.deepEqual(v.answers.genre, ['drama']); assert.deepEqual(v.questions, ['Is she alone?']);
  const d = directionsFromPicks(v.picks, { feeling: ['tender'], role: ['face'] }, { skin: { found: true } })[0];
  assert.equal(d.kind, 'smart'); assert.equal(d.look.C, 'C1'); assert.equal(d.look.G.temp, 0.6); assert.ok(d.extra.skinGuard >= 0.7);
  assert.throws(() => parseReply('no json here'));
});
test('Smart mode talks to Ollama, OpenAI-compatible servers, Claude and Gemini in their own formats', async () => {
  const seen = []; const reply = { picks: [] };
  const post = async (url, headers, body) => { seen.push({ url, headers, body: JSON.parse(body) });
    const j = url.includes('/api/chat') ? { message: { content: JSON.stringify(reply) } } : url.includes('/chat/completions') ? { choices: [{ message: { content: JSON.stringify(reply) } }] }
      : url.includes('api.anthropic.com') ? { content: [{ text: JSON.stringify(reply).slice(1) }] } : { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] };
    return { status: 200, text: JSON.stringify(j) }; };
  const req = { prompt: buildPrompt({ intent: { genre: [], feeling: ['tense'], role: [] }, message: 'darker' }), imageB64: 'QUJD' };
  for (const cfg of [{ provider: 'ollama', ollamaUrl: 'http://localhost:11434/', ollamaModel: 'gemma3:4b' }, { provider: 'openai', openaiUrl: 'http://localhost:5273/v1', openaiModel: 'phi-4', openaiKey: 'k' }, { provider: 'gemini', geminiKey: 'g', geminiModel: 'gemini-2.5-flash' }, { provider: 'claude', claudeKey: 'sk-ant-x', claudeModel: 'claude-opus-5' }])
    assert.deepEqual(parseReply(await smartAsk(cfg, req, post)), reply);
  assert.equal(seen[0].url, 'http://localhost:11434/api/chat'); assert.deepEqual(seen[0].body.messages.at(-1).images, ['QUJD']); assert.equal(seen[0].body.format, 'json');
  assert.equal(seen[1].url, 'http://localhost:5273/v1/chat/completions'); assert.equal(seen[1].headers.authorization, 'Bearer k'); assert.match(seen[1].body.messages.at(-1).content[1].image_url.url, /^data:image\/png;base64,QUJD/);
  assert.match(seen[2].url, /gemini-2\.5-flash:generateContent$/); assert.equal(seen[2].headers['x-goog-api-key'], 'g'); assert.equal(seen[2].body.contents.at(-1).parts[1].inline_data.data, 'QUJD');
  assert.equal(seen[3].url, 'https://api.anthropic.com/v1/messages'); assert.equal(seen[3].headers['x-api-key'], 'sk-ant-x'); assert.equal(seen[3].headers['anthropic-version'], '2023-06-01');
  assert.equal(seen[3].body.model, 'claude-opus-5'); assert.equal(seen[3].body.messages.at(-2).content[1].source.data, 'QUJD'); assert.equal(seen[3].body.messages.at(-1).content, '{');
  assert.match(req.prompt, /EDITOR'S MESSAGE: darker/); assert.match(req.prompt, /warm-print/);
});
test('Automatic picks Ollama when it has a vision model, else a Gemini key, else nothing', async () => {
  const get = models => async () => ({ status: 200, text: JSON.stringify({ models: models.map(name => ({ name })) }) });
  assert.equal((await resolveProvider({ provider: 'auto', ollamaUrl: 'x' }, get(['llama3:8b', 'gemma3:4b']))).ollamaModel, 'gemma3:4b');
  assert.equal((await resolveProvider({ provider: 'auto', ollamaUrl: 'x', geminiKey: 'k' }, get(['llama3:8b']))).provider, 'gemini');
  assert.equal((await resolveProvider({ provider: 'auto', ollamaUrl: 'x', geminiKey: 'k', claudeKey: 'c' }, get(['llama3:8b']))).provider, 'claude');
  assert.equal(await resolveProvider({ provider: 'auto', ollamaUrl: 'x' }, async () => { throw new Error('down'); }), null);
});

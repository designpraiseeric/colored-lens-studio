// Host contract tests: the built Premiere and Resolve panels run against mock versions of the host APIs
// (shaped after @adobe/premierepro 27 and Resolve's scripting API). Needs `npm run build` and Chrome.
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Module from 'node:module';
import { kParams } from '../engine/src/generated/params.generated.js';
import { parseCode, lookToEngineParams } from '../core/look.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FRAME = path.join(ROOT, 'test', 'fixtures', 'frame.bmp');
const chrome = ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));

test('engine parameter ids match what the panels send', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/content/looks.json'), 'utf8')).catalog;
  const sent = Object.keys(lookToEngineParams(parseCode('C1', cat), cat)).sort(), known = kParams.map(p => p.id).sort();
  assert.deepEqual(sent, known);
});

function serve(dir) {
  return new Promise(res => { const s = http.createServer((req, rsp) => { const f = path.join(dir, decodeURIComponent(req.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isFile()) { rsp.writeHead(200); rsp.end(fs.readFileSync(f)); } else { rsp.writeHead(404); rsp.end(); } }).listen(0, () => res(s)); });
}

test('Premiere panel: grab, mark, read markers, apply the effect, update', { skip: !chrome && 'no Chrome' }, async () => {
  const { chromium } = await import('playwright-core');
  const server = await serve(path.join(ROOT, 'dist', 'premiere')), port = server.address().port;
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 1200 } });
    const errors = [], window_seen = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://designpraiseeric.github.io/**', async route => {
      const rel = route.request().url().split('/colored-lens-studio/')[1].split('?')[0], f = path.join(ROOT, 'site', rel);
      if (rel === 'version.json') { const v = JSON.parse(fs.readFileSync(f, 'utf8')); v.version = '9.9.9'; return route.fulfill({ body: JSON.stringify(v), contentType: 'application/json' }); }
      return fs.existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404, body: '' });
    });
    let badDownload = false; // a real installer starts with its file signature; the panel must refuse anything else
    await page.route('https://github.com/**', route => route.fulfill({ body: badDownload ? Buffer.from('<html>not an installer</html>') : Buffer.concat([Buffer.from('xar!'), Buffer.alloc(300000, 7)]) }));
    const html = fs.readFileSync(path.join(ROOT, 'dist/premiere/index.html'), 'utf8').replace('<script src="app.js">', '<script src="mock.js"></script><script src="app.js">');
    await page.route(`http://127.0.0.1:${port}/test.html`, r => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.route(`http://127.0.0.1:${port}/mock.js`, r => r.fulfill({ path: path.join(ROOT, 'test/mocks/premiere_mock.js') }));
    await page.addInitScript(({ bmp, params }) => { window.__bmp = new Uint8Array(bmp); window.__effectParams = params; }, { bmp: [...fs.readFileSync(FRAME)], params: kParams });
    await page.goto(`http://127.0.0.1:${port}/test.html`);
    // first run: the tour opens; walk it to the end, look at the Smart setup, then start
    await page.waitForSelector('#gNext', { timeout: 15000 }); for (let i = 0; i < 6; i++) await page.click('#gNext');
    await page.click('#gSmart'); await page.waitForSelector('.card.route'); assert.match(await page.innerText('#body'), /Apple Intelligence/);
    await page.click('button[data-route="ollama"]'); assert.match(await page.innerText('#body'), /ollama pull gemma3:4b/);
    assert.match(await page.inputValue('textarea[data-prompt="smart"]'), /one small step at a time/);
    await page.click('[data-tab=shot]');
    await page.waitForSelector('#grab', { timeout: 15000 });
    await page.click('#grab'); await page.waitForSelector('#reading .card', { timeout: 15000 });
    assert.match(await page.innerText('#body'), /A001_C003 00:00:12:12/);
    // timeline context: the selected V1 clip is the shot, the V3 title above it is named
    const ctx = await page.innerText('.card.ctx'); assert.match(ctx, /V1 · A001_C003/); assert.match(ctx, /V3 graphic \/ title “Lower third”/);
    assert.match(ctx, /Scene “Scene 2 — kitchen”/, 'scene from a marker'); assert.match(ctx, /V4 “BROLL LAYER” is empty at this moment/, 'an empty nest on top is not the shot'); assert.match(ctx, /shots either side/, 'continuity with the neighbours');
    // two answers per question
    await page.click('[data-intent="feeling:tender"]'); await page.waitForTimeout(300);
    // the loop: answer what the shot is for, get directions, preview one, apply it, save it as a preset
    await page.click('[data-intent="feeling:tense"]'); await page.waitForSelector('.dir', { timeout: 20000 });
    assert.equal(await page.innerText('[data-intent="feeling:tense"]'), '+ Tense', 'second answer marked');
    assert.ok((await page.$$('.dir')).length >= 4, 'at least four directions');
    await page.locator('.dir .dtext b').first().click(); await page.waitForSelector('[data-dapply]');
    await page.waitForFunction(() => document.querySelector('#stA') && document.querySelector('#stA').src.startsWith('data:image/png'), null, { timeout: 15000 });
    // drag the wipe on the picture: the clip edge follows the mouse
    { const bx = await page.locator('#stage').boundingBox(); await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.down(); await page.mouse.move(bx.x + bx.width * 0.25, bx.y + bx.height / 2, { steps: 4 });
      const mid = await page.evaluate(() => parseFloat(document.querySelector('#stClip').style.left)); await page.mouse.up(); assert.ok(Math.abs(mid - bx.width * 0.25) < 6, 'wipe follows the drag: ' + mid); }
    await page.click('[data-dsave]'); await page.waitForTimeout(400);
    // pop the preview out into its own panel, then bring it back
    await page.click('#dockPop'); await page.waitForSelector('#pvRoot #previewPanel #stage');
    assert.match(await page.innerText('#dock'), /in its own panel/);
    await page.click('#dockBack'); await page.waitForSelector('#dock #stage');
    assert.match(await page.innerText('#pvRoot'), /back in the Colored Lens panel/);
    // Smart mode with a local Ollama (faked): set it up, ask about the frame, get a Smart pick among the directions
    await page.route('http://localhost:11434/**', route => { const u = route.request().url();
      if (u.endsWith('/api/tags')) return route.fulfill({ body: JSON.stringify({ models: [{ name: 'llama3:8b' }, { name: 'gemma3:4b' }] }), contentType: 'application/json' });
      const body = JSON.parse(route.request().postData()); window_seen.push(body);
      return route.fulfill({ body: JSON.stringify({ message: { content: JSON.stringify({ sees: 'A man selling candy floss on a beach.', reading: 'Warm and busy.', questions: ['Is this the opening?'], answers: { feeling: ['joyful'] }, picks: [{ recipe: 'super8-summer', why: 'Leans into the warm afternoon.', tweaks: { grainK: 0.6 } }] }) } }), contentType: 'application/json' }); });
    await page.click('#smartBtn'); await page.click('[data-prov="ollama"]'); await page.click('#olTest'); await page.waitForSelector('#olModel');
    assert.equal(await page.inputValue('#olModel'), 'gemma3:4b', 'the vision model is picked'); await page.click('#smBack');
    await page.fill('#smMsg', 'make it feel like summer'); await page.click('#smAsk'); await page.waitForSelector('.badge.smart', { timeout: 15000 });
    assert.match(await page.innerText('.card.smart'), /candy floss/); assert.equal(window_seen[0].model, 'gemma3:4b'); assert.ok(window_seen[0].messages.at(-1).images[0].length > 1000, 'the frame is sent');
    assert.match(window_seen[0].messages.at(-1).content, /EDITOR'S MESSAGE: make it feel like summer/);
    await page.click('[data-tab=presets]'); await page.waitForSelector('.preset');
    await page.click('[data-tab=scene]'); await page.fill('#tags', 'Ada'); await page.click('#add'); await page.waitForSelector('.shot');
    await page.click('#clear'); await page.click('#load'); await page.waitForSelector('.shot');
    await page.click('[data-tab=tweak]'); await page.click('[data-scope="scene"]'); await page.click('#apply'); await page.waitForSelector('#toast:not([hidden])');
    assert.match(await page.innerText('#toast'), /scene “Scene 2 — kitchen”/); await page.click('[data-scope="clip"]');
    await page.click('[data-tab=tweak]'); await page.selectOption('[data-axis=C]', 'C2'); await page.click('#apply'); await page.waitForTimeout(800);
    const pp = await page.evaluate(() => window.__pp);
    assert.ok(pp.calls.includes('Add Lukuluku Look'), 'effect appended');
    assert.equal(pp.params['Colour science'], 2, 'C2 is popup index 2: Premiere UXP popups are 0-based');
    // a clean re-read: the shot now carries our look, so Bypass goes on for the export and off again
    await page.click('[data-tab=shot]'); await page.click('#grab'); await page.waitForSelector('.card.ctx'); await page.waitForTimeout(500);
    const calls = await page.evaluate(() => window.__pp.calls);
    assert.ok(calls.includes('Colored Lens: read the shot without its look') && calls.includes('Colored Lens: look back on'), 'bypass toggled: ' + calls.join(', '));
    assert.equal(await page.evaluate(() => window.__pp.params['Bypass (show the original)']), false, 'look switched back on');
    assert.match(await page.innerText('.card.ctx'), /switched off for a moment/);
    assert.equal(pp.params['Animate grain'], true);
    assert.equal(pp.markers.length, 1); assert.match(pp.markers[0].comments, /^CLS1:/);
    await page.waitForSelector('#doUpdate'); await page.click('#doUpdate'); await page.waitForTimeout(800);
    const pp2 = await page.evaluate(() => window.__pp.calls);
    assert.ok(pp2.some(c => /^openPath \/tmp\/tmp\/ColoredLensStudio-.*-mac\.pkg$/.test(c)), 'installer downloaded and opened: ' + pp2.join(', '));
    // a broken download is refused, and the banner offers the GitHub download instead
    badDownload = true; await page.reload(); await page.waitForSelector('#doUpdate'); await page.click('#doUpdate'); await page.waitForSelector('#manualUpdate', { timeout: 10000 });
    assert.match(await page.innerText('#banner'), /not a valid installer/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('Resolve plugin main process: grab, markers, LUT, update', async () => {
  // fake electron + Resolve, then load the built main.js
  const handlers = {}, opened = [];
  const fakeElectron = { app: { whenReady: () => new Promise(() => {}), on() {}, getPath: () => fs.mkdtempSync('/tmp/clr-') }, BrowserWindow: class {},
    ipcMain: { handle: (n, fn) => { handlers[n.replace('cl:', '')] = fn; } }, shell: { openExternal: async u => opened.push(u), openPath: async p => { opened.push(p); return ''; } },
    dialog: { showSaveDialog: async () => ({ canceled: true }) } };
  const bmp = fs.readFileSync(FRAME), state = { tc: '01:00:00:00', markers: {}, lut: null, page: 'edit' };
  const album = { ExportStills: async (st, dir, prefix, fmt) => { fs.writeFileSync(path.join(dir, prefix + '_1.1.1.bmp'), bmp); fs.writeFileSync(path.join(dir, prefix + '_1.1.1.drx'), ''); return true; }, DeleteStills: async () => true };
  const item = { GetName: async () => 'A001_C003', SetLUT: async (n, p) => { state.lut = [n, p]; return true; } };
  const tl = { GetSetting: async () => '24', GetStartTimecode: async () => '01:00:00:00', SetCurrentTimecode: async tc => { state.tc = tc; return true; }, GetCurrentTimecode: async () => state.tc,
    GrabStill: async () => ({ still: 1 }), GetCurrentVideoItem: async () => item, GetName: async () => 'Main', GetStartFrame: async () => 86400, GetEndFrame: async () => 86400 + 24 * 30,
    AddMarker: async (f, c, n, note, d, custom) => { state.markers[f] = { color: c, name: n, note, duration: d, customData: custom }; return true; }, GetMarkers: async () => state.markers };
  const project = { GetCurrentTimeline: async () => tl, GetGallery: async () => ({ GetCurrentStillAlbum: async () => album }), RefreshLUTList: async () => true };
  const resolve = { GetProjectManager: async () => ({ GetCurrentProject: async () => project }), GetCurrentPage: async () => state.page, OpenPage: async p => { state.page = p; return true; } };
  const dir = path.join(ROOT, 'dist', 'resolve', 'com.designpraise.coloredlens');
  fs.writeFileSync(path.join(dir, 'WorkflowIntegration.node.js'), '');
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === 'electron') return fakeElectron;
    if (req.endsWith('WorkflowIntegration.node')) return { Initialize: async () => true, GetResolve: async () => resolve };
    return origLoad.apply(this, arguments);
  };
  const origExists = fs.existsSync; fs.existsSync = p => (String(p).endsWith('WorkflowIntegration.node') ? true : origExists(p));
  try {
    Module.createRequire(path.join(dir, 'main.js'))('./main.js');
    const g = await handlers.grabFrame(null, 2.5);
    assert.equal(g.timecode, '01:00:02:12'); assert.equal(g.clipName, 'A001_C003'); assert.equal(state.page, 'edit', 'returns to the page it came from');
    assert.equal(g.bytes[0], 0x42, 'BMP bytes come back');
    await handlers.addMarker(null, { seconds: 2.5, name: 'Colored Lens: Teal', note: 'CLS1:{"t":2.5}' });
    const ms = await handlers.listMarkers(null); assert.equal(ms[0].seconds, 2.5); assert.equal(ms[0].note, 'CLS1:{"t":2.5}');
    assert.equal(state.markers[60].note, 'Colored Lens shot', 'readable note in Resolve, data in customData');
    const res = await handlers.applyLut(null, 'test_look', 'LUT_3D_SIZE 2\n');
    assert.ok(res.ok && state.lut[0] === 1 && state.lut[1].endsWith('ColoredLens/test_look.cube'), JSON.stringify(res));
    assert.equal(await handlers.sequenceDuration(null), 30);
  } finally { Module._load = origLoad; fs.existsSync = origExists; fs.rmSync(path.join(dir, 'WorkflowIntegration.node.js'), { force: true }); }
});

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
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://designpraiseeric.github.io/**', async route => {
      const rel = route.request().url().split('/colored-lens-studio/')[1].split('?')[0], f = path.join(ROOT, 'site', rel);
      if (rel === 'version.json') { const v = JSON.parse(fs.readFileSync(f, 'utf8')); v.version = '9.9.9'; return route.fulfill({ body: JSON.stringify(v), contentType: 'application/json' }); }
      return fs.existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404, body: '' });
    });
    await page.route('https://github.com/**', route => route.fulfill({ body: Buffer.from('fake installer') }));
    const html = fs.readFileSync(path.join(ROOT, 'dist/premiere/index.html'), 'utf8').replace('<script src="app.js">', '<script src="mock.js"></script><script src="app.js">');
    await page.route(`http://127.0.0.1:${port}/test.html`, r => r.fulfill({ body: html, contentType: 'text/html' }));
    await page.route(`http://127.0.0.1:${port}/mock.js`, r => r.fulfill({ path: path.join(ROOT, 'test/mocks/premiere_mock.js') }));
    await page.addInitScript(({ bmp, params }) => { window.__bmp = new Uint8Array(bmp); window.__effectParams = params; }, { bmp: [...fs.readFileSync(FRAME)], params: kParams });
    await page.goto(`http://127.0.0.1:${port}/test.html`);
    await page.waitForSelector('#grab', { timeout: 15000 });
    await page.click('#grab'); await page.waitForSelector('#reading .card', { timeout: 15000 });
    assert.match(await page.innerText('#body'), /A001_C003 00:00:12:12/);
    // the loop: answer what the shot is for, get directions, preview one, apply it, save it as a preset
    await page.click('[data-intent="feeling:tense"]'); await page.waitForSelector('.dir', { timeout: 20000 });
    assert.ok((await page.$$('.dir')).length >= 4, 'at least four directions');
    await page.locator('.dir .dtext b').first().click(); await page.waitForSelector('[data-dapply]');
    await page.waitForFunction(() => document.querySelector('#stage') && document.querySelector('#stage').src.startsWith('data:image/png'), null, { timeout: 15000 });
    await page.click('[data-dsave]'); await page.waitForTimeout(400);
    await page.click('[data-tab=presets]'); await page.waitForSelector('.preset');
    await page.click('[data-tab=scene]'); await page.fill('#tags', 'Ada'); await page.click('#add'); await page.waitForSelector('.shot');
    await page.click('#clear'); await page.click('#load'); await page.waitForSelector('.shot');
    await page.click('[data-tab=tweak]'); await page.selectOption('[data-axis=C]', 'C2'); await page.click('#apply'); await page.waitForTimeout(800);
    const pp = await page.evaluate(() => window.__pp);
    assert.ok(pp.calls.includes('Add Lukuluku Look'), 'effect appended');
    assert.equal(pp.params['Colour science'], 2, 'C2 is popup index 2: Premiere UXP popups are 0-based');
    assert.equal(pp.params['Animate grain'], true);
    assert.equal(pp.markers.length, 1); assert.match(pp.markers[0].comments, /^CLS1:/);
    await page.waitForSelector('#doUpdate'); await page.click('#doUpdate'); await page.waitForTimeout(800);
    const pp2 = await page.evaluate(() => window.__pp.calls);
    assert.ok(pp2.some(c => /^openPath \/tmp\/tmp\/ColoredLensStudio-.*-mac\.pkg$/.test(c)), 'installer downloaded and opened: ' + pp2.join(', '));
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

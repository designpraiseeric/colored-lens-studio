// Colored Lens for DaVinci Resolve Studio: Workflow Integration plugin (an Electron app Resolve launches from
// Workspace > Workflow Integrations). This main process owns the connection to Resolve; the panel UI runs
// sandboxed in the window and calls in through preload.js.
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const PLUGIN_ID = 'com.designpraise.coloredlens';
const IS_WIN = process.platform === 'win32';

// ---- Resolve connection. WorkflowIntegration.node ships with Resolve Studio; we load it from Resolve's own
// Developer folder (so we never redistribute it), or from next to this file if the installer copied it.
let WI = null, resolveObj = null;
function wiCandidates() {
  const dev = IS_WIN ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Workflow Integrations')
    : '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations';
  return [path.join(__dirname, 'WorkflowIntegration.node'), path.join(dev, 'Examples', 'SamplePlugin', 'WorkflowIntegration.node'), path.join(dev, 'Examples', 'CompatibleSamplePlugin', 'WorkflowIntegration.node')];
}
async function R() {
  if (resolveObj) return resolveObj;
  if (!WI) {
    const found = wiCandidates().find(p => fs.existsSync(p));
    if (!found) throw new Error('WorkflowIntegration.node was not found. Colored Lens needs DaVinci Resolve Studio.');
    WI = require(found);
    if (!(await WI.Initialize(PLUGIN_ID))) throw new Error('Resolve did not accept the Colored Lens plugin id');
  }
  resolveObj = await WI.GetResolve();
  if (!resolveObj) throw new Error('Could not connect to DaVinci Resolve');
  return resolveObj;
}
async function projectAndTimeline() {
  const r = await R(), pm = await r.GetProjectManager(), project = await pm.GetCurrentProject();
  if (!project) throw new Error('Open a project first');
  const tl = await project.GetCurrentTimeline(); if (!tl) throw new Error('Open a timeline first');
  return { r, project, tl };
}

// ---- timecode helpers (non-drop-frame)
async function fpsOf(tl) { const v = parseFloat(await tl.GetSetting('timelineFrameRate')); return v > 0 ? v : 24; }
function tcToFrames(tc, fps) { const [h, m, s, f] = String(tc).split(/[:;]/).map(Number); const r = Math.round(fps); return ((h * 60 + m) * 60 + s) * r + f; }
function framesToTc(n, fps) { const r = Math.round(fps), p = x => String(x).padStart(2, '0'); return `${p(Math.floor(n / (r * 3600)))}:${p(Math.floor(n / (r * 60)) % 60)}:${p(Math.floor(n / r) % 60)}:${p(n % r)}`; }

// ---- small files
const dataDir = () => { const d = path.join(app.getPath('userData'), 'ColoredLens'); fs.mkdirSync(d, { recursive: true }); return d; };
function downloadTo(url, dest, onProgress, depth = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ColoredLens' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 6) { res.resume(); return resolve(downloadTo(new URL(res.headers.location, url).toString(), dest, onProgress, depth + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (' + res.statusCode + ')')); }
      const total = +res.headers['content-length'] || 0; let got = 0; const out = fs.createWriteStream(dest);
      res.on('data', c => { got += c.length; if (total) onProgress(got / total); }); res.pipe(out); out.on('finish', () => out.close(() => resolve(dest))); out.on('error', reject);
    }).on('error', reject);
  });
}

// ---- the API the panel uses (see hosts/README.md)
const api = {
  /** The Colored Lens Helper on macOS (Apple Intelligence), over the same request / answer files the Premiere panel uses. */
  async bridge(req, ms = 180000) {
    const dir = path.join(os.homedir(), 'Library', 'Application Support', 'ColoredLens', 'bridge'); if (IS_WIN || !fs.existsSync(dir)) throw new Error('helper');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), tmp = path.join(dir, `tmp-${id}.json`), res = path.join(dir, `res-${id}.json`);
    fs.writeFileSync(tmp, JSON.stringify(req)); fs.renameSync(tmp, path.join(dir, `req-${id}.json`));
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { await new Promise(r => setTimeout(r, 150)); if (fs.existsSync(res)) { try { const out = JSON.parse(fs.readFileSync(res, 'utf8')); fs.unlinkSync(res); return out; } catch { /* still being written */ } } }
    throw new Error('helper');
  },
  /** Smart mode's requests go out from here (no page CORS or content policy in the way). */
  async http(url, method, headers, body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 180000);
    try { const r = await fetch(url, { method, headers, body, signal: ctl.signal }); return { status: r.status, text: await r.text() }; } finally { clearTimeout(t); }
  },
  async info() { return { version: require('./package.json').version, os: IS_WIN ? 'win' : 'mac' }; },
  async readBundled(name, type) { const p = path.join(__dirname, 'content', name); if (!fs.existsSync(p)) return null; return type === 'binary' ? new Uint8Array(fs.readFileSync(p)) : fs.readFileSync(p, 'utf8'); },
  async cacheRead(name, type) { const p = path.join(dataDir(), 'cache', name); if (!fs.existsSync(p)) return null; return type === 'binary' ? new Uint8Array(fs.readFileSync(p)) : fs.readFileSync(p, 'utf8'); },
  async cacheWrite(name, data) { const p = path.join(dataDir(), 'cache', name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : Buffer.from(data)); },

  /** Grabs a still of the current frame (or of `seconds` into the timeline) and returns BMP bytes. */
  async grabFrame(seconds) {
    const { r, project, tl } = await projectAndTimeline(), fps = await fpsOf(tl);
    const startTc = await tl.GetStartTimecode(), start = tcToFrames(startTc, fps);
    if (seconds != null) await tl.SetCurrentTimecode(framesToTc(start + Math.round(seconds * fps), fps));
    const tc = await tl.GetCurrentTimecode(), page = await r.GetCurrentPage();
    if (page !== 'color') await r.OpenPage('color'); // stills are grabbed on the Color page
    let still;
    try { still = await tl.GrabStill(); } finally { if (page && page !== 'color') await r.OpenPage(page); }
    if (!still) throw new Error('Resolve could not grab a still here (is there a clip under the playhead?)');
    const album = await (await project.GetGallery()).GetCurrentStillAlbum(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), prefix = 'clframe';
    const ok = await album.ExportStills([still], dir, prefix, 'bmp');
    await album.DeleteStills([still]);
    const file = ok && fs.readdirSync(dir).find(f => f.startsWith(prefix) && f.toLowerCase().endsWith('.bmp'));
    if (!file) throw new Error('The still could not be exported');
    const bytes = new Uint8Array(fs.readFileSync(path.join(dir, file)));
    fs.rmSync(dir, { recursive: true, force: true });
    let clipName = ''; try { const it = await tl.GetCurrentVideoItem(); if (it) clipName = await it.GetName(); } catch { /* optional */ }
    return { bytes, seconds: (tcToFrames(tc, fps) - start) / fps, timecode: tc, clipName: clipName || (await tl.GetName()) };
  },
  async sequenceDuration() { const { tl } = await projectAndTimeline(), fps = await fpsOf(tl); return ((await tl.GetEndFrame()) - (await tl.GetStartFrame())) / fps; },
  async addMarker({ seconds, name, note }) {
    const { tl } = await projectAndTimeline(), fps = await fpsOf(tl), frame = Math.round(seconds * fps);
    const readable = note.startsWith('CLS1:') ? 'Colored Lens shot' : note;
    const ok = await tl.AddMarker(frame, 'Purple', name, readable, 1, note);
    if (!ok) throw new Error('There is already a marker on this frame');
  },
  async listMarkers() {
    const { tl } = await projectAndTimeline(), fps = await fpsOf(tl), m = (await tl.GetMarkers()) || {};
    return Object.entries(m).map(([frame, v]) => ({ seconds: +frame / fps, name: v.name, note: v.customData || v.note }));
  },
  /** Resolve's scripting API cannot add OpenFX effects, so the look goes on as a LUT on node 1 of the current clip. */
  async applyLut(name, text) {
    const { project, tl } = await projectAndTimeline();
    const dirs = IS_WIN ? [path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'LUT', 'ColoredLens')]
      : ['/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT/ColoredLens', path.join(os.homedir(), 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve', 'LUT', 'ColoredLens')];
    let file = null;
    for (const d of dirs) { try { fs.mkdirSync(d, { recursive: true }); file = path.join(d, name + '.cube'); fs.writeFileSync(file, text); break; } catch { file = null; } }
    if (!file) throw new Error('Could not write to the Resolve LUT folder. Reinstall Colored Lens Studio to fix its permissions.');
    await project.RefreshLUTList();
    const item = await tl.GetCurrentVideoItem(); if (!item) return { ok: false, message: 'Saved ' + name + '.cube to the LUT list (ColoredLens). Park the playhead on a clip to apply it.' };
    const ok = await item.SetLUT(1, file);
    return { ok, message: ok ? `Applied to “${await item.GetName()}” as a LUT on node 1. For grain, halation and glow, add the Lukuluku Look OpenFX (DesignPraise) on a node after it.` : 'Saved ' + name + '.cube to the LUT list (ColoredLens), but Resolve did not apply it: add a node to the clip and try again.' };
  },
  async saveFile(name, data, title) {
    const res = await dialog.showSaveDialog({ title: title || 'Save', defaultPath: path.join(os.homedir(), 'Desktop', name) });
    if (res.canceled || !res.filePath) return null; fs.writeFileSync(res.filePath, typeof data === 'string' ? data : Buffer.from(data)); return res.filePath;
  },
  async openUrl(url) { await shell.openExternal(url); },
  async installUpdate(url, filename) {
    const dest = path.join(os.tmpdir(), filename);
    await downloadTo(url, dest, p => win && win.webContents.send('cl:progress', p));
    const err = await shell.openPath(dest); if (err) throw new Error(err + ' (the installer is at ' + dest + ')');
  },
};
for (const [name, fn] of Object.entries(api)) ipcMain.handle('cl:' + name, async (_e, ...args) => fn(...args));

let win = null;
function createWindow() {
  win = new BrowserWindow({ width: 440, height: 860, title: 'Colored Lens', backgroundColor: '#1d1d1f', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (WI && WI.CleanUp) try { WI.CleanUp(); } catch { /* ignore */ } app.quit(); });

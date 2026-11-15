// Premiere Pro host (UXP, Premiere 25.6+). API calls follow @adobe/premierepro 27 type definitions
// and Adobe's uxp-premiere-pro-samples. Everything the shared panel needs from Premiere goes through here.
import { startApp } from '../../ui/app.js';
import { decodeImage } from '../../core/image.js';
import pkg from '../../package.json';
import config from '../../studio.config.json';
import { kParamLabels } from '../../engine/src/generated/params.generated.js';

const ppro = require('premierepro');
const uxp = require('uxp');
const { localFileSystem: lfs, formats } = uxp.storage;
const os = (() => { try { return require('os').platform() === 'win32' ? 'win' : 'mac'; } catch { return 'mac'; } })();
const TICKS_PER_SECOND = 254016000000;

async function project() { const p = await ppro.Project.getActiveProject(); if (!p) throw new Error('Open a project first'); return p; }
async function sequence() { const s = await (await project()).getActiveSequence(); if (!s) throw new Error('Open a sequence first'); return s; }
function transaction(proj, label, build) {
  let ok = false;
  proj.lockedAccess(() => { ok = proj.executeTransaction(ca => build(ca), label); });
  if (!ok) throw new Error(label + ' did not go through');
}
async function fps(seq) { try { const tb = await seq.getTimebase(); const t = Number(tb); return t > 0 ? TICKS_PER_SECOND / t : 25; } catch { return 25; } }
function timecode(seconds, rate) { const r = Math.round(rate), f = Math.round(seconds * rate), p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (r * 3600)))}:${p(Math.floor(f / (r * 60)) % 60)}:${p(Math.floor(f / r) % 60)}:${p(f % r)}`; }

// ---- files: a small helper over UXP's storage API (nested paths inside a folder)
async function entryAt(folder, path, create = false) {
  const parts = path.split('/'); let dir = folder;
  for (const p of parts.slice(0, -1)) { try { dir = await dir.getEntry(p); } catch { if (!create) return null; dir = await dir.createFolder(p); } }
  if (create) return dir.createFile(parts[parts.length - 1], { overwrite: true });
  try { return await dir.getEntry(parts[parts.length - 1]); } catch { return null; }
}
const readEntry = async (e, type) => e ? e.read({ format: type === 'binary' ? formats.binary : formats.utf8 }) : null;

let effectMatchName = null; // e.g. "AE.DesignPraise Lukuluku Look" once the effect is installed
async function findEffect() {
  if (effectMatchName) return effectMatchName;
  try { const names = await ppro.VideoFilterFactory.getMatchNames(); effectMatchName = names.find(n => n.endsWith(config.ids.adobeMatchName)) || null; } catch { effectMatchName = null; }
  return effectMatchName;
}

const host = {
  name: 'premiere', label: 'Premiere Pro', version: pkg.version, os, preferCcx: false,
  applyNote: 'Adds the Lukuluku Look effect to the selected clips (or updates it if it is already there). Without the effect installed, the look is saved as a .cube for Lumetri.',
  fetch: (url, o) => fetch(url, o),
  async readBundled(name, type) { return readEntry(await entryAt(await lfs.getPluginFolder(), 'content/' + name), type); },
  cache: {
    async read(name, type) { return readEntry(await entryAt(await lfs.getDataFolder(), 'cache/' + name), type); },
    async write(name, data) { const f = await entryAt(await lfs.getDataFolder(), 'cache/' + name, true); await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); },
  },

  /** Exports the sequence frame at the playhead (or at `seconds`) to a temp BMP and decodes it. */
  async grabFrame(seconds) {
    const seq = await sequence(), rate = await fps(seq);
    const t = seconds == null ? await seq.getPlayerPosition() : ppro.TickTime.createWithSeconds(seconds);
    let w = 960, h = 540;
    try { const r = await seq.getFrameSize(); const s = Math.min(1, 960 / r.width); w = Math.round(r.width * s); h = Math.round(r.height * s); } catch { /* keep 16:9 */ }
    const tmp = await lfs.getTemporaryFolder(), base = 'cl_frame_' + Date.now();
    // PNG is the format Adobe's own sample exports. Whatever Premiere actually writes, decodeImage reads it by its bytes.
    const ok = await ppro.Exporter.exportSequenceFrame(seq, t, base + '.png', tmp.nativePath, w, h);
    if (!ok) throw new Error('Premiere could not export this frame');
    // The export lands a moment later (and some builds add a second extension): wait until the file stops growing.
    let entry = null, last = -1, bytes = null;
    for (let i = 0; i < 80; i++) {
      if (!entry) entry = (await tmp.getEntries()).find(e => e.name.startsWith(base)) || null;
      if (entry) { const b = new Uint8Array(await entry.read({ format: formats.binary })); if (b.length > 0 && b.length === last) { bytes = b; break; } last = b.length; }
      await new Promise(r => setTimeout(r, 75));
    }
    if (!bytes) throw new Error(entry ? 'The exported frame never finished writing' : 'The exported frame did not appear');
    const frame = decodeImage(bytes);
    try { await entry.delete(); } catch { /* temp folder is cleaned by UXP */ }
    let clipName = '';
    try { const items = await (await seq.getSelection()).getTrackItems(); if (items[0] && items[0].getName) clipName = await items[0].getName(); } catch { /* optional */ }
    return { frame, seconds: t.seconds, timecode: timecode(t.seconds, rate), clipName: clipName || seq.name };
  },
  async sequenceDuration() { return (await (await sequence()).getEndTime()).seconds; },

  async addMarker({ seconds, name, note }) {
    const proj = await project(), seq = await sequence(), markers = await ppro.Markers.getMarkers(seq);
    transaction(proj, 'Colored Lens shot', ca => ca.addAction(markers.createAddMarkerAction(name, ppro.Marker.MARKER_TYPE_COMMENT, ppro.TickTime.createWithSeconds(seconds), ppro.TickTime.TIME_ZERO, note)));
  },
  async listMarkers() {
    const seq = await sequence(), markers = await ppro.Markers.getMarkers(seq);
    return markers.getMarkers().map(m => ({ seconds: m.getStart().seconds, name: m.getName(), note: m.getComments() }));
  },

  /** Adds (or updates) the Lukuluku Look effect on every selected video clip and sets its parameters. */
  async applyLook({ params, makeCube }) {
    const match = await findEffect();
    if (!match) {
      const cube = await makeCube(); const path = await host.saveFile(cube.name + '.cube', cube.text, { title: 'Save the look for Lumetri' });
      return { ok: !!path, message: path ? 'The Lukuluku Look effect is not installed, so the look was saved as a .cube. In Lumetri Color → Creative → Look → Browse, pick it.' : 'Cancelled' };
    }
    const proj = await project(), seq = await sequence();
    const items = (await (await seq.getSelection()).getTrackItems()).filter(it => typeof it.createAddVideoTransitionAction === 'function');
    if (!items.length) return { ok: false, message: 'Select one or more video clips in the timeline first.' };
    let done = 0;
    for (const it of items) {
      const chain = await it.getComponentChain();
      let comp = null;
      for (let i = 0; i < chain.getComponentCount(); i++) { const c = chain.getComponentAtIndex(i); if ((await c.getMatchName()) === match) comp = c; }
      if (!comp) {
        const created = await ppro.VideoFilterFactory.createComponent(match);
        transaction(proj, 'Add Lukuluku Look', ca => ca.addAction(chain.createAppendComponentAction(created)));
        const chain2 = await it.getComponentChain(); comp = chain2.getComponentAtIndex(chain2.getComponentCount() - 1);
      }
      const byLabel = {}; for (let i = 0; i < comp.getParamCount(); i++) { const p = comp.getParam(i); byLabel[p.displayName] = p; }
      transaction(proj, 'Set Lukuluku Look', ca => {
        for (const [id, value] of Object.entries(params)) {
          const meta = kParamLabels[id]; const p = meta && byLabel[meta.label]; if (!p) continue;
          const v = meta.kind === 'B' ? !!value : meta.kind === 'P' ? Math.round(value) : Number(value); // Premiere's UXP API takes 0-based popup indices (verified live: +1 landed one item off)
          ca.addAction(p.createSetValueAction(p.createKeyframe(v), true));
        }
      });
      done++;
    }
    return { ok: true, message: `Lukuluku Look applied to ${done} clip${done === 1 ? '' : 's'}.` };
  },

  async saveFile(name, data, { title } = {}) {
    const ext = name.split('.').pop();
    const f = await lfs.getFileForSaving(name, { types: [ext] }); if (!f) return null;
    await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); return f.nativePath;
  },
  openUrl: url => uxp.shell.openExternal(url, 'Opens in your browser'),

  /** Downloads the installer from GitHub Releases into the temp folder and opens it. */
  async installUpdate(url, filename, onProgress = () => {}) {
    const r = await fetch(url); if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    const total = +r.headers.get('content-length') || 0, reader = r.body && r.body.getReader ? r.body.getReader() : null;
    let buf;
    if (reader) { const parts = []; let got = 0; for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (total) onProgress(got / total); }
      buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; } }
    else buf = new Uint8Array(await r.arrayBuffer());
    const tmp = await lfs.getTemporaryFolder(), f = await tmp.createFile(filename, { overwrite: true });
    await f.write(buf.buffer, { format: formats.binary });
    const res = await uxp.shell.openPath(f.nativePath, 'Opens the Colored Lens Studio installer');
    if (res) throw new Error('Could not open the installer: ' + res + '. It is saved at ' + f.nativePath);
  },
};

startApp(host, document.getElementById('root')).catch(e => { document.getElementById('root').textContent = 'Colored Lens could not start: ' + e.message; });

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

// ---- timeline context: what sits under the playhead on each video track
const CLIP = (ppro.Constants && ppro.Constants.TrackItemType && ppro.Constants.TrackItemType.CLIP != null) ? ppro.Constants.TrackItemType.CLIP : 1;
const GRAPHIC_EXT = /\.(png|jpe?g|tiff?|psd|ai|eps|svg|gif|bmp|mogrt|aegraphic)$/i;
async function effectsOn(item) {
  const out = { look: false, lumetri: false };
  try { const ch = await item.getComponentChain(); for (let i = 0; i < ch.getComponentCount(); i++) { const m = await ch.getComponentAtIndex(i).getMatchName();
    if (m.endsWith(config.ids.adobeMatchName)) out.look = true; if (/Lumetri/i.test(m)) out.lumetri = true; } } catch { /* optional */ }
  return out;
}
/** Every enabled clip under the playhead, top track first, with what kind of thing it is. */
const layersAt = (seq, t) => allLayers(seq, t);
/** Every enabled video clip in the sequence (or only those under time `t`), top track first. */
async function allLayers(seq, t = null, depth = 0) {
  const n = await seq.getVideoTrackCount(), layers = [];
  for (let i = n - 1; i >= 0; i--) {
    let track; try { track = await seq.getVideoTrack(i); } catch { continue; }
    try { if (await track.isMuted()) continue; } catch { /* older builds */ }
    let items = []; try { items = track.getTrackItems(CLIP, false) || []; } catch { continue; }
    for (const it of items) {
      const s0 = (await it.getStartTime()).seconds, e0 = (await it.getEndTime()).seconds; if (t != null && (t < s0 || t >= e0)) continue;
      let disabled = false; try { disabled = await it.isDisabled(); } catch {} if (disabled) continue;
      let kind = 'video', path = '', inputLUT = '', nested = false, inner = null, empty = false;
      try { if (await it.isAdjustmentLayer()) kind = 'adjustment'; } catch {}
      if (kind !== 'adjustment') try {
        const pi = await it.getProjectItem(), clip = ppro.ClipProjectItem.cast(pi);
        try { nested = await clip.isSequence(); } catch {}
        try { path = await clip.getMediaFilePath(); } catch {}
        try { inputLUT = await clip.getInputLUTID(); } catch {}
        kind = nested ? 'nested' : !path || GRAPHIC_EXT.test(path) ? 'graphic' : 'video';
        // a nested sequence: look inside at this moment. Wrapper nests (B-roll layers and the like) are often
        // empty for long stretches; an empty stretch adds nothing to the picture and is not the shot.
        if (nested && t != null && depth < 2) try {
          const ns = await clip.getSequence(), local = t - s0 + (await it.getInPoint()).seconds, lay = await allLayers(ns, local, depth + 1);
          empty = !lay.some(l => l.kind !== 'adjustment' && !l.empty); const sub = subjectOf(lay);
          if (sub) { const off = s0 - (await it.getInPoint()).seconds; // nested time -> this sequence's time
            inner = { name: sub.name, track: sub.track, kind: sub.kind, start: Math.max(s0, sub.start + off), end: Math.min(e0, sub.end + off) }; }
        } catch (e) { console.warn('nested', e); }
      } catch {}
      let selected = false; try { selected = await it.getIsSelected(); } catch {}
      layers.push({ item: it, track: i + 1, name: await it.getName(), kind, path, inner, empty, inputLUT: inputLUT && !/^0+(-0+)*$/.test(inputLUT) ? inputLUT : '', selected, start: s0, end: e0, ...(await effectsOn(it)) });
    }
  }
  return layers;
}
/** The shot the editor means: a selected clip under the playhead, else the top footage clip under it. */
async function lookComponent(item) {
  try { const ch = await item.getComponentChain(); for (let i = 0; i < ch.getComponentCount(); i++) { const c = ch.getComponentAtIndex(i); if ((await c.getMatchName()).endsWith(config.ids.adobeMatchName)) return c; } } catch {}
  return null;
}
/** Switches the clip's own Lukuluku Look off or on (the effect's Bypass), so a reading sees the shot, not our look. */
async function setBypass(proj, comp, on) {
  const meta = kParamLabels.bypass; if (!meta) return false; let p = null;
  for (let i = 0; i < comp.getParamCount(); i++) { const q = comp.getParam(i); if (q.displayName === meta.label) p = q; }
  if (!p) return false; // an older effect without Bypass
  transaction(proj, on ? 'Colored Lens: read the shot without its look' : 'Colored Lens: look back on', ca => ca.addAction(p.createSetValueAction(p.createKeyframe(!!on), true)));
  return true;
}
/** Scenes from sequence markers: range markers are scenes; otherwise markers named "Scene…" / "Sc…" start one. */
async function scenesOf(seq) {
  let ms = []; try { ms = (await ppro.Markers.getMarkers(seq)).getMarkers(); } catch { return []; }
  const end = (await seq.getEndTime()).seconds, list = ms.map(m => ({ name: m.getName(), start: m.getStart().seconds, dur: (() => { try { return m.getDuration().seconds; } catch { return 0; } })(), note: m.getComments() || '' }))
    .filter(m => !m.note.includes('CLS1:')).sort((a, b) => a.start - b.start);
  const ranges = list.filter(m => m.dur > 0.5).map(m => ({ name: m.name || 'Scene', start: m.start, end: m.start + m.dur }));
  if (ranges.length) return ranges;
  const starts = list.filter(m => /^\s*(scene|sc[\s\d._-])/i.test(m.name));
  return starts.map((m, i) => ({ name: m.name, start: m.start, end: starts[i + 1] ? starts[i + 1].start : end }));
}
const subjectOf = layers => { const L = layers.filter(l => !l.empty);
  return L.find(l => l.selected && l.kind !== 'adjustment') || L.find(l => l.kind === 'video' || l.kind === 'nested') || L.find(l => l.kind !== 'adjustment') || null; };

const host = {
  name: 'premiere', label: 'Premiere Pro', version: pkg.version, os, preferCcx: false,
  applyNote: 'Adds the Lukuluku Look effect to the selected clips, or to the clip under the playhead when none are selected, and updates it where it is already there. Without the effect installed, the look is saved as a .cube for Lumetri.',
  fetch: (url, o) => fetch(url, o),
  async readBundled(name, type) { return readEntry(await entryAt(await lfs.getPluginFolder(), 'content/' + name), type); },
  cache: {
    async read(name, type) { return readEntry(await entryAt(await lfs.getDataFolder(), 'cache/' + name), type); },
    async write(name, data) { const f = await entryAt(await lfs.getDataFolder(), 'cache/' + name, true); await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); },
  },

  /** Exports the sequence frame at the playhead (or at `seconds`) to a temp BMP and decodes it. */
  async grabFrame(seconds, opts = {}) {
    const seq = await sequence(), rate = await fps(seq);
    const t = seconds == null ? await seq.getPlayerPosition() : ppro.TickTime.createWithSeconds(seconds);
    // A clean read: if the shot already carries our look, switch it off for the export and back on after.
    let bypassed = null, proj = null;
    if (opts.clean) try { const sub = subjectOf(await layersAt(seq, t.seconds)); const comp = sub && sub.look ? await lookComponent(sub.item) : null;
      if (comp) { proj = await project(); if (await setBypass(proj, comp, true)) bypassed = comp; } } catch (e) { console.warn('clean read', e); }
    try {
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
    var frame = decodeImage(bytes);
    try { await entry.delete(); } catch { /* temp folder is cleaned by UXP */ }
    } finally { if (bypassed) try { await setBypass(proj, bypassed, false); } catch (e) { console.warn('restore look', e); } }
    let clipName = '';
    try { const items = await (await seq.getSelection()).getTrackItems(); if (items[0] && items[0].getName) clipName = await items[0].getName(); } catch { /* optional */ }
    return { frame, seconds: t.seconds, timecode: timecode(t.seconds, rate), clipName: clipName || seq.name, sequenceId: String(seq.guid || seq.name), sequenceName: seq.name, withoutLook: !!bypassed };
  },
  async sequenceDuration() { return (await (await sequence()).getEndTime()).seconds; },

  /** What is under the playhead: every layer (top first) and the shot the editor most likely means. */
  async clipContext() {
    const seq = await sequence(), t = (await seq.getPlayerPosition()).seconds, layers = await layersAt(seq, t), subject = subjectOf(layers);
    const plain = l => l && (({ item, ...rest }) => rest)(l);
    const all = await allLayers(seq), scenes = await scenesOf(seq), scene = scenes.find(sc => t >= sc.start && t < sc.end) || null;
    const footage = l => l.kind === 'video' || l.kind === 'nested';
    // the shots either side: whatever is on screen just before this shot cuts in and just after it cuts out
    // (for a nest, the cut of the clip showing inside it), on any track
    let before = null, after = null;
    if (subject) {
      const a = subject.inner && subject.inner.start != null ? subject.inner.start : subject.start, b = subject.inner && subject.inner.end != null ? subject.inner.end : subject.end, endSeq = (await seq.getEndTime()).seconds;
      const at = async x => { const sub = subjectOf(await layersAt(seq, x)); return sub ? { name: sub.inner ? sub.inner.name : sub.name, track: sub.inner ? sub.inner.track : sub.track, seconds: x } : null; };
      if (a > 0.3) before = await at(a - 0.25); if (b < endSeq - 0.3) after = await at(b + 0.25);
    }
    const inScene = l => scene && l.start < scene.end && l.end > scene.start && (l.kind !== 'nested' || (l.start >= scene.start - 0.05 && l.end <= scene.end + 0.05));
    const counts = { clip: subject ? 1 : 0, source: subject && subject.path ? all.filter(l => l.path === subject.path).length : 0,
      scene: scene ? all.filter(l => footage(l) && inScene(l)).length : 0, adjust: layers.filter(l => l.kind === 'adjustment').length };
    return { sequenceId: String(seq.guid || seq.name), sequenceName: seq.name, seconds: t, layers: layers.map(plain), subject: plain(subject),
      above: subject ? layers.filter(l => l.track > subject.track && !l.empty).map(plain) : [], emptyAbove: subject ? layers.filter(l => l.track > subject.track && l.empty).map(plain) : [], scene, scenes: scenes.length, before, after, counts };
  },

  async addMarker({ seconds, name, note }) {
    const proj = await project(), seq = await sequence(), markers = await ppro.Markers.getMarkers(seq);
    transaction(proj, 'Colored Lens shot', ca => ca.addAction(markers.createAddMarkerAction(name, ppro.Marker.MARKER_TYPE_COMMENT, ppro.TickTime.createWithSeconds(seconds), ppro.TickTime.TIME_ZERO, note)));
  },
  async listMarkers() {
    const seq = await sequence(), markers = await ppro.Markers.getMarkers(seq);
    return markers.getMarkers().map(m => ({ seconds: m.getStart().seconds, name: m.getName(), note: m.getComments() }));
  },

  /** Adds (or updates) the Lukuluku Look effect on every selected video clip and sets its parameters. */
  async applyLook({ params, makeCube, scope = 'clip' }) {
    const match = await findEffect();
    if (!match) {
      const cube = await makeCube(); const path = await host.saveFile(cube.name + '.cube', cube.text, { title: 'Save the look for Lumetri' });
      return { ok: !!path, message: path ? 'The Lukuluku Look effect is not installed, so the look was saved as a .cube. In Lumetri Color → Creative → Look → Browse, pick it.' : 'Cancelled' };
    }
    const proj = await project(), seq = await sequence();
    let items = [], fallback = '';
    if (scope !== 'clip') { // a wider scope, worked out from the shot under the playhead
      const t = (await seq.getPlayerPosition()).seconds, here = await layersAt(seq, t), subject = subjectOf(here), all = await allLayers(seq);
      const footage = l => l.kind === 'video' || l.kind === 'nested';
      if (scope === 'source') { if (!subject || !subject.path) return { ok: false, message: 'The shot under the playhead has no source file to match.' };
        items = all.filter(l => l.path === subject.path).map(l => l.item); fallback = ` (every clip from ${subject.path.split(/[\\/]/).pop()})`; }
      if (scope === 'scene') { const sc = (await scenesOf(seq)).find(x => t >= x.start && t < x.end);
        if (!sc) return { ok: false, message: 'No scene here. Mark scenes with range markers, or markers named “Scene …”.' };
        items = all.filter(l => footage(l) && l.start < sc.end && l.end > sc.start && (l.kind !== 'nested' || (l.start >= sc.start - 0.05 && l.end <= sc.end + 0.05))).map(l => l.item); fallback = ` (scene “${sc.name}”)`; }
      if (scope === 'adjust') { const adj = here.find(l => l.kind === 'adjustment');
        if (!adj) return { ok: false, message: 'There is no adjustment layer under the playhead. Put one over the scene, then apply to it.' };
        items = [adj.item]; fallback = ` (adjustment layer on V${adj.track}, colouring every track beneath it)`; }
      if (!items.length) return { ok: false, message: 'Nothing to apply to in that scope.' };
    } else items = (await (await seq.getSelection()).getTrackItems()).filter(it => typeof it.createAddVideoTransitionAction === 'function');
    if (!items.length) { // nothing selected: the shot under the playhead
      const subject = subjectOf(await layersAt(seq, (await seq.getPlayerPosition()).seconds));
      if (!subject) return { ok: false, message: 'There is no clip under the playhead. Select clips in the timeline, or park on a shot.' };
      items = [subject.item]; fallback = ` (V${subject.track} · ${subject.name}, under the playhead)`;
    }
    let done = 0, updated = 0;
    for (const it of items) {
      const chain = await it.getComponentChain();
      let comp = null;
      for (let i = 0; i < chain.getComponentCount(); i++) { const c = chain.getComponentAtIndex(i); if ((await c.getMatchName()) === match) comp = c; }
      if (comp) updated++;
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
    const added = done - updated, parts = [added && `added to ${added} clip${added === 1 ? '' : 's'}`, updated && `updated on ${updated} clip${updated === 1 ? '' : 's'}`].filter(Boolean);
    return { ok: true, message: `Lukuluku Look ${parts.join(', ')}${fallback}.` };
  },

  async saveFile(name, data, { title } = {}) {
    const ext = name.split('.').pop();
    const f = await lfs.getFileForSaving(name, { types: [ext] }); if (!f) return null;
    await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); return f.nativePath;
  },
  openUrl: url => uxp.shell.openExternal(url, 'Opens in your browser'),

  /**
   * Downloads the installer from GitHub Releases and opens it. The whole file is fetched in one go (UXP's streamed
   * chunks are not reliably Uint8Arrays, which in 0.1.x could write an empty installer), checked against the
   * expected size and file type, saved to Downloads (temp folder as a fallback) and read back before opening.
   */
  async installUpdate(url, filename, onProgress = () => {}) {
    onProgress(0.05);
    const r = await fetch(url); if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    const total = +r.headers.get('content-length') || 0;
    const buf = new Uint8Array(await r.arrayBuffer()); onProgress(0.9);
    if (total && buf.length !== total) throw new Error(`The download was incomplete (${buf.length} of ${total} bytes)`);
    const magic = String.fromCharCode(...buf.subarray(0, 4)), ext = filename.split('.').pop().toLowerCase();
    const ok = ext === 'pkg' ? magic === 'xar!' : ext === 'exe' ? magic.startsWith('MZ') : ext === 'ccx' ? magic.startsWith('PK') : buf.length > 0;
    if (!ok || buf.length < 100000) throw new Error('The downloaded file is not a valid installer (' + buf.length + ' bytes)');
    let folder = null;
    try { const home = require('os').homedir(); if (home) folder = await lfs.getEntryWithUrl('file:' + home.replace(/\\/g, '/') + '/Downloads'); } catch { folder = null; }
    if (!folder) folder = await lfs.getTemporaryFolder();
    const f = await folder.createFile(filename, { overwrite: true });
    await f.write(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { format: formats.binary });
    try { const back = await f.read({ format: formats.binary }); const n = back.byteLength ?? back.length; if (n !== buf.length) throw new Error(`Saving the installer failed (${n} of ${buf.length} bytes written)`); } catch (e) { if (/Saving/.test(e.message)) throw e; }
    onProgress(1);
    const res = await uxp.shell.openPath(f.nativePath, 'Opens the Colored Lens Studio installer');
    if (res) throw new Error('Could not open the installer: ' + res + '. It is saved at ' + f.nativePath);
    return f.nativePath;
  },
};

// ---- two panels: the main Colored Lens panel, and an optional Preview panel the editor can dock anywhere.
// Both live in this one document and JavaScript context (Adobe's multi-panel pattern): the preview's container
// is appended to the Preview panel's root when that panel shows.
const previewEl = document.createElement('div'); previewEl.id = 'previewPanel'; previewEl.className = 'pv';
let app = null, previewShown = false;
host.openPreviewPanel = async () => {
  const me = [...uxp.pluginManager.plugins].find(p => p.id === config.ids.premierePlugin);
  if (!me) throw new Error('Could not find the Colored Lens plugin to open its preview panel');
  await me.showPanel('preview');
};
try {
  uxp.entrypoints.setup({
    panels: {
      coloredlens: { show() { /* the main panel's content is already in the document */ } },
      preview: {
        show(rootNode) {
          // Premiere may fire hooks for every panel: only take a root that is not the main panel's
          if (!rootNode || (rootNode.contains && rootNode.contains(document.getElementById('root')))) return;
          if (previewEl.parentNode !== rootNode) rootNode.appendChild(previewEl);
          previewShown = true; if (app && app.attachPreview) app.attachPreview(previewEl);
        },
      },
    },
  });
} catch (e) { console.warn('panel setup', e); }

startApp(host, document.getElementById('root')).then(a => { app = a; if (previewShown && a.attachPreview) a.attachPreview(previewEl); })
  .catch(e => { document.getElementById('root').textContent = 'Colored Lens could not start: ' + e.message; });

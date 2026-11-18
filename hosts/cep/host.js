// After Effects host as a CEP panel (works in every current After Effects, including the 2027 release, where
// Adobe has not yet switched on third-party UXP panels — see docs/after-effects-scope.md). Same panel as Premiere;
// the AE work is done by ExtendScript in host/cl.jsx through evalScript, files through CEP's Node.js.
import { startApp } from '../../ui/app.js';
import pkg from '../../package.json';
import { kParamLabels } from '../../engine/src/generated/params.generated.js';

const nreq = typeof window !== 'undefined' && window.cep_node ? window.cep_node.require : (typeof require === 'function' ? require : null);
const fs = nreq ? nreq('fs') : null, os = nreq ? nreq('os') : null, pathM = nreq ? nreq('path') : null;
const OS = os && os.platform() === 'win32' ? 'win' : 'mac';

/** Runs an ExtendScript call in AE and parses its {ok, v} JSON. */
function es(code, ms = 90000) {
  return new Promise((res, rej) => {
    const cep = window.__adobe_cep__; if (!cep) return rej(new Error('Not running inside After Effects'));
    // AE runs one script at a time; if another script or a dialog holds it, the answer never comes. Say so instead of waiting forever.
    const t = setTimeout(() => rej(new Error('After Effects is not answering scripts (another script, a dialog or a render may be holding it). Close any open dialog; if it persists, restart After Effects.')), ms);
    cep.evalScript(code, out => { clearTimeout(t);
      if (out === 'EvalScript error.' || out == null) return rej(new Error('After Effects could not run the script (' + out + ')'));
      let r; try { r = JSON.parse(out); } catch { return rej(new Error('After Effects answered: ' + String(out).slice(0, 200))); }
      if (!r.ok) return rej(new Error(r.error || 'After Effects reported an error')); res(r.v);
    });
  });
}
const lit = v => JSON.stringify(v); // a JS literal is also a valid ExtendScript literal for strings, numbers, arrays
const ext = () => { try { return window.__adobe_cep__.getSystemPath('extension'); } catch { return '.'; } };
function frameDir() { const h = os.homedir(); const d = OS === 'mac' ? h + '/Library/Application Support/ColoredLens' : (process.env.TEMP || h) + '/ColoredLens'; try { fs.mkdirSync(d, { recursive: true }); } catch {} return d; }
/** PNG bytes to pixels with the browser's own decoder (fast even for a 4K comp), at most 960 px wide like Premiere. */
function decodePng(bytes) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const s = Math.min(1, 960 / im.naturalWidth), w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h); const d = x.getImageData(0, 0, w, h); URL.revokeObjectURL(im.src); res({ w, h, data: d.data }); };
    im.onerror = () => rej(new Error('After Effects wrote a frame the panel could not read')); im.src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); });
}
function timecode(seconds, rate) { const r = Math.round(rate || 25), f = Math.round(seconds * r), p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (r * 3600)))}:${p(Math.floor(f / (r * 60)) % 60)}:${p(Math.floor(f / r) % 60)}:${p(f % r)}`; }
const subjectOf = layers => { const L = layers.filter(l => !l.empty);
  return L.find(l => l.selected && l.kind !== 'adjustment') || L.find(l => l.kind === 'video' || l.kind === 'nested') || L.find(l => l.kind !== 'adjustment') || null; };

let loaded = null;
const ready = () => loaded || (loaded = es(`$.evalFile(${lit(ext() + '/host/cl.jsx')}); "{\\"ok\\":true,\\"v\\":1}"`).catch(e => { loaded = null; throw e; }));

const host = {
  name: 'aftereffects', label: 'After Effects', version: pkg.version, os: OS, preferCcx: false,
  applyNote: 'Adds the Lukuluku Look effect to the selected layers, or to the layer the panel reads as the shot, and updates it where it is already there. "Adjustment layer" puts it on a layer named “Colored Lens” at the top of the comp, created the first time. One Edit › Undo removes it.',
  fetch: (url, o) => fetch(url, o),
  readBundled: async (name, type) => { try { const b = fs.readFileSync(pathM.join(ext(), 'content', name)); return type === 'binary' ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b.toString('utf8'); } catch { return null; } },
  cache: {
    read: async (name, type) => { try { const b = fs.readFileSync(pathM.join(frameDir(), 'cache', name)); return type === 'binary' ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b.toString('utf8'); } catch { return null; } },
    write: async (name, data) => { const p = pathM.join(frameDir(), 'cache', name); fs.mkdirSync(pathM.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : Buffer.from(data)); },
  },

  async grabFrame(seconds, opts = {}) {
    await ready(); const ctx = await es('cl_context()'), here = ctx.layers, sub = subjectOf(here);
    const p = `${frameDir()}/cl_ae_frame_${Date.now()}.png`;
    const r = await es(`cl_grab(${seconds == null ? -1 : +seconds}, ${lit(p)}, ${!!opts.clean}, ${lit((opts.hide || []).join(','))})`);
    // the file is finished when two reads in a row agree on its size
    let bytes = null, last = -1; const t0 = Date.now(), LIMIT = opts.waitMs || 90000;
    while (Date.now() - t0 < LIMIT) { try { const b = fs.readFileSync(p); if (b.length && b.length === last) { bytes = b; break; } last = b.length; } catch {} await new Promise(z => setTimeout(z, 150));
      if (opts.onSlow) { const s = Math.round((Date.now() - t0) / 1000); if (s >= 5 && s % 5 === 0) opts.onSlow(s); } }
    if (!bytes) throw new Error('After Effects did not write the frame. If the comp is heavy, wait for it to render and read again.');
    try { fs.unlinkSync(p); } catch {}
    const frame = await decodePng(bytes);
    return { frame, seconds: r.t, timecode: timecode(r.t + (r.start || 0), r.fps), clipName: sub ? sub.name : r.name, sequenceId: r.id, sequenceName: r.name, withoutLook: r.off > 0, hiddenLayers: r.hidden,
      note: r.bpc > 8 ? `This project is ${r.bpc}-bit; After Effects saves such frames darker than they are, so the reading may be off until the project is set to 8-bit.` : '' };
  },
  async sequenceDuration() { await ready(); return (await es('cl_context()')).duration; },
  async clipContext() {
    await ready(); const c = await es('cl_context()'), layers = c.layers, subject = subjectOf(layers), all = c.all, footage = l => l.kind === 'video' || l.kind === 'nested';
    return { sequenceId: c.id, sequenceName: c.name, seconds: c.time, inOut: c.inOut, end: c.duration, layers, subject,
      above: subject ? layers.filter(l => l.track > subject.track) : [], emptyAbove: [], scene: null, scenes: 0, before: null, after: null,
      counts: { clip: subject ? 1 : 0, source: subject && subject.path ? all.filter(l => l.path === subject.path).length : 0, scene: 0, adjust: layers.filter(l => l.kind === 'adjustment').length },
      host: 'aftereffects', footageCount: all.filter(footage).length };
  },
  async addMarker({ seconds, name, note }) { await ready(); await es(`cl_addMarker(${+seconds}, ${lit(name)}, ${lit(note)})`); },
  async listMarkers() { await ready(); return es('cl_markers()'); },
  async applyLook({ params, makeCube, scope = 'clip' }) {
    await ready();
    if ((await es('cl_canApply()')) === false) { const cube = await makeCube(); const p = await host.saveFile(cube.name + '.cube', cube.text);
      return { ok: !!p, message: p ? 'The Lukuluku Look effect is not installed for After Effects, so the look was saved as a .cube. Apply it with Lumetri Color › Creative › Look.' : 'Cancelled' }; }
    const list = Object.entries(params).map(([id, v]) => { const m = kParamLabels[id]; return m ? [m.label, m.kind, typeof v === 'boolean' ? (v ? 1 : 0) : +v] : null; }).filter(Boolean);
    const sub = subjectOf((await es('cl_context()')).layers);
    const r = await es(`cl_apply(${lit(list)}, ${lit(scope === 'adjust' ? 'adjust' : 'clip')}, ${sub ? sub.track : 0})`);
    const parts = [r.added && `added to ${r.added} layer${r.added === 1 ? '' : 's'}`, r.updated && `updated on ${r.updated} layer${r.updated === 1 ? '' : 's'}`].filter(Boolean);
    return { ok: true, message: `Lukuluku Look ${parts.join(', ')}${r.where}. Edit › Undo removes it in one step.${r.missing ? ` Not set (missing from this version of the effect): ${(r.missed || []).join(', ') || r.missing}.` : ''}` };
  },
  async selectionCount() { try { await ready(); return await es('cl_selection()'); } catch { return 0; } },
  async saveFile(name, data) { const d = OS === 'mac' ? os.homedir() + '/Downloads' : os.homedir(); const p = pathM.join(d, name); fs.writeFileSync(p, typeof data === 'string' ? data : Buffer.from(data)); return p; },
  openUrl: url => { try { window.cep.util.openURLInDefaultBrowser(url); } catch { window.open(url, '_blank'); } },
  async installUpdate(url) { host.openUrl(url); },
  async post(url, headers, body) { const r = await fetch(url, { method: 'POST', headers, body }); return { status: r.status, text: await r.text() }; },
  async get(url, headers = {}) { const r = await fetch(url, { headers }); return { status: r.status, text: await r.text() }; },
  words: [[/under the playhead/g, 'at the current time'], [/under your playhead/g, 'at the current time'], [/Park the playhead on/g, 'Move the current time to'],
    [/[Tt]he playhead/g, m => m[0] + 'he current-time indicator'], [/playhead/g, 'current-time indicator'],
    [/nested sequence/g, 'precomp'], [/Scan the sequence/g, 'Scan the comp'], [/Whole sequence/g, 'Whole comp'], [/(the|your|whole|this) sequence/g, '$1 comp'],
    [/an enabled video track/g, 'a visible layer'], [/selected clips/g, 'selected layers'], [/the selected clip\b/g, 'the selected layer']],
  secret: { async get(k) { try { return localStorage.getItem('coloredlens.secret.' + k) || ''; } catch { return ''; } }, async set(k, v) { try { localStorage.setItem('coloredlens.secret.' + k, v); } catch {} } },
};
// The Colored Lens Helper's bridge (Apple Intelligence) is the same file exchange as in Premiere.
if (OS === 'mac' && fs) host.bridge = async (req, ms = 180000) => {
  const dir = os.homedir() + '/Library/Application Support/ColoredLens/bridge/', id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try { fs.writeFileSync(dir + 'tmp-' + id + '.json', JSON.stringify(req)); fs.renameSync(dir + 'tmp-' + id + '.json', dir + 'req-' + id + '.json'); } catch { throw new Error('helper'); }
  const t0 = Date.now(); while (Date.now() - t0 < ms) { await new Promise(r => setTimeout(r, 150)); let txt; try { txt = fs.readFileSync(dir + 'res-' + id + '.json', 'utf8'); } catch { continue; }
    try { const out = JSON.parse(txt); try { fs.unlinkSync(dir + 'res-' + id + '.json'); } catch {} return out; } catch {} }
  try { fs.unlinkSync(dir + 'req-' + id + '.json'); } catch {} throw new Error('helper');
};
// Startup timing (After Effects took ~20 s to paint the panel): one line per stage, in ColoredLens/cep_timing.log.
host.mark = label => { try { fs.appendFileSync(frameDir() + '/cep_timing.log', `${new Date().toISOString()} ${Math.round(performance.now())} ms ${label}\n`); } catch {} };
host.mark('host.js evaluated');
startApp(host, document.getElementById('root')).catch(e => { document.getElementById('root').textContent = 'Colored Lens could not start: ' + e.message; });

// After Effects host (UXP, After Effects 2027 / 27.0+). The same panel as Premiere, on a comp instead of a sequence.
// AE's UXP API is synchronous and mirrors its scripting object model (LayerCollection.byIndex / byName, layers
// numbered from 1 at the top). Everything the shared panel needs from AE goes through here.
//
// Mapping: a comp is the "sequence"; each layer is a "track" (layer 1 is the top, so track = numLayers - index + 1
// keeps "higher track = higher in the stack" true for the panel); comp markers are sequence markers; "This clip"
// is the selected layers or the layer the panel judges to be the shot; "Adjustment layer" is a layer named
// "Colored Lens" (created on first use, in one undo group).
import { decodeImage } from '../../core/image.js';
import pkg from '../../package.json';
import config from '../../studio.config.json';
import { kParamLabels } from '../../engine/src/generated/params.generated.js';
import { commonHost, boot, os, plainFrameDir, readPlain } from '../uxp_common.js';

const ae = require('aftereffects');
const app = ae.app || ae;
const AE_PLUGIN_ID = config.ids.aePlugin || 'com.designpraise.coloredlens.ae';
const MATCH = config.ids.adobeMatchName; // "DesignPraise Lukuluku Look"
const ADJ_NAME = 'Colored Lens';

function comp() {
  const c = app.project && app.project.activeItem;
  if (!c || typeof c.layers !== 'object' || c.width == null) throw new Error('Open a composition (click in its timeline) first');
  return c;
}
const layerAt = (c, i) => (c.layers.byIndex ? c.layers.byIndex(i) : c.layer(i));
function undo(label, fn) { app.beginUndoGroup(label); try { return fn(); } finally { app.endUndoGroup(); } }
function timecode(seconds, rate) { const r = Math.round(rate), f = Math.round(seconds * rate), p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (r * 3600)))}:${p(Math.floor(f / (r * 60)) % 60)}:${p(Math.floor(f / r) % 60)}:${p(f % r)}`; }
const GRAPHIC_EXT = /\.(png|jpe?g|tiff?|psd|ai|eps|svg|gif|bmp)$/i;

function lookEffect(layer) {
  try { const fx = layer.property('ADBE Effect Parade'); for (let i = 1; i <= fx.numProperties; i++) { const p = fx.property(i); if (p.matchName === MATCH || p.name === MATCH) return p; } } catch { /* not an AV layer */ }
  return null;
}
/** Every layer of the comp (top first), or only those visible at time t, shaped like the Premiere host's tracks. */
function layersOf(c, t = null) {
  const n = c.layers.length != null ? c.layers.length : c.numLayers, out = [];
  for (let i = 1; i <= n; i++) {
    const l = layerAt(c, i); if (!l) continue;
    let on = true; try { on = l.enabled !== false && (t == null || (l.activeAtTime ? l.activeAtTime(t) : (t >= l.inPoint && t < l.outPoint))); } catch { /* keep */ }
    if (!on) continue;
    let kind = 'video', path = '';
    const src = l.source;
    try { if (l.adjustmentLayer) kind = 'adjustment'; else if (src && src.layers && src.width != null) kind = 'nested';
      else if (!src || l.nullLayer || /text|shape|camera|light/i.test(String(l.matchName || ''))) kind = 'graphic';
      else { try { path = (src.file && (src.file.fsName || src.file.nativePath || String(src.file))) || ''; } catch { path = ''; }
        kind = !path || GRAPHIC_EXT.test(path) ? (src.mainSource && src.mainSource.color ? 'graphic' : 'video') : 'video'; } } catch { /* a layer we cannot read */ }
    let selected = false; try { selected = !!l.selected; } catch {}
    out.push({ item: l, track: n - i + 1, index: i, name: l.name, kind, path, inner: null, empty: false, inputLUT: '', selected,
      start: l.inPoint, end: l.outPoint, look: !!lookEffect(l), lumetri: false });
  }
  return out;
}
const subjectOf = layers => { const L = layers.filter(l => !l.empty);
  return L.find(l => l.selected && l.kind !== 'adjustment') || L.find(l => l.kind === 'video' || l.kind === 'nested') || L.find(l => l.kind !== 'adjustment') || null; };

/**
 * Renders the comp frame to a PNG we can read. Which call does this is the one thing Adobe's AE UXP docs do not
 * say; tools/ae_probe tells us on the founder's AE. Each route is tried in turn and the file waited for.
 */
async function exportFrame(c, t, path) {
  const routes = [];
  if (typeof c.saveFrameToPng === 'function') routes.push(['saveFrameToPng', () => c.saveFrameToPng(t, path)]);
  if (typeof c.saveFrameAs === 'function') routes.push(['saveFrameAs', () => c.saveFrameAs(t, path)]);
  if (!routes.length) throw new Error('This After Effects cannot save a frame for a plugin (no saveFrameToPng). After Effects 2027 or later is needed.');
  const tried = [];
  for (const [name, fn] of routes) {
    try { await fn(); } catch (e) { tried.push(`${name}: ${e.message || e}`); continue; }
    const t0 = Date.now(); let last = -1;
    while (Date.now() - t0 < 60000) { const b = await readPlain(path); if (b && b.length === last) return b; last = b ? b.length : -1; await new Promise(r => setTimeout(r, 150)); }
    tried.push(`${name}: no file after 60 s`);
  }
  throw new Error('After Effects did not write the frame (' + tried.join('; ') + ')');
}

const host = {
  ...commonHost(),
  name: 'aftereffects', label: 'After Effects', version: pkg.version, os, preferCcx: false,
  applyNote: 'Adds the Lukuluku Look effect to the selected layers, or to the layer the panel reads as the shot, and updates it where it is already there. "Adjustment layer" puts it on a layer named “Colored Lens” at the top of the comp, created the first time.',

  async grabFrame(seconds, opts = {}) {
    const c = comp(), t = seconds == null ? c.time : seconds, here = layersOf(c, t), sub = subjectOf(here);
    // A clean read: our own look switched off while the frame is rendered, then back on.
    const off = [], hidden = [];
    try { if (opts.clean) for (const l of here) { if (!(l === sub || l.kind === 'adjustment')) continue; const fx = lookEffect(l.item); if (fx && fx.enabled !== false) { fx.enabled = false; off.push(fx); } }
      if (opts.hide && opts.hide.length) for (const l of here) if (opts.hide.includes(l.track) && l.item.enabled) { l.item.enabled = false; hidden.push(l.item); }
      const dir = plainFrameDir(); if (!dir) throw new Error('No folder to render the frame into');
      const path = `${dir}/cl_ae_frame_${Date.now()}.png`;
      const bytes = await exportFrame(c, t, path);
      try { await require('fs').unlink('file:' + path); } catch { /* left for the OS to clean */ }
      var frame = decodeImage(bytes);
    } finally { for (const fx of off) try { fx.enabled = true; } catch {} for (const l of hidden) try { l.enabled = true; } catch {} }
    // the panel reads at most 960 px wide, like Premiere's export
    return { frame, seconds: t, timecode: timecode(t, c.frameRate || 25), clipName: sub ? sub.name : c.name, sequenceId: String(c.id || c.name), sequenceName: c.name, withoutLook: off.length > 0, hiddenLayers: hidden.length };
  },
  async sequenceDuration() { return comp().duration; },

  async clipContext() {
    const c = comp(), t = c.time, layers = layersOf(c, t), subject = subjectOf(layers), plain = l => l && (({ item, ...rest }) => rest)(l);
    const all = layersOf(c), footage = l => l.kind === 'video' || l.kind === 'nested';
    let inOut = null; try { const a = c.workAreaStart, b = a + c.workAreaDuration; if (b > a + 0.2 && (a > 0.05 || b < c.duration - 0.05)) inOut = { start: a, end: b }; } catch {}
    return { sequenceId: String(c.id || c.name), sequenceName: c.name, seconds: t, inOut, end: c.duration, layers: layers.map(plain), subject: plain(subject),
      above: subject ? layers.filter(l => l.track > subject.track).map(plain) : [], emptyAbove: [], scene: null, scenes: 0, before: null, after: null,
      counts: { clip: subject ? 1 : 0, source: subject && subject.path ? all.filter(l => l.path === subject.path).length : 0, scene: 0, adjust: layers.filter(l => l.kind === 'adjustment').length },
      host: 'aftereffects', footageCount: all.filter(footage).length };
  },

  async addMarker({ seconds, name, note }) {
    const c = comp(), MV = ae.MarkerValue || (typeof MarkerValue !== 'undefined' ? MarkerValue : null);
    if (!MV) throw new Error('This After Effects does not let plugins add markers yet');
    undo('Colored Lens shot', () => { const m = new MV(name); m.comment = note; c.markerProperty.setValueAtTime(seconds, m); });
  },
  async listMarkers() {
    const c = comp(), mp = c.markerProperty, out = [];
    for (let i = 1; i <= mp.numKeys; i++) { const v = mp.keyValue(i); out.push({ seconds: mp.keyTime(i), name: v.comment ? String(v.comment).split('\n')[0] : '', note: v.comment || '' }); }
    return out;
  },

  async applyLook({ params, makeCube, scope = 'clip' }) {
    const c = comp(), here = layersOf(c, c.time), subject = subjectOf(here);
    const canAdd = l => { try { return l.property('ADBE Effect Parade').canAddProperty(MATCH); } catch { return false; } };
    if (subject && !canAdd(subject.item)) {
      const cube = await makeCube(); const path = await host.saveFile(cube.name + '.cube', cube.text);
      return { ok: !!path, message: path ? 'The Lukuluku Look effect is not installed for After Effects, so the look was saved as a .cube. Apply it with Lumetri Color › Creative › Look.' : 'Cancelled' };
    }
    let targets = [], where = '';
    return undo('Colored Lens: apply look', () => {
      if (scope === 'adjust') {
        let adj = here.find(l => l.kind === 'adjustment' && l.name === ADJ_NAME);
        if (!adj) { const L = c.layers.addSolid([1, 1, 1], ADJ_NAME, c.width, c.height, c.pixelAspect || 1); L.adjustmentLayer = true; try { L.label = 9; } catch {}
          targets = [L]; where = ` (a new adjustment layer “${ADJ_NAME}” at the top of the comp)`; }
        else { targets = [adj.item]; where = ` (adjustment layer “${ADJ_NAME}”)`; }
      } else {
        targets = (c.selectedLayers || []).filter(l => l && !l.adjustmentLayer && canAdd(l));
        if (!targets.length) { if (!subject) return { ok: false, message: 'There is no layer at the current time. Select layers, or move to a shot.' };
          targets = [subject.item]; where = ` (“${subject.name}”, the shot at the current time)`; }
      }
      let added = 0, updated = 0;
      for (const L of targets) {
        let fx = lookEffect(L);
        if (fx) updated++; else { fx = L.property('ADBE Effect Parade').addProperty(MATCH); added++; }
        for (const [id, value] of Object.entries(params)) {
          const meta = kParamLabels[id]; if (!meta) continue; let p = null; try { p = fx.property(meta.label); } catch { p = null; } if (!p) continue;
          // AE popups are 1-based (Premiere's UXP API is 0-based); checkboxes take 0/1
          const v = meta.kind === 'B' ? (value ? 1 : 0) : meta.kind === 'P' ? Math.round(value) + 1 : Number(value);
          try { p.setValue(v); } catch (e) { console.warn('set', meta.label, e); }
        }
      }
      const parts = [added && `added to ${added} layer${added === 1 ? '' : 's'}`, updated && `updated on ${updated} layer${updated === 1 ? '' : 's'}`].filter(Boolean);
      return { ok: true, message: `Lukuluku Look ${parts.join(', ')}${where}. Edit › Undo removes it in one step.` };
    });
  },
  async selectionCount() { try { return (comp().selectedLayers || []).length; } catch { return 0; } },
};

boot(host, AE_PLUGIN_ID);

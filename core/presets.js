// Presets: saved recipes (look + colour configuration + skin/match settings + the intent they were made for),
// stored on this machine, shareable as a short code, and applicable to other shots.
import { fullGrade } from './look.js';

const KEY = 'coloredlens.presets.v1', mem = {};
const store = {
  get(k) { try { const v = globalThis.localStorage && localStorage.getItem(k); return v == null ? mem[k] ?? null : v; } catch { return mem[k] ?? null; } },
  set(k, v) { mem[k] = v; try { globalThis.localStorage && localStorage.setItem(k, v); } catch {} },
};
export const settings = {
  get: (k, d) => { try { const v = store.get('coloredlens.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => store.set('coloredlens.' + k, JSON.stringify(v)),
};

export function listPresets() { try { return JSON.parse(store.get(KEY) || '[]'); } catch { return []; } }
function saveAll(list) { store.set(KEY, JSON.stringify(list)); return list; }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** p = { name, look, extra, input, matte, intent, from, ref (matchStats of the shot it was made on), thumb } */
export function savePreset(p) {
  const list = listPresets(), now = new Date().toISOString();
  const clean = { id: p.id || uid(), name: String(p.name || 'Untitled').slice(0, 80), look: { ...p.look, G: fullGrade(p.look.G) }, extra: { ...(p.extra || {}) },
    input: p.input || 'rec709', matte: !!p.matte, intent: p.intent || {}, from: p.from || '', ref: p.ref || null, thumb: p.thumb || '', created: p.created || now, updated: now };
  const i = list.findIndex(x => x.id === clean.id); if (i >= 0) list[i] = clean; else list.unshift(clean);
  saveAll(list); return clean;
}
export function deletePreset(id) { return saveAll(listPresets().filter(p => p.id !== id)); }
export function duplicatePreset(id) { const p = listPresets().find(x => x.id === id); return p ? savePreset({ ...p, id: null, created: null, name: p.name + ' copy' }) : null; }

// Share codes: "CLP1:" + base64url(JSON) without the thumbnail.
// Pure JavaScript on purpose: UXP does not guarantee btoa, atob, TextEncoder or TextDecoder, and "Share code" threw
// in the founder's Premiere (18 Nov) because one of them was missing.
import { b64u, unb64u, utf8 } from './b64.js';
export function presetCode(p) { const { thumb, id, created, updated, ...rest } = p; return 'CLP1:' + b64u(utf8.enc(JSON.stringify(rest))); }
export function importPresetCode(code) {
  const s = String(code).trim(), i = s.indexOf('CLP1:'); if (i < 0) throw new Error('That is not a Colored Lens preset code (it starts with CLP1:)');
  const o = JSON.parse(utf8.dec(unb64u(s.slice(i + 5).split(/\s/)[0])));
  if (!o.look || !o.look.C) throw new Error('The preset code is incomplete');
  return savePreset({ ...o, name: o.name || 'Imported preset' });
}

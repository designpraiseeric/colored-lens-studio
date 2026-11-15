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
const b64u = s => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary'); };
const utf8 = { enc: s => { let b = ''; for (const x of new TextEncoder().encode(s)) b += String.fromCharCode(x); return b; }, dec: b => new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))) };
export function presetCode(p) { const { thumb, id, created, updated, ...rest } = p; return 'CLP1:' + b64u(utf8.enc(JSON.stringify(rest))); }
export function importPresetCode(code) {
  const s = String(code).trim(), i = s.indexOf('CLP1:'); if (i < 0) throw new Error('That is not a Colored Lens preset code (it starts with CLP1:)');
  const o = JSON.parse(utf8.dec(unb64u(s.slice(i + 5).split(/\s/)[0])));
  if (!o.look || !o.look.C) throw new Error('The preset code is incomplete');
  return savePreset({ ...o, name: o.name || 'Imported preset' });
}

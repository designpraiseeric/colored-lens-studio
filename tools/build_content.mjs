// Builds the live content feed that every installed plugin reads (published to GitHub Pages):
//   site/version.json             what the latest release is and where its installers are
//   site/content/manifest.json    content version + file list (plugins refresh their cache from this)
//   site/content/encyclopedia.json, refs.json, looks.json, luts/*.bin, frames/*.jpg
// Usage: node tools/build_content.mjs [--enc ../chroma-encyclopedia] [--luk ../lukuluku] [--out site]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import jpeg from 'jpeg-js';
import { labPixels, signature } from '../core/analysis.js';
import { downsample } from '../core/image.js';
import { matchStats } from '../core/look.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENC = path.resolve(arg('--enc', process.env.ENC_DIR || path.join(ROOT, '..', 'chroma-encyclopedia')));
const LUK = path.resolve(arg('--luk', process.env.LUK_DIR || path.join(ROOT, '..', 'lukuluku')));
const OUT = path.resolve(arg('--out', path.join(ROOT, 'site')));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio.config.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const C = path.join(OUT, 'content');
fs.mkdirSync(path.join(C, 'frames'), { recursive: true }); fs.mkdirSync(path.join(C, 'luts'), { recursive: true });

// 1. Encyclopedia
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'extract_encyclopedia.mjs'), path.join(ENC, cfg.sources.encyclopedia.html), path.join(C, 'encyclopedia.json')], { stdio: 'inherit' });
const enc = JSON.parse(fs.readFileSync(path.join(C, 'encyclopedia.json'), 'utf8'));

// 2. Lukuluku catalog + LUTs
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(LUK, cfg.sources.lukuluku.catalog), 'utf8'), ctx);
const cat = JSON.parse(JSON.stringify(ctx.window.CATALOG));
const lutMeta = JSON.parse(fs.readFileSync(path.join(LUK, cfg.sources.lukuluku.luts, 'luts.json'), 'utf8'));
for (const id of Object.keys(lutMeta)) fs.copyFileSync(path.join(LUK, cfg.sources.lukuluku.luts, id + '.bin'), path.join(C, 'luts', id + '.bin'));
fs.writeFileSync(path.join(C, 'looks.json'), JSON.stringify({ source: cfg.sources.lukuluku.repo, app: cfg.sources.lukuluku.app, catalog: cat, luts: lutMeta }));

// 3. Frames: thumbnails + colour signatures + the reading that goes with each
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const films = new Map();
const reg = (t, y, where, hueId) => { const k = slug(t); if (!films.has(k)) films.set(k, { t, y: '', where: new Set(), hues: new Set() }); const f = films.get(k); if (y && !f.y) f.y = String(y).slice(0, 4); f.where.add(where); if (hueId) f.hues.add(hueId); };
enc.HUES.forEach(h => h.ex.forEach(e => reg(e[0], e[1], h.name, h.id)));
enc.PALS.forEach(p => (enc.PAL_FILMS[p.id] || []).forEach(([t, y]) => reg(t, y, p.n)));
enc.NARR.forEach(n => (enc.NARR_FILMS[n.n] || []).forEach(([t, y]) => reg(t, y, n.n)));
enc.AUTS.forEach(a => (enc.AUT_FILMS[a.n] || []).forEach(([t, y]) => reg(t, y, a.n)));
const hueById = Object.fromEntries(enc.HUES.map(h => [h.id, h]));
const splitLooks = s => String(s || '').split(/\s*·\s*/).filter(x => /^[LOHKDCM]\d+$/.test(x));

function describe(id) {
  const [kind, ...rest] = id.split('-'), key = rest.join('-');
  if (kind === 'ref') { const f = films.get(key) || { t: key, y: '', where: new Set(), hues: new Set() };
    return { kind, title: f.y ? `${f.t} (${f.y})` : f.t, reading: enc.FREAD[key] || '', section: [...f.where].join(' · '), link: enc.FG[key] || '', looks: [...f.hues].flatMap(h => hueById[h].looks) }; }
  if (kind === 'aut') { const a = enc.AUTS.find(x => slug(x.n) === key) || { n: key };
    return { kind, title: a.n, reading: enc.AUTI[a.n] || a.t || '', section: 'Auteur & Cinematographer Signatures', looks: splitLooks(a.l) }; }
  if (kind === 'pal') { const p = enc.PALS.find(x => x.id === id) || { n: key };
    return { kind, title: p.n, reading: enc.PALI[id] || p.t || '', section: 'Palette Structures', looks: p.looks || [] }; }
  if (kind === 'nar') { const n = enc.NARR.find(x => slug(x.n) === key) || { n: key };
    return { kind, title: n.n, reading: enc.NARRI[n.n] || n.t || '', section: 'Narrative Color Devices', looks: [] }; }
  if (kind === 'ctx') { const [hue, mil] = rest; const e = (enc.CTX[hue] || []).find(x => x[0] === mil) || [];
    return { kind, title: `${(hueById[hue] || { name: hue }).name}: ${e[3] || mil}`, reading: enc.CTXI[id] || '', section: `Milieu contrast · ${enc.MIL[mil] || mil} · ${e[1] || ''}`, looks: (hueById[hue] || {}).looks || [] }; }
  if (kind === 'ext') { const e = enc.EXTS.find(x => x[0] === key) || [];
    return { kind, title: `Extension study: ${e[1] || key}`, reading: enc.EXTI[id] || e[2] || '', section: 'Dimensions & Contrasts', looks: [] }; }
  if (kind === 'psy') { const h = hueById[key] || { name: key };
    return { kind, title: h.name, reading: h.tag || '', section: 'Color Psychology', looks: h.looks || [] }; }
  return { kind, title: id, reading: '', section: '', looks: [] };
}

const frameDir = path.join(ENC, cfg.sources.encyclopedia.frames), refs = [];
const files = fs.readdirSync(frameDir).filter(f => /\.(jpe?g)$/i.test(f)).sort();
for (const file of files) {
  const id = file.replace(/\.[^.]+$/, '');
  const raw = jpeg.decode(fs.readFileSync(path.join(frameDir, file)), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  const frame = { w: raw.width, h: raw.height, data: new Uint8ClampedArray(raw.data.buffer) };
  const sig = signature(labPixels(frame));
  const th = downsample(frame, 360), thumb = `frames/${id}.jpg`;
  fs.writeFileSync(path.join(C, thumb), jpeg.encode({ width: th.w, height: th.h, data: Buffer.from(th.data.buffer) }, 80).data);
  const ms = Object.fromEntries(Object.entries(matchStats(frame)).map(([k, v]) => [k, +v.toFixed(5)]));
  refs.push({ id, ...describe(id), thumb, sig, ms });
}
fs.writeFileSync(path.join(C, 'refs.json'), JSON.stringify({ count: refs.length, frames: refs }));
console.log(`refs: ${refs.length} frames`);

// 4. Content manifest (hash of everything, so plugins can tell when to refresh)
const list = []; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f !== 'manifest.json') list.push(path.relative(C, p)); } }; walk(C);
const h = crypto.createHash('sha256'); const sizes = {};
for (const f of list.sort()) { const b = fs.readFileSync(path.join(C, f)); h.update(f); h.update(b); sizes[f] = b.length; }
const contentVersion = h.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(C, 'manifest.json'), JSON.stringify({ contentVersion, built: new Date().toISOString(), core: ['encyclopedia.json', 'refs.json', 'looks.json'], files: sizes }, null, 1));

// 5. version.json: the release the plugins compare themselves against.
// It must name a release whose installers already exist, so CI passes the latest PUBLISHED release in
// RELEASE_VERSION; a version bump in package.json is only announced once its release job has uploaded the files.
const released = (process.env.RELEASE_VERSION || pkg.version).replace(/^v/, '');
const rel = `https://github.com/${cfg.github.owner}/${cfg.github.repo}/releases/download/v${released}/`;
const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'version.json'), 'utf8')); } catch { return {}; } })();
const notesFile = path.join(ROOT, 'RELEASE_NOTES.md');
const notesFor = v => { if (!fs.existsSync(notesFile)) return ''; const m = fs.readFileSync(notesFile, 'utf8').split(/^## /m).find(b => b.startsWith(v + ' ') || b.startsWith(v + '\n') || b.startsWith('v' + v));
  return m ? m.split('\n').slice(1).join('\n').trim().slice(0, 1200) : ''; };
const version = {
  name: cfg.name, version: released, contentVersion, released: prev.version === released ? prev.released : new Date().toISOString(),
  notes: notesFor(released),
  page: `https://github.com/${cfg.github.owner}/${cfg.github.repo}/releases/tag/v${released}`,
  downloads: {
    'mac-suite': rel + `ColoredLensStudio-${released}-mac.pkg`,
    'win-suite': rel + `ColoredLensStudio-${released}-win.exe`,
    'premiere-ccx': rel + `ColoredLens-Premiere-${released}.ccx`,
  },
};
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify(version, null, 1));
console.log(`content ${contentVersion}, announced release ${released} -> ${OUT}`);

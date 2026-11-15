// Color script: the colours of a whole film, shot by shot, plus what the sequence says
// (the narrative devices that only show up across many shots).
import { makeFrame } from './image.js';
import { hexToRgb } from './color.js';

/** One shot record, small enough to store in a marker's note. */
export function shotRecord(reading, meta = {}) {
  return {
    t: meta.seconds ?? 0, tc: meta.timecode || '', name: meta.name || '',
    sw: reading.swatches.slice(0, 5).map(s => [s.hex, +s.share.toFixed(3)]),
    hue: (reading.hues.find(h => !['black', 'grey', 'white', 'bw'].includes(h.id) && h.share >= 0.1) || reading.hues[0] || { id: 'grey' }).id, hues: Object.fromEntries(reading.hues.slice(0, 6).map(h => [h.id, +h.share.toFixed(3)])),
    pal: reading.pal.id, C: +reading.stats.meanC.toFixed(4), T: +reading.stats.temperature.toFixed(3), K: +reading.stats.contrast.toFixed(3), L: +reading.stats.p50.toFixed(3),
    tags: meta.tags || [], note: meta.note || '',
  };
}
const MARK = 'CLS1:'; // marker note prefix so we only read our own markers
export const encodeShot = s => MARK + JSON.stringify(s);
export function decodeShot(note) { if (!note || !note.includes(MARK)) return null; try { return JSON.parse(note.slice(note.indexOf(MARK) + MARK.length)); } catch { return null; } }

/** Draws the strip: one column per shot, its swatches stacked by share; a temperature line underneath. */
export function renderStrip(shots, opts = {}) {
  const colW = opts.colW || 18, H = opts.height || 120, band = 22, W = Math.max(1, shots.length) * colW, f = makeFrame(W, H + band);
  f.data.fill(14); for (let i = 3; i < f.data.length; i += 4) f.data[i] = 255;
  shots.forEach((s, i) => { let y = 0; const tot = s.sw.reduce((a, b) => a + b[1], 0) || 1;
    for (const [hex, share] of s.sw) { const hgt = Math.round((share / tot) * H), rgb = hexToRgb(hex);
      for (let yy = y; yy < Math.min(H, y + hgt); yy++) for (let x = i * colW; x < (i + 1) * colW - 1; x++) { const o = (yy * W + x) * 4; f.data[o] = rgb[0] * 255; f.data[o + 1] = rgb[1] * 255; f.data[o + 2] = rgb[2] * 255; }
      y += hgt; }
    const ty = H + band / 2 - Math.round(s.T * (band / 2 - 2)); // warm up, cool down
    for (let x = i * colW; x < (i + 1) * colW; x++) for (let yy = ty - 1; yy <= ty + 1; yy++) { const o = (yy * W + x) * 4; const warm = s.T > 0; f.data[o] = warm ? 240 : 90; f.data[o + 1] = warm ? 150 : 170; f.data[o + 2] = warm ? 70 : 240; }
  });
  return f;
}

function trend(ys) { const n = ys.length; if (n < 3) return 0; const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; }); return (num / den) * n; }

/** Sequence-level readings, worded with the encyclopedia's narrative devices. */
export function readSequence(shots, enc) {
  const out = []; if (shots.length < 3) return [{ n: 'Add more shots', why: 'Tag at least three shots (or scan the sequence) to read colour across the film.' }];
  const chrom = enc.HUES.filter(h => !['white', 'black', 'grey', 'bw'].includes(h.id));
  const maxShare = id => Math.max(...shots.map(s => s.hues[id] || 0));
  const absent = chrom.filter(h => maxShare(h.id) < 0.02).map(h => h.name);
  if (absent.length && absent.length < chrom.length - 1) out.push({ n: 'Withholding a color', why: `${absent.slice(0, 4).join(', ')} never take more than 2% of any shot. If that is deliberate, the first time one appears will carry weight.` });
  const dC = trend(shots.map(s => s.C)), dT = trend(shots.map(s => s.T));
  if (Math.abs(dC) > 0.04) out.push({ n: 'Temporal evolution', why: dC > 0 ? 'Saturation rises across the sequence: colour as awakening.' : 'Saturation drains across the sequence: colour as loss.' });
  if (Math.abs(dT) > 0.5) out.push({ n: 'Emotional thermometer', why: dT > 0 ? 'The sequence warms as it goes.' : 'The sequence cools as it goes.' });
  const runs = []; for (const s of shots) { const last = runs[runs.length - 1]; if (last && last.hue === s.hue) last.n++; else runs.push({ hue: s.hue, n: 1 }); }
  const longRuns = runs.filter(r => r.n >= 3), distinct = [...new Set(longRuns.map(r => r.hue))];
  if (distinct.length >= 2) out.push({ n: 'Location coding', why: `Long runs of ${distinct.slice(0, 4).join(', ')}: if these are different places or timelines, the colour already separates them.` });
  const accents = shots.filter(s => s.pal === 'pal-select' || s.pal === 'pal-accent');
  if (accents.length >= 2) out.push({ n: 'Omen / foreshadowing', why: `${accents.length} shots use a lone accent against neutral. A recurring accent object can work as an omen.` });
  const tagged = {}; shots.forEach(s => s.tags.forEach(t => { (tagged[t] = tagged[t] || []).push(s.hue); }));
  for (const [t, hs] of Object.entries(tagged)) { const top = hs.sort((a, b) => hs.filter(x => x === b).length - hs.filter(x => x === a).length)[0];
    if (hs.length >= 2 && hs.filter(x => x === top).length / hs.length >= 0.66) out.push({ n: 'Character leitmotif', why: `Shots tagged “${t}” are mostly ${top}. Keep it consistent and it becomes their theme.` }); }
  if (!out.length) out.push({ n: 'No strong pattern yet', why: 'The colour is consistent across these shots. That is a choice too: a single colour world.' });
  return out.map(o => ({ ...o, entry: enc.NARR.find(x => x.n === o.n) }));
}

export function scriptCSV(shots) {
  const rows = [['timecode', 'name', 'dominant hue', 'palette', 'saturation', 'temperature', 'contrast', 'tags', 'note', 'swatches']];
  for (const s of shots) rows.push([s.tc, s.name, s.hue, s.pal, s.C, s.T, s.K, s.tags.join(' '), s.note, s.sw.map(x => x[0]).join(' ')]);
  return rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n';
}

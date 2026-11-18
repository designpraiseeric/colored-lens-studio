// Colored Lens — After Effects 2027 probe. Read-only: nothing in the project is created, changed or deleted.
const out = document.getElementById('out'), R = { started: new Date().toISOString(), steps: [] };
const step = (name, fn) => { try { const v = fn(); R.steps.push({ name, ok: true, v }); return v; } catch (e) { R.steps.push({ name, ok: false, err: String(e && (e.message || e)), stack: String(e && e.stack || '').split('\n').slice(0, 4).join(' | ') }); return undefined; } };
const keys = o => { const s = new Set(); try { let p = o; for (let i = 0; p && i < 4; i++) { Object.getOwnPropertyNames(p).forEach(k => s.add(k)); p = Object.getPrototypeOf(p); } } catch {} return [...s].filter(k => !/^__|^constructor$/.test(k)).sort(); };
async function run() {
  R.steps = [];
  const ae = step('require aftereffects', () => require('aftereffects'));
  const uxp = step('require uxp', () => require('uxp'));
  step('aftereffects module keys', () => keys(ae));
  const app = step('app object', () => (ae && (ae.app || ae)));
  step('app keys', () => keys(app));
  step('version', () => app.version || app.buildName || (ae && ae.version));
  const proj = step('project', () => app.project);
  step('project keys', () => keys(proj));
  const comp = step('active comp', () => proj.activeItem);
  step('comp keys', () => keys(comp));
  step('comp basics', () => ({ name: comp.name, w: comp.width, h: comp.height, fps: comp.frameRate, dur: comp.duration, time: comp.time, n: comp.numLayers, bpc: proj.bitsPerChannel }));
  step('layers at time', () => { const L = comp.layers, out = []; for (let i = 1; i <= L.length; i++) { const l = L.byIndex ? L.byIndex(i) : comp.layer(i);
    out.push({ i, name: l.name, enabled: l.enabled, active: l.activeAtTime ? l.activeAtTime(comp.time) : null, adj: l.adjustmentLayer, src: l.source && l.source.name, inP: l.inPoint, outP: l.outPoint, matte: l.hasTrackMatte }); } return out; });
  step('layer keys', () => keys(comp.layers.byIndex(1)));
  step('effect parade on layer 1', () => { const l = comp.layers.byIndex(1), p = l.property('ADBE Effect Parade'); return { n: p.numProperties, can: p.canAddProperty ? p.canAddProperty('DesignPraise Lukuluku Look') : 'no canAddProperty' }; });
  step('installed effects (search Lukuluku)', () => { const fx = app.effects; if (!fx) return 'app.effects missing'; const all = []; for (let i = 0; i < fx.length; i++) all.push(fx[i]); return { count: all.length, ours: all.filter(e => /lukuluku|designpraise/i.test(JSON.stringify(e))) }; });
  // Frame export: every route we know of, into our own folder.
  const lfs = uxp && uxp.storage && uxp.storage.localFileSystem;
  const home = step('home path', () => require('os').homedir());
  const dir = (home || '') + '/Library/Application Support/ColoredLens';
  for (const [name, fn] of [
    ['saveFrameToPng(time, path string)', () => comp.saveFrameToPng(comp.time, dir + '/ae_probe_frame_a.png')],
    ['saveFrameToPng(time, file entry)', async () => { const f = await lfs.getEntryWithUrl('file:' + dir + '/'); const e = await f.createFile('ae_probe_frame_b.png', { overwrite: true }); return comp.saveFrameToPng(comp.time, e); }],
    ['saveFrameAs', () => comp.saveFrameAs ? comp.saveFrameAs(comp.time, dir + '/ae_probe_frame_c.png') : 'no saveFrameAs'],
    ['renderQueue present', () => ({ rq: !!proj.renderQueue, keys: keys(proj.renderQueue).slice(0, 40) })],
    ['findMenuCommandId Copy Frame', () => app.findMenuCommandId ? app.findMenuCommandId('Copy Frame') : 'no findMenuCommandId'],
  ]) { try { const v = await fn(); R.steps.push({ name, ok: true, v: v === undefined ? 'returned undefined' : v }); } catch (e) { R.steps.push({ name, ok: false, err: String(e && (e.message || e)) }); } }
  const fs = step('require fs', () => require('fs'));
  step('frames written', () => ['a', 'b', 'c'].map(x => { try { const s = fs.lstatSync(dir + '/ae_probe_frame_' + x + '.png'); return { x, size: s.size }; } catch (e) { return { x, missing: true }; } }));
  R.finished = new Date().toISOString();
  const text = JSON.stringify(R, null, 1);
  try { fs.writeFileSync(dir + '/ae_probe.json', text); } catch (e) { R.writeErr = String(e); }
  out.textContent = text.slice(0, 6000);
}
document.getElementById('go').onclick = () => run();
run();

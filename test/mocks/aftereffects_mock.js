// A stand-in for After Effects 2027's `aftereffects` UXP module (synchronous, scripting-model shaped) plus `uxp`/`fs`/`os`.
// Loaded before dist/aftereffects/app.js by test/hosts.test.mjs.
(function () {
  const log = (window.__ae = { calls: [], undo: [], params: {}, markers: [] });
  const bmp = window.__bmp, labels = window.__effectParams, files = {};
  const MATCH = 'DesignPraise Lukuluku Look';
  const mkEffect = () => { const ps = {}; for (const p of labels) ps[p.label] = { name: p.label, setValue(v) { log.params[p.label] = v; this.value = v; } };
    return { matchName: MATCH, name: MATCH, enabled: true, property: k => ps[k] || null }; };
  const mkLayer = (name, o = {}) => { const fx = [];
    const L = { name, enabled: true, inPoint: o.in ?? 0, outPoint: o.out ?? 30, adjustmentLayer: !!o.adj, selected: !!o.sel, nullLayer: false, matchName: o.match || 'ADBE AV Layer', source: o.source === undefined ? { name, file: { fsName: '/media/' + name + '.mov' } } : o.source,
      activeAtTime(t) { return this.enabled && t >= this.inPoint && t < this.outPoint; },
      property(k) { if (k !== 'ADBE Effect Parade') return null; return { get numProperties() { return fx.length; }, property: i => fx[i - 1], canAddProperty: m => m === MATCH,
        addProperty(m) { if (m !== MATCH) throw new Error('no effect ' + m); const e = mkEffect(); fx.push(e); log.calls.push('addEffect ' + name); return e; } }; } };
    return L; };
  const layers = [mkLayer('Lower third', { in: 11, out: 14, source: null, match: 'ADBE Text Layer' }), mkLayer('A001_C003', { in: 10, out: 20, sel: true }), mkLayer('Plate', {})];
  const comp = { name: 'Main comp', id: 7, width: 1920, height: 1080, pixelAspect: 1, frameRate: 24, duration: 30, time: 12.5, workAreaStart: 0, workAreaDuration: 30,
    layers: { get length() { return layers.length; }, byIndex: i => layers[i - 1], addSolid(c, n) { const L = mkLayer(n, { source: { name: n, mainSource: { color: c } } }); layers.unshift(L); log.calls.push('addSolid ' + n); return L; } },
    get selectedLayers() { return layers.filter(l => l.selected); },
    saveFrameToPng(t, p) { log.calls.push('saveFrameToPng @' + t); files['file:' + p] = bmp; },
    markerProperty: { keys: [], get numKeys() { return this.keys.length; }, setValueAtTime(t, v) { this.keys.push([t, v]); log.markers.push({ t, v }); }, keyTime(i) { return this.keys[i - 1][0]; }, keyValue(i) { return this.keys[i - 1][1]; } } };
  class MarkerValue { constructor(c) { this.comment = c; } }
  const app = { project: { activeItem: comp, bitsPerChannel: 8 }, beginUndoGroup: n => log.undo.push('begin ' + n), endUndoGroup: () => log.undo.push('end') };
  const folder = name => ({ nativePath: '/tmp/' + name, name, async getEntries() { return []; }, async getEntry(n) { throw new Error('no entry ' + n); }, async createFolder(n) { return folder(name + '/' + n); },
    async createFile(n) { const k = name + '/' + n; return { nativePath: '/tmp/' + k, write: async d => { files[k] = d; } }; } });
  const rfolder = prefix => ({ async getEntry(n) { if (/\.[a-z]+$/.test(n)) { const r = await fetch(prefix + n); if (!r.ok) throw new Error('missing ' + n);
      const blob = await r.arrayBuffer(); return { name: n, read: async o => (o && o.format === 'binary' ? blob : new TextDecoder().decode(blob)) }; } return rfolder(prefix + n + '/'); } });
  const modules = {
    aftereffects: { app, MarkerValue },
    uxp: { storage: { formats: { binary: 'binary', utf8: 'utf8' }, localFileSystem: { getTemporaryFolder: async () => folder('tmp'), getDataFolder: async () => folder('data'), getPluginFolder: async () => rfolder(''), getFileForSaving: async n => ({ nativePath: '/Users/x/' + n, write: async () => {} }) },
      secureStorage: { getItem: async () => null, setItem: async () => {} } },
      shell: { openExternal: async u => log.calls.push('open ' + u), openPath: async () => '' }, entrypoints: { setup(o) { log.hooks = o; } }, pluginManager: { plugins: [] } },
    os: { platform: () => 'darwin', homedir: () => '/Users/x' },
    fs: { writeFile: async (p, d) => { files[p] = d; }, rename: async (a, b) => { files[b] = files[a]; delete files[a]; }, readFile: async p => { if (files[p] === undefined) throw new Error('ENOENT'); return files[p]; }, unlink: async p => { delete files[p]; }, readdir: async () => [] },
  };
  window.require = n => { if (!modules[n]) throw new Error('mock has no module ' + n); return modules[n]; };
})();

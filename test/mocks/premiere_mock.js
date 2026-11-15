// A stand-in for Premiere's `premierepro` and `uxp` modules, shaped after @adobe/premierepro 27 types.
// Loaded before dist/premiere/app.js in a browser page by test/hosts.test.mjs.
(function () {
  const log = (window.__pp = { calls: [], markers: [], params: {}, components: [] });
  const bmp = window.__bmp; // Uint8Array of a BMP frame, set by the test
  const TickTime = { createWithSeconds: s => ({ seconds: s, ticks: String(s * 254016000000) }), TIME_ZERO: { seconds: 0 } };
  const labels = window.__effectParams; // [{id,label,kind}] from params.generated.js
  const mkComp = () => { const params = labels.map(p => ({ displayName: p.label, createKeyframe: v => ({ v }), createSetValueAction: kf => ({ type: 'set', label: p.label, v: kf.v }) }));
    return { getMatchName: async () => 'AE.DesignPraise Lukuluku Look', getParamCount: () => params.length, getParam: i => params[i] }; };
  const chain = { comps: [{ getMatchName: async () => 'AE.ADBE Motion' }], getComponentCount() { return this.comps.length; }, getComponentAtIndex(i) { return this.comps[i]; },
    createAppendComponentAction(c) { return { type: 'append', c }; } };
  const clip = { getName: async () => 'A001_C003', getComponentChain: async () => chain, createAddVideoTransitionAction() {} };
  const markersObj = { createAddMarkerAction: (name, type, start, dur, comments) => ({ type: 'marker', name, start, comments }), getMarkers: () => log.markers.map(m => ({ getStart: () => m.start, getName: () => m.name, getComments: () => m.comments })) };
  const seq = { name: 'Main edit', getPlayerPosition: async () => TickTime.createWithSeconds(12.5), getFrameSize: async () => ({ width: 1920, height: 1080 }), getTimebase: async () => String(254016000000 / 24),
    getEndTime: async () => TickTime.createWithSeconds(30), getSelection: async () => ({ getTrackItems: async () => [clip] }) };
  const project = { getActiveSequence: async () => seq, lockedAccess: fn => fn(),
    executeTransaction(build, label) { const ca = { addAction: a => {
      log.calls.push(label);
      if (a.type === 'marker') log.markers.push(a);
      if (a.type === 'append') chain.comps.push(mkComp());
      if (a.type === 'set') log.params[a.label] = a.v; } }; build(ca); return true; } };
  const files = {};
  const folder = (name) => ({ nativePath: '/tmp/' + name, name,
    async getEntries() { return Object.keys(files).filter(k => k.startsWith(name + '/')).map(k => ({ name: k.slice(name.length + 1), read: async () => files[k], delete: async () => delete files[k] })); },
    async getEntry(n) { const k = name + '/' + n; if (files[k] !== undefined) return { name: n, read: async () => files[k] }; if (Object.keys(files).some(f => f.startsWith(k + '/'))) return folder(k); throw new Error('no entry ' + k); },
    async createFolder(n) { return folder(name + '/' + n); },
    async createFile(n) { const k = name + '/' + n; return { nativePath: '/tmp/' + k, write: async d => { files[k] = d; } }; } });
  // the plugin folder, served by the test web server (dist/premiere)
  const rfolder = prefix => ({ async getEntry(n) { if (/\.[a-z]+$/.test(n)) { const r = await fetch(prefix + n); if (!r.ok) throw new Error('missing ' + n);
      const blob = await r.arrayBuffer(); return { name: n, read: async o => (o && o.format === 'binary' ? blob : new TextDecoder().decode(blob)) }; } return rfolder(prefix + n + '/'); } });
  const modules = {
    premierepro: { Project: { getActiveProject: async () => project }, TickTime, Marker: { MARKER_TYPE_COMMENT: 'Comment' }, Markers: { getMarkers: async () => markersObj },
      Exporter: { exportSequenceFrame: async (s, t, fname, dir) => { log.calls.push('export ' + fname + ' @' + t.seconds); files['tmp/' + fname] = bmp.buffer; return true; } },
      VideoFilterFactory: { getMatchNames: async () => ['AE.ADBE Motion', 'AE.DesignPraise Lukuluku Look'], createComponent: async n => ({ n }) } },
    uxp: { storage: { formats: { binary: 'binary', utf8: 'utf8' }, localFileSystem: { getTemporaryFolder: async () => folder('tmp'), getDataFolder: async () => folder('data'),
      getPluginFolder: async () => rfolder(''), getFileForSaving: async n => ({ nativePath: '/Users/x/' + n, write: async () => {} }) } },
      shell: { openExternal: async u => log.calls.push('open ' + u), openPath: async p => { log.calls.push('openPath ' + p); return ''; } } },
    os: { platform: () => 'darwin' },
  };
  window.require = n => { if (!modules[n]) throw new Error('mock has no module ' + n); return modules[n]; };
})();

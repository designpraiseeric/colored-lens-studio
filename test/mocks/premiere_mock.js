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
    createAppendComponentAction(c) { return { type: 'append', c, chain }; } };
  const T = v => ({ seconds: v });
  const projItem = path => ({ path });
  const clip = { createSetDisabledAction: d => ({ type: 'disable', d }), getName: async () => 'A001_C003', getComponentChain: async () => chain, createAddVideoTransitionAction() {}, getStartTime: async () => T(10), getEndTime: async () => T(20),
    isDisabled: async () => false, isAdjustmentLayer: async () => false, getProjectItem: async () => projItem('/media/A001_C003.mov'), getIsSelected: async () => true };
  const title = { createSetDisabledAction: d => ({ type: 'disable', d }), getName: async () => 'Lower third', getComponentChain: async () => ({ getComponentCount: () => 0 }), getStartTime: async () => T(11), getEndTime: async () => T(14),
    isDisabled: async () => false, isAdjustmentLayer: async () => false, getProjectItem: async () => projItem(''), getIsSelected: async () => false };
  const mkChain = () => ({ comps: [], getComponentCount() { return this.comps.length; }, getComponentAtIndex(i) { return this.comps[i]; }, createAppendComponentAction(c) { return { type: 'append', c, chain: this }; } });
  const other = (name, a, b) => ({ createSetDisabledAction: d => ({ type: 'disable', d }), chain: mkChain(), getName: async () => name, async getComponentChain() { return this.chain; }, getStartTime: async () => T(a), getEndTime: async () => T(b),
    isDisabled: async () => false, isAdjustmentLayer: async () => false, getProjectItem: async () => projItem('/media/' + name + '.mov'), getIsSelected: async () => false, createAddVideoTransitionAction() {} });
  const emptyNest = { createSetDisabledAction: d => ({ type: 'disable', d }), getName: async () => 'BROLL LAYER', getComponentChain: async () => ({ getComponentCount: () => 0 }), getStartTime: async () => T(0), getEndTime: async () => T(30), getInPoint: async () => T(0),
    isDisabled: async () => false, isAdjustmentLayer: async () => false, getProjectItem: async () => ({ path: '', nest: { getVideoTrackCount: async () => 1, getVideoTrack: async () => ({ isMuted: async () => false, getTrackItems: () => [] }) } }), getIsSelected: async () => false };
  const tracks = [{ isMuted: async () => false, getTrackItems: () => [other('A001_C002', 0, 10), clip, other('A001_C004', 20, 30)] }, { isMuted: async () => false, getTrackItems: () => [] }, { isMuted: async () => false, getTrackItems: () => [title] }, { isMuted: async () => false, getTrackItems: () => [emptyNest] }];
  const markersObj = { createAddMarkerAction: (name, type, start, dur, comments) => ({ type: 'marker', name, start, comments }), getMarkers: () => [{ start: T(8), name: 'Scene 2 — kitchen', comments: '' }, ...log.markers].map(m => ({ getStart: () => m.start, getName: () => m.name, getComments: () => m.comments, getDuration: () => T(0) })) };
  const seq = { name: 'Main edit', getPlayerPosition: async () => TickTime.createWithSeconds(12.5), getFrameSize: async () => ({ width: 1920, height: 1080 }), getTimebase: async () => String(254016000000 / 24),
    getEndTime: async () => TickTime.createWithSeconds(30), getSelection: async () => ({ getTrackItems: async () => [clip] }), guid: 'seq-guid-1',
    getVideoTrackCount: async () => tracks.length, getVideoTrack: async i => tracks[i] };
  const project = { getActiveSequence: async () => seq, lockedAccess: fn => fn(),
    executeTransaction(build, label) { const ca = { addAction: a => {
      log.calls.push(label);
      if (a.type === 'marker') log.markers.push(a);
      if (a.type === 'append') (a.chain || chain).comps.push(mkComp());
      if (a.type === 'set') log.params[a.label] = a.v; } }; build(ca); return true; } };
  const files = {};
  const folder = (name) => ({ nativePath: '/tmp/' + name, name,
    async getEntries() { return Object.keys(files).filter(k => k.startsWith(name + '/')).map(k => ({ name: k.slice(name.length + 1), read: async () => files[k], delete: async () => delete files[k] })); },
    async getEntry(n) { const k = name + '/' + n; if (files[k] !== undefined) return { name: n, read: async () => files[k], delete: async () => delete files[k] }; if (Object.keys(files).some(f => f.startsWith(k + '/'))) return folder(k); throw new Error('no entry ' + k); },
    async createFolder(n) { return folder(name + '/' + n); },
    async createFile(n) { const k = name + '/' + n; return { nativePath: '/tmp/' + k, write: async d => { files[k] = d; helper(k); }, delete: async () => delete files[k],
      moveTo: async (dir, o) => { const k2 = dir.name + '/' + o.newName; files[k2] = files[k]; delete files[k]; helper(k2); } }; } });
  // a stand-in for the Colored Lens Helper: answers req-<id>.json in the bridge folder with res-<id>.json
  window.__apple = { available: true, image: true };
  async function helper(k) { const m = /^(.*bridge)\/req-(.+)\.json$/.exec(k); if (!m) return; const req = JSON.parse(files[k]); delete files[k]; let res;
    if (req.type === 'status') res = { helper: 'mock', variant: 'apple-image', apple: window.__apple };
    else if (req.type === 'http') { try { const r = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body }); res = { status: r.status, text: await r.text() }; } catch (e) { res = { status: 0, text: '', error: String(e) }; } }
    else if (req.type === 'apple') { log.apple = req; res = { text: JSON.stringify({ sees: 'A man selling candy floss.', reading: 'Warm and busy.', reply: '', questions: [], answers: { feeling: ['joyful'] }, picks: [{ recipe: window.__recipe || 'x', why: 'It suits the warmth.' }] }) }; }
    files[m[1] + '/res-' + m[2] + '.json'] = JSON.stringify(res); }
  // the plugin folder, served by the test web server (dist/premiere)
  const rfolder = prefix => ({ async getEntry(n) { if (/\.[a-z]+$/.test(n)) { const r = await fetch(prefix + n); if (!r.ok) throw new Error('missing ' + n);
      const blob = await r.arrayBuffer(); return { name: n, read: async o => (o && o.format === 'binary' ? blob : new TextDecoder().decode(blob)) }; } return rfolder(prefix + n + '/'); } });
  const modules = {
    premierepro: { Constants: { TrackItemType: { CLIP: 1 } }, ClipProjectItem: { cast: pi => ({ isSequence: async () => !!pi.nest, getSequence: async () => pi.nest, getMediaFilePath: async () => pi.path, getInputLUTID: async () => '' }) }, Project: { getActiveProject: async () => project }, TickTime, Marker: { MARKER_TYPE_COMMENT: 'Comment' }, Markers: { getMarkers: async () => markersObj },
      Exporter: { exportSequenceFrame: async (s, t, fname, dir) => { log.calls.push('export ' + fname + ' @' + t.seconds); files['tmp/' + fname] = bmp.buffer; return true; } },
      VideoFilterFactory: { getMatchNames: async () => ['AE.ADBE Motion', 'AE.DesignPraise Lukuluku Look'], createComponent: async n => ({ n }) } },
    uxp: { storage: { formats: { binary: 'binary', utf8: 'utf8' }, localFileSystem: { getTemporaryFolder: async () => folder('tmp'), getDataFolder: async () => folder('data'),
      getPluginFolder: async () => rfolder(''), getFileForSaving: async n => ({ nativePath: '/Users/x/' + n, write: async () => {} }) } },
      shell: { openExternal: async u => log.calls.push('open ' + u), openPath: async p => { log.calls.push('openPath ' + p); return ''; } },
      // two panels: setup() records the hooks; showPanel('preview') gives the preview panel its own root node
      entrypoints: { setup(o) { log.hooks = o; } },
      pluginManager: { plugins: [{ id: 'com.designpraise.coloredlens', async showPanel(id) { log.calls.push('showPanel ' + id);
        const node = document.createElement('div'); node.id = 'pvRoot'; node.style.height = '400px'; document.body.appendChild(node); log.hooks.panels[id].show(node); } }] } },
    os: { platform: () => 'darwin', homedir: () => '/Users/x' },
    fs: { writeFile: async (p, d) => { files[p] = d; }, rename: async (a, b) => { files[b] = files[a]; delete files[a]; helper(b); },
      readFile: async p => { if (files[p] === undefined) throw new Error('ENOENT'); return files[p]; }, unlink: async p => { delete files[p]; } },
  };
  window.require = n => { if (!modules[n]) throw new Error('mock has no module ' + n); return modules[n]; };
})();

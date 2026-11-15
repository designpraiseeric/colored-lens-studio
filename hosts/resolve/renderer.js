// Resolve host, renderer side: forwards the panel's host calls to main.js over IPC.
import { startApp } from '../../ui/app.js';
import { decodeImage } from '../../core/image.js';

const H = window.resolveHost;
let progressCb = () => {};
H.onProgress(p => progressCb(p));

(async () => {
  const info = await H.invoke('info');
  const host = {
    name: 'resolve', label: 'DaVinci Resolve', version: info.version, os: info.os,
    applyNote: 'Resolve cannot add OpenFX from a script, so the look is applied as a LUT on node 1 of the clip under the playhead. Grain, halation and glow come from the Lukuluku Look OpenFX in the OpenFX library (DesignPraise).',
    fetch: (url, o) => fetch(url, o),
    readBundled: (name, type) => H.invoke('readBundled', name, type).then(d => (d && type === 'binary' ? d.buffer : d)),
    cache: {
      read: (name, type) => H.invoke('cacheRead', name, type).then(d => (d && type === 'binary' ? d.buffer : d)),
      write: (name, data) => H.invoke('cacheWrite', name, typeof data === 'string' ? data : new Uint8Array(data)),
    },
    async grabFrame(seconds) { const g = await H.invoke('grabFrame', seconds); return { ...g, frame: decodeImage(g.bytes) }; },
    sequenceDuration: () => H.invoke('sequenceDuration'),
    addMarker: m => H.invoke('addMarker', m),
    listMarkers: () => H.invoke('listMarkers'),
    async applyLook({ makeCube }) { const c = await makeCube(); return H.invoke('applyLut', c.name, c.text); },
    saveFile: (name, data, o = {}) => H.invoke('saveFile', name, typeof data === 'string' ? data : new Uint8Array(data), o.title),
    openUrl: url => H.invoke('openUrl', url),
    installUpdate: (url, filename, onProgress) => { progressCb = onProgress || (() => {}); return H.invoke('installUpdate', url, filename); },
  };
  await startApp(host, document.getElementById('root'));
})().catch(e => { document.getElementById('root').textContent = 'Colored Lens could not start: ' + e.message; });

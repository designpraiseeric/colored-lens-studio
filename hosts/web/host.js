// Web host: the same panel in a browser. Used for development and testing, and published on GitHub Pages
// as a stand-alone tool for editors on apps without a plugin system (CapCut, OpenCut): open a frame grab, read it,
// check skin, build a look and download the .cube.
import { startApp } from '../../ui/app.js';
import pkg from '../../package.json';

function decodeImageFile(blob) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height); res({ w: c.width, h: c.height, data: d.data }); }; im.onerror = rej; im.src = URL.createObjectURL(blob); });
}
const pickFile = () => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => res(i.files[0]); i.click(); });
const download = (name, data) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click(); return name; };

const markers = [];
const host = {
  name: 'web', label: 'Web', grabLabel: 'Open a frame grab and read it', version: pkg.version, os: /Win/.test(navigator.platform) ? 'win' : 'mac',
  applyNote: 'In the browser the look downloads as a .cube LUT. CapCut: Adjust → LUT → Import. OpenCut / others: load it as a LUT.',
  fetch: (url, o) => fetch(url, o),
  readBundled: async (name, type) => { const r = await fetch('content/' + name); if (!r.ok) return null; return type === 'binary' ? r.arrayBuffer() : r.text(); },
  cache: {
    read: async (name, type) => { if (type === 'binary') return null; try { return localStorage.getItem('cl:' + name); } catch { return null; } },
    write: async (name, data) => { if (typeof data !== 'string') return; try { localStorage.setItem('cl:' + name, data); } catch { /* quota */ } },
  },
  // The frame comes from window.__testFrame (tests) or a file the editor picks.
  async grabFrame(seconds) {
    if (window.__testFrame) return { frame: window.__testFrame, seconds: seconds || 0, timecode: '00:00:00:00', clipName: 'test frame' };
    const f = await pickFile(); if (!f) throw new Error('No image chosen');
    return { frame: await decodeImageFile(f), seconds: seconds || 0, timecode: '', clipName: f.name };
  },
  async sequenceDuration() { throw new Error('Scanning needs Premiere or Resolve; in the browser, add frames one by one.'); },
  async addMarker(m) { markers.push(m); },
  async listMarkers() { return markers; },
  async applyLook({ makeCube }) { const c = await makeCube(); download(c.name + '.cube', c.text); return { ok: true, message: 'Downloaded ' + c.name + '.cube' }; },
  async saveFile(name, data) { return download(name, data); },
  openUrl: url => window.open(url, '_blank'),
  async installUpdate(url) { window.open(url, '_blank'); },
};
window.__app = startApp(host, document.getElementById('root'));

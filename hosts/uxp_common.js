// What every UXP host (Premiere Pro, After Effects) shares: files, the network, the helper bridge, secure storage,
// updates, and the two-panel boot (main panel + a Preview panel the editor can dock anywhere).
// Copied from hosts/premiere/host.js for the After Effects host (0.15.0); Premiere moves onto it once AE is proven live.
import { startApp } from '../ui/app.js';

const uxp = require('uxp');
const { localFileSystem: lfs, formats } = uxp.storage;
export const os = (() => { try { return require('os').platform() === 'win32' ? 'win' : 'mac'; } catch { return 'mac'; } })();
export { uxp, lfs, formats };

export async function entryAt(folder, path, create = false) {
  const parts = path.split('/'); let dir = folder;
  for (const p of parts.slice(0, -1)) { try { dir = await dir.getEntry(p); } catch { if (!create) return null; dir = await dir.createFolder(p); } }
  if (create) return dir.createFile(parts[parts.length - 1], { overwrite: true });
  try { return await dir.getEntry(parts[parts.length - 1]); } catch { return null; }
}
export const readEntry = async (e, type) => e ? e.read({ format: type === 'binary' ? formats.binary : formats.utf8 }) : null;

/** A folder outside the UXP sandbox that the host can write a frame into and the panel can read (shared with the helper). */
export function plainFrameDir() {
  try { const home = require('os').homedir(); if (!home) return null; const h = String(home).replace(/\\/g, '/');
    return os === 'mac' ? h + '/Library/Application Support/ColoredLens' : h + '/AppData/Local/Temp';
  } catch { return null; }
}
/** Read a file by exact path, or null. */
export async function readPlain(path) {
  const fs = require('fs'); let raw; try { raw = await fs.readFile('file:' + path); } catch { return null; }
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw); return bytes.length ? bytes : null;
}
const bytesToText = v => { if (typeof v === 'string') return v; const u = v instanceof Uint8Array ? v : new Uint8Array(v.buffer || v); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };

/** The pieces of the host object that do not depend on which Adobe app this is. */
export function commonHost() {
  const host = {
    fetch: (url, o) => fetch(url, o),
    async readBundled(name, type) { return readEntry(await entryAt(await lfs.getPluginFolder(), 'content/' + name), type); },
    cache: {
      async read(name, type) { return readEntry(await entryAt(await lfs.getDataFolder(), 'cache/' + name), type); },
      async write(name, data) { const f = await entryAt(await lfs.getDataFolder(), 'cache/' + name, true); await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); },
    },
    async saveFile(name, data) {
      const ext = name.split('.').pop(); const f = await lfs.getFileForSaving(name, { types: [ext] }); if (!f) return null;
      await f.write(data, { format: typeof data === 'string' ? formats.utf8 : formats.binary }); return f.nativePath;
    },
    openUrl: url => uxp.shell.openExternal(url, 'Opens in your browser'),
    bridge: os !== 'mac' ? null : async (req, ms = 180000) => {
      const fs = require('fs'), dir = 'file:' + require('os').homedir() + '/Library/Application Support/ColoredLens/bridge/';
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), body = JSON.stringify(req);
      try { await fs.writeFile(dir + 'tmp-' + id + '.json', body, { encoding: 'utf-8' }); await fs.rename(dir + 'tmp-' + id + '.json', dir + 'req-' + id + '.json'); }
      catch (e) { console.warn('bridge write', e); throw new Error('helper'); }
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        await new Promise(r => setTimeout(r, 150));
        let txt; try { txt = await fs.readFile(dir + 'res-' + id + '.json', { encoding: 'utf-8' }); } catch { continue; }
        try { const out = JSON.parse(txt); try { await fs.unlink(dir + 'res-' + id + '.json'); } catch {} return out; } catch { /* still being written */ }
      }
      try { await fs.unlink(dir + 'req-' + id + '.json'); } catch {}
      throw new Error('helper');
    },
    async post(url, headers, body) { if (host.bridge && /^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) { const r = await host.bridge({ type: 'http', method: 'POST', url, headers, body }, 240000); return { status: r.status || 0, text: r.text || '' }; }
      const r = await fetch(url, { method: 'POST', headers, body }); return { status: r.status, text: await r.text() }; },
    async get(url, headers = {}) { if (host.bridge && /^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) { const r = await host.bridge({ type: 'http', method: 'GET', url, headers }, 6000); return { status: r.status || 0, text: r.text || '' }; }
      const r = await fetch(url, { headers }); return { status: r.status, text: await r.text() }; },
    secret: {
      async get(k) {
        try { const v = await uxp.storage.secureStorage.getItem('coloredlens.' + k); if (v != null) { const out = bytesToText(v); if (out) return out; } } catch (e) { console.warn('secure storage read', e); }
        try { return localStorage.getItem('coloredlens.secret.' + k) || ''; } catch { return ''; }
      },
      async set(k, v) {
        try { await uxp.storage.secureStorage.setItem('coloredlens.' + k, v); } catch (e) { console.warn('secure storage write', e); }
        let back = ''; try { const r = await uxp.storage.secureStorage.getItem('coloredlens.' + k); if (r != null) back = bytesToText(r); } catch { /* fall through */ }
        try { if (back === v) localStorage.removeItem('coloredlens.secret.' + k); else localStorage.setItem('coloredlens.secret.' + k, v); } catch { /* nothing else to try */ }
      },
    },
    async installUpdate(url, filename, onProgress = () => {}) {
      onProgress(0.05);
      const r = await fetch(url); if (!r.ok) throw new Error('Download failed (' + r.status + ')');
      const total = +r.headers.get('content-length') || 0, buf = new Uint8Array(await r.arrayBuffer()); onProgress(0.9);
      if (total && buf.length !== total) throw new Error(`The download was incomplete (${buf.length} of ${total} bytes)`);
      const magic = String.fromCharCode(...buf.subarray(0, 4)), ext = filename.split('.').pop().toLowerCase();
      const ok = ext === 'pkg' ? magic === 'xar!' : ext === 'exe' ? magic.startsWith('MZ') : ext === 'ccx' ? magic.startsWith('PK') : buf.length > 0;
      if (!ok || buf.length < 100000) throw new Error('The downloaded file is not a valid installer (' + buf.length + ' bytes)');
      let folder = null; try { const home = require('os').homedir(); if (home) folder = await lfs.getEntryWithUrl('file:' + home.replace(/\\/g, '/') + '/Downloads'); } catch { folder = null; }
      if (!folder) folder = await lfs.getTemporaryFolder();
      const f = await folder.createFile(filename, { overwrite: true });
      await f.write(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { format: formats.binary });
      onProgress(1);
      const res = await uxp.shell.openPath(f.nativePath, 'Opens the Colored Lens Studio installer');
      if (res) throw new Error('Could not open the installer: ' + res + '. It is saved at ' + f.nativePath);
      return f.nativePath;
    },
  };
  return host;
}

/** Boots the shared panel in a UXP host, with the optional Preview panel (same document, same JS context). */
export function boot(host, pluginId) {
  const previewEl = document.createElement('div'); previewEl.id = 'previewPanel'; previewEl.className = 'pv';
  let app = null, previewShown = false;
  host.openPreviewPanel = async () => {
    const me = [...uxp.pluginManager.plugins].find(p => p.id === pluginId);
    if (!me) throw new Error('Could not find the Colored Lens plugin to open its preview panel');
    await me.showPanel('preview');
  };
  try {
    uxp.entrypoints.setup({ panels: {
      coloredlens: { show() {} },
      preview: { show(rootNode) {
        if (!rootNode || (rootNode.contains && rootNode.contains(document.getElementById('root')))) return;
        if (previewEl.parentNode !== rootNode) rootNode.appendChild(previewEl);
        previewShown = true; if (app && app.attachPreview) app.attachPreview(previewEl); } },
    } });
  } catch (e) { console.warn('panel setup', e); }
  startApp(host, document.getElementById('root')).then(a => { app = a; if (previewShown && a.attachPreview) a.attachPreview(previewEl); })
    .catch(e => { document.getElementById('root').textContent = 'Colored Lens could not start: ' + e.message; });
}

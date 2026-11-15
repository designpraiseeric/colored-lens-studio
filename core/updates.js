// Keeps every installed copy connected to GitHub:
//  - content (encyclopedia, frames, looks, LUTs) refreshes silently from GitHub Pages and is cached offline;
//  - code updates are detected from version.json and installed with one click (host.installUpdate).
import { lutFromBin } from './look.js';
// The host adapter supplies fetch, a cache folder and an installer opener; nothing here is host-specific.

export function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map(x => (isNaN(+x) ? x : +x)), pb = String(b).replace(/^v/, '').split(/[.-]/).map(x => (isNaN(+x) ? x : +x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] ?? 0, y = pb[i] ?? 0; if (x === y) continue; if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1; return String(x) > String(y) ? 1 : -1; }
  return 0;
}

export class Updater {
  /** @param host adapter (see hosts/README.md); @param base the GitHub Pages URL */
  constructor(host, base) { this.host = host; this.base = base.replace(/\/?$/, '/'); this.content = null; }

  async json(url) { const r = await this.host.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }

  /** Is a newer version of the plugin published? */
  async check() {
    try {
      const v = await this.json(this.base + 'version.json');
      const newer = cmpVersion(v.version, this.host.version) > 0;
      const key = this.host.os === 'win' ? 'win-suite' : 'mac-suite';
      return { ok: true, newer, latest: v.version, current: this.host.version, notes: v.notes, page: v.page, download: v.downloads[key], premiere: v.downloads['premiere-ccx'], contentVersion: v.contentVersion };
    } catch (e) { return { ok: false, error: e.message, current: this.host.version }; }
  }

  /** Load content: cache first (instant, offline), then bundled. */
  async load() {
    const get = async n => { const c = (await this.host.cache.read(n, 'text').catch(() => null)) || (await this.host.readBundled(n, 'text').catch(() => null)); return c ? JSON.parse(c) : null; };
    const [encyclopedia, refs, looks, manifest] = await Promise.all(['encyclopedia.json', 'refs.json', 'looks.json', 'manifest.json'].map(get));
    this.content = { encyclopedia, refs, looks, manifest, luts: {} };
    return this.content;
  }

  /** Pull new content if GitHub has a newer contentVersion. Returns true when something changed. */
  async sync(onProgress = () => {}) {
    let remote; try { remote = await this.json(this.base + 'content/manifest.json'); } catch { return false; }
    const local = this.content && this.content.manifest;
    if (local && local.contentVersion === remote.contentVersion) return false;
    const want = [...remote.core, ...Object.keys(remote.files).filter(f => f.startsWith('luts/'))];
    let done = 0;
    for (const f of want) {
      const r = await this.host.fetch(this.base + 'content/' + f + '?v=' + remote.contentVersion); if (!r.ok) throw new Error('Could not download ' + f);
      await this.host.cache.write(f, f.endsWith('.json') ? await r.text() : await r.arrayBuffer());
      onProgress(++done / want.length, f);
    }
    await this.host.cache.write('manifest.json', JSON.stringify(remote));
    await this.load();
    return true;
  }

  /** A Lukuluku 3D LUT (cache, then network, then bundled). */
  async lut(id) {
    if (this.content.luts[id]) return this.content.luts[id];
    let buf = await this.host.cache.read('luts/' + id + '.bin', 'binary').catch(() => null);
    if (!buf) try {
      const r = await this.host.fetch(this.base + 'content/luts/' + id + '.bin'); if (r.ok) { buf = await r.arrayBuffer(); await this.host.cache.write('luts/' + id + '.bin', buf); }
    } catch { /* offline */ }
    if (!buf) buf = await this.host.readBundled('luts/' + id + '.bin', 'binary').catch(() => null);
    if (!buf) throw new Error('Colour LUT ' + id + ' is not available offline yet');
    return (this.content.luts[id] = lutFromBin(buf, (this.content.looks.luts[id] || {}).size || 33));
  }

  frameUrl(thumb) { return this.base + 'content/' + thumb; }

  /** Download the installer for this computer and open it. */
  async install(info, onProgress = () => {}) {
    const url = this.host.name === 'premiere' && this.host.preferCcx ? info.premiere : info.download;
    return this.host.installUpdate(url, url.split('/').pop(), onProgress);
  }
}

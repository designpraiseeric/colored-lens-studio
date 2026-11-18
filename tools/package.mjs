// Packages the Premiere panel as a .ccx (Adobe's ZIP-based installer, manifest.json at the root).
// The macOS .pkg and Windows .exe are built by installer/mac/build_pkg.sh and installer/windows/*.iss in CI.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipDir(dir, out) {
  const files = []; const walk = d => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } }; walk(dir);
  const chunks = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(path.relative(dir, f).split(path.sep).join('/')), data = fs.readFileSync(f), comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, comp);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name); offset += 30 + name.length + comp.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.concat([...chunks, ...central, end]));
  return files.length;
}
if (process.argv[1] && process.argv[1].endsWith('package.mjs')) {
  const src = path.join(ROOT, 'dist', 'premiere'), out = path.join(ROOT, 'dist', 'release', `ColoredLens-Premiere-${pkg.version}.ccx`);
  if (!fs.existsSync(path.join(src, 'manifest.json'))) { console.error('Build the Premiere panel first (npm run build)'); process.exit(1); }
  const n = zipDir(src, out); console.log(`${path.relative(ROOT, out)}: ${n} files, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  // After Effects ships as a CEP panel (tools/sign_cep.sh signs it as a .zxp on macOS). The UXP build in
  // hosts/aftereffects stays in the repo for the day AE releases load third-party UXP; it is no longer packaged.
}

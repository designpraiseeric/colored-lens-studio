// Tiny image helpers that run anywhere (UXP has no canvas pixel access, so we decode ourselves).
// A Frame is { w, h, data: Uint8ClampedArray (RGBA, 8-bit, display-referred sRGB/Rec.709) }.
import { unzlibSync } from 'fflate';
import jpegDecode from 'jpeg-js/lib/decoder.js';

export function makeFrame(w, h, data) { return { w, h, data: data || new Uint8ClampedArray(w * h * 4) }; }

/** Decode a frame grab, whatever the host wrote: PNG, JPEG, BMP, TGA or PPM (detected from the bytes, not the name). */
export function decodeImage(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 16) throw new Error(`The frame file is empty or still being written (${u8.length} bytes)`);
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return decodePNG(u8);
  if (u8[0] === 0xff && u8[1] === 0xd8) return decodeJPEG(u8);
  if (u8[0] === 0x42 && u8[1] === 0x4d) return decodeBMP(u8);
  if (u8[0] === 0x50 && u8[1] === 0x36) return decodePPM(u8);
  if ((u8[2] === 2 || u8[2] === 10) && u8[1] === 0) return decodeTGA(u8);
  const head = Array.from(u8.slice(0, 8), b => b.toString(16).padStart(2, '0')).join(' ');
  throw new Error(`Unsupported frame format (first bytes ${head}, ${u8.length} bytes)`);
}

function decodeJPEG(u8) {
  const r = jpegDecode(u8, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return makeFrame(r.width, r.height, new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.length));
}

/** PNG: 8/16-bit, greyscale / RGB / palette / alpha, non-interlaced and Adam7. */
function decodePNG(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let p = 8, w = 0, h = 0, depth = 8, type = 2, interlace = 0, pal = null, trns = null; const idat = [];
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p), t = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]), d = u8.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (t === 'PLTE') pal = d; else if (t === 'tRNS') trns = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    p += 12 + len;
  }
  let total = 0; for (const c of idat) total += c.length; const z = new Uint8Array(total); let o = 0; for (const c of idat) { z.set(c, o); o += c.length; }
  const raw = unzlibSync(z), ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bpp = Math.max(1, (ch * depth) >> 3), f = makeFrame(w, h);
  const sample = (row, x, c) => { // value of channel c at x in an unfiltered row, scaled to 0..255
    if (depth === 16) return row[(x * ch + c) * 2];
    if (depth === 8) return row[x * ch + c];
    const bit = x * depth, v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1); return type === 3 ? v : Math.round(v * 255 / ((1 << depth) - 1));
  };
  const put = (row, x, X, Y) => { const i = (Y * w + X) * 4;
    if (type === 3) { const k = sample(row, x, 0); f.data[i] = pal[k * 3]; f.data[i + 1] = pal[k * 3 + 1]; f.data[i + 2] = pal[k * 3 + 2]; f.data[i + 3] = trns && k < trns.length ? trns[k] : 255; return; }
    const g = type === 0 || type === 4; f.data[i] = sample(row, x, 0); f.data[i + 1] = g ? f.data[i] : sample(row, x, 1); f.data[i + 2] = g ? f.data[i] : sample(row, x, 2);
    f.data[i + 3] = type === 4 ? sample(row, x, 1) : type === 6 ? sample(row, x, 3) : 255; };
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let q = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy); if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil(pw * ch * depth / 8); let prev = new Uint8Array(stride);
    for (let y = 0; y < ph; y++) {
      const ft = raw[q++], row = raw.slice(q, q + stride); q += stride;
      for (let i = 0; i < stride; i++) { const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        if (ft === 1) row[i] = (row[i] + a) & 255; else if (ft === 2) row[i] = (row[i] + b) & 255; else if (ft === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
        else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; } }
      for (let x = 0; x < pw; x++) put(row, x, x0 + x * dx, y0 + y * dy);
      prev = row;
    }
  }
  return f;
}

function decodeBMP(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const off = dv.getUint32(10, true), w = dv.getInt32(18, true), hRaw = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true), comp = dv.getUint32(30, true);
  if (!(bpp === 24 || bpp === 32) || !(comp === 0 || comp === 3)) throw new Error(`BMP ${bpp}-bit compression ${comp} not supported`);
  const h = Math.abs(hRaw), bottomUp = hRaw > 0, stride = Math.ceil((w * bpp) / 32) * 4, bytes = bpp / 8;
  const f = makeFrame(w, h);
  for (let y = 0; y < h; y++) {
    const row = off + (bottomUp ? h - 1 - y : y) * stride;
    for (let x = 0; x < w; x++) {
      const s = row + x * bytes, d = (y * w + x) * 4;
      f.data[d] = u8[s + 2]; f.data[d + 1] = u8[s + 1]; f.data[d + 2] = u8[s]; f.data[d + 3] = 255;
    }
  }
  return f;
}

function decodePPM(u8) {
  let p = 2; const tok = () => {
    while (p < u8.length) { const c = u8[p]; if (c === 35) { while (u8[p] !== 10) p++; } else if (c <= 32) p++; else break; }
    let s = ''; while (u8[p] > 32) s += String.fromCharCode(u8[p++]); return +s;
  };
  const w = tok(), h = tok(), max = tok(); p++;
  const f = makeFrame(w, h), two = max > 255;
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) {
    const v = two ? ((u8[p++] << 8) | u8[p++]) / max : u8[p++] / max;
    f.data[i * 4 + c] = v * 255; if (c === 2) f.data[i * 4 + 3] = 255;
  }
  return f;
}

function decodeTGA(u8) {
  const idLen = u8[0], type = u8[2], w = u8[12] | (u8[13] << 8), h = u8[14] | (u8[15] << 8), bpp = u8[16], desc = u8[17];
  const bytes = bpp / 8, topDown = (desc & 0x20) !== 0; let p = 18 + idLen;
  const px = new Uint8Array(w * h * bytes);
  if (type === 2) px.set(u8.subarray(p, p + px.length));
  else { let o = 0; while (o < px.length) { const hd = u8[p++], n = (hd & 127) + 1;
    if (hd & 128) { for (let i = 0; i < n; i++) for (let b = 0; b < bytes; b++) px[o++] = u8[p + b]; p += bytes; }
    else { const len = n * bytes; px.set(u8.subarray(p, p + len), o); o += len; p += len; } } }
  const f = makeFrame(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((topDown ? y : h - 1 - y) * w + x) * bytes, d = (y * w + x) * 4;
    f.data[d] = px[s + 2]; f.data[d + 1] = px[s + 1]; f.data[d + 2] = px[s]; f.data[d + 3] = 255;
  }
  return f;
}

/** Box-filter downsample so the longest side is at most `max` px. */
export function downsample(f, max = 192) {
  const s = Math.max(f.w, f.h) / max; if (s <= 1) return f;
  const w = Math.max(1, Math.round(f.w / s)), h = Math.max(1, Math.round(f.h / s)), out = makeFrame(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor((x * f.w) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * f.w) / w));
    const y0 = Math.floor((y * f.h) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * f.h) / h));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * f.w + xx) * 4; r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2]; n++; }
    const o = (y * w + x) * 4; out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
  }
  return out;
}

// ---------- PNG encoder (stored deflate blocks: no zlib needed, fine for small previews) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8, start, end) { let c = 0xffffffff; for (let i = start; i < end; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function encodePNG(f) {
  const raw = new Uint8Array((f.w * 3 + 1) * f.h);
  for (let y = 0, o = 0; y < f.h; y++) { raw[o++] = 0; for (let x = 0; x < f.w; x++) { const i = (y * f.w + x) * 4; raw[o++] = f.data[i]; raw[o++] = f.data[i + 1]; raw[o++] = f.data[i + 2]; } }
  const blocks = Math.ceil(raw.length / 65535) || 1, z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78; z[1] = 0x01; let p = 2, a = 1, b = 0;
  for (let i = 0; i < blocks; i++) { const s = i * 65535, len = Math.min(65535, raw.length - s);
    z[p++] = i === blocks - 1 ? 1 : 0; z[p++] = len & 255; z[p++] = len >> 8; z[p++] = ~len & 255; z[p++] = (~len >> 8) & 255;
    z.set(raw.subarray(s, s + len), p); p += len; }
  for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  z[p++] = b >> 8; z[p++] = b & 255; z[p++] = a >> 8; z[p++] = a & 255;
  const chunks = [];
  const chunk = (type, data) => { const c = new Uint8Array(12 + data.length), dv = new DataView(c.buffer);
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i); c.set(data, 8);
    dv.setUint32(8 + data.length, crc32(c, 4, 8 + data.length)); chunks.push(c); };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, f.w); dv.setUint32(4, f.h); ihdr[8] = 8; ihdr[9] = 2;
  chunk('IHDR', ihdr); chunk('IDAT', z.subarray(0, p)); chunk('IEND', new Uint8Array(0));
  const sig = [137, 80, 78, 71, 13, 10, 26, 10], len = 8 + chunks.reduce((s, c) => s + c.length, 0), out = new Uint8Array(len);
  out.set(sig, 0); let q = 8; for (const c of chunks) { out.set(c, q); q += c.length; } return out;
}
export function toBase64(u8) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let s = '';
  for (let i = 0; i < u8.length; i += 3) { const n = (u8[i] << 16) | ((u8[i + 1] || 0) << 8) | (u8[i + 2] || 0);
    s += T[(n >> 18) & 63] + T[(n >> 12) & 63] + (i + 1 < u8.length ? T[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? T[n & 63] : '='); }
  return s;
}
export const pngDataUrl = f => 'data:image/png;base64,' + toBase64(encodePNG(f));

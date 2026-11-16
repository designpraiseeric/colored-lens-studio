// A small baseline JPEG encoder (4:4:4, standard tables). Frames sent to an AI are photographs: as PNG they are
// around a megabyte, which is slow to upload on an ordinary connection; as JPEG they are under a tenth of that.
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const QY = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
const DC_Y = [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const DC_C = [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const AC_Y = [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];
const AC_C = [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];
function huff([bits, vals]) { const codes = {}; let code = 0, k = 0; for (let len = 1; len <= 16; len++) { for (let i = 0; i < bits[len - 1]; i++) codes[vals[k++]] = [code++, len]; code <<= 1; } return codes; }
const COS = (() => { const c = new Float64Array(64); for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) c[u * 8 + x] = Math.cos((2 * x + 1) * u * Math.PI / 16) * (u === 0 ? Math.SQRT1_2 : 1) / 2; return c; })();

/** frame {w,h,data RGBA} → Uint8Array of a JPEG file. quality 1..100. */
export function encodeJPEG(f, quality = 82) {
  const s = quality < 50 ? 5000 / quality : 200 - quality * 2, q = t => t.map(v => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
  const qy = q(QY), qc = q(QC), out = []; let acc = 0, nb = 0;
  const byte = b => out.push(b & 255), word = w => { byte(w >> 8); byte(w); };
  const put = (code, len) => { acc = (acc << len) | code; nb += len; while (nb >= 8) { const b = (acc >> (nb - 8)) & 255; byte(b); if (b === 255) byte(0); nb -= 8; } acc &= (1 << nb) - 1; };
  const hDCY = huff(DC_Y), hDCC = huff(DC_C), hACY = huff(AC_Y), hACC = huff(AC_C);
  word(0xffd8); word(0xffe0); word(16); [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0].forEach(byte); word(1); word(1); byte(0); byte(0);
  for (const [id, t] of [[0, qy], [1, qc]]) { word(0xffdb); word(67); byte(id); for (let i = 0; i < 64; i++) byte(t[ZZ[i]]); }
  word(0xffc0); word(17); byte(8); word(f.h); word(f.w); byte(3); [[1, 0x11, 0], [2, 0x11, 1], [3, 0x11, 1]].forEach(c => c.forEach(byte));
  for (const [cls, [bits, vals]] of [[0x00, DC_Y], [0x10, AC_Y], [0x01, DC_C], [0x11, AC_C]]) { word(0xffc4); word(19 + vals.length); byte(cls); bits.forEach(byte); vals.forEach(byte); }
  word(0xffda); word(12); byte(3); [[1, 0x00], [2, 0x11], [3, 0x11]].forEach(c => c.forEach(byte)); byte(0); byte(63); byte(0);
  const blk = [new Float64Array(64), new Float64Array(64), new Float64Array(64)], tmp = new Float64Array(64), zz = new Int32Array(64), pred = [0, 0, 0], d = f.data, W = f.w, H = f.h;
  const size = v => { v = Math.abs(v); let n = 0; while (v) { n++; v >>= 1; } return n; };
  const emit = (b, qt, hdc, hac, ci) => {
    for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) { let sum = 0; for (let y = 0; y < 8; y++) sum += b[y * 8 + x] * COS[u * 8 + y]; tmp[u * 8 + x] = sum; } // columns
    for (let y = 0; y < 8; y++) for (let v = 0; v < 8; v++) { let sum = 0; for (let x = 0; x < 8; x++) sum += tmp[y * 8 + x] * COS[v * 8 + x]; b[y * 8 + v] = sum; } // rows
    for (let i = 0; i < 64; i++) zz[i] = Math.round(b[ZZ[i]] / qt[ZZ[i]]);
    const diff = zz[0] - pred[ci]; pred[ci] = zz[0]; let n = size(diff); put(...hdc[n]); if (n) put(diff < 0 ? diff + (1 << n) - 1 : diff, n);
    let run = 0, last = 63; while (last > 0 && zz[last] === 0) last--;
    for (let i = 1; i <= last; i++) { const v = zz[i]; if (v === 0) { run++; continue; } while (run > 15) { put(...hac[0xf0]); run -= 16; } n = size(v); put(...hac[(run << 4) | n]); put(v < 0 ? v + (1 << n) - 1 : v, n); run = 0; }
    if (last < 63) put(...hac[0]);
  };
  for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const p = (Math.min(H - 1, by + y) * W + Math.min(W - 1, bx + x)) * 4, r = d[p], g = d[p + 1], b = d[p + 2], i = y * 8 + x;
      blk[0][i] = 0.299 * r + 0.587 * g + 0.114 * b - 128; blk[1][i] = -0.168736 * r - 0.331264 * g + 0.5 * b; blk[2][i] = 0.5 * r - 0.418688 * g - 0.081312 * b; }
    emit(blk[0], qy, hDCY, hACY, 0); emit(blk[1], qc, hDCC, hACC, 1); emit(blk[2], qc, hDCC, hACC, 2);
  }
  if (nb) put((1 << (8 - nb)) - 1, 8 - nb); word(0xffd9);
  return new Uint8Array(out);
}

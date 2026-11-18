// Base64url and UTF-8 in plain JavaScript. UXP does not guarantee btoa, atob, TextEncoder or TextDecoder, and code
// that leaned on them threw in the founder's Premiere (18 Nov: "Share code"). Use these everywhere the panel runs.
export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const b64u = bin => { let o = ''; for (let i = 0; i < bin.length; i += 3) { const a = bin.charCodeAt(i), b = bin.charCodeAt(i + 1), c = bin.charCodeAt(i + 2), n = (a << 16) | ((b || 0) << 8) | (c || 0);
  o += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bin.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bin.length ? B64[n & 63] : ''); } return o; };
export const unb64u = s => { const t = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); let o = '', buf = 0, bits = 0;
  for (const ch of t) { const v = B64.indexOf(ch); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; o += String.fromCharCode((buf >> bits) & 255); } } return o; };
export const utf8 = { enc: s => unescape(encodeURIComponent(s)), dec: b => decodeURIComponent(escape(b)) };

// Colour maths shared by every part of the suite.
// Oklab is used for analysis because distances in it track what people see.

export const WV = [0.2126, 0.7152, 0.0722]; // Rec.709 luma weights

export const srgb2lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const lin2srgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

// ARRI LogC3 (EI 800), the same constants Lukuluku uses.
const A = 5.555556, B = 0.052272, C = 0.247190, D = 0.385537, E = 5.367655, F = 0.092809, CUT = 0.010591;
export const log2lin = t => (t > E * CUT + F ? (Math.pow(10, (t - D) / C) - B) / A : (t - F) / E);
export const lin2log = x => (x > CUT ? C * Math.log10(A * Math.max(x, 1e-6) + B) + D : E * x + F);

export function linToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
export function oklabToLin(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
/** display sRGB 0..1 -> Oklab */
export const srgbToOklab = (r, g, b) => linToOklab(srgb2lin(r), srgb2lin(g), srgb2lin(b));
export const oklabToSrgb = (L, a, b) => oklabToLin(L, a, b).map(v => Math.min(1, Math.max(0, lin2srgb(v))));

/** Oklab -> [L, chroma, hue in degrees 0..360) */
export function toLCh(lab) {
  const C = Math.hypot(lab[1], lab[2]);
  let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [lab[0], C, h];
}
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(r, g, b) {
  const t = v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return '#' + t(r) + t(g) + t(b);
}
export const hexToOklab = hex => srgbToOklab(...hexToRgb(hex));
export const luma = (r, g, b) => WV[0] * r + WV[1] * g + WV[2] * b;
export const oklabDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/**
 * A plain name for a colour, from OkLCh: what an editor would call it. Zone names used the encyclopedia's thirteen
 * hues, which have no olive, khaki or brown, so an olive jacket was announced as "the amber you picked" (18 Nov).
 * L 0..1, C chroma, h degrees.
 */
export function plainColourName(L, C, h) {
  if (C < 0.03) return L < 0.25 ? 'black' : L > 0.88 ? 'white' : L > 0.65 ? 'light grey' : L < 0.42 ? 'dark grey' : 'grey';
  h = ((h % 360) + 360) % 360;
  if (h >= 30 && h < 85 && L < 0.58 && C < 0.13) return L < 0.38 ? 'dark brown' : 'brown';
  if (h >= 75 && h < 125 && C < 0.1) return L >= 0.62 ? 'khaki' : 'olive';
  const base = h < 15 || h >= 350 ? (L > 0.72 ? 'pink' : 'red') : h < 40 ? 'red' : h < 70 ? 'orange' : h < 88 ? 'amber' : h < 112 ? 'yellow'
    : h < 165 ? 'green' : h < 210 ? 'teal' : h < 265 ? 'blue' : h < 315 ? 'purple' : 'magenta';
  const tone = L < 0.4 ? 'dark ' : L > 0.82 && C < 0.12 ? 'pale ' : '', mute = C < 0.07 ? 'muted ' : '';
  return (mute + tone + base).trim();
}

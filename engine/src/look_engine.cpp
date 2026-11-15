// See look_engine.h. Every constant here mirrors Lukuluku's src/index.html (renderLook + FS_COMP),
// and core/look.js mirrors the same maths in JavaScript; test/engine_parity checks they agree.
#include "look_engine.h"
#include "generated/catalog.h"
#include <algorithm>
#include <cmath>
#include <thread>
#include <vector>

namespace lukuluku {
static_assert(kLensCount == 3 && kDiffCount == 5 && kColorCount == 17 && kMediumCount == 11 && kAspectCount == 11,
              "Lukuluku's catalog changed size: update the popup ranges in params.h (append only)");

const char* versionString() { return LUKULUKU_ENGINE_VERSION; }

namespace {
struct V3 { float r, g, b; };
inline V3 operator+(V3 a, V3 b) { return {a.r + b.r, a.g + b.g, a.b + b.b}; }
inline V3 operator-(V3 a, V3 b) { return {a.r - b.r, a.g - b.g, a.b - b.b}; }
inline V3 operator*(V3 a, float k) { return {a.r * k, a.g * k, a.b * k}; }
inline V3 operator*(V3 a, V3 b) { return {a.r * b.r, a.g * b.g, a.b * b.b}; }
inline V3 vmax0(V3 a) { return {std::max(a.r, 0.f), std::max(a.g, 0.f), std::max(a.b, 0.f)}; }
inline V3 clamp01(V3 a) { return {std::clamp(a.r, 0.f, 1.f), std::clamp(a.g, 0.f, 1.f), std::clamp(a.b, 0.f, 1.f)}; }
inline float dotW(V3 c) { return 0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b; }
inline V3 mixv(V3 a, V3 b, float t) { return a + (b - a) * t; }
inline float smoothstepf(float e0, float e1, float x) { float t = std::clamp((x - e0) / (e1 - e0), 0.f, 1.f); return t * t * (3 - 2 * t); }
inline float fractf(double x) { return float(x - std::floor(x)); }

// ---- transfer functions (same constants as Lukuluku / core/color.js)
const float A = 5.555556f, B = 0.052272f, C = 0.247190f, D = 0.385537f, E = 5.367655f, F = 0.092809f, CUT = 0.010591f;
inline float log2lin(float t) { return t > E * CUT + F ? (std::pow(10.f, (t - D) / C) - B) / A : (t - F) / E; }
inline float lin2log(float x) { return x > CUT ? C * std::log10(A * std::max(x, 1e-6f) + B) + D : E * x + F; }
inline float srgb2lin(float c) { return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f); }
inline float lin2srgb(float c) { return c <= 0.0031308f ? 12.92f * c : 1.055f * std::pow(std::max(c, 0.f), 1 / 2.4f) - 0.055f; }

V3 linToOklab(V3 c) {
  float l = 0.4122214708f * c.r + 0.5363325363f * c.g + 0.0514459929f * c.b, m = 0.2119034982f * c.r + 0.6806995451f * c.g + 0.1073969566f * c.b,
        s = 0.0883024619f * c.r + 0.2817188376f * c.g + 0.6299787005f * c.b;
  l = std::cbrt(l); m = std::cbrt(m); s = std::cbrt(s);
  return {0.2104542553f * l + 0.7936177850f * m - 0.0040720468f * s, 1.9779984951f * l - 2.4285922050f * m + 0.4505937099f * s, 0.0259040371f * l + 0.7827717662f * m - 0.8086757660f * s};
}
V3 oklabToLin(V3 o) {
  float l = o.r + 0.3963377774f * o.g + 0.2158037573f * o.b, m = o.r - 0.1055613458f * o.g - 0.0638541728f * o.b, s = o.r - 0.0894841775f * o.g - 1.2914855480f * o.b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return {4.0767416621f * l - 3.3077115913f * m + 0.2309699292f * s, -1.2684380046f * l + 2.6097574011f * m - 0.3413193965f * s, -0.0041960863f * l - 0.7034186147f * m + 1.7076147010f * s};
}
inline V3 srgbToOklab(V3 c) { return linToOklab({srgb2lin(c.r), srgb2lin(c.g), srgb2lin(c.b)}); }
inline V3 oklabToSrgb(V3 o) { V3 l = oklabToLin(o); return clamp01({lin2srgb(l.r), lin2srgb(l.g), lin2srgb(l.b)}); }

V3 rgb2hsv(V3 c) {
  float px, py, pz, pw;
  if (c.b > c.g) { px = c.b; py = c.g; pz = -1.f; pw = 2.f / 3.f; } else { px = c.g; py = c.b; pz = 0.f; pw = -1.f / 3.f; }
  float qx, qy, qz, qw;
  if (px > c.r) { qx = px; qy = py; qz = pw; qw = c.r; } else { qx = c.r; qy = py; qz = pz; qw = px; }
  float d = qx - std::min(qw, qy), e = 1e-6f;
  return {std::fabs(qz + (qw - qy) / (6 * d + e)), d / (qx + e), qx};
}
V3 hsv2rgb(V3 c) {
  auto ch = [&](float k) { float p = std::fabs(fractf(c.r + k) * 6 - 3); return c.b * (1 + (std::clamp(p - 1, 0.f, 1.f) - 1) * c.g); };
  return {ch(1.f), ch(2.f / 3.f), ch(1.f / 3.f)};
}

// ---- 3-channel float buffer with GPU-style bilinear sampling (texel centres at (i+0.5)/w)
struct Buf {
  int w = 0, h = 0; std::vector<float> px;
  void resize(int W, int H) { w = std::max(1, W); h = std::max(1, H); px.assign(size_t(w) * h * 3, 0.f); }
  float* at(int x, int y) { return &px[(size_t(y) * w + x) * 3]; }
  const float* at(int x, int y) const { return &px[(size_t(y) * w + x) * 3]; }
  V3 sample(float u, float v) const {
    float x = u * w - 0.5f, y = v * h - 0.5f; int x0 = int(std::floor(x)), y0 = int(std::floor(y)); float fx = x - x0, fy = y - y0;
    auto get = [&](int xx, int yy) { xx = std::clamp(xx, 0, w - 1); yy = std::clamp(yy, 0, h - 1); const float* p = at(xx, yy); return V3{p[0], p[1], p[2]}; };
    V3 a = get(x0, y0), b = get(x0 + 1, y0), c = get(x0, y0 + 1), d = get(x0 + 1, y0 + 1);
    return mixv(mixv(a, b, fx), mixv(c, d, fx), fy);
  }
};

template <class Fn> void parallelRows(int h, int threads, Fn fn) {
  int n = threads > 0 ? threads : int(std::max(1u, std::thread::hardware_concurrency()));
  n = std::min(n, std::max(1, h / 16));
  if (n <= 1) { for (int y = 0; y < h; y++) fn(y); return; }
  std::vector<std::thread> pool;
  for (int t = 0; t < n; t++) pool.emplace_back([&, t] { for (int y = t; y < h; y += n) fn(y); });
  for (auto& th : pool) th.join();
}

void blur1D(const Buf& src, Buf& dst, float sigma, bool horizontal, int threads) {
  dst.resize(src.w, src.h);
  if (sigma < 0.3f) { dst.px = src.px; return; }
  int r = int(std::ceil(sigma * 3)); std::vector<float> k(2 * r + 1); float sum = 0;
  for (int i = -r; i <= r; i++) { k[i + r] = std::exp(-0.5f * i * i / (sigma * sigma)); sum += k[i + r]; }
  for (auto& v : k) v /= sum;
  parallelRows(src.h, threads, [&](int y) {
    for (int x = 0; x < src.w; x++) {
      float acc[3] = {0, 0, 0};
      for (int i = -r; i <= r; i++) {
        int xx = horizontal ? std::clamp(x + i, 0, src.w - 1) : x, yy = horizontal ? y : std::clamp(y + i, 0, src.h - 1);
        const float* p = src.at(xx, yy); float wgt = k[i + r]; acc[0] += p[0] * wgt; acc[1] += p[1] * wgt; acc[2] += p[2] * wgt;
      }
      float* o = dst.at(x, y); o[0] = acc[0]; o[1] = acc[1]; o[2] = acc[2];
    }
  });
}
void blur2(const Buf& src, Buf& out, float sx, float sy, int threads) { Buf tmp; blur1D(src, tmp, sx, true, threads); blur1D(tmp, out, sy, false, threads); }

/** Lukuluku FS_PRE at a reduced size: average, clamp, keep only what is above the threshold. */
void prefilter(const Buf& lin, Buf& out, int factor, float thr, int threads) {
  out.resize(lin.w / factor, lin.h / factor);
  parallelRows(out.h, threads, [&](int y) {
    for (int x = 0; x < out.w; x++) {
      float acc[3] = {0, 0, 0}; int n = 0;
      for (int yy = y * factor; yy < std::min(lin.h, (y + 1) * factor); yy++) for (int xx = x * factor; xx < std::min(lin.w, (x + 1) * factor); xx++) { const float* p = lin.at(xx, yy); acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; n++; }
      V3 c = {std::min(acc[0] / std::max(n, 1), 12.f), std::min(acc[1] / std::max(n, 1), 12.f), std::min(acc[2] / std::max(n, 1), 12.f)};
      float k = smoothstepf(thr, thr * 3, dotW(c)); float* o = out.at(x, y); o[0] = c.r * k; o[1] = c.g * k; o[2] = c.b * k;
    }
  });
}

// ---- grain (Lukuluku's hash value noise)
inline float hsh(double px, double py) { float x = fractf(px * 123.34), y = fractf(py * 456.21); float d = x * (x + 45.32f) + y * (y + 45.32f); x += d; y += d; return fractf(double(x) * double(y)); }
inline float vnoise(double px, double py) {
  double ix = std::floor(px), iy = std::floor(py); float fx = float(px - ix), fy = float(py - iy); fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  float a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
inline float grainAt(double px, double py, float s) {
  return (vnoise(px / s, py / s) + vnoise(px / s * 1.9 + 17, py / s * 1.9 + 17) * 0.6f + vnoise(px / s * 3.7 + 41, py / s * 3.7 + 41) * 0.35f) / 1.95f - 0.5f;
}

// ---- 3D LUT (33^3, r fastest), trilinear like a GL_LINEAR 3D texture
struct Lut {
  const uint16_t* d; int n;
  V3 sample(V3 t) const {
    auto cl = [&](float v) { return std::clamp(v, 0.f, 1.f) * (n - 1); };
    float x = cl(t.r), y = cl(t.g), z = cl(t.b); int x0 = std::min(n - 2, int(x)), y0 = std::min(n - 2, int(y)), z0 = std::min(n - 2, int(z));
    float fx = x - x0, fy = y - y0, fz = z - z0; float out[3];
    for (int c = 0; c < 3; c++) {
      auto at = [&](int i, int j, int k) { return d[(size_t(k * n + j) * n + i) * 3 + c] / 65535.f; };
      float c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx, c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
      float c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx, c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
      out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    }
    return {out[0], out[1], out[2]};
  }
};

// ---- Rec.709 input: cancel the baseline (C0) film curve so the neutral look is a pass-through (mirrors core/look.js)
struct NeutralInverse {
  static const int N = 1024; float inv[N]; float y0 = 0, y1 = 1, sLo = 1, sHi = 1;
  explicit NeutralInverse(const Lut& lut0) {
    float f[N];
    for (int i = 0; i < N; i++) { float g = lin2log(srgb2lin(float(i) / (N - 1))); V3 o = lut0.sample({g, g, g}); f[i] = (o.r + o.g + o.b) / 3; if (i && f[i] < f[i - 1]) f[i] = f[i - 1]; }
    y0 = f[0]; y1 = f[N - 1]; int j = 0;
    for (int k = 0; k < N; k++) { float y = y0 + (y1 - y0) * k / (N - 1); while (j < N - 2 && f[j + 1] < y) j++;
      float d = f[j + 1] - f[j], t = d > 1e-9f ? std::clamp((y - f[j]) / d, 0.f, 1.f) : 0.f; inv[k] = (j + t) / (N - 1); }
    float step = (y1 - y0) / (N - 1); sLo = (inv[1] - inv[0]) / step; sHi = (inv[N - 1] - inv[N - 2]) / step;
  }
  float operator()(float v) const {
    if (v <= y0) return std::max(0.f, inv[0] + (v - y0) * sLo); if (v >= y1) return std::min(1.f, inv[N - 1] + (v - y1) * sHi);
    float x = (v - y0) / (y1 - y0) * (N - 1); int i = std::min(N - 2, int(x)); float t = x - i; return inv[i] + (inv[i + 1] - inv[i]) * t;
  }
};
const NeutralInverse& neutralInverse() { static const NeutralInverse ni(Lut{kLuts[0], kLutSize}); return ni; }

// ---- everything derived from the parameters once per frame
struct Setup {
  const LensFx* K; const DiffFx* Dd; const MediumFx* M; Lut lut, lut0;
  bool in709; float expK; V3 wb;
  float dfK, dfThr, dfSigma, dfLift, dfFlatten, dfSoften;
  float lift, flatten, con, msat, clipv; V3 warm;
  float uSat, vib, cs, sn; bool hueOn = false;
  V3 wLift, wGamE, wGainM, wOff, satR, LS, LM, LH, LSat; float lowR, highR, pivot, ucon; bool wpost;
  float hi, sh, wh, bk, bri, gam, lutMix, sharpU;
  float matchAmt, mLg, mLo, mA, mB, mCg; float skinGuard, skinHue, skinDensity, skinLight;
};
inline V3 puck(float x, float y) { return {1.14f * y, -0.395f * x - 0.581f * y, 2.032f * x}; }

Setup makeSetup(const Params& p) {
  Setup s{};
  int li = std::clamp(int(p[P_lens]), 0, kLensCount - 1), di = std::clamp(int(p[P_diffusion]), 0, kDiffCount - 1), mi = std::clamp(int(p[P_medium]), 0, kMediumCount - 1), ci = std::clamp(int(p[P_color]), 0, kColorCount - 1);
  s.K = &kLens[li]; s.Dd = &kDiff[di]; s.M = &kMedium[mi]; s.lut = {kLuts[ci], kLutSize}; s.lut0 = {kLuts[0], kLutSize};
  s.in709 = p[P_input] < 0.5; s.expK = std::pow(2.f, float(p[P_exp]));
  float tk = float(p[P_temp]) * 0.25f, tn = float(p[P_tint]) * 0.2f; V3 wb = {1 + tk, 1 - tn, 1 - tk}; float wl = dotW(wb); s.wb = wb * (1 / wl);
  float dk = float(p[P_diffK]);
  s.dfK = s.Dd->k * dk + s.K->bloom; s.dfThr = s.Dd->k > 0 ? s.Dd->thr : 0.4f; s.dfSigma = s.Dd->sigma > 0 ? s.Dd->sigma : 40.f;
  s.dfLift = s.Dd->lift * dk + s.K->lift; s.dfFlatten = s.Dd->flatten * dk + s.K->veil; s.dfSoften = s.Dd->soften * std::min(dk, 1.5f);
  s.lift = s.dfLift; s.flatten = s.dfFlatten; s.con = s.M->con; s.msat = s.M->sat; s.clipv = s.M->clip; s.warm = {s.M->warm[0], s.M->warm[1], s.M->warm[2]};
  s.uSat = float(p[P_sat] * p[P_offS]); s.vib = float(p[P_vib]); float hu = float(p[P_hue]) * 3.14159265f / 180.f; s.cs = std::cos(hu); s.sn = std::sin(hu); s.hueOn = hu != 0;
  auto add = [](V3 a, V3 b, float k) { return a + b * k; };
  float liftL = float(p[P_liftL]), gamL = float(p[P_gammaL]), gainL = float(p[P_gainL]), offL = float(p[P_offL]);
  s.wLift = add({liftL * 0.3f, liftL * 0.3f, liftL * 0.3f}, puck(float(p[P_liftX]), float(p[P_liftY])), 0.18f);
  V3 g = puck(float(p[P_gammaX]), float(p[P_gammaY])); s.wGamE = {std::pow(2.f, -(g.r * 0.5f + gamL * 0.8f)), std::pow(2.f, -(g.g * 0.5f + gamL * 0.8f)), std::pow(2.f, -(g.b * 0.5f + gamL * 0.8f))};
  V3 gn = puck(float(p[P_gainX]), float(p[P_gainY])); float gl = std::pow(2.f, gainL); s.wGainM = {gl * (1 + gn.r * 0.35f), gl * (1 + gn.g * 0.35f), gl * (1 + gn.b * 0.35f)};
  s.wOff = add({offL * 0.15f, offL * 0.15f, offL * 0.15f}, puck(float(p[P_offX]), float(p[P_offY])), 0.08f);
  s.satR = {float(p[P_liftS]), float(p[P_gammaS]), float(p[P_gainS])};
  auto lw = [&](ParamId X, ParamId Y, ParamId L) { float l = float(p[L]); return add({l * 0.15f, l * 0.15f, l * 0.15f}, puck(float(p[X]), float(p[Y])), 0.1f); };
  s.LS = lw(P_shX, P_shY, P_shL); s.LM = lw(P_midX, P_midY, P_midL); s.LH = lw(P_hiX, P_hiY, P_hiL); s.LSat = {float(p[P_shS]), float(p[P_midS]), float(p[P_hiS])};
  s.lowR = float(p[P_lowR]); s.highR = float(p[P_highR]); s.pivot = float(p[P_pivot]); s.ucon = float(p[P_con]); s.wpost = p[P_wpost] > 0.5;
  s.hi = float(p[P_hi]); s.sh = float(p[P_sh]); s.wh = float(p[P_wh]); s.bk = float(p[P_bk]); s.bri = float(p[P_bri]); s.gam = float(p[P_gam]); s.lutMix = float(p[P_lutMix]); s.sharpU = float(p[P_sharp]);
  s.matchAmt = float(p[P_matchAmt]); s.mLg = float(p[P_mLg]); s.mLo = float(p[P_mLo]); s.mA = float(p[P_mA]); s.mB = float(p[P_mB]); s.mCg = float(p[P_mCg]);
  s.skinGuard = float(p[P_skinGuard]); s.skinHue = float(p[P_skinHue]); s.skinDensity = float(p[P_skinDensity]); s.skinLight = float(p[P_skinLight]);
  return s;
}

V3 wheels(V3 x, const Setup& s) {
  x = x + s.wLift * V3{1 - x.r, 1 - x.g, 1 - x.b}; x = x * s.wGainM;
  x = {std::pow(std::max(x.r, 0.f), s.wGamE.r), std::pow(std::max(x.g, 0.f), s.wGamE.g), std::pow(std::max(x.b, 0.f), s.wGamE.b)}; x = x + s.wOff;
  float Y = std::clamp(dotW(x), 0.f, 1.f), wl = (1 - Y) * (1 - Y), whh = Y * Y, wm = std::max(0.f, 1 - wl - whh);
  x = V3{Y, Y, Y} + (x - V3{Y, Y, Y}) * (1 + wl * (s.satR.r - 1) + wm * (s.satR.g - 1) + whh * (s.satR.b - 1));
  float wS = 1 - smoothstepf(s.lowR - 0.08f, s.lowR + 0.08f, Y), wH = smoothstepf(s.highR - 0.08f, s.highR + 0.08f, Y), wM = std::clamp(1 - wS - wH, 0.f, 1.f);
  x = x + s.LS * wS + s.LM * wM + s.LH * wH;
  float Y2 = dotW(x); x = V3{Y2, Y2, Y2} + (x - V3{Y2, Y2, Y2}) * (1 + wS * (s.LSat.r - 1) + wM * (s.LSat.g - 1) + wH * (s.LSat.b - 1));
  return V3{s.pivot, s.pivot, s.pivot} + (x - V3{s.pivot, s.pivot, s.pivot}) * s.ucon;
}

V3 applyMatch(V3 rgb, const Setup& s) {
  if (s.matchAmt <= 0) return rgb;
  V3 lab = srgbToOklab(rgb), m = {lab.r * s.mLg + s.mLo, lab.g * s.mCg + s.mA, lab.b * s.mCg + s.mB};
  return oklabToSrgb(mixv(lab, m, s.matchAmt));
}
float skinWeight(V3 lab) {
  float L = lab.r, Cc = std::hypot(lab.g, lab.b), h = std::atan2(lab.b, lab.g) * 57.29578f; if (h < 0) h += 360;
  auto soft = [](float x, float lo, float hi, float e) { return smoothstepf(lo - e, lo + e, x) * (1 - smoothstepf(hi - e, hi + e, x)); };
  return soft(h, 30, 86, 7) * soft(Cc, 0.025f, 0.17f, 0.012f) * soft(L, 0.17f, 0.93f, 0.05f);
}
V3 applySkinGuard(V3 src, V3 out, const Setup& s) {
  if (s.skinGuard <= 0) return out;
  V3 so = srgbToOklab(src); float w = skinWeight(so) * s.skinGuard; if (w <= 0.001f) return out;
  V3 go = srgbToOklab(out);
  float sC = std::hypot(so.g, so.b), sh = std::atan2(so.b, so.g), gC = std::hypot(go.g, go.b), gh = std::atan2(go.b, go.g);
  float dh = sh - gh; while (dh > 3.14159265f) dh -= 6.2831853f; while (dh < -3.14159265f) dh += 6.2831853f;
  float h = gh + dh * w * s.skinHue, Cc = gC + std::max(0.f, sC - gC) * w * s.skinDensity, L = go.r + std::max(0.f, so.r - go.r) * w * s.skinLight;
  return oklabToSrgb({L, Cc * std::cos(h), Cc * std::sin(h)});
}

/** Lukuluku FS_COMP from "c" (linear, after the spatial stages) to display output. */
V3 finish(V3 c, const Setup& s, float grainVal3[3], bool useGrain, float gAmp, float chroma, float shadowNoise, float grainMono) {
  c = c * s.warm + V3{s.lift, s.lift, s.lift};
  float Yl = dotW(c); c = vmax0(V3{Yl, Yl, Yl} + (c - V3{Yl, Yl, Yl}) * s.msat);
  if (s.hueOn) {
    float Y = 0.299f * c.r + 0.587f * c.g + 0.114f * c.b, I = 0.596f * c.r - 0.274f * c.g - 0.322f * c.b, Q = 0.211f * c.r - 0.523f * c.g + 0.312f * c.b;
    float I2 = s.cs * I - s.sn * Q, Q2 = s.sn * I + s.cs * Q;
    c = vmax0({Y + 0.956f * I2 + 0.621f * Q2, Y - 0.272f * I2 - 0.647f * Q2, Y - 1.106f * I2 + 1.703f * Q2});
  }
  { float Y2 = dotW(c), mx = std::max(c.r, std::max(c.g, c.b)), mn = std::min(c.r, std::min(c.g, c.b)), s0 = (mx - mn) / std::max(mx, 1e-4f);
    c = vmax0(V3{Y2, Y2, Y2} + (c - V3{Y2, Y2, Y2}) * (s.uSat * (1 + s.vib * (1 - s0)))); }
  V3 t = {lin2log(c.r), lin2log(c.g), lin2log(c.b)};
  t = mixv(t, V3{0.45f, 0.45f, 0.45f}, s.flatten - s.con);
  auto tone = [&](float v) { return v + s.hi * 0.12f * smoothstepf(0.45f, 0.85f, v) + s.sh * 0.12f * (1 - smoothstepf(0.15f, 0.5f, v)); };
  t = {tone(t.r), tone(t.g), tone(t.b)};
  if (!s.wpost) t = wheels(t, s);
  if (useGrain) {
    float y = std::clamp(0.3f * t.r + 0.5f * t.g + 0.2f * t.b, 0.f, 1.f), wgt = 0.55f + 1.6f * y * (1 - y) + shadowNoise * (1 - y) * 2;
    V3 g = mixv(V3{grainMono, grainMono, grainMono}, V3{grainVal3[0], grainVal3[1], grainVal3[2]}, chroma);
    t = t + g * (gAmp * wgt * 2);
  }
  V3 col = s.lut.sample(t);
  if (s.lutMix < 0.999f) col = mixv(s.lut0.sample(t), col, s.lutMix);
  if (s.in709) { const NeutralInverse& ni = neutralInverse(); col = {ni(col.r), ni(col.g), ni(col.b)}; }
  if (s.clipv > 0) col = {std::min(col.r * (1 + s.clipv), 1.f), std::min(col.g * (1 + s.clipv), 1.f), std::min(col.b * (1 + s.clipv), 1.f)};
  if (s.wh != 0 || s.bk != 0) { float Yd = std::clamp(dotW(col), 0.f, 1.f), add = s.wh * 0.22f * smoothstepf(0.55f, 1, Yd) + s.bk * 0.14f * (1 - smoothstepf(0, 0.38f, Yd)); col = clamp01(col + V3{add, add, add}); }
  col = clamp01(col + V3{s.bri * 0.2f, s.bri * 0.2f, s.bri * 0.2f}); col = {std::pow(col.r, 1 / s.gam), std::pow(col.g, 1 / s.gam), std::pow(col.b, 1 / s.gam)};
  if (s.wpost) col = clamp01(wheels(col, s));
  return col;
}
} // namespace

void pixelOnly(const float in[3], float out[3], const Params& p) {
  Setup s = makeSetup(p); V3 src = {in[0], in[1], in[2]};
  V3 inp = s.in709 ? applyMatch(src, s) : src;
  V3 lin = s.in709 ? V3{srgb2lin(inp.r), srgb2lin(inp.g), srgb2lin(inp.b)} : V3{log2lin(inp.r), log2lin(inp.g), log2lin(inp.b)};
  lin = vmax0(lin) * s.expK * s.wb;
  float g3[3] = {0, 0, 0}; V3 col = finish(lin, s, g3, false, 0, 0, 0, 0);
  if (s.in709) col = applySkinGuard(src, col, s);
  out[0] = col.r; out[1] = col.g; out[2] = col.b;
}

void render(const ImageView& src, const ImageView& dst, const Params& p, const RenderInfo& info) {
  const int W = src.width, H = src.height; if (W <= 0 || H <= 0) return;
  const Setup s = makeSetup(p); const MediumFx& M = *s.M; const LensFx& K = *s.K;
  const float sc = float((info.fullWidth > 0 ? info.fullWidth * info.renderScale : W) / 2048.0); // Lukuluku pixel sizes are at 2048 px
  const int T = info.threads;

  // decode (+ match) into linear light, keeping the original for Skin Guard
  Buf lin; lin.resize(W, H); Buf orig; if (s.skinGuard > 0 && s.in709) orig.resize(W, H);
  parallelRows(H, T, [&](int y) {
    const float* r = src.row(y);
    for (int x = 0; x < W; x++) {
      V3 c = {r[x * 4], r[x * 4 + 1], r[x * 4 + 2]};
      if (!orig.px.empty()) { float* o = orig.at(x, y); o[0] = c.r; o[1] = c.g; o[2] = c.b; }
      V3 inp = s.in709 ? applyMatch(clamp01(c), s) : c;
      V3 l = s.in709 ? V3{srgb2lin(inp.r), srgb2lin(inp.g), srgb2lin(inp.b)} : V3{log2lin(inp.r), log2lin(inp.g), log2lin(inp.b)};
      l = vmax0(l) * s.expK * s.wb; float* o = lin.at(x, y); o[0] = l.r; o[1] = l.g; o[2] = l.b;
    }
  });

  Buf soft; blur2(lin, soft, M.softX * sc, M.softY * sc, T);
  const float gs = std::max({M.sharpen > 0 ? 1.6f : 0.f, s.dfSoften > 0 ? 3.5f : 0.f, K.edge > 0 ? 5.f : 0.f, s.sharpU > 0 ? 1.4f : 0.f});
  Buf gb; bool haveG = gs > 0; if (haveG) blur2(lin, gb, gs * sc, gs * sc, T);
  Buf diff; bool haveDiff = s.dfK > 0; if (haveDiff) { Buf pre; prefilter(lin, pre, 4, s.dfThr, T); blur2(pre, diff, s.dfSigma * sc / 4, s.dfSigma * sc / 4, T); }
  const float kHal = M.hal * float(p[P_halK]); Buf hal; bool haveHal = M.hal > 0 && p[P_halK] > 0; if (haveHal) { Buf pre; prefilter(lin, pre, 2, 1.5f, T); blur2(pre, hal, M.halSigma * sc / 2, M.halSigma * sc / 2, T); }
  const float streak = p[P_streak] > 0.5 ? kStreakO4 : 0.f; Buf str; if (streak > 0) { Buf pre; prefilter(lin, pre, 4, 6.0f, T); blur2(pre, str, 140 * sc / 4, 0.6f, T); }

  const float gAmp = M.grain * float(p[P_grainK]), gSize = std::max(0.6f, M.gsize * sc), chroma = M.chroma, shadowNoise = M.shadowNoise;
  const float vig = std::min(1.f, (M.vig + K.vig) * float(p[P_vigK]));
  const double seed = p[P_grainAnim] > 0.5 ? std::fmod(info.frame * 17.31, 1000.0) : 0.0;
  const int ai = int(p[P_aspect]); const float fa = float(W) / float(H); const float ar = ai > 0 ? kAspect[std::min(ai, kAspectCount) - 1] : fa;
  const float hvx = ar < fa ? ar / (2 * fa) : 0.5f, hvy = ar < fa ? 0.5f : fa / (2 * ar);
  const float lines = M.lines, hres = M.hres;

  parallelRows(H, T, [&](int y) {
    float* drow = dst.row(y); const float* srow = src.row(y);
    for (int x = 0; x < W; x++) {
      const float uvx = (x + 0.5f) / W, uvy = (y + 0.5f) / H; float ux = uvx, uy = uvy;
      if (lines > 0) uy = (std::floor(uy * lines) + 0.5f) / lines;
      if (hres > 0) ux = (std::floor(ux * hres) + 0.5f) / hres;
      const float ox = (ux - 0.5f) * K.ca, oy = (uy - 0.5f) * K.ca;
      V3 c = {soft.sample(ux - ox, uy - oy).r, soft.sample(ux, uy).g, soft.sample(ux + ox, uy + oy).b};
      if (M.sharpen > 0 && haveG) { V3 l = lin.sample(ux, uy); c = vmax0(l + (l - gb.sample(ux, uy)) * M.sharpen); }
      if (s.sharpU > 0 && haveG) c = vmax0(c + (lin.sample(ux, uy) - gb.sample(ux, uy)) * (s.sharpU * 1.5f));
      if (s.dfSoften > 0 && haveG) c = mixv(c, gb.sample(ux, uy), s.dfSoften);
      if (K.edge > 0 && haveG) { float rr = std::hypot((uvx - 0.5f) * 2, uvy - 0.5f); c = mixv(c, gb.sample(ux, uy), K.edge * smoothstepf(0.45f, 1.15f, rr)); }
      if (M.vhs) { float Y = dotW(c); V3 acc = {0, 0, 0}; for (int i = -7; i <= 7; i++) acc = acc + soft.sample(ux + (i + 4) / float(W) * 1.6f, uy); acc = acc * (1 / 15.f); float aY = dotW(acc); c = V3{Y, Y, Y} + (acc - V3{aY, aY, aY}) * 1.15f; }
      if (haveDiff) c = vmax0(c + diff.sample(uvx, uvy) * s.dfK);
      if (haveHal) c = c + hal.sample(uvx, uvy) * V3{M.halTint[0], M.halTint[1], M.halTint[2]} * kHal;
      if (streak > 0) c = c + str.sample(uvx, uvy) * V3{0.35f, 0.6f, 1.f} * streak;
      float g3[3] = {0, 0, 0}, gm = 0; bool useGrain = gAmp > 0;
      if (useGrain) { double px = double(uvx) * W + seed, py = double(uvy) * H + seed;
        gm = grainAt(px, py, gSize); g3[0] = grainAt(px + 31, py + 7, gSize); g3[1] = grainAt(px - 13, py + 59, gSize); g3[2] = grainAt(px + 71, py - 23, gSize); }
      V3 col = finish(c, s, g3, useGrain, gAmp, chroma, shadowNoise, gm);
      if (M.vhs) { col = col * (0.9f + 0.1f * std::sin(uvy * 486.f * 3.14159f)); float n = hsh(double(uvx) * W + seed, double(uvy) * H + seed) - 0.5f; col = col + V3{n, n, n} * 0.035f; col = mixv(col, col * V3{1.02f, 0.98f, 1.04f}, 0.6f); }
      const float relx = (uvx - 0.5f) / hvx, rely = (uvy - 0.5f) / hvy; const float inside = (std::fabs(relx) <= 1 && std::fabs(rely) <= 1) ? 1.f : 0.f;
      if (vig > 0) { float vv = std::hypot(relx, rely * 0.8f), t = std::clamp((vv - 1.55f) / (0.35f - 1.55f), 0.f, 1.f), sm = t * t * (3 - 2 * t); col = col * (1 + (sm - 1) * vig); }
      if (M.gate) { float ax = std::fabs(relx), ay = std::fabs(rely), rx = 0.10f * hvy / hvx, ry = 0.10f;
        float kx = std::max(ax - (1 - rx), 0.f) / rx, ky = std::max(ay - (1 - ry), 0.f) / ry; col = col * (1 - smoothstepf(0.9f, 1, std::hypot(kx, ky))); }
      if (!orig.px.empty()) { const float* o = orig.at(x, y); col = applySkinGuard({o[0], o[1], o[2]}, col, s); }
      col = mixv(V3{0.035f, 0.035f, 0.035f}, col, inside);
      drow[x * 4] = col.r; drow[x * 4 + 1] = col.g; drow[x * 4 + 2] = col.b; drow[x * 4 + 3] = srow[x * 4 + 3];
    }
  });
}
} // namespace lukuluku

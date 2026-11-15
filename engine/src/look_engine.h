// Lukuluku Look Engine: CPU port of Lukuluku's WebGL pipeline (decode -> soft/blur passes -> diffusion,
// halation, streaks -> composite -> 3D LUT -> finishing), plus Match to Reference and Skin Guard.
// Host wrappers (OFX for Resolve, Adobe SDK for Premiere) convert their pixels to an RGBA float view.
#pragma once
#include <cstddef>
#include "params.h"

namespace lukuluku {

/** A view onto RGBA float pixels (0..1 display-referred, or LogC3 when the input is log). */
struct ImageView {
  float* data = nullptr;
  int width = 0, height = 0;
  std::ptrdiff_t rowStride = 0; // in floats (usually width * 4); may be negative for bottom-up images
  float* row(int y) const { return data + y * rowStride; }
};

struct RenderInfo {
  double frame = 0;        // for animated grain
  double renderScale = 1;  // host proxy / preview scale (1 = full resolution)
  int fullWidth = 0;       // width of the full frame at render scale 1 (pixel sizes are defined at 2048 px)
  int threads = 0;         // 0 = all cores
};

/** Renders src into dst (same size). src and dst may be the same buffer. */
void render(const ImageView& src, const ImageView& dst, const Params& p, const RenderInfo& info);

/** The per-pixel part only (no blur, grain, vignette): what a .cube LUT of this look contains. */
void pixelOnly(const float in[3], float out[3], const Params& p);

const char* versionString();
} // namespace lukuluku

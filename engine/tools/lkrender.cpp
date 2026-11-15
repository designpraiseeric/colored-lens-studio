// lkrender in.ppm out.ppm [param=value ...]   Renders a frame through the Look Engine (for tests and previews).
#include "look_engine.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <chrono>
using namespace lukuluku;
static bool readPPM(const char* path, int& w, int& h, std::vector<float>& px) {
  FILE* f = std::fopen(path, "rb"); if (!f) return false; char m[3] = {0}; int mx = 0;
  if (std::fscanf(f, "%2s %d %d %d", m, &w, &h, &mx) != 4 || std::strcmp(m, "P6") || mx != 255) { std::fclose(f); return false; }
  std::fgetc(f); std::vector<unsigned char> b(size_t(w) * h * 3); size_t got = std::fread(b.data(), 1, b.size(), f); std::fclose(f); if (got != b.size()) return false;
  px.resize(size_t(w) * h * 4); for (size_t i = 0; i < size_t(w) * h; i++) { for (int c = 0; c < 3; c++) px[i * 4 + c] = b[i * 3 + c] / 255.f; px[i * 4 + 3] = 1.f; }
  return true;
}
static void writePPM(const char* path, int w, int h, const std::vector<float>& px) {
  FILE* f = std::fopen(path, "wb"); std::fprintf(f, "P6\n%d %d\n255\n", w, h);
  for (size_t i = 0; i < size_t(w) * h; i++) for (int c = 0; c < 3; c++) { float v = px[i * 4 + c]; std::fputc(int(v < 0 ? 0 : v > 1 ? 255 : v * 255 + 0.5f), f); }
  std::fclose(f);
}
int main(int argc, char** argv) {
  if (argc < 3) { std::fprintf(stderr, "usage: lkrender in.ppm out.ppm [param=value ...]\nparams:"); for (auto& i : kParamInfo) std::fprintf(stderr, " %s", i.id); std::fprintf(stderr, "\n"); return 2; }
  int w, h; std::vector<float> px; if (!readPPM(argv[1], w, h, px)) { std::fprintf(stderr, "could not read %s (binary P6, 8-bit)\n", argv[1]); return 1; }
  Params p; RenderInfo info; info.fullWidth = w;
  for (int a = 3; a < argc; a++) { std::string s = argv[a]; auto eq = s.find('='); if (eq == std::string::npos) continue; std::string k = s.substr(0, eq); double v = std::atof(s.c_str() + eq + 1);
    if (k == "frame") { info.frame = v; continue; } bool ok = false; for (int i = 0; i < PARAM_COUNT; i++) if (k == kParamInfo[i].id) { p.v[i] = v; ok = true; } if (!ok) { std::fprintf(stderr, "unknown param %s\n", k.c_str()); return 2; } }
  std::vector<float> out(px.size()); ImageView src{px.data(), w, h, w * 4}, dst{out.data(), w, h, w * 4};
  auto t0 = std::chrono::steady_clock::now(); render(src, dst, p, info); auto ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  writePPM(argv[2], w, h, out); std::fprintf(stderr, "%dx%d rendered in %.0f ms (engine %s)\n", w, h, ms, versionString()); return 0;
}

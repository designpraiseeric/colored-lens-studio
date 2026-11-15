// lkpixel N [param=value ...]  Prints the per-pixel transform on an N^3 grid (for the JS/C++ parity test).
#include "look_engine.h"
#include <cstdio>
#include <cstdlib>
#include <string>
using namespace lukuluku;
int main(int argc, char** argv) {
  int N = argc > 1 ? std::atoi(argv[1]) : 9; Params p;
  for (int a = 2; a < argc; a++) { std::string s = argv[a]; auto eq = s.find('='); std::string k = s.substr(0, eq); for (int i = 0; i < PARAM_COUNT; i++) if (k == kParamInfo[i].id) p.v[i] = std::atof(s.c_str() + eq + 1); }
  for (int b = 0; b < N; b++) for (int g = 0; g < N; g++) for (int r = 0; r < N; r++) {
    float in[3] = {r / float(N - 1), g / float(N - 1), b / float(N - 1)}, out[3]; pixelOnly(in, out, p); std::printf("%.6f %.6f %.6f\n", out[0], out[1], out[2]); }
  return 0;
}

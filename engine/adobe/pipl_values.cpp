// Built and run on the build machine: prints the numeric flag and version values the PiPL resource needs.
#include "AEConfig.h"
#include "AE_Effect.h"
#include "lk_flags.h"
#include <cstdio>
int main() {
  std::printf("#define LK_PIPL_OUTFLAGS %d\n#define LK_PIPL_OUTFLAGS2 %d\n#define LK_PIPL_VERSION %d\n",
              int(LK_OUT_FLAGS), int(LK_OUT_FLAGS2), int(PF_VERSION(LK_VMAJOR, LK_VMINOR, LK_VBUG, PF_Stage_RELEASE, LK_VBUILD)));
  return 0;
}

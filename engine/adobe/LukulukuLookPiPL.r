// Plug-in property list for Premiere Pro / After Effects. The numbers come from lk_pipl_values.h,
// generated at build time from lk_flags.h (see engine/CMakeLists.txt).
#include "AEConfig.h"
#include "AE_EffectVers.h"
#include "lk_pipl_values.h"
#ifndef AE_OS_WIN
  #include <AE_General.r>
#endif

resource 'PiPL' (16000) {
  {
    Kind { AEEffect },
    Name { "Lukuluku Look" },
    Category { "DesignPraise" },
#ifdef AE_OS_WIN
  #if defined(AE_PROC_INTELx64)
    CodeWin64X86 { "EffectMain" },
  #elif defined(AE_PROC_ARM64)
    CodeWinARM64 { "EffectMain" },
  #endif
#elif defined(AE_OS_MAC)
    CodeMacIntel64 { "EffectMain" },
    CodeMacARM64 { "EffectMain" },
#endif
    AE_PiPL_Version { 2, 0 },
    AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
    AE_Effect_Version { LK_PIPL_VERSION },
    AE_Effect_Info_Flags { 0 },
    AE_Effect_Global_OutFlags { LK_PIPL_OUTFLAGS },
    AE_Effect_Global_OutFlags_2 { LK_PIPL_OUTFLAGS2 },
    AE_Effect_Match_Name { "DesignPraise Lukuluku Look" },
    AE_Reserved_Info { 0 },
    AE_Effect_Support_URL { "https://github.com/designpraiseeric/colored-lens-studio" }
  }
};

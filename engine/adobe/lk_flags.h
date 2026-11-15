// One definition of the Adobe flags, used by the plugin at PF_Cmd_GLOBAL_SETUP and printed into the PiPL
// by pipl_values.cpp at build time, so the two can never disagree.
#pragma once
#define LK_OUT_FLAGS  (PF_OutFlag_DEEP_COLOR_AWARE | PF_OutFlag_NON_PARAM_VARY)
#define LK_OUT_FLAGS2 (PF_OutFlag2_SUPPORTS_THREADED_RENDERING)
#ifndef LK_VMAJOR
#define LK_VMAJOR 0
#endif
#ifndef LK_VMINOR
#define LK_VMINOR 1
#endif
#define LK_VBUG 0
#define LK_VBUILD 1
#define LK_MATCH_NAME "DesignPraise Lukuluku Look"

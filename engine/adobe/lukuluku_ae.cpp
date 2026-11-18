// Lukuluku Look as an Adobe effect plug-in: Premiere Pro (8-bit and 32-bit float BGRA) and After Effects (8/16-bit).
// Match name "DesignPraise Lukuluku Look" is what the Colored Lens panel uses to add the effect to clips.
// All maths is in look_engine.cpp; this file only moves pixels and parameters.
#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_EffectCBSuites.h"
#include "AE_EffectSuites.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AEFX_SuiteHelper.h"
#include "AE_EffectPixelFormat.h"
#include "PrSDKAESupport.h" // PF_PixelFormatSuite1 + Premiere pixel formats (as in the SDK's SDK_Noise sample)
#define LK_HAVE_PR_FORMATS 1

#include "look_engine.h"
#include "generated/catalog.h"
#include "lk_flags.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace lukuluku;

namespace {
// Adobe parameter index of each engine parameter (index 0 is the input layer; topics take indices too).
int gIndex[PARAM_COUNT];
std::string gPopup[PARAM_COUNT];
const int kTopicIdBase = 1000; // disk IDs: params use 1 + ParamId, topic starts/ends use 1000 + 2*group (+1)

std::string popupString(const char* id) {
  std::string s; auto add = [&](const char* const* n, int c) { for (int i = 0; i < c; i++) { if (!s.empty()) s += '|'; s += n[i]; } };
  if (!std::strcmp(id, "input")) s = "Rec.709 (normal video, phones)|ARRI LogC3 (log footage)";
  else if (!std::strcmp(id, "lens")) add(kLensNames, kLensCount);
  else if (!std::strcmp(id, "diffusion")) add(kDiffNames, kDiffCount);
  else if (!std::strcmp(id, "color")) add(kColorNames, kColorCount);
  else if (!std::strcmp(id, "medium")) add(kMediumNames, kMediumCount);
  else if (!std::strcmp(id, "aspect")) { s = "None (keep the frame)"; for (int i = 0; i < kAspectCount; i++) { s += '|'; s += kAspectNames[i]; } }
  for (auto& c : s) if (c == '(' || c == ')') c = c == '(' ? '[' : ']'; // AE popups treat "(" as a disabled item
  return s;
}
int popupCount(const std::string& s) { int n = 1; for (char c : s) if (c == '|') n++; return n; }

PF_Err About(PF_InData* in_data, PF_OutData* out_data) {
  std::snprintf(out_data->return_msg, sizeof(out_data->return_msg),
                "Lukuluku Look %s\rColored Lens Studio by DesignPraise Studio.\rFilm looks with Skin Guard and Match to Reference.", versionString());
  return PF_Err_NONE;
}

// Parameter indices are a pure function of the table, so they are computed once at load, not in PARAMS_SETUP.
void computeIndices() {
  int index = 1; std::string lastGroup; bool first = true;
  for (int i = 0; i < PARAM_COUNT; i++) {
    if (lastGroup != kParamInfo[i].group) { if (!first) index++; /* topic end */ index++; /* topic start */ lastGroup = kParamInfo[i].group; first = false; }
    gIndex[i] = index++;
  }
}

PF_Err GlobalSetup(PF_InData* in_data, PF_OutData* out_data) {
  computeIndices();
  out_data->my_version = PF_VERSION(LK_VMAJOR, LK_VMINOR, LK_VBUG, PF_Stage_RELEASE, LK_VBUILD);
  out_data->out_flags = LK_OUT_FLAGS;
  out_data->out_flags2 = LK_OUT_FLAGS2;
#ifdef LK_HAVE_PR_FORMATS
  if (in_data->appl_id == kAppID_Premiere) { // Premiere Pro: ask for 32-bit float BGRA (best quality) and 8-bit BGRA
    AEFX_SuiteScoper<PF_PixelFormatSuite1> pfs(in_data, kPFPixelFormatSuite, kPFPixelFormatSuiteVersion1, out_data);
    (*pfs->ClearSupportedPixelFormats)(in_data->effect_ref);
    (*pfs->AddSupportedPixelFormat)(in_data->effect_ref, PrPixelFormat_BGRA_4444_32f);
    (*pfs->AddSupportedPixelFormat)(in_data->effect_ref, PrPixelFormat_BGRA_4444_8u);
  }
#endif
  return PF_Err_NONE;
}

PF_Err ParamsSetup(PF_InData* in_data, PF_OutData* out_data) {
  PF_Err err = PF_Err_NONE;
  PF_ParamDef def;
  int index = 1, group = -1; std::string lastGroup;
  // PF_END_TOPIC hides a `return err` on failure, so this helper returns PF_Err like Adobe's macros expect
  auto endTopic = [&]() -> PF_Err { if (group >= 0) { AEFX_CLR_STRUCT(def); PF_END_TOPIC(kTopicIdBase + 2 * group + 1); index++; } return PF_Err_NONE; };
  for (int i = 0; i < PARAM_COUNT && !err; i++) {
    const ParamInfo& pi = kParamInfo[i];
    if (lastGroup != pi.group) {
      if ((err = endTopic())) return err;
      lastGroup = pi.group; group++;
      AEFX_CLR_STRUCT(def);
      const bool open = lastGroup == "Look" || lastGroup == "Skin Guard" || lastGroup == "Lift the face";
      PF_ADD_TOPICX(pi.group, open ? 0 : PF_ParamFlag_START_COLLAPSED, kTopicIdBase + 2 * group);
      index++;
    }
    AEFX_CLR_STRUCT(def);
    const int id = 1 + i;
    if (pi.kind == 'F') {
      PF_ADD_FLOAT_SLIDERX(pi.label, pi.min, pi.max, pi.min, pi.max, pi.def, PF_Precision_HUNDREDTHS, 0, 0, id);
    } else if (pi.kind == 'P') {
      gPopup[i] = popupString(pi.id);
      PF_ADD_POPUP(pi.label, popupCount(gPopup[i]), int(pi.def) + 1, gPopup[i].c_str(), id);
    } else {
      PF_ADD_CHECKBOXX(pi.label, pi.def > 0.5, 0, id);
    }
    if (gIndex[i] != index) return PF_Err_INTERNAL_STRUCT_DAMAGED; // computeIndices() and the layout disagree
    index++;
  }
  if ((err = endTopic())) return err;
  out_data->num_params = index;
  return err;
}

enum class Fmt { AE8, AE16, PR8, PR32 };

PF_Err Render(PF_InData* in_data, PF_OutData* out_data, PF_ParamDef* params[], PF_LayerDef* output) {
  PF_Err err = PF_Err_NONE;
  PF_EffectWorld* input = &params[0]->u.ld;
  Params p;
  for (int i = 0; i < PARAM_COUNT; i++) {
    const PF_ParamDef* d = params[gIndex[i]];
    const char k = kParamInfo[i].kind;
    p.v[i] = k == 'F' ? d->u.fs_d.value : k == 'P' ? double(d->u.pd.value - 1) : (d->u.bd.value ? 1.0 : 0.0);
  }

  Fmt fmt = PF_WORLD_IS_DEEP(output) ? Fmt::AE16 : Fmt::AE8;
#ifdef LK_HAVE_PR_FORMATS
  if (in_data->appl_id == kAppID_Premiere) {
    // Premiere: frames are BGRA, and the format is read through the Pixel Format suite (as in Adobe's SDK_Noise
    // sample). PF_WorldSuite2 is the After Effects path; in Premiere it misreports or fails, which rendered black.
    PrPixelFormat pf = PrPixelFormat_BGRA_4444_8u;
    try {
      AEFX_SuiteScoper<PF_PixelFormatSuite1> pfs(in_data, kPFPixelFormatSuite, kPFPixelFormatSuiteVersion1, out_data);
      pfs->GetPixelFormat(output, &pf);
    } catch (...) { pf = PrPixelFormat_BGRA_4444_8u; }
    if (pf == PrPixelFormat_BGRA_4444_32f) fmt = Fmt::PR32;
    else if (pf == PrPixelFormat_BGRA_4444_8u) fmt = Fmt::PR8;
    else return PF_COPY(&params[0]->u.ld, output, NULL, NULL); // a format we did not ask for: pass the frame through untouched
  }
#endif

  const int W = std::min(input->width, output->width), H = std::min(input->height, output->height);
  if (W <= 0 || H <= 0) return PF_Err_NONE;
  std::vector<float> buf(size_t(W) * H * 4);
  for (int y = 0; y < H; y++) {
    const char* row = reinterpret_cast<const char*>(input->data) + size_t(y) * input->rowbytes;
    float* o = &buf[size_t(y) * W * 4];
    for (int x = 0; x < W; x++, o += 4) {
      switch (fmt) {
        case Fmt::AE8: { const PF_Pixel* s = reinterpret_cast<const PF_Pixel*>(row) + x; o[0] = s->red / 255.f; o[1] = s->green / 255.f; o[2] = s->blue / 255.f; o[3] = s->alpha / 255.f; break; }
        case Fmt::AE16: { const PF_Pixel16* s = reinterpret_cast<const PF_Pixel16*>(row) + x; const float k = 1.f / PF_MAX_CHAN16; o[0] = s->red * k; o[1] = s->green * k; o[2] = s->blue * k; o[3] = s->alpha * k; break; }
        case Fmt::PR8: { const unsigned char* s = reinterpret_cast<const unsigned char*>(row) + x * 4; o[0] = s[2] / 255.f; o[1] = s[1] / 255.f; o[2] = s[0] / 255.f; o[3] = s[3] / 255.f; break; }
        case Fmt::PR32: { const float* s = reinterpret_cast<const float*>(row) + x * 4; o[0] = s[2]; o[1] = s[1]; o[2] = s[0]; o[3] = s[3]; break; }
      }
    }
  }

  RenderInfo info;
  info.frame = in_data->time_step ? double(in_data->current_time) / double(in_data->time_step) : 0.0;
  info.fullWidth = W;
  ImageView view{buf.data(), W, H, std::ptrdiff_t(W) * 4};
  lukuluku::render(view, view, p, info);

  for (int y = 0; y < H; y++) {
    char* row = reinterpret_cast<char*>(output->data) + size_t(y) * output->rowbytes;
    const float* s = &buf[size_t(y) * W * 4];
    auto q = [](float v, float mx) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * mx + 0.5f; };
    for (int x = 0; x < W; x++, s += 4) {
      switch (fmt) {
        case Fmt::AE8: { PF_Pixel* d = reinterpret_cast<PF_Pixel*>(row) + x; d->red = (A_u_char)q(s[0], 255); d->green = (A_u_char)q(s[1], 255); d->blue = (A_u_char)q(s[2], 255); d->alpha = (A_u_char)q(s[3], 255); break; }
        case Fmt::AE16: { PF_Pixel16* d = reinterpret_cast<PF_Pixel16*>(row) + x; d->red = (A_u_short)q(s[0], PF_MAX_CHAN16); d->green = (A_u_short)q(s[1], PF_MAX_CHAN16); d->blue = (A_u_short)q(s[2], PF_MAX_CHAN16); d->alpha = (A_u_short)q(s[3], PF_MAX_CHAN16); break; }
        case Fmt::PR8: { unsigned char* d = reinterpret_cast<unsigned char*>(row) + x * 4; d[2] = (unsigned char)q(s[0], 255); d[1] = (unsigned char)q(s[1], 255); d[0] = (unsigned char)q(s[2], 255); d[3] = (unsigned char)q(s[3], 255); break; }
        case Fmt::PR32: { float* d = reinterpret_cast<float*>(row) + x * 4; d[2] = s[0]; d[1] = s[1]; d[0] = s[2]; d[3] = s[3]; break; }
      }
    }
  }
  return err;
}
} // namespace

extern "C" DllExport PF_Err PluginDataEntryFunction2(PF_PluginDataPtr inPtr, PF_PluginDataCB2 inPluginDataCallBackPtr, SPBasicSuite* inSPBasicSuitePtr,
                                                     const char* inHostName, const char* inHostVersion) {
  PF_Err result = PF_Err_INVALID_CALLBACK; // PF_REGISTER_EFFECT_EXT2 is a statement that sets `result`
  PF_REGISTER_EFFECT_EXT2(inPtr, inPluginDataCallBackPtr, "Lukuluku Look", LK_MATCH_NAME, "DesignPraise", AE_RESERVED_INFO, "EffectMain",
                                   "https://github.com/designpraiseeric/colored-lens-studio");
  return result;
}

extern "C" DllExport PF_Err EffectMain(PF_Cmd cmd, PF_InData* in_data, PF_OutData* out_data, PF_ParamDef* params[], PF_LayerDef* output, void* extra) {
  PF_Err err = PF_Err_NONE;
  try {
    switch (cmd) {
      case PF_Cmd_ABOUT: err = About(in_data, out_data); break;
      case PF_Cmd_GLOBAL_SETUP: err = GlobalSetup(in_data, out_data); break;
      case PF_Cmd_PARAMS_SETUP: err = ParamsSetup(in_data, out_data); break;
      case PF_Cmd_RENDER: err = Render(in_data, out_data, params, output); break;
      default: break;
    }
  } catch (PF_Err& thrown) {
    err = thrown;
  } catch (...) {
    err = PF_Err_INTERNAL_STRUCT_DAMAGED;
  }
  return err;
}

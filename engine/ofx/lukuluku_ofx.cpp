// Lukuluku Look as an OpenFX plugin, for DaVinci Resolve (free and Studio) and other OFX hosts.
// Shows up in Resolve's OpenFX library under "DesignPraise". All maths is in look_engine.cpp.
#include "ofxsImageEffect.h"
#include "ofxsMultiThread.h"
#include "look_engine.h"
#include "generated/catalog.h"
#include <cstring>
#include <memory>
#include <string>
#include <vector>

using namespace lukuluku;

static const char* const kPluginId = "com.designpraise.lukuluku.look";

// 8- and 16-bit hosts are converted to float and back; Resolve always hands over float.
static void readRow(const void* p, float* out, int n, OFX::BitDepthEnum depth) {
  if (depth == OFX::eBitDepthFloat) { std::memcpy(out, p, sizeof(float) * 4 * n); return; }
  if (depth == OFX::eBitDepthUShort) { const unsigned short* s = static_cast<const unsigned short*>(p); for (int i = 0; i < n * 4; i++) out[i] = s[i] / 65535.f; return; }
  const unsigned char* s = static_cast<const unsigned char*>(p); for (int i = 0; i < n * 4; i++) out[i] = s[i] / 255.f;
}
static void writeRow(const float* in, void* p, int offsetPx, int n, OFX::BitDepthEnum depth) {
  auto q = [](float v, float mx) { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * mx + 0.5f; };
  if (depth == OFX::eBitDepthFloat) { std::memcpy(static_cast<float*>(p) + offsetPx * 4, in, sizeof(float) * 4 * n); return; }
  if (depth == OFX::eBitDepthUShort) { unsigned short* d = static_cast<unsigned short*>(p) + offsetPx * 4; for (int i = 0; i < n * 4; i++) d[i] = (unsigned short)q(in[i], 65535.f); return; }
  unsigned char* d = static_cast<unsigned char*>(p) + offsetPx * 4; for (int i = 0; i < n * 4; i++) d[i] = (unsigned char)q(in[i], 255.f);
}

class LookPlugin : public OFX::ImageEffect {
 public:
  explicit LookPlugin(OfxImageEffectHandle h) : OFX::ImageEffect(h) {
    dst_ = fetchClip(kOfxImageEffectOutputClipName);
    src_ = fetchClip(kOfxImageEffectSimpleSourceClipName);
    for (int i = 0; i < PARAM_COUNT; i++) {
      const ParamInfo& pi = kParamInfo[i];
      if (pi.kind == 'F') d_[i] = fetchDoubleParam(pi.id);
      else if (pi.kind == 'P') c_[i] = fetchChoiceParam(pi.id);
      else b_[i] = fetchBooleanParam(pi.id);
    }
  }

  void render(const OFX::RenderArguments& args) override {
    std::unique_ptr<OFX::Image> dst(dst_->fetchImage(args.time));
    std::unique_ptr<const OFX::Image> src(src_->fetchImage(args.time));
    if (!dst || !src) OFX::throwSuiteStatusException(kOfxStatFailed);
    if (src->getPixelComponents() != OFX::ePixelComponentRGBA || dst->getPixelComponents() != OFX::ePixelComponentRGBA ||
        src->getPixelDepth() != dst->getPixelDepth())
      OFX::throwSuiteStatusException(kOfxStatErrImageFormat);
    const OFX::BitDepthEnum depth = src->getPixelDepth();

    Params p;
    for (int i = 0; i < PARAM_COUNT; i++) {
      if (d_[i]) p.v[i] = d_[i]->getValueAtTime(args.time);
      else if (c_[i]) { int v = 0; c_[i]->getValueAtTime(args.time, v); p.v[i] = v; }
      else if (b_[i]) p.v[i] = b_[i]->getValueAtTime(args.time) ? 1 : 0;
    }

    // Copy the whole source into a tight buffer (the engine needs the full frame for its blurs).
    const OfxRectI sb = src->getBounds();
    const int W = sb.x2 - sb.x1, H = sb.y2 - sb.y1;
    if (W <= 0 || H <= 0) return;
    std::vector<float> in(size_t(W) * H * 4), out(size_t(W) * H * 4);
    for (int y = 0; y < H; y++) {
      // OFX rows run bottom-up; the engine wants row 0 at the top
      readRow(src->getPixelAddress(sb.x1, sb.y1 + y), &in[size_t(H - 1 - y) * W * 4], W, depth);
    }
    RenderInfo info;
    info.frame = args.time;
    info.fullWidth = W;
    info.renderScale = 1.0; // W is already at render scale
    lukuluku::render(ImageView{in.data(), W, H, W * 4}, ImageView{out.data(), W, H, W * 4}, p, info);

    const OfxRectI rw = args.renderWindow;
    for (int y = rw.y1; y < rw.y2; y++) {
      void* d = dst->getPixelAddress(rw.x1, y);
      if (!d) continue;
      const int sy = H - 1 - (y - sb.y1);
      if (sy < 0 || sy >= H) continue;
      const int x0 = std::max(rw.x1, sb.x1), x1 = std::min(rw.x2, sb.x2);
      if (x1 > x0) writeRow(&out[(size_t(sy) * W + (x0 - sb.x1)) * 4], d, x0 - rw.x1, x1 - x0, depth);
    }
  }

  bool isIdentity(const OFX::IsIdentityArguments&, OFX::Clip*&, double&) override { return false; }

 private:
  OFX::Clip* dst_ = nullptr;
  OFX::Clip* src_ = nullptr;
  OFX::DoubleParam* d_[PARAM_COUNT] = {};
  OFX::ChoiceParam* c_[PARAM_COUNT] = {};
  OFX::BooleanParam* b_[PARAM_COUNT] = {};
};

mDeclarePluginFactory(LookFactory, {}, {});

void LookFactory::describe(OFX::ImageEffectDescriptor& desc) {
  desc.setLabels("Lukuluku Look", "Lukuluku Look", "Lukuluku Look (Colored Lens Studio)");
  desc.setPluginGrouping("DesignPraise");
  desc.setPluginDescription("Lukuluku film looks with Skin Guard and Match to Reference. By DesignPraise Studio.");
  desc.addSupportedContext(OFX::eContextFilter);
  desc.addSupportedContext(OFX::eContextGeneral);
  desc.addSupportedBitDepth(OFX::eBitDepthFloat);
  desc.addSupportedBitDepth(OFX::eBitDepthUShort);
  desc.addSupportedBitDepth(OFX::eBitDepthUByte);
  desc.setSingleInstance(false);
  desc.setHostFrameThreading(false);
  desc.setSupportsMultiResolution(false);
  desc.setSupportsTiles(false);
  desc.setTemporalClipAccess(false);
  desc.setRenderTwiceAlways(false);
  desc.setSupportsMultipleClipPARs(false);
  desc.setRenderThreadSafety(OFX::eRenderFullySafe);
}

static std::vector<std::string> choicesFor(const char* id) {
  std::vector<std::string> o;
  auto add = [&](const char* const* names, int n) { for (int i = 0; i < n; i++) o.push_back(names[i]); };
  if (!std::strcmp(id, "input")) { o = {"Rec.709 (normal video, phones)", "ARRI LogC3 (log footage)"}; }
  else if (!std::strcmp(id, "lens")) add(kLensNames, kLensCount);
  else if (!std::strcmp(id, "diffusion")) add(kDiffNames, kDiffCount);
  else if (!std::strcmp(id, "color")) add(kColorNames, kColorCount);
  else if (!std::strcmp(id, "medium")) add(kMediumNames, kMediumCount);
  else if (!std::strcmp(id, "aspect")) { o.push_back("None (keep the frame)"); add(kAspectNames, kAspectCount); }
  return o;
}

void LookFactory::describeInContext(OFX::ImageEffectDescriptor& desc, OFX::ContextEnum) {
  OFX::ClipDescriptor* src = desc.defineClip(kOfxImageEffectSimpleSourceClipName);
  src->addSupportedComponent(OFX::ePixelComponentRGBA);
  src->setTemporalClipAccess(false);
  src->setSupportsTiles(false);
  src->setIsMask(false);
  OFX::ClipDescriptor* dst = desc.defineClip(kOfxImageEffectOutputClipName);
  dst->addSupportedComponent(OFX::ePixelComponentRGBA);
  dst->setSupportsTiles(false);

  OFX::PageParamDescriptor* page = desc.definePageParam("Controls");
  std::string lastGroup; OFX::GroupParamDescriptor* group = nullptr;
  for (int i = 0; i < PARAM_COUNT; i++) {
    const ParamInfo& pi = kParamInfo[i];
    if (lastGroup != pi.group) {
      lastGroup = pi.group;
      std::string gid = "grp_" + lastGroup; for (auto& ch : gid) if (ch == ' ') ch = '_';
      group = desc.defineGroupParam(gid);
      group->setLabel(pi.group);
      group->setOpen(lastGroup == "Look" || lastGroup == "Skin Guard" || lastGroup == "Lift the face");
      page->addChild(*group);
    }
    if (pi.kind == 'F') {
      OFX::DoubleParamDescriptor* d = desc.defineDoubleParam(pi.id);
      d->setLabel(pi.label); d->setDefault(pi.def); d->setRange(pi.min, pi.max); d->setDisplayRange(pi.min, pi.max);
      d->setIncrement((pi.max - pi.min) / 200.0); d->setDigits(3); d->setParent(*group); page->addChild(*d);
    } else if (pi.kind == 'P') {
      OFX::ChoiceParamDescriptor* c = desc.defineChoiceParam(pi.id);
      c->setLabel(pi.label); for (auto& s : choicesFor(pi.id)) c->appendOption(s); c->setDefault(int(pi.def)); c->setParent(*group); page->addChild(*c);
    } else {
      OFX::BooleanParamDescriptor* b = desc.defineBooleanParam(pi.id);
      b->setLabel(pi.label); b->setDefault(pi.def > 0.5); b->setParent(*group); page->addChild(*b);
    }
  }
}

OFX::ImageEffect* LookFactory::createInstance(OfxImageEffectHandle handle, OFX::ContextEnum) { return new LookPlugin(handle); }

namespace OFX { namespace Plugin {
void getPluginIDs(OFX::PluginFactoryArray& ids) {
  static LookFactory p(kPluginId, LK_OFX_VMAJOR, LK_OFX_VMINOR);
  ids.push_back(&p);
}
} }

// The Look Engine's parameters: one table that drives the OFX (Resolve) and Adobe (Premiere) versions.
// RULE: never reorder or delete rows. Adobe saves parameters by index, so only ever APPEND new rows
// at the end (before PARAM_COUNT), or projects made with an older version will load the wrong values.
#pragma once

// X(id, kind, label, min, max, default, group)
// kind: F = slider, P = popup (choices from the catalog), B = checkbox
#define LUKULUKU_PARAMS(X) \
  X(input,      P, "Footage is",          0, 1,    0,    "Look") \
  X(lens,       P, "Lens character",      0, 2,    0,    "Look") \
  X(diffusion,  P, "Diffusion",           0, 4,    0,    "Look") \
  X(color,      P, "Colour science",      0, 16,   0,    "Look") \
  X(medium,     P, "Film / video medium", 0, 10,   0,    "Look") \
  X(aspect,     P, "Aspect matte",        0, 11,   0,    "Look") \
  X(streak,     B, "Anamorphic streaks",  0, 1,    0,    "Look") \
  X(lutMix,     F, "Colour look strength",0, 1,    1,    "Strength") \
  X(grainK,     F, "Grain",               0, 2,    1,    "Strength") \
  X(halK,       F, "Halation",            0, 2,    1,    "Strength") \
  X(diffK,      F, "Diffusion glow",      0, 2,    1,    "Strength") \
  X(vigK,       F, "Vignette",            0, 2,    1,    "Strength") \
  X(grainAnim,  B, "Animate grain",       0, 1,    1,    "Strength") \
  X(exp,        F, "Exposure",           -3, 3,    0,    "Grade") \
  X(con,        F, "Contrast",          0.5, 1.6,  1,    "Grade") \
  X(pivot,      F, "Pivot",             0.2, 0.75, 0.45, "Grade") \
  X(bri,        F, "Brightness",       -0.5, 0.5,  0,    "Grade") \
  X(gam,        F, "Gamma",             0.5, 2,    1,    "Grade") \
  X(hi,         F, "Highlights",         -1, 1,    0,    "Grade") \
  X(sh,         F, "Shadows",            -1, 1,    0,    "Grade") \
  X(wh,         F, "Whites",             -1, 1,    0,    "Grade") \
  X(bk,         F, "Blacks",             -1, 1,    0,    "Grade") \
  X(temp,       F, "Temperature",        -1, 1,    0,    "Grade") \
  X(tint,       F, "Tint",               -1, 1,    0,    "Grade") \
  X(sat,        F, "Saturation",          0, 2,    1,    "Grade") \
  X(vib,        F, "Colour boost",       -1, 1,    0,    "Grade") \
  X(hue,        F, "Hue",              -180, 180,  0,    "Grade") \
  X(sharp,      F, "Sharpness",           0, 2,    0,    "Grade") \
  X(skinGuard,  F, "Skin Guard",          0, 1,    0,    "Skin Guard") \
  X(skinHue,    F, "Protect skin hue",    0, 1,    0.8,  "Skin Guard") \
  X(skinDensity,F, "Protect skin density",0, 1,    0.7,  "Skin Guard") \
  X(skinLight,  F, "Protect skin light",  0, 1,    0.5,  "Skin Guard") \
  X(matchAmt,   F, "Match amount",        0, 1,    0,    "Match to Reference") \
  X(mLg,        F, "Match contrast",    0.6, 1.6,  1,    "Match to Reference") \
  X(mLo,        F, "Match brightness", -0.3, 0.3,  0,    "Match to Reference") \
  X(mA,         F, "Match green-magenta",-0.08,0.08,0,   "Match to Reference") \
  X(mB,         F, "Match blue-yellow", -0.08, 0.08, 0,    "Match to Reference") \
  X(mCg,        F, "Match saturation",  0.4, 2,    1,    "Match to Reference") \
  X(wpost,      B, "Wheels after the look",0, 1,   0,    "Wheels") \
  X(lowR,       F, "Low range",        0.15, 0.5,  0.33, "Wheels") \
  X(highR,      F, "High range",       0.45, 0.85, 0.62, "Wheels") \
  X(liftX, F, "Lift X", -1, 1, 0, "Wheels") X(liftY, F, "Lift Y", -1, 1, 0, "Wheels") X(liftL, F, "Lift level", -1, 1, 0, "Wheels") X(liftS, F, "Lift sat", 0, 2, 1, "Wheels") \
  X(gammaX, F, "Gamma X", -1, 1, 0, "Wheels") X(gammaY, F, "Gamma Y", -1, 1, 0, "Wheels") X(gammaL, F, "Gamma level", -1, 1, 0, "Wheels") X(gammaS, F, "Gamma sat", 0, 2, 1, "Wheels") \
  X(gainX, F, "Gain X", -1, 1, 0, "Wheels") X(gainY, F, "Gain Y", -1, 1, 0, "Wheels") X(gainL, F, "Gain level", -1, 1, 0, "Wheels") X(gainS, F, "Gain sat", 0, 2, 1, "Wheels") \
  X(offX, F, "Offset X", -1, 1, 0, "Wheels") X(offY, F, "Offset Y", -1, 1, 0, "Wheels") X(offL, F, "Offset level", -1, 1, 0, "Wheels") X(offS, F, "Offset sat", 0, 2, 1, "Wheels") \
  X(shX, F, "Log shadow X", -1, 1, 0, "Wheels") X(shY, F, "Log shadow Y", -1, 1, 0, "Wheels") X(shL, F, "Log shadow level", -1, 1, 0, "Wheels") X(shS, F, "Log shadow sat", 0, 2, 1, "Wheels") \
  X(midX, F, "Log mid X", -1, 1, 0, "Wheels") X(midY, F, "Log mid Y", -1, 1, 0, "Wheels") X(midL, F, "Log mid level", -1, 1, 0, "Wheels") X(midS, F, "Log mid sat", 0, 2, 1, "Wheels") \
  X(hiX, F, "Log high X", -1, 1, 0, "Wheels") X(hiY, F, "Log high Y", -1, 1, 0, "Wheels") X(hiL, F, "Log high level", -1, 1, 0, "Wheels") X(hiS, F, "Log high sat", 0, 2, 1, "Wheels") \
  X(bypass,     B, "Bypass (show the original)", 0, 1, 0, "Advanced") \
  X(z1Amt, F, "Zone 1 amount", 0, 1, 0, "Colour zones") X(z1Hue, F, "Zone 1 pick hue", 0, 360, 0, "Colour zones") X(z1Wid, F, "Zone 1 hue width", 5, 120, 25, "Colour zones") X(z1Cmin, F, "Zone 1 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z1Cmax, F, "Zone 1 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z1Lmin, F, "Zone 1 darkest", 0, 1, 0, "Colour zones") X(z1Lmax, F, "Zone 1 brightest", 0, 1, 1, "Colour zones") X(z1ToHue, F, "Zone 1 new hue", 0, 360, 0, "Colour zones") X(z1ToC, F, "Zone 1 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z1dL, F, "Zone 1 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z2Amt, F, "Zone 2 amount", 0, 1, 0, "Colour zones") X(z2Hue, F, "Zone 2 pick hue", 0, 360, 0, "Colour zones") X(z2Wid, F, "Zone 2 hue width", 5, 120, 25, "Colour zones") X(z2Cmin, F, "Zone 2 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z2Cmax, F, "Zone 2 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z2Lmin, F, "Zone 2 darkest", 0, 1, 0, "Colour zones") X(z2Lmax, F, "Zone 2 brightest", 0, 1, 1, "Colour zones") X(z2ToHue, F, "Zone 2 new hue", 0, 360, 0, "Colour zones") X(z2ToC, F, "Zone 2 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z2dL, F, "Zone 2 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z3Amt, F, "Zone 3 amount", 0, 1, 0, "Colour zones") X(z3Hue, F, "Zone 3 pick hue", 0, 360, 0, "Colour zones") X(z3Wid, F, "Zone 3 hue width", 5, 120, 25, "Colour zones") X(z3Cmin, F, "Zone 3 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z3Cmax, F, "Zone 3 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z3Lmin, F, "Zone 3 darkest", 0, 1, 0, "Colour zones") X(z3Lmax, F, "Zone 3 brightest", 0, 1, 1, "Colour zones") X(z3ToHue, F, "Zone 3 new hue", 0, 360, 0, "Colour zones") X(z3ToC, F, "Zone 3 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z3dL, F, "Zone 3 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z4Amt, F, "Zone 4 amount", 0, 1, 0, "Colour zones") X(z4Hue, F, "Zone 4 pick hue", 0, 360, 0, "Colour zones") X(z4Wid, F, "Zone 4 hue width", 5, 120, 25, "Colour zones") X(z4Cmin, F, "Zone 4 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z4Cmax, F, "Zone 4 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z4Lmin, F, "Zone 4 darkest", 0, 1, 0, "Colour zones") X(z4Lmax, F, "Zone 4 brightest", 0, 1, 1, "Colour zones") X(z4ToHue, F, "Zone 4 new hue", 0, 360, 0, "Colour zones") X(z4ToC, F, "Zone 4 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z4dL, F, "Zone 4 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(ambHue, F, "Ambience hue", 0, 360, 0, "Colour zones") X(ambAmt, F, "Ambience amount", 0, 1, 0, "Colour zones") \
  X(z5Amt, F, "Zone 5 amount", 0, 1, 0, "Colour zones") X(z5Hue, F, "Zone 5 pick hue", 0, 360, 0, "Colour zones") X(z5Wid, F, "Zone 5 hue width", 5, 120, 25, "Colour zones") X(z5Cmin, F, "Zone 5 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z5Cmax, F, "Zone 5 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z5Lmin, F, "Zone 5 darkest", 0, 1, 0, "Colour zones") X(z5Lmax, F, "Zone 5 brightest", 0, 1, 1, "Colour zones") X(z5ToHue, F, "Zone 5 new hue", 0, 360, 0, "Colour zones") X(z5ToC, F, "Zone 5 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z5dL, F, "Zone 5 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z6Amt, F, "Zone 6 amount", 0, 1, 0, "Colour zones") X(z6Hue, F, "Zone 6 pick hue", 0, 360, 0, "Colour zones") X(z6Wid, F, "Zone 6 hue width", 5, 120, 25, "Colour zones") X(z6Cmin, F, "Zone 6 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z6Cmax, F, "Zone 6 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z6Lmin, F, "Zone 6 darkest", 0, 1, 0, "Colour zones") X(z6Lmax, F, "Zone 6 brightest", 0, 1, 1, "Colour zones") X(z6ToHue, F, "Zone 6 new hue", 0, 360, 0, "Colour zones") X(z6ToC, F, "Zone 6 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z6dL, F, "Zone 6 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z7Amt, F, "Zone 7 amount", 0, 1, 0, "Colour zones") X(z7Hue, F, "Zone 7 pick hue", 0, 360, 0, "Colour zones") X(z7Wid, F, "Zone 7 hue width", 5, 120, 25, "Colour zones") X(z7Cmin, F, "Zone 7 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z7Cmax, F, "Zone 7 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z7Lmin, F, "Zone 7 darkest", 0, 1, 0, "Colour zones") X(z7Lmax, F, "Zone 7 brightest", 0, 1, 1, "Colour zones") X(z7ToHue, F, "Zone 7 new hue", 0, 360, 0, "Colour zones") X(z7ToC, F, "Zone 7 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z7dL, F, "Zone 7 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  X(z8Amt, F, "Zone 8 amount", 0, 1, 0, "Colour zones") X(z8Hue, F, "Zone 8 pick hue", 0, 360, 0, "Colour zones") X(z8Wid, F, "Zone 8 hue width", 5, 120, 25, "Colour zones") X(z8Cmin, F, "Zone 8 min colourfulness", 0, 0.4, 0.03, "Colour zones") X(z8Cmax, F, "Zone 8 max colourfulness", 0, 0.5, 0.4, "Colour zones") \
  X(z8Lmin, F, "Zone 8 darkest", 0, 1, 0, "Colour zones") X(z8Lmax, F, "Zone 8 brightest", 0, 1, 1, "Colour zones") X(z8ToHue, F, "Zone 8 new hue", 0, 360, 0, "Colour zones") X(z8ToC, F, "Zone 8 new colourfulness", 0, 0.4, 0.1, "Colour zones") X(z8dL, F, "Zone 8 lighter / darker", -0.3, 0.3, 0, "Colour zones") \
  /* Appended 17 Nov 2026. A dark face's shadows carry the least colour, so a colour-qualified zone grabs them
     least — exactly the pixels that need lifting when the reading says "the face is underexposed". This lifts by
     skin weight instead of by hue and colourfulness, so it reaches them. */ \
  X(skinLift, F, "Lift the face", -0.3, 0.3, 0, "Skin Guard")

namespace lukuluku {
enum ParamId {
#define LK_ENUM(id, kind, label, mn, mx, def, group) P_##id,
  LUKULUKU_PARAMS(LK_ENUM)
#undef LK_ENUM
  PARAM_COUNT
};
struct ParamInfo { const char* id; char kind; const char* label; double min, max, def; const char* group; };
static const ParamInfo kParamInfo[PARAM_COUNT] = {
#define LK_INFO(id, kind, label, mn, mx, def, group) {#id, (#kind)[0], label, mn, mx, def, group},
  LUKULUKU_PARAMS(LK_INFO)
#undef LK_INFO
};
/** All parameter values for one render, indexed by ParamId. */
struct Params { double v[PARAM_COUNT]; Params() { for (int i = 0; i < PARAM_COUNT; i++) v[i] = kParamInfo[i].def; } double operator[](ParamId p) const { return v[p]; } };
} // namespace lukuluku

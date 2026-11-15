# Colored Lens Studio

**Colored Lens** (the Cinematic Color Encyclopedia) and **Lukuluku** (the film look lab), inside Premiere Pro and
DaVinci Resolve. By DesignPraise Studio.

## What you get
**Colored Lens panel** (Premiere Pro 25.6+, DaVinci Resolve Studio 19+)
- **Shot**: reads the frame under the playhead (letterbox bars, deep shadow and blown highlights are left out, so it reads the subject, not the black), asks what the project is, how the scene should feel and what the shot is, then suggests directions: each one a palette structure from the encyclopedia, a colour grade and a Lukuluku configuration, with what it will do to this frame and to faces. Preview any of them on your own frame with a before / after wipe, apply it to the selected clips, tweak it or save it. Click a face to check skin exposure (40–75 IRE), density and hue (§7 *Skin, Exposure & Equity*).
- **Scene**: a colour script from tagged shots (stored as markers, so they travel with the project) or a scan, checked against the feeling you set. Narrative devices (motifs, omens, leitmotifs) only when the piece tells a story. Saves PNG and CSV.
- **Tweak**: every setting of the look with a live preview on your frame: colour science, medium, lens, diffusion, strength, grade, **Skin Guard** and **Match to Reference**. Also pastes any Lukuluku look code or share link, exports a `.cube`, or opens in Lukuluku.
- **Presets**: saved looks with what they were for. Apply to other shots (optionally adapting to each shot's exposure and balance first), open and edit with live preview, share as a code.
- **Encyclopedia**: the whole encyclopedia, searchable, offline, one tap from any reading or direction.

**Smart mode** (optional, off by default): an AI that looks at the frame, reads what the scene is doing, talks it through with you and picks looks from the same recipes, with small adjustments inside safe limits. It runs on Ollama on your computer, a local OpenAI-compatible server (Microsoft Foundry Local, LM Studio), or Google Gemini with your own key, so it costs you nothing. Keys stay in the OS keychain.

Everything else is rules running on your machine: free, offline after the first launch, and the same answer every time.

**Lukuluku Look effect** (OpenFX for Resolve free and Studio; Adobe effect for Premiere Pro)
- Lukuluku's pipeline, ported line for line: 17 colour sciences, 11 film/video media (grain, halation, softness, gate, VHS…), lens character, diffusion filters, aspect mattes, anamorphic streaks, the full grade including colour wheels.
- **Skin Guard** (new): the look may add to skin, but cannot take away its hue, density or light beyond what you allow.
- **Match to Reference** (new): moves a shot toward a reference frame from the encyclopedia or your own timeline.

**Web version** at `https://designpraiseeric.github.io/colored-lens-studio/panel/` for CapCut, OpenCut and anything else: open a frame grab, read it, check skin, download the look as `.cube`.

## Install
Download from [Releases](../../releases): `ColoredLensStudio-x.y.z-mac.pkg` or `-win.exe` installs everything.
Then: Premiere → **Window → UXP Plugins → Colored Lens**; Resolve Studio → **Workspace → Workflow Integrations → Colored Lens**; the effect is under **DesignPraise** in Resolve's OpenFX library and Premiere's Effects panel.

## Staying up to date
Content (encyclopedia, looks) updates by itself. New versions show a banner in the panel: one click installs them. See [docs/RELEASING.md](docs/RELEASING.md).

## Layout
| | |
|---|---|
| `core/` | shared JavaScript: colour maths, frame reading, skin check, color script, Lukuluku looks (CPU port), updater |
| `ui/` | the panel (plain DOM + flexbox, so it runs in Premiere's UXP) |
| `hosts/` | Premiere (UXP), Resolve (Workflow Integration / Electron) and web adapters ([hosts/README.md](hosts/README.md)) |
| `engine/` | the Look Engine in C++: `src/` core, `ofx/` Resolve plugin, `adobe/` Premiere plugin, `tests/` |
| `tools/` | content feed, code generation, panel builds, packaging |
| `installer/` | macOS `.pkg` and Windows Inno Setup scripts |
| `.github/workflows/` | CI, the live content feed (GitHub Pages) and releases |

## Build locally
```
npm ci
node tools/build_content.mjs --enc ../chroma-encyclopedia --luk ../lukuluku
node tools/gen_engine.mjs && ./tools/fetch_sdks.sh
cmake -S engine -B engine/build && cmake --build engine/build -j      # add -DAE_SDK=/path/to/AfterEffectsSDK for Premiere
node tools/build_hosts.mjs && node tools/package.mjs
node --test test/*.test.mjs
```
Load `dist/premiere` in Adobe's UXP Developer Tool to develop the Premiere panel; copy `dist/resolve/com.designpraise.coloredlens` into Resolve's *Workflow Integration Plugins* folder for Resolve.

Lukuluku's looks (`catalog.js`, LUTs) and the encyclopedia are read from their own repositories at build time; nothing is duplicated by hand.

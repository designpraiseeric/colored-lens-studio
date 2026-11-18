# Colored Lens Studio — developer handoff

**Purpose of this doc:** everything a new Claude session (or a new account) needs to take over this project with no other context. Keep it updated at every release. Last updated: 18 Nov 2026, 17:00 WAT, at v0.18.0 (§11d: the by-eye review and zones with a place; §11c: AE CEP panel, Gemini key ring).

**This file now lives in the repo at `docs/HANDOFF.md`** (and `docs/after-effects-scope.md`), as well as in the claude.ai Project. Before 0.14.0 they existed only as Project uploads; the repo copy is the one to edit.

Companion docs: `docs/after-effects-scope.md` (rewritten again 17 Nov night: **AE 2027 has a public UXP API — one codebase can serve Premiere and AE**), `colored-lens-studio-status.md` (running status/history) and the older `colored-lens-after-effects-scope.md` (AE port plan, rewritten 17 Nov with the architecture and with the founder's second proposal — duplicate-per-item, eyedrop assignment, reroll — and the answer to it).

> **If you are picking this up cold, read §3 (the quality bar) and §11 first.** The founder spent 17 Nov proving that the plugin produced grades that were not merely unimpressive but measurably damaging, and the whole evaluation method changed as a result.

> **Where the founder is as of 17 Nov night:** he had **0.13.0** installed and asked for three things in order: re-run the five-grade challenge in his Premiere, speed, then the third track (AE/Resolve/proposals). 0.14.0 is the result: **0.14.0 is the build to install.** The live run on 0.13.0 found the exposure defect in §11 within two suggestions. His stated goal, in his own words: *the best possible version of this plugin for each of Premiere, DaVinci Resolve and After Effects* — and Premiere and After Effects are the two he personally works in most, so they carry the most weight.

---

## 1. What this is

A colour plugin for Premiere Pro (and DaVinci Resolve) that joins two of the founder's existing products:
- **Colored Lens** — "The Cinematic Color Encyclopedia" (repo `designpraiseeric/chroma-encyclopedia`): colour psychology, palette structures, narrative devices, auteur signatures, reference frames.
- **Lukuluku** — a film-look lab (repo `designpraiseeric/lukuluku`): film stocks, lens/diffusion/medium character, grading, LUT baking.

**Repo:** https://github.com/designpraiseeric/colored-lens-studio (public). Local clone at `/home/claude/colored-lens-studio`.

**Founder:** Divine Praise Eric (DesignPraise). Mac (Apple silicon), Premiere Pro 2026 (26.x). Tests in a real project called "christianity as a coping mechanism_exp", sequence MAIN SEQ 1 (9:16 vertical, nested sequences + several adjustment layers, media partly on an external volume `/Volumes/Terabyte`).

### The product vision (founder's own words, restated 16 Nov)
1. Analyse a frame **in itself and in relation to its scene**. Every layer visible in frame is listed live with ticks; the AI's advice is scoped to the ticked layers.
2. The AI is **on by default**. It studies the frame and a user-chosen range: first every tiny detail it can see, then inferences about purpose and context from the surrounding scene. The user adds context through chat.
3. A button produces **many meticulous colour suggestions**, each with per-item colour proposals ("lamp lid green, ambience golden yellow, the dress ___; this communicates ___ because ___"), with abundant encyclopedia references.
4. **Lukuluku implements** any suggestion, per-item included, non-destructively (adjustment layers / nodes / masks, duplicated clips if needed), or gives the detailed manual process. Plus linear grading sent to the host's own engine on an adjustment layer.

He is explicitly wary of bloat: features must earn their place. He also said plainly on 17 Nov: **do not get so used to building one small step that the real thing is lost sight of.** Build toward the whole vision; say honestly what will not land today. And all three hosts are meant to end up excellent, not one host with two ports.

---

## 2. Repository map

```
core/           host-agnostic logic (the brain). Pure JS, no DOM.
  color.js      sRGB/linear/log/OkLab/OkLCh conversions
  image.js      decodeImage (PNG/JPEG/BMP/DPX), encodePNG (fflate), downsample, makeFrame, toBase64
  jpeg.js       own baseline JPEG encoder (frames to the AI are ~10× smaller than PNG)
  analysis.js   activeArea (bars cropped), labPixels, hueShares, readFrame, frameStats
  skin.js       face-sized regions, faces[] (fields: n, area, L, C, H, ire, box, swatch), lead face, maskPreview
                TWO gamuts: SKIN (narrow, for FINDING a face) and SKIN_WIDE (for PROTECTING and MEASURING one)
  look.js       the Lukuluku look model: parseCode, makePixelFn, bakeCube, lookToEngineParams, GRADE0,
                applyZones + zoneCoverage, skinWeight/applySkinGuard, match, shareLink, lchHex, hueHistogram
  quality.js    THE QUALITY BAR: gradeReport, faults, verdict, BAR, ALLOWS, fitStrength, scaleLook (see §3)
  preview.js    previewer(): 25³ baked table, applyTable, wipe compositing, textureOf
  directions.js 28 RECIPES (each with `allows`), GENRES/FEELINGS/ROLES, answers(), scoring, continuity()
  smart.js      THE AI LAYER: providers, three prompts (STUDY / TELL / SUGGEST), validation, matchItem(),
                zonesFor(), howTo(), picture()
  palette.js    PALETTE STRUCTURES AS A SURFACE: structures(), zoneItems(), dealPalette(), accentOf(),
                applyDeal(), assign(), bestDeal() — assign one swatch to one item, or deal a whole
                structure across every live zone, seeded, constrained and scored (see §4)
  presets.js    localStorage presets, CLP1 share codes, settings
  script.js     readSequence (scene scan)
  updates.js    version feed + installer download

ui/             the panel (plain DOM + flexbox; no framework)
  app.js        ~1250 lines: state S, tabs, render(), fitToShot(), aiCall(kind), all cards and wiring
  slider.js     div-based slider (UXP has no <input type=range>); band / marks / thumbColor paint the rail
  guide.js      COACH (tour steps) + routes(os) (AI setup wizard) + helpPrompt()
  style.css     DesignPraise theme (bright default, .cl.dark variant)

hosts/
  premiere/host.js       UXP host adapter: grabFrame (+ plainFrameDir / uxpSource / plainSource / listNames),
                         clipContext, applyLook, markers, selectionCount, secret, bridge, openPreviewPanel
  premiere/manifest.json UXP manifest v5, two entrypoints (coloredlens, preview)
  resolve/*              Electron main + renderer for the Resolve app
  web/host.js            browser demo host (used by scratch/ scripts and the web panel)

engine/
  src/params.h           X-macro parameter list — APPEND ONLY (153 params; zones 5–8 appended AFTER ambHue/ambAmt,
                         so the C++ reader uses two bases: P_z1Amt for zones 1–4, P_z5Amt for 5–8;
                         skinLift is the last row)
  src/look_engine.cpp    the C++ per-pixel + spatial pipeline (must match core/look.js exactly)
  adobe/lukuluku_ae.cpp  the Premiere/AE effect plugin (AE SDK 27)
  ofx/lukuluku_ofx.cpp   the Resolve OFX plugin

helper/mac/              the Colored Lens Helper (Swift): Apple Intelligence + localhost bridge
installer/mac/           pkg build + postinstall
tools/                   gen_engine.mjs, build_hosts.mjs, build_content.mjs
test/                    core.test.mjs, hosts.test.mjs, engine_parity.test.mjs,
                         look_quality.test.mjs + quality_harness.mjs + quality-baseline.json
tools/frame_bench.mjs    THE REAL-FRAME BENCH (0.14.0): `node tools/frame_bench.mjs <frame> [suggestions.json]` — builds suggestions exactly as
                         the panel does and measures them. Takes the frame by path; never commit the founder's footage.
core/aicache.js          per-shot memory of the AI's study + suggestions (fingerprint + scope), 0.14.0
scratch/                 throwaway scripts, UNTRACKED — everything in it was lost with the 17 Nov session. Anything worth keeping goes in tools/: quality_report.mjs (the scorecard), five_grades.mjs (the founder's
                         own five-structure challenge, measured on his frame), user_frame_check.mjs,
                         zone_cover_check.mjs (coverage vs real movement), fit_probe.mjs, zones.mjs, readfail.mjs
site/content/            encyclopedia.json, looks.json, refs.json, luts/*.bin, frames/*.jpg (246 reference frames)
.github/workflows/       ci.yml, pages.yml, release.yml, helper.yml
```

---

## 3. The quality bar (read this before changing anything that touches pixels)

**Why it exists.** On 17 Nov the founder asked for five grades better than what he had. Five AI suggestions were produced, they looked different from each other, and that was reported as success. He pushed back twice. Measured properly: four of five clipped his subject's face, one darkened her, two swung her skin off the skin-tone line, and two described themselves as doing the opposite of what they measurably did. **Zero of five were better.** Nothing in the test suite could have caught it, because no test had ever asked what a look does to a picture.

**`core/quality.js` is the answer.** `gradeReport(src, out, { skin, tonal })` compares a graded frame with its source and `faults(report, { allows, claims })` returns what is wrong with it in plain words, worst first. `verdict()` turns that into one sentence.

Lessons already paid for, do not relearn them:
- **Never judge a grade by a mean.** A mean lightness on a cheek rises just as happily when the highlights blow. Two clipping grades were mistaken for improvements that way. Use percentiles, and the shadow/highlight split: a lift that lands mostly on the top end is clipping with extra steps (`liftBalance`, fault `top-heavy`).
- **"Blown" means a channel out of 8-bit room (≥250), not "bright".** A lightness threshold of 0.88 flagged merely-bright pastel skin as blown. Verified against the founder's real footage, where the flagged pixels genuinely were at 250+ — the conclusion held, the measure did not.
- **The thing being measured can be the thing that is wrong.** The face measurements were all built on a skin gamut that started at hue 28° and chroma 0.022, and the founder's subject measures **24.1° at 0.0158**. Every face check scored her at 0.001 and looked straight through her. A measurement that cannot see the subject reports no damage, which is not the same as no damage. See §4.
- **Anything selected by colour-similarity touches everything of that colour.** `skinLift` lifted by skin weight alone, so on a frame with a warm wall and a wooden door it lifted those as hard as the face and blew them. A lift is for **shadows**; a bright surface that merely shares the hue is not one. The same trap waits for any future "by colour" operator.
- **Nothing may spend headroom the picture has not got.** Lightness *and* colour: piling colour onto a near-white pixel is what pins a channel at the top and twists the hues there. Taking colour away was never the problem. Both holds live in `applyZones` / `applySkinGuard` and are mirrored in C++.
- **Measure the tonal pass with grain off.** Otherwise grain a look adds on purpose is indistinguishable from blocking the grade amplified out of a weak source. `gradeReport` takes a `tonal` render for this; `flatNoiseRatio` is the amplification, `grainAdded` the deliberate texture.
- **`lostDetail` is the style-agnostic measure**: neighbours the source could tell apart that the output cannot. Unlike "crushed to black" it says nothing about whether a look is dark or bright, so a low-key look and a high-key one are held to the same standard. No intent excuses it.
- **Intents, not exceptions.** Each recipe declares `allows: ['mono'|'tint'|'soft'|'crush'|'grain']`. An intent relaxes exactly its own axis and never the face.

**`fitStrength(src, build, { skin, allows })`** is the fix that mattered most. Every look is built at one strength and used to land at that strength on whatever frame arrived, which is why one contrast curve clipped a bright face and crushed a dark one. It binary-searches the strength at which the look stops damaging *this* frame, judged **at the same size the verdict is given at** — an early version pre-shrank the frame, which averaged clipped pixels away and let a look pass the fit and fail the report the fit existed to satisfy — and returns `{ k, fitted, suits, faults }`. `suits: false` means no usable strength is clean: the panel shows it with a warning rather than offering it silently. `scaleLook()` holds the strength maths so the panel and the tests scale a look identically.

**The gate is a ratchet.** `test/quality-baseline.json` records the look/frame pairs that currently damage a picture; `test/look_quality.test.mjs` fails if any look gains a new fault. `node scratch/quality_report.mjs` prints the scorecard; `--write` lowers the baseline when something is fixed. **Run it before and after any change to the look engine, the LUTs, the grade model, Skin Guard or the zones.** It scores the *fitted* path, because scoring the unfitted look would measure something no user ever sees.

Standing debt at 0.14.0: **1** (unchanged) (`technicolor` on `aut-wes-anderson.jpg`, blowing 2.0% more of the face). It was 35 before fitting, 2 after fitting, 1 after the skin model was widened.

**`node scratch/five_grades.mjs`** re-runs the founder's own challenge on his own frame: the five palette structures, each built the way the plugin builds it, each measured against the overall-look-only version he was given on the morning of 17 Nov. It measures the machinery, not the AI's taste — the taste half needs his Premiere.

**This is now the standing way to evaluate the product, at the founder's explicit instruction.** Usefulness and effectiveness are judged by measurement and by professional taste, every release, and the result goes in this doc. More and better tests are expected, not optional. His widened mandate (17 Nov): it is **not only the face and skin**, critical as those are — it is everything else in the scene too. The only acceptable limit is the source: a weak source (pixelated footage, say) sets a ceiling, and the plugin's job is to reach that ceiling, never to land below it.

---

## 4. How the panel works (the loop)

1. **Read** — `grabFrame` asks Premiere to export the frame under the playhead and waits for the file. See §8 "Reading a frame".
2. **Analyse** — `readFrame` gives hues/tones/palette/confidence; `skin.js` finds faces and their IRE.
3. **AI study** — `SYSTEM_STUDY` → items (name, where, colour, hex), light, mood, purpose, scene, questions, suggested answers.
4. **Intent** — the user taps answers; in Simple view only the feeling question shows.
5. **Suggest** — `SYSTEM_SUGGEST` → suggestions with title, idea, palette structure, ambience, per-item colours, communicates/because, encyclopedia refs, and a Lukuluku recipe.
6. **Try this on my frame** — `zonesFor()` turns the suggestion into the recipe look + ambience + colour zones + any face lift; **then `fitToShot()` brings it down until the frame can carry it** and the dock says what it did.
7. **Strength** — `setStrength(k)` rescales the whole direction from `S.base`. The fitter sets it; the user can drag it back.
8. **Apply** — `applyLook` puts the effect with all its parameters on the chosen target in one undo step. `applyLabel()` names the real destination.
9. **Tweak / Save as preset / Scene scan / Encyclopedia**.

### Colour zones (eight since 0.10.0)
Eight zones + ambience as effect parameters. Each qualifies pixels by their **original** colour in OkLCh and moves them in OkLab. Applied after the look, before Skin Guard. Implemented twice and kept in lock-step (`applyZones` in `core/look.js` and `engine/src/look_engine.cpp`); `test/engine_parity.test.mjs` fails on divergence beyond ~half an 8-bit step. **It runs against a prebuilt `engine/build/lkpixel` — rebuild it (`cd engine/build && make lkpixel`) after touching the C++, or the test compares new JS against an old binary.**

Zones are pure colour transforms — **no spatial masks**. Premiere cannot create or track masks, so anything needing one is handed to the user as written steps. In After Effects that same skip list becomes the build order (see the AE scope doc).

**Skin Guard governs the zones, but only their colour (0.10.1, refined 0.11.1).** Each zone's colour move is scaled by `1 - skinWeight(source, 0.017) * skinGuard`; the **lightness** move is not, because lifting an underexposed face is ordinary grading and refusing it left the plugin able to diagnose a dark face with no way to act on it. Three traps, all easy to reintroduce:
- `applySkinGuard` only ever *restored* chroma the look removed. Chroma a zone *added* was invisible to it.
- A neutral zone targets low chroma, while `skinWeight`'s default floor was `0.025`. Deep skin in shadow sat in the gap: grabbed by the zone, scored as not-skin by the guard.
- The floor must stay **above ~0.005**: at near-zero chroma the OkLab hue is numerical noise, and JS doubles vs C++ floats then disagree enough to break parity. 0.017 is the tested value for the zone hold; `skinWeight`'s own floor is now 0.012.

**The headroom holds (0.12.2).** `applyZones` captures `oL` (what the look left, before any zone moves it) and `room = 1 - smooth(0.82, 0.97, oL)`. Three consequences, all mirrored in C++:
- a zone's lightness move is ceilinged at `max(oL, srcL, 0.93)` — free until the picture runs short, beyond that only as far as the look or the source already reached;
- a zone move that would **add** colour is scaled by `room`; a move that removes colour is untouched;
- the ambience is scaled by `room` for the same reason — on a pixel with nothing left it is not air, it is a pinned channel.

### Skin Guard itself (rebuilt 0.11.0, widened 0.12.0, bounded 0.12.2)
It had the same asymmetry in three places. Now: hue drift is **capped** rather than resisted proportionally (a proportional pull always lets a strong enough look through — at 0.7 it returned only 56%, which is how looks landed 13–22° off the line); lightness is held out of **both** ends of the scale, not only resisted downward; chroma piled **onto** skin is held back as well as chroma drained from it. The lightness limits bite at `sqrt(w)` because they are limits, not preferences. Mirrored in C++.

**The gamut it works on was the real bug (0.12.0).** `skinWeight` ran hue 28–88° with a chroma floor of 0.022 — and the founder's subject measures 24.1° at 0.0158, so her face scored **0.001** and Skin Guard let a 101° hue swing through at strength 0.7. It is now hue **18–92°**, floor **0.012**, edge 0.006. Finding a face and protecting one want opposite things (a wide gamut mistakes a warm wall or a wooden door for a person and collapses face detection — tried, 2 faces at 10% area became 1 at 0.2%), so `core/skin.js` exports **two**: `SKIN` for detection and `SKIN_WIDE` for protection and measurement.

**`skinLift` ("Lift the face", 0.12.0; bounded 0.12.2)** is the other half. A colour zone is qualified by colour, and a dark face's shadows are exactly where the colour runs out, so the pixels that most need lifting received the least of it. `skinLift` lifts by **skin weight** instead, so it reaches them, and a suggestion that asks for a brighter face is routed to it rather than to a zone. Appended last in `params.h`; exposed in the Skin Guard card. **0.12.2 added the two holds it was missing:** a positive lift is weighted by `1 - smooth(0.45, 0.85, srcL)` so it is a *shadow* lift, and the result is hard-capped at `max(srcL, 0.93)`. Without those it lifted the warm wall and the wooden door along with the face and blew them — on the founder's own frame it was adding 6.1 points of blown picture.

### Palette structures as a surface (`core/palette.js`, 0.13.0)
The encyclopedia's ten structures each carry five swatches. They were something to read; now they act on the shot. Every live colour zone is an *item* with the share of the frame it covers; a swatch can be given to one item (`assign`), or the whole structure dealt across every item (`dealPalette`) and re-dealt.

Three rules, and all three were earned by getting them wrong first:
- **Constrained.** The accent swatch goes to the smallest surface, never the largest — an accent on the biggest thing in frame is how a palette reads as a mistake.
- **No invented accents.** `accentOf` returns null unless the top swatch is genuinely colourful (C > 0.02) *and* at least 1.25× the next. Greys differ in chroma by fractions of a billionth; treating the top one as an accent made every deal of a greyscale structure identical and the reroll button a lie.
- **Scored.** Each candidate is rendered and run through `gradeReport` before it is offered. A damaging deal is dropped; if nothing clean is found the least-bad one is shown *with what is wrong with it*, because showing nothing is worse than showing a caveat.
- **Seeded**, so a deal the user liked can be asked for again by its number, and `bestDeal`'s `avoid` option means a reroll never hands back the deal already on screen (it reports `exhausted` when there genuinely is no other).

One bug worth remembering: the swatch pool was built by repeating the structure's swatches **in order** and then truncating, so with two items only the first two swatches of a five-colour structure could ever be dealt. Shuffle each batch *before* appending.

---

## 5. The AI layer (core/smart.js)

**Providers:** `off`, `auto`, `apple`, `ollama`, `openai`, `claude`, `gemini`. `resolveProvider` for `auto`: Apple → Ollama (vision model) → Claude key → Gemini key.

**Three prompts, not two (0.12.1).** `SYSTEM_STUDY`, `SYSTEM_TELL` and `SYSTEM_SUGGEST`, all JSON-only, with `validateStudy` / `validateSuggest` clamping everything.
- `SYSTEM_STUDY` + `buildStudy` is the full pass: the inventory, the contact sheet, the layer list, a 768px frame.
- **`SYSTEM_TELL` + `buildTell` is a reply.** Telling the AI anything used to re-run the whole study — one to two minutes to answer "the lamp is practical" — because `studyFrame(message)` called the study prompt. A message now goes to `aiCall('tell', …)` whenever `S.study` already exists: it carries the reading the AI has plus the message, asks only for what the message changes, and sends a 448px frame with **no** contact sheet and no layer list. An empty field in the reply means unchanged, and `studyFrame`'s merge keeps the old value; `items` is all-or-nothing, because a partial list would replace the full one.
- `SYSTEM_SUGGEST` + `buildSuggest` reads `UNDERSTANDING` from the study.

**Item names are matched fuzzily** (`matchItem`) because the AI words items differently across calls; an exact-match-only version in 0.8.1 silently discarded *every* suggestion. Any validation rule that can reject a whole suggestion must be tested against real model output.

**`zonesFor` is where a suggestion becomes something real.** Three rules in it meant that on the founder's own footage every suggestion collapsed to "only the overall look" (fixed 0.11.1 and 0.12.0):
- Skin was skipped before anything else was considered. A skin item now routes to **`skinLift`** — exposure only, colour left to Skin Guard; a suggestion that wants to repaint a face still gets nothing.
- The neutral cutoff sat at 0.035 colourfulness, well above where grey begins, so a mint shirt at 0.02, a cream wall and a shadowed doorway were all one grey and each refused for covering too much of the frame. It is now 0.015, the qualifier widens for soft colours, and the share test uses the same predicate the zone will use.
- Skin is exempt from the share cap, because a face legitimately covers a lot of a close-up.

**The AI's `tweaks` are dangerous on a face (0.14.0).** `exp` is whole-picture exposure, and asked to fix "the face is underexposed" the model reaches for it — +1.2 stops on the founder's shot, which blew 31% of the picture. `routeExposure` (core/directions.js) hands any positive exposure to `skinLift` when a face with L < 0.6 is in frame (`EXP_CAP_FACE = 0`: even 0.15 stops blew 5% of a wall already at the ceiling). Both prompts now say exp is whole-picture. Each suggestion builds with **its own** tweaks via `directionsFromPicks([{recipe, tweaks}])` in the Try handler — before 0.14.0 it borrowed the Smart pick for that recipe, i.e. the first suggestion's tweaks.

**Speed (0.14.0):** suggestions prefetch the moment a full study lands (`suggestColours('', {prefetch:true})`); every AI call carries a generation number (`aiGen`) so Stop / a new read / a pre-empting message drops a late answer; the busy line counts seconds without re-rendering; `core/aicache.js` restores study + suggestions for the same shot (fingerprint distance < 9 on a 12-px lightness thumbnail, same layer/range scope). "Study it again" (`#aiFresh`) forces a fresh pass.

**Per-provider quirks:**
- **Gemini** — `gemini-flash-latest`; `GEMINI_FALLBACKS`; retries on 503/500/502/504; 404 means a retired model name. 503 on every fallback model is common and the panel says so clearly. Free tier has a daily cap. Image generation needs billing. Study 1–2 min on a 768px JPEG; suggestions another 1–2.
- **Claude** (0.8.3) — `https://api.anthropic.com/v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`. Prefilled `'{'` forces JSON. **A Claude Pro subscription does NOT cover API keys.** Never exercised against the real API from inside UXP.
- **Apple Intelligence** — through the helper. CI's SDK has no image Attachment API, so the shipped helper is the **text variant**.
- **Ollama / local** — small models hallucinate and loop; fewer suggestions, retries, no contact sheet.

**Keys** live in UXP `secureStorage` with a localStorage fallback (secureStorage returns bytes some builds cannot read back).

---

## 6. The Mac helper

`helper/mac/` — a Swift LaunchAgent `com.designpraise.coloredlens.helper`, binary at `/Library/Application Support/ColoredLens/ColoredLensHelper`. It exists because Premiere's UXP blocks `http://` on macOS, and it exposes Apple Intelligence. Transport: JSON files in `~/Library/Application Support/ColoredLens/bridge` (write `tmp-<id>.json`, rename to `req-<id>.json`, read `res-<id>.json`). `build.sh` tries `ai_image.swift` (macOS 27) → `ai_text.swift` (macOS 26 + Vision) → `ai_none.swift`.

---

## 7. Release process

```bash
npm version X.Y.Z --no-git-tag-version
# add a "## X.Y.Z" block at the TOP of RELEASE_NOTES.md (user-facing wording, no jargon)
cd engine/build && make lkpixel && cd ../..   # ONLY if look_engine.cpp changed, before npm test
node scratch/quality_report.mjs               # before AND after any pixel change
npm run build
npm test                                      # 54 tests, ~6-7 min — allow 580 s
git add -A && git commit -m "Release X.Y.Z: ..." && git push origin main
curl -s https://designpraiseeric.github.io/colored-lens-studio/version.json
gh api repos/designpraiseeric/colored-lens-studio/releases/tags/vX.Y.Z -q '(.assets[]|.name)'
```
Feed flips ~5–9 min after push; installers appear shortly before it. **The panel only checks for updates when Premiere starts**, so a new version never appears in a panel that is already open.

**The Release workflow's `mac` job gets cancelled when a macOS runner does not come free** — it shows as a failed run with `mac: cancelled, publish: skipped`, and the feed stays on the previous version. It is not a code failure. Recover with `gh run rerun <id> --failed`. This happened on 0.12.2. **Always confirm the release actually published before telling the founder to install.**

**`npm run build` writes the bundle the tests load.** If you stash source to compare behaviour, rebuild after the stash *and* after the pop — half an hour went on 17 Nov chasing a "flaky" host test that was simply the previous bundle.

**Commit attribution** (from the session's reminder):
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_...
```

**Notes:** `gh` GraphQL is blocked; use `gh api` REST. The cloud environment can restart mid-session: files survive, running commands do not. A `&`-backgrounded command does not survive the Bash call that started it. Piping a long `node --test` run through `grep` buffers the output to nothing if the run is killed — redirect to a file instead.

---

## 8. Hard-won platform knowledge (do not relearn these)

### Reading a frame (the fragile part)
`grabFrame` calls `ppro.Exporter.exportSequenceFrame` and waits for the file.
- **The export can report success and write nothing.** Seen 17 Nov on both a heavy shot and a black single-layer shot, so it is not render time. Suspected cause: the UXP temporary folder is handed out per session, so a Premiere restart gives a new sandboxed path the exporter may not be able to write.
- 0.10.2/0.10.3 therefore watch **two** places: the UXP temp folder, and `~/Library/Application Support/ColoredLens`. If nothing lands in the first after nine seconds the frame is asked for again in the second. **This fixed it.**
- **Read the plain path by its exact name, not by listing the folder.** UXP's `fs.readdir` needs the `file:` scheme and is still refused on some installs ("Permission denied to read directory"); `fs.readFile` of one known path works.
- Limit 90 s; the status line counts the seconds.
- **A failure must stay on screen.** It was a six-second toast on a ninety-second operation. `S.readErr` now renders a `.card.alert` in the Shot tab with the reason, what to try, and a "Show what Premiere wrote" disclosure listing both folders — that listing is the diagnostic, because Claude cannot see the founder's disk (`device_bash` runs in a Linux VM, not on the Mac).
- A read marks the project **Edited** even when nothing of the user's changed, because the bypass/restore of looks is an undoable change. Not yet fixed; flag it when reporting.

### Premiere UXP
- No `<input type="range">` — use `ui/slider.js`.
- `<button>` colours are overridden — use `div role="button"` for selected states.
- CSS `opacity` ignored. `<ol>/<li>` do not render.
- `flex: none` is **not** respected on images in a `nowrap` row. Use wrap + percentage width + fixed height + `object-fit: cover`.
- `<select>`: set `background`, `color` **and** `option { color }`, and watch for a more specific earlier rule.
- No reliable `window.confirm`. Ask inside the panel with a card and a second click.
- `#body` scrolls, not the page. `100vh` is wrong for a second panel. The first scroll gesture after a tab switch is sometimes swallowed, and scrolling is slow (~2.5–3.5 px per tick) — a long tab is painful.
- `fetch` streams unreliable — use `arrayBuffer()`.
- `http://` blocked on macOS. `require('fs')` with `file:` paths works with `localFileSystem: fullAccess`, but see the `readdir` caveat.
- `secureStorage` returns bytes; `TextDecoder`/`TextEncoder`/`btoa` not guaranteed.
- Hidden panels stay loaded: update check only on app restart. Popup indices are 0-based.
- **No API to create adjustment layers, masks or text layers.** The template-.prproj import workaround is real but unimplemented. Apply → Adjustment layer uses an existing one and says so.
- `createSetDisabledAction` hides layers during a read. `sequence.getSelection().getTrackItems()` gives selected clips.
- **Two cards can own the same element id.** The Shot tab's AI card and the Smart mode card both render `#smMsg`, so `querySelector` finds whichever is first in the DOM. Scope selectors (`#aicard [data-smq]`) in tests and in wiring.

### Engine
- `params.h` is **append-only**.
- Premiere needs `PF_PixelFormatSuite1` or the effect renders black.
- Run `engine_parity` after any pipeline change, **after rebuilding `lkpixel`**.
- Anything keyed on hue needs a chroma floor that reaches zero before the hue becomes noise, or JS doubles and C++ floats disagree on grey.
- A new parameter must also be added to `lookToEngineParams`' defaults, or the id-match test fails.
- **Every pixel-stage change has to be written twice.** 0.12.2's holds were mirrored in C++ in the same commit; parity broke the one time they were not.

### UI
- Never re-render in a way that loses scroll position, a drag, or text being typed. An input's value must live in `S`, not only the DOM.
- A slider rail **can** be repainted mid-drag via `.rail`'s `style.background`; re-rendering would replace the element the user is holding.
- Re-encoding a PNG per mouse move makes a drag feel stuck; move DOM nodes instead.
- A control that is live but **inert** is worse than a missing one (a neutral zone showed draggable hue sliders that did nothing).
- A button must say what it will really do, in **every** branch — 0.9.1 fixed only "This clip" and left a bare "Apply" elsewhere until 0.10.1.
- **Averaging a patch destroys the colour the user clicked** — `colourAt` takes the dominant hue under the cursor.
- **An error on a long operation needs somewhere permanent to live.** Toasts are for things that succeeded.
- Vertical footage is limited by the dock's **height**, not the panel's width. Popping the preview out is the real answer; the hint says so under 170 px.
- **Pre-filling an input with the prompt is not an affordance.** Tapping one of the AI's questions pasted the question into the message box, so Send without looking sent the AI its own question back. The question now sits above the box (`S.smart.answering`) and the box holds only the answer.

### Installer
- Never wait on Adobe's `UnifiedPluginInstallerAgent`: it hangs when Creative Cloud is closed and reports success on failure. Background it with a cap, check output for "Failed", fall back to `open`ing the .ccx.
- `launchctl bootout` is asynchronous: wait before `bootstrap` or it fails with "Bootstrap failed: 5".

---

## 9. Working with this founder

- **He tests in his real project.** Never apply, save or change his timeline without asking. Undo test edits with Edit › Undo and report anything left changed — **including the playhead, the panel widths and the active tool**, which are easy to forget.
- **He types the passwords and API keys.** Claude never enters credentials. He leaves "Remember my choice" unticked deliberately.
- **Never touch a modal that belongs to his project** (e.g. Link Media). Report it and stop.
- **His personal email address is private.** Never give it to an external service, and never write it into a doc, a commit or a config; ask him which contact to use if a service needs one.
- **Computer use:** access expires after ~30 min idle — re-run `computer_resolve_access` then `computer_request_access`. `computer_app_screenshot` reads the Premiere window in the background without taking his screen; prefer it. The first screenshot after granting sometimes returns "no result"; call again. His Mac locks itself: calls then fail with "loginwindow is not in the allowed applications" — **do not request access to loginwindow**, tell him and wait. Premiere's menus other than the app menu need `computer_app_menu`. **Premiere's panel dividers do not respond to synthetic drags at all** — don't waste turns on it; `~` over a panel maximises it, which is the way to get room. Batch waits ≤50 s; `scroll_amount` ≤100.
- **He pushes back when a claim is wrong, and he has been right every time.** He was right about adjustment layers. He was right that five different grades were not five better grades. He was right that even the "best" of them was not good. Verify before asserting, and measure before claiming an improvement.
- **Tone:** honest assessment, not cheerleading. When he says something "feels" wrong, go and look — every one of his "feelings" so far has been a reproducible defect.
- **He thinks in architectures, and his proposals are usually worth building.** When he describes one, answer as an engineer would: what is right, what cannot work and why (with the verification), what it costs, and whether it amends or replaces. He asked for exactly that on 17 Nov and the answer is in the AE scope doc.
- Releases and pushes are pre-authorised by his go-aheads for this work.

---

## 10. Version history

| Version | What |
|---|---|
| 0.1.x–0.2.9 | first panel, encyclopedia, looks; effect fixed (was black), update flow, per-face skin, timeline context, scenes, continuity, Apply scope, nested sequences, preview dock, separate Preview panel |
| 0.3.0–0.4.2 | Smart mode, guide + tour; **Colored Lens Helper** (Apple Intelligence + localhost bridge over files), draggable wipe, installer no longer hangs on Adobe's agent |
| 0.5.0–0.6.3 | DesignPraise theme, Simple view; **AI by default**, layer checklist, item-by-item study, per-item colour suggestions, secure-storage fix, JPEG frames, Gemini fallbacks |
| 0.7.0–0.8.3 | **Colour zones** in the engine, suggestions build real previews, adjustment-layer choice, 60 s frame wait; measured zone feedback, AI picture, encyclopedia pictures; **Claude as a provider** |
| 0.9.0–0.9.1 | fixed the validation bug that discarded every suggestion; **Tweak rebuilt**; **Strength slider**; honest Apply label; **safe sequence scan**; empty states |
| 0.10.0 | **Eight colour zones**; `lchHex` + `hueHistogram`; **sliders painted with what they control**; **"Pick a colour from the picture"**; per-zone card editor |
| 0.10.1 | **Skin Guard holds the zones off faces**; picking grabs the dominant colour not the patch average; zones named for what they grabbed; neutral zones stop showing inert hue controls; slice-width slider drawn as the wheel; Apply honest for every scope; saturation rail follows the shot; more panel height for vertical footage |
| 0.10.2 | frame read: second export location, failure card that stays, elapsed seconds, 90 s limit. **Superseded within the hour — do not ship 0.10.2.** |
| 0.10.3 | the fallback finds the file **by the exact name Premiere was given**, because UXP's `fs.readdir` is refused on some installs. **This fixed the frame reads.** |
| 0.11.0 | **`core/quality.js` + the ratchet gate**; **`fitStrength` fits every look to the shot** and says so, or warns that a look does not suit it; **Skin Guard caps hue drift, holds both ends of the scale, and holds back added chroma**. Looks that damage a picture: 35 → 2 |
| 0.11.1 | **the per-item half fires**: skin gets an exposure-only zone so an underexposed face can be lifted; the grey line moves to 0.015 so a pale shirt or wall is targetable by hue |
| 0.12.0 | **the skin model excluded deep skin** — hue 28°/chroma 0.022 against a real subject at 24.1°/0.0158, so every face protection scored her 0.001 and saw nothing. Gamut widened to 18–92°/0.012 and **split in two** (`SKIN` to find a face, `SKIN_WIDE` to protect and measure one); **`skinLift` ("Lift the face")** lifts by skin weight where a colour-qualified zone cannot reach; `fitStrength` stops pre-shrinking the frame. Debt: 2 → 1 |
| 0.12.1 | **a reply is not a restudy**: `SYSTEM_TELL`/`buildTell` answer the editor from the reading the AI already has, with no fresh inventory and no contact sheet; the AI's own question sits above the message box instead of being pasted into it. The host test's chat leg was passing vacuously and now drives the real path |
| 0.12.2 | **a lift is for shadows, and nothing spends room the picture has not got.** `skinLift` was lifting the warm wall and the wooden door as hard as the face; it is now shadow-weighted and hard-capped. Colour zones and the ambience gained a lightness ceiling and a headroom rolloff on any move that ADDS colour. On the founder's frame, per-item building went from adding 6.1 points of blown picture to adding **none** |
| 0.18.0 | **places follow the subject** (`core/track.js`; AE keyframes the places; Premiere static for now); AE startup timing log |
| 0.17.0 | **colour zones with a place in the frame** (Gemini boxes / rough places from words; fade inside the box; LUTs leave them out); picked colours covering half the frame stay where clicked |
| 0.16.0 | **Gemini key ring** (next saved key on a limit, tired key rests); **After Effects ships as a signed CEP panel** in the Mac installer (.zxp also released); AE timecode follows the comp start |
| 0.15.0 | **After Effects panel (preview)**; share code works in UXP; plain zone names; cache keeps notes |
| 0.14.1 | scan fixed; guarded render + crash card; Apple prompt fits 4,096 tokens; Skin Guard group renamed |
| 0.14.0 | **a dark face is lifted, not the whole picture** (AI exposure tweaks routed to skinLift; per-suggestion tweaks; Strength = scaleLook incl. skinLift + zones 5–8; dock shows worst two faults; captions are not items) and **speed** (prefetch, per-shot cache, seconds + Stop). `tools/frame_bench.mjs` |
| 0.13.0 | **palette structures become a working surface**: `core/palette.js` — give one swatch to one item, or deal a whole structure across every live zone and re-deal it. Constrained (the accent goes to the smallest surface), scored by the quality gate before it is shown, and seeded so a good deal can be asked for again |

---

## 11d. 18 Nov, 15:15–16:15 — the by-eye review, and zones with a place (0.17.0)

He asked Claude to do the "taste half" itself, judged by professional grading standards. Live in Premiere (tests project, forest shot 1471212 at 00:00:10:04, Gemini, the 10 suggestions restored from the cache):
- **No damage:** skin natural on both faces, nothing crushed; the fitter held Teal and Orange at 63% (it would blow 15.5% more at 100%) and said so. Best look: Golden green (pleasant late-afternoon warmth; shadows a touch milky).
- **The failure:** every suggestion said "Only the overall look". The vest "61% of the picture has that same colour", jacket 61%, path 90%. So 10 suggestions promised 10 ideas and delivered 2–3 mild overall looks; #1 ("vest as focal anchor") was a near no-op. The pitch did not match the picture.

**Fix, 0.17.0: zones with a place.** params.h appended `z1X…z8BH` (32 rows, group "Zone places"; centre across/down + half-width/height, size 0 = anywhere → old projects unchanged). `zonePlace` (JS) / `zonePlace` (C++): a superellipse box (power 4), full strength in the core, **fading to nothing at the box's edge, never beyond** — the first version faded 35% beyond the edge and painted the leaves beside the woman teal (seen in a before/after crop; a colourist would have spotted the rectangle at once). No position (u<0: a baked LUT) → a boxed zone does nothing.
- STUDY asks for `box: [ymin,xmin,ymax,xmax]` 0–1000 (Gemini's native format); `boxOk` normalises; no-vision AIs (Apple text) have boxes dropped; `boxFromWords` gives a rough third-of-frame place from "where" (cached readings). `zonesFor` boxes a zone only when colour alone covers too much, the box is ≤45% of the frame (rough ≤20%) and the colour is ≥8% of the box; same-coloured items in non-overlapping places no longer clash (only if the earlier one is itself boxed).
- Preview: pixels a box can reach go through the exact positioned pipeline; the rest through the table. `renderWith` passes positions, so the fitter and quality gate measure the real thing.
- Tweak: "Placed: …" note + "Let it act anywhere". Picking a colour that covers >45% of the frame keeps the zone around the click (fixes the "57% with no warning" defect).
- **Forest bench, suggestion 1** (`~/bench/places.mjs`, outside the repo): colour only → 1 zone (sky); words → 3; boxes → 4 (vest, jacket, path, sky); k 1.0, nothing blown, faces untouched. Vest reads as a livelier olive, jacket's green camo deeper with its brown kept, path warmer.
- **Not yet seen live:** a fresh Gemini study returning boxes on 0.17.0 (the cached reading has none). That is the next check, with his eye.
- Limit: a box is placed for the frame read. A subject that travels needs AE masks/tracking — the next AE item.
- Release note: the 0.17.0 mac job was cancelled for want of a runner and re-run with `POST …/runs/<id>/rerun-failed-jobs`; a later push did not start a new release run because the version had not changed.
- AE startup timing marks ship in 0.18.0 (`ColoredLens/cep_timing.log`).
- **0.18.0 — places follow the subject.** `core/track.js`: OkLab planes at 192 px (chroma ×4), normalised correlation of the box's inner 70% in a window (≥60% of the box or 12% of the frame), step 3 then ±2 then a sub-pixel parabola; `MIN_SCORE` 0.7 (random background patches reach ~0.5 — a hidden item scored 0.516). Forest frame panned in 7 steps: worst error 2.1 px of 960. Panel: "Follow the placed colours through the shot" (≤3 frames each side within the clip, ±4 s, ~0.6 s apart; progress + Stop; per-zone "lost it at"). AE: `cl_apply(params, scope, track, keys)` keyframes "Zone n place across/down" with `setValuesAtTimes` (comp time) in the same undo group, removing old keys first (a keyframed setting refuses `setValue`). **Premiere keeps the static place** — its UXP keyframe API (clip-relative positions?) is untested; do it live.
- **Known limit, all versions with places:** places are fractions of the *frame that was read* (the sequence/comp frame). An effect on a clip renders in the clip's own space, so a clip that is scaled or moved (Motion / Transform — e.g. 16:9 footage in his 9:16 sequence) puts the box in the wrong spot. On an adjustment layer it is right. Not yet handled or warned.
- AE frame reads stay ~40 s at 4K, so following 6 extra frames there takes minutes. Next: faster AE reads (and read the timing log).

## 11c. 18 Nov, 11:20–13:10 — After Effects runs as a CEP panel, tested live

**AE 27.0 (build 78) will not load third-party UXP, so After Effects ships as a CEP panel** (`hosts/cep/`: `manifest.xml` CSXS 9, host AEFT [22,99.9], Node + mixed context; `host/cl.jsx` ExtendScript; `host.js` adapter). Build: `node tools/build_hosts.mjs cep` → `dist/cep`. Installed on his Mac at `~/Library/Application Support/Adobe/CEP/extensions/ColoredLens/` (Window › Extensions › Colored Lens). Earlier panel files are kept in `~/tmp_frames/cl-old/`. **0.16.0 packages it:** `tools/sign_cep.sh` (macOS CI) signs `dist/cep` with Adobe's ZXPSignCmd 4.1.3 and a self-signed certificate made per build → `ColoredLens-AfterEffects-<v>.zxp`; `build_pkg.sh` unpacks it to `/Library/Application Support/Adobe/CEP/extensions/com.designpraise.coloredlens.cep`; postinstall moves a hand-installed copy with the same bundle id aside (his `~/Library/.../CEP/extensions/ColoredLens`) into `~/Library/Application Support/ColoredLens/replaced-AE-panel-*`. Unsigned fallback copies `dist/cep`. The UXP AE build is no longer packaged.

**Gemini key ring (0.16.0):** `core/keyring.js`. Secret `gemini.ring` holds `[{k, rest}]`; `gemini` still holds the first key (old code paths and older builds). `smartCfg` passes `geminiKeys` (ready first, resting by wake time) and `onKeyLimit`; `ask()` tries each key and moves on only on a limit (429 / RESOURCE_EXHAUSTED / quota), never on a bad key. `postJSON` appends Google's quotaId and retryDelay to a 429 message so `restUntil` can tell a per-minute limit (retryDelay, else 60 s) from a daily one (midnight Pacific, DST computed without tz data). Saving adds instead of replacing; AI settings list keys masked (`AIza…1234`) with ready/resting and a two-click Remove. Keys are per app (UXP secureStorage in Premiere, localStorage in the AE panel), so AE needs its own.

Verified live in his AE "test" project (comp 1471212_People_Family_3840x2160):
- frame read (`saveFrameToPng`) about 40 s on 4K; the panel takes about 20 s to paint when it opens and is **black until then** (not a crash);
- AI study via the helper (Apple Intelligence); cache restore ("read this shot 4 min ago… restored");
- host wording via `host.words` (text nodes only): "current time", "comp", "precomp", "layer"; the button follows the selection;
- **Apply → Lukuluku Look on the layer with every setting set** ("added to 1 layer. Edit › Undo removes it in one step.", nothing missing), and Edit › Undo removes it.

Fixed on the way (commits 3b53d4e, 221b863; `test/cep_jsx.test.mjs` runs cl.jsx in Node against a mock effect):
- **"3 settings were not found"**: "Skin Guard" and "Lift the face" are each a group *and* a setting, so `fx.property(name)` returned the group. `cl_controls` now walks the controls and skips `NO_VALUE` headings. Missing settings are named, with AE's own error text, value and matchName. Sliders are clamped; a setting already right is skipped.
- The undo group opens only once there is a layer to change.
- `es()` gives up after 90 s with a plain message (AE stopped answering the panel once, after an Apply/Undo round; **an AE restart cleared it**).
- Effect matchNames are stable: `DesignPraise Lukuluku Look-NNNN` = param id + 1 (topics 1000+). Addressing by matchName would be sturdier than by label.

Gotchas:
- **Transfers to his Mac can be stale** (see the Animate grain note): fresh staged names, then compare sizes.
- **AE's menu bar lags one action when read through accessibility.** "Can't Undo", a missing History entry and an undo that seemed not to take were all stale reads; `computer_app_menu` pressing the top item reports the real title.
- "Animate grain" failed three times with "Value 2 out of range 0 to 1" while AE accepts 0, 1, true and false on it (probe `~/tmp_frames/cl_probe.jsx`, results in `ColoredLens/probe.txt`). **Likely cause found afterwards: `device_commit_files` re-delivered a stale copy when the same staged path was reused** (the Mac got a 470,419-byte app.js instead of the 476,655-byte build), so several of those runs were not running the script I thought. Always stage under a fresh file name and check the size on the Mac (`Filesystem__get_file_info`) before testing. With 0.16.0 really installed the Apply was clean.
- Panel menu › Panel Group Settings has **Undock** right under Close; it floats the panel.
- The frame timecode reads 00:00:00:00 on a comp whose display start is 0:00:23:03 (use `displayStartTime`).
- His `aftereffects-local` bridge (MCP Bridge Auto palette) runs only fixed commands; `listLayerEffects` with properties is a good read-only inspector. File › Scripts › Run Script File with ⌘⇧G runs an arbitrary .jsx.

## 11b. 18 Nov, 00:50–02:10 — the every-tab sweep in his "tests" project, and the AE start

He asked for every feature under every tab to be checked. Found live (Premiere 26.5.2, Apple Intelligence text variant), fixed in 0.14.1 / 0.15.0:
- **Scene › Scan the sequence** threw `addShot is not defined` (addShot was scoped to the Scene wiring). Fixed, host test added, verified live (4 frames, strip, reading).
- **Panel froze**: every click logged uncaught exceptions with no message (UXP drops it). render() is now guarded (crash card + full message/stack to the log via console.error, which UXP does keep), root listeners use `near()` not `e.target.closest`. 4 message-less exceptions per click STILL appear in 0.14.1 even when clicks work: source not yet found; look in `~/Library/Logs/Adobe/Adobe Premiere Pro 2026/UXPLogs_*.log` for `[Colored Lens] error while` lines next time.
- **Apple Intelligence** suggest prompt overflowed its 4,096-token window ("4098 tokens") and was reported as "not available". Lite prompt now ~1,900 tokens; history dropped first; one squeezed retry; honest message.
- Apple text variant gets Vision labels, not "measurements only"; note corrected. Its item hexes are guesses, so its colour zones target guessed colours — open problem.
- **Presets › Share code** threw (no btoa/TextEncoder in this UXP). core/b64.js is pure JS; the code opens under its preset. Same fix for pasting a Lukuluku link.
- Zone named "amber" for an olive pick (encyclopedia has 13 hues, no olive/brown) → `plainColourName` in core/color.js.
- "Skin Guard" twice in Effect Controls (skinLift appended under that group; OFX defined grp_Skin_Guard twice) → group "Lift the face"; test that groups are contiguous and unique.
- "in a analogous" → "an". "exposure 0" no longer listed. Cache keeps vision + stale flags.
- **Open, not fixed:** on a muted forest shot every item is skipped ("61–90% of the picture has that same colour") so suggestions are overall-look only — Premiere's real limit, AE/segmentation is the answer. A single colour pick can cover 57% of a muted frame with no warning.
- Read/scan did NOT mark this project Edited (no Lukuluku on the clip to bypass).
- Not yet swept: Guide, AI settings, Encyclopedia tab, Simple/Dark toggles, Apply (needs his say-so), the popped-out Preview panel on 0.14.1+.

**AE install finding (18 Nov 02:15):** a bare-manifest .ccx failed in Creative Cloud with error -4; with icons + full fields (tools/ae_probe, variant A: manifest v6, host array aftereffects 27.0) it installs and is registered in `~/Library/Application Support/Adobe/UXP/PluginsInfo/v1/aftereffects.json` — but **AE 27.0.0 (build 78) never loads user-installed UXP plugins**: its UXP log has no "Loading plugins from user PluginsInfo" step (Premiere's does), only Adobe's own (Frame.io, `com.adobe.dva.ae.mcp`). Route now: **Adobe UXP Developer Tools** (installed by him 02:25, `/Applications/Adobe UXP Developer Tools/`, bundle `com.adobe.uxp.devtools.app`) → Add Plugin `~/tmp_frames/ae_probe_folder/manifest.json` → Load into AE. Note: Claude's auto-mode classifier refused to install apps on his Mac; he clicks Install himself. His `aftereffects` MCP server is configured for AE 2026 (AE_NOT_FOUND) — pointing AE_MCP_EXE at AE 2027 would give a scripting route too.

**After Effects, started 18 Nov** (0.15.0 ships `ColoredLens-AfterEffects-preview-<v>.ccx`): `hosts/aftereffects/host.js` + `hosts/uxp_common.js`, manifest v6 host aftereffects 27.0, id `com.designpraise.coloredlens.ae`, AE mock + contract test in hosts.test. **Never run on a real AE yet.** The live unknown is frame export: `tools/ae_probe` (read-only) is at `~/tmp_frames/ColoredLens-AE-probe.ccx` on his Mac; once installed and opened it writes `~/Library/Application Support/ColoredLens/ae_probe.json` — read it with his Filesystem MCP (allowed `/`). The device shell is a Linux VM and cannot install .ccx; he double-clicks.

## 11a. 17 Nov night — the live run on 0.13.0, and what it found

In his Premiere (computer use; nothing applied to the timeline), shot at 03:41:01 of MAIN SEQ 1, Gemini study + 10 suggestions already on screen:
- **Suggestion 2 "Complementary Warmth"** → fitter: *does not suit this shot; even at 35% it brightens the face from the top end (0.009 shadows vs 0.092 highlights)*.
- **Suggestion 1 "Natural Resolve" (Neutral + Accent)** → same refusal, 0.012 vs 0.088. Two different palettes failing identically pointed at the machinery.
- Per-item zones were cleared on the bench first (no face lift at all from any zone, incl. the warm-brown wall). The Tweak tab then showed **Exposure 0.43 at Strength 0.35 → the AI had asked for ≈ +1.23 stops**. Reproduced on his frame to the third decimal; the full verdict, hidden by the dock showing only one fault, was **+31% of the picture blown**.
- Also seen: a burned-in caption ("Graphic text 'fact'") given its own colour zone that found nothing; `setStrength` scaling zones 1–4 while the fitter scaled 1–8, and neither scaling `skinLift`.
- After 0.14.0, `tools/frame_bench.mjs` on his frame: **12 of 12** recipe × exposure-request combinations clean; +1.2-stop requests lift her face +0.08 to +0.14 in the shadows with nothing blown.
- **Not yet done: the taste half.** 0.14.0 has not been looked at in his Premiere. First thing next session: install, re-read the shot, and walk suggestions 1–5 with the dock and his eye.
- Frame access: `~/Library/Application Support` is refused by the device bridge, but his local **Filesystem MCP server** is allowed `/` and can read `cl_frame_*.png` there (`read_media_file`). The file on disk may be an older read than the panel's current frame.

## 11. State as of 0.13.0 — verified, unverified, open

**Verified live in the founder's Premiere:** install + update flow, helper, file bridge, Apple Intelligence, wipe dragging, layer checklist, theme, preview dock, **frame reads (0.10.3)**, Gemini study naming eight items in his frame accurately and asking shot-specific questions, **ten suggestions across seven palette structures with per-item colours, reasoning and encyclopedia references**, **"Try this on my frame"**, **"Save as preset"** (five presets saved from one session), **Apply end to end** with Edit › Undo, sequence scan, encyclopedia jump, the banded sliders with the frame's own hue marks, "Pick a colour from the picture", the honest Apply label. At 0.12.0 (seen at 16:55 on 17 Nov) he had **two colour zones live in Tweak** — "shirt → vibrant teal" and "background wall → neutral warm grey" — each reporting about 2% coverage of the frame.

**NOT verified live:** everything from 0.11.0 onward — the fitter, the rebuilt and widened Skin Guard, the per-item mapper, `skinLift`, the reply prompt, the 0.12.2 headroom holds, and the whole of 0.13.0's palette surface (driven end to end in the host test, never in his Premiere). The Claude provider against the real API from inside UXP. The AI picture button. Resolve at all. **He last installed 0.12.0; 0.13.0 is the build he should take.**

**The ~2% zone coverage was checked and is not a defect** (`scratch/zone_cover_check.mjs`). On his frame a suggestion-built shirt zone reports 21.8% coverage while 35.3% of pixels visibly move, which is the right relationship — `zoneCoverage` counts pixels above a 0.25 weight threshold, so it under-reports on purpose. The 2% on his screen was his own narrow hand-picked zones, not the code.

**The 17 Nov grading review, in full, because it is the most important thing in this doc.**
The founder asked for five grades better than his own, produced only through the plugin's own smarts. Five were produced from the plugin's suggestions and saved as presets. Measured on his own frame against his own footage:
- the plugin's own reading had already flagged **"The face is underexposed"** — the right diagnosis, unprompted;
- **Amber Honey (Analogous)** lifted her shadows 0.099 and her **highlights 0.215**, clipping an extra **9.8%** of her face, with skin chroma up 0.036 — orange and waxy, not warm;
- **Ice Blue (Complementary)** moved only the top end (+0.239), blew **11.6%** more of her face, and swung her skin hue **101°** — ashen, the classic way to grade dark skin badly, with Skin Guard at 0.7;
- **Discordant** crushed shadows and blew 13.8% more; **Monochromatic** clipped nothing because it darkened everything; **Neutral + Accent** was nearly a no-op with a 17.6° warm drift.
- **Zero of five were better.** Two of five stated in their own text that they did the opposite of what they measurably did.
- Cause: all per-item colour was skipped, so each "grade" was a whole-frame look, and a whole-frame transform cannot lift a face that is dark *relative to* its background. Underneath that, the skin model could not see her face at all. 0.11.0 → 0.12.2 are the fixes.

**The bench re-run at 0.12.2** (`node scratch/five_grades.mjs`, his frame, the same five structures, per-item colour targets written by hand in the AI's shape — so this measures the machinery, not the AI's taste):
- **5 of 5** lift her face without clipping it or pulling her skin off its line. This morning none did.
- **3 of 5** carry no fault at all at the strength the fitter chose (2 of 5 before the headroom holds).
- Building a grade item by item now adds **no clipping over the plain overall look** — it added 6.1 points of the picture before 0.12.2, and on one structure it now *reduces* clipping by 2.4 points.
- The two still flagged (`cold-steel`, `giallo-pop`) blow 8–17% of this picture at the fitter's 0.35 floor **from the recipe look alone**, nothing to do with the per-item work. The fitter correctly says they do not suit this shot.
- **Still owed: the taste half.** These are measurements, not his eye. The real challenge — five grades he agrees are better — needs his Premiere, a fresh study and fresh suggestions. 0.13.0 changes no pixels, so these figures stand for it too.

**Known open problems, ranked:**
1. **0.11.0 → 0.13.0 unverified on his footage, and the five-grade challenge not yet re-run with his eye on it.** First thing to do.
2. **Speed.** ~45 s frame render, then 1–2 min study, then 1–2 min suggestions. The worst part — a chat message costing a whole second study — is fixed in 0.12.1; the study and the suggestions are still serial, with no progress detail and no cancel. Overlap them and cache per shot.
3. **The Shot tab is very long** and Premiere scrolls it slowly. Suggestion titles truncate mid-word even at full width.
4. Zone edges are purely colorimetric, so a zone can look blotchy on a noisy frame. Segmentation is the real answer.
5. A frame read marks the project Edited although nothing of the user's changed.
6. Resolve has no timeline context and gets a LUT rather than live parameters; never tested on his machine.

---

## 12. Agreed next work

His stated end state (17 Nov): **the best possible version for each of Premiere, Resolve and After Effects** — with Premiere and After Effects weighted highest because those are the two he works in daily. Resolve is not a leftover.

0. **Install 0.14.0 and look at the suggestions with him** (§11a). The measurement half is done; the taste half is not.
1. ~~**Speed**~~ — **shipped in 0.14.0** (prefetch, per-shot cache, seconds + Stop). Still possible: a single combined study+suggest call for providers that can take it; a smaller study frame for Gemini.
2. ~~**Palette eyedrop + deal-and-reroll**~~ — **shipped in 0.13.0** for Premiere, bounded by colour zones (§4). What is still owed from his proposal: the same gesture bounded by a **mask** rather than by colour (that is the AE/Resolve work below), and multi-select across *layers* rather than across zones.
3. **Encyclopedia proposals** — user picks that are not in the encyclopedia are written to a proposals file in its exact schema, with the shot and structure they came from, and reviewed (accept / edit / reject) in the standalone Colored Lens reference app. Never written straight in: the reference's authority is the point of it.
4. **Apple Vision segmentation** in the helper and the effect, so a zone can be limited to "the person" or "the background" and tracks itself. Then optional **SAM** for arbitrary objects (he has SAM on an external volume; need to know which version and in what form).
5. **After Effects** — **the panel-technology question is answered (17 Nov night): AE 2027 (v27.0+) has a public UXP API, `require("aftereffects")`, and one UXP manifest can list both `premierepro` and `aftereffects` hosts (Adobe's own Frame.io panel does). He has AE 2027 installed.** See `docs/after-effects-scope.md` for what it changes. Older notes: the architecture, the verified fact that **Roto Brush strokes are not scriptable**, and his duplicate-per-item amendment with the costs it carries.
6. **Resolve deserves a second look.** His proposal lands more cheaply there than in AE — nodes instead of duplicates, and Magic Mask is native, so "click an object and track it" is a first-class operation. It may be the better second host rather than the third.
7. **Adjustment-layer template** for Premiere (a .prproj with a layer named "Colored Lens", imported on demand). Needs a few minutes of his Premiere to author. **Waiting on him.**
8. A free alternative to the paid AI picture: copy the prompt and the frame for the Gemini app.

---

## 13. Identifiers that must never change

- Plugin: `com.designpraise.coloredlens` (panels `coloredlens`, `preview`)
- Effect: `com.designpraise.lukuluku.look`, Adobe match name **"DesignPraise Lukuluku Look"**
- Helper: `com.designpraise.coloredlens.helper`
- `params.h`: append only (185 rows; zones 1–4, then `ambHue`/`ambAmt`, then zones 5–8, then `skinLift`, then the zone places `z1X…z8BH`)
- Feed: https://designpraiseeric.github.io/colored-lens-studio/version.json
- Frames fallback folder: `~/Library/Application Support/ColoredLens` (shared with the helper's `bridge/`)
- Logs on the Mac: `/tmp/ColoredLensStudio-install.log`, `/tmp/ColoredLensHelper.log`
- DesignPraise palette: `#1A0D3E #110929 #17161A #2F2D35 #DDDFD7 #6403EE #D903EE #038EEE #00D7FF #03EED8 #03EE63 #EED903 #FFA800 #FF7639`

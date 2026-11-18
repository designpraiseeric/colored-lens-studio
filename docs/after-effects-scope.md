# Colored Lens Studio for After Effects: scope

Status: **started 18 Nov.** 0.15.0 ships a preview AE panel (hosts/aftereffects). Not yet run on a real AE; frame export is the open question (tools/ae_probe).

## 17 Nov night: the main unknown is answered — UXP, and the same plugin

Checked on the founder's Mac and against Adobe's docs:
- He has **After Effects 2026 and 2027** installed (2026's folder holds only Plug-ins/ and Scripts/; the app bundle is 2027's).
- AE 2027's bundle ships a UXP host (`dvauxphost.framework`, `dvauxpui.framework`, `Contents/UXP/plugins/`) alongside CEP (`PlugPlug`) and ExtendScript.
- Adobe's **Frame.io V4** panel is one UXP plugin with one manifest (v6) listing **both** hosts: `premierepro` minVersion 26.2 and `aftereffects` minVersion 26.3, the latter depending on an AE scripting module `dvaaescripting`.
- Adobe publishes an **After Effects UXP API** for third parties at developer.adobe.com/after-effects/uxp: `const app = require("aftereffects")`, `app.beginUndoGroup()/endUndoGroup()`, with every member marked **min version 27.0**.
- The layer API has what the builder needs: `adjustmentLayer` (RW), `duplicate()`, `addProperty("ADBE Mask Atom")` for masks, `setTrackMatte(layer, type)` / `removeTrackMatte()`, effects added by match name (`addProperty` into the effect parade), `applyPreset`, `copyToComp`, `doSceneEditDetection`.
- **Not confirmed:** rendering a comp frame to a file from UXP (ExtendScript has `CompItem.saveFrameToPng`, with a known dark-image bug in >8-bpc projects). This is the one thing to prove with the UXP Developer Tool before anything else, because the frame read is the front door of the whole panel. Fallbacks if absent: `app.executeCommand` on Copy Frame / Save Frame As, or the render queue to a PNG sequence of one frame.
- Hybrid UXP plugins (native code alongside JS) are **not** yet supported in AE (open developer request, Oct 2026); the effect plugin stays a separate AE SDK binary, which it already is.

**What it changes.** The AE port is not a second panel in CEP/ExtendScript. It is `hosts/aftereffects/host.js` behind the existing host interface, built from the same `core/` and `ui/`, shipped either as the same .ccx with a second host entry or as a sibling plugin. Stage 1 below ("panel technology spike, 2–3 days") shrinks to proving three calls in his AE 2027: render a frame to disk, list the layer stack at a time, add the Lukuluku effect with parameters to an adjustment layer. The minimum supported AE becomes **2027 (27.0)**.

Last updated 17 Nov 2026 with the founder's own statement of what he wants it to be, the architecture answer to it, and his second proposal (duplicate-per-item, eyedrop assignment, reroll) with the answer to that.

## Why After Effects

The founder's vision needs per-item colour applied precisely and non-destructively. Premiere's plugin API cannot create adjustment layers, masks or mattes. After Effects scripting can do all of these directly, so "AI suggests → Colored Lens builds the layers and masks → user tweaks" can be fully automatic there.

**And it is the structural fix for the defect found on 17 Nov.** Five AI grades were measured against the founder's own footage and none improved it: a whole-frame transform cannot lift an underexposed face without carrying the blown wall up with it. Separate the face onto its own layer and that stops being a trade-off. The AE version is not a port with extra features; it is the version where the per-item half of the product can be honest.

## The founder's statement of it (17 Nov, his words paraphrased)

A smart grader that creates duplicate comps, one per suggestion. In each duplicate comp every distinct item the suggestion names is a separate rotoed or track-matted layer, stacked over the original so nothing is destructive, with the intended look applied to it — after tweaks, and ideally still live-responsive to tweaks. Everything else is adjustable through whatever effects ended up on those layers, masks included, in the Effect Controls panel.

## The architecture answer

### What is right and should be built as stated
One comp per suggestion; items as layers inside it; original untouched underneath; every colour decision reachable as an effect parameter. That is standard compositing practice and it is what AE is for.

### What cannot work as imagined: roto is not scriptable
AE's scripting API exposes the Roto Brush **tool** and the effect's parameters, but there is no way to create or set its **strokes**. Expressions can read brush-stroke path points; scripting cannot write them. The same holds for Content-Aware Fill and the Camera Tracker. Verified against Adobe's scripting guide and the community docs, 17 Nov 2026 — do not re-litigate this without checking the changelog first.

What **is** fully scriptable: comps, layers, solids, adjustment layers, nulls, pre-comps, masks with per-frame vertices, track mattes, blending modes, every effect and every parameter, importing footage, and essential properties (CC 2019+).

So automated per-item separation has to come from somewhere other than Roto Brush. Two routes, and both should ship:

1. **Mattes we generate.** Apple Vision for the person and the foreground subject; SAM (SAM 2 for video, which tracks) for arbitrary objects. Rendered to disk as an alpha sequence and imported as a track matte. Per-frame mask paths from a segmentation mask would be thousands of vertices a frame and would make the project unopenable; a matte sequence is how professional tools do it.
2. **The hybrid, and the better v1.** The plugin builds the whole stack and pre-labels each item layer; the user makes **one stroke per item** with AE's own Object Matte tool (the AI roto in current versions, which propagates between frames and freezes). It is better than anything we would ship, it is already paid for, and it turns an unautomatable step into about four seconds of work per item.

### Live-responsive: split it in two
Mattes are expensive and stable; grades are cheap and must stay live as effect parameters, so changing an item's colour re-renders the grade and nothing else.

There is a third, cheaper tier that needs no matte at all: the colour zones already in the engine. The builder should use those when colour alone can separate the item and only bake a matte when it cannot — and **it already knows which is which**. The "needs a mask" skip list `zonesFor` prints in the Premiere panel is the work order for the AE builder. Same data, opposite outcome: Premiere says you will have to do this by hand, AE says here is the layer.

### Effect Controls shows one layer at a time
The founder's "adjust it in Effect Controls" is right but means clicking through six layers per suggestion. The AE-native answer is **essential properties**: promote each item's hue and amount onto the parent comp so one panel reads *lamp hue, dress hue, wall tint, ambience* together. Scriptable. Without it the stack is correct and miserable to use.

### Comp and layer discipline (he is explicitly wary of bloat)
- One comp per suggestion, items as layers inside. Never a comp per item.
- Build only the suggestion the user asks to build, not all ten.
- One shared matte source referenced by every suggestion that uses that item.
- Folder and label-colour everything under the shot name. Ten comps × six layers is sixty layers and an unopenable project otherwise.

### Quality
The grading-quality gate (`core/quality.js`, see the handoff) applies to AE output unchanged — same core, same measure. Per-item layering does not excuse a grade that blows a face; it only makes the damage easier to see. It also makes the fix possible: `fitStrength` can be run per item rather than per frame.

---

## Amendment, 17 Nov (second proposal): duplicate-per-item, eyedrop assignment, reroll

**What he proposed.** Duplicate the footage / nest / precomp / compound clip as many times as needed, one duplicate per target area or object, so the original is never touched. On each duplicate, click an object, track-mask or roto it, and then drift that item's colour language toward a hue region by **eyedropping a single colour out of one of the plugin's suggested palette structures from the encyclopedia**. If the colour he wants is not in the encyclopedia and is worth having, it is added in the encyclopedia's own format and logged as a suggested update to the standalone Colored Lens reference app. Several tracked items can be selected at once (through their layers) and drifted individually to distinct hues of one palette structure, and the palette's hues can be **randomly reassigned among the selected items, rerolled on a button, as often as he likes**. All of it automatable the same way.

**Verdict: an amendment plus two additions. Not a replacement.** The spine above stands. Taken piece by piece:

### 1. Duplicate-per-item is an amendment to the inner layer, and it needs a budget
The scope above already duplicates — one comp per *suggestion*, with item layers inside. He is duplicating on a second axis: one copy per *item*. These compose rather than conflict: comp per suggestion, duplicate layer per item inside it. That is what "items as layers" already meant; his wording just makes the duplication explicit, and makes it available **without** a suggestion, as a manual gesture.

The cost is real and must be designed for. Ten items means ten full-resolution copies of the footage stacked behind mattes, and on 9:16 footage off an external volume that will crawl. The rule stays: **duplicate only what colour cannot separate.** The panel already prints that list — `zonesFor`'s "needs a mask" skips. Everything else goes to one of the eight colour zones on a single adjustment layer, which costs nothing. A duplicate is the exception, not the unit of work.

### 2. Eyedropping a palette colour onto a tracked item is the best idea in the proposal
It inverts who decides. Today the AI names a colour per item and the user accepts or edits it. Here the **palette structure** is the source of truth, the user points at an item and points at a swatch, and the structure does the reasoning. That is how a colourist actually works with a reference, and it makes the encyclopedia load-bearing instead of decorative.

Mechanically it is nearly free: a hue target plus an amount is exactly what a colour zone already is. The only new part is that the region comes from a matte rather than from a colour qualifier. Same operator, different boundary. The engine needs nothing new.

**One hard condition, learned today.** A single eyedropped hue dropped on a masked region can still wreck it. On this very footage, per-item colour was adding six per cent of the picture in blown highlights until 0.12.2 put headroom holds on the zones and the ambience. So the drift must go through the same guard rails as everything else: skin held, headroom held, and `fitStrength` run **per item** — the item gets the strongest version of that hue it can carry, and the panel says so when it had to come down. Without that, this architecture is a very fast way to reintroduce exactly the damage the quality bar exists to stop.

### 3. Reroll is new, cheap, and should be built
Nothing in the current scope does it, and it is the one feature here that would genuinely change how the product feels: the same palette structure, re-dealt across the selected items, on a button. It turns a structure from one answer into a space of answers. Conditions:
- **Seeded and undoable.** Every deal gets a seed so a good one can be returned to; the whole deal is one undo step.
- **Not uniformly random.** A structure has roles — dominant, secondary, accent. Dealing the accent hue onto the largest area produces a bad frame nearly every time, and if most rolls are bad the user ends up doing the filtering. Constrain the deal by area and by role, and let an unconstrained "anything goes" be an explicit second button.
- **Scored, not just shuffled.** Each deal can be run through `gradeReport` before it is shown, and the ones that damage the picture dropped. That is the quality bar earning its keep somewhere new.

### 4. Encyclopedia write-back: proposals, never direct writes
He already said the right thing — "logged as a suggested update". Hold that line firmly. If user picks write straight into the encyclopedia it stops being a reference and becomes a scrapbook, and its authority is the whole point of it. The shape:
- A new colour is written to a separate proposals file in the encyclopedia's exact schema (so it needs no translation later), with the shot, the palette structure it was used in, and the date.
- The standalone Colored Lens reference app shows proposals in a review list: accept, edit, reject. Accepting is what writes the entry.
- The plugin reads accepted entries only. A proposal is usable in the project it was made in without being blessed.

### 5. Where it can and cannot live
- **After Effects:** all of it, with the roto caveat above — the plugin builds the duplicates, the mattes, the names and the structure; the actual object selection is either a generated matte (Vision / SAM) or one Object Matte stroke per item.
- **Resolve:** most of it, and arguably more cheaply — nodes instead of duplicates, and Magic Mask is native, so "click an object and track it" is a first-class operation there. Worth revisiting the order of work; this proposal makes Resolve look like the better second host, not the third.
- **Premiere:** none of the masking half. No comps, no masks, no mattes from the API. What Premiere can have is the palette-eyedrop and the reroll applied to the **colour zones** — same gesture, colour-bounded instead of mask-bounded — plus written steps for anything needing a mask. That is a worthwhile Premiere feature on its own and does not wait on AE.

### 6. What it changes in the order of work
Nothing is removed. Added, in priority order:
- **a.** Palette-eyedrop assignment onto an item (works in Premiere today against colour zones; becomes mask-bounded in AE). Small.
- **b.** Multi-select items and deal a structure across them, with reroll, seeded, scored by the quality gate. Small-to-medium, and the highest ratio of felt value to work in the whole plan.
- **c.** Encyclopedia proposals file + review list in the standalone app. Small, but it touches a second codebase.
- **d.** Duplicate-per-item builder in AE. This is stage 3–4 above, unchanged in size, now with an explicit per-item fit step.

---

## What carries over unchanged
- `core/` (analysis, skin, look engine port, directions, smart/AI, zones, quality, presets, encyclopedia) and `ui/` (the panel) are host-agnostic.
- The Lukuluku Look effect is built on the After Effects effect SDK already (same binary family as the Premiere build; match name "DesignPraise Lukuluku Look"). Needs: AE install path, 16/32-bpc float paths checked, SmartFX for 32-bpc projects.
- The helper (Apple Intelligence, localhost bridge) and the update feed.

## What must be written
1. **Host adapter `hosts/aftereffects/`** implementing the host interface the panel uses: grabFrame (render the comp frame at the current time), clipContext (the layer stack at the current time), applyLook, markers, saveFile, secrets, update.
   - Panel technology: check first whether the installed After Effects exposes UXP panels with a usable DOM; if not, use a CEP panel with ExtendScript for the host calls. This is the main unknown and decides a week of work either way.
2. **Timeline model for comps**: "shot" = selected layer or the layer under the playhead; "scene" = comp or work area; "range" = work area / comp / precomp chain.
3. **Builder**: from an accepted suggestion, in one undo group and only with consent — a duplicate comp named for the suggestion; an adjustment layer carrying the overall look, ambience and colour zones; one layer per item that colour cannot separate, limited by a track matte, named after the item and carrying its own zone, **fitted per item**; essential properties promoted to the parent.
4. **Segmentation**: Apple Vision through the helper first; optional SAM for arbitrary objects. Temporal smoothing and a feather/choke control are not optional — a flickering matte is the fastest way to make this feel amateur.
5. **Assignment and reroll** (the amendment above): eyedrop a palette colour onto a selected item; deal a structure across several selected items; reroll, seeded and scored.

## Linking After Effects and Premiere
- Same effect in both apps; a Premiere clip sent to AE ("Replace with After Effects Composition") keeps rendering in Premiere through Dynamic Link. **Caveat to plan for:** Dynamic Link comps play back slowly in a sequence as nested as the founder's, so the panel needs a "bake and relink" path for delivery, not only the live link.
- **Colour management is architectural, not a detail.** AE's working space differs from Premiere's. If the same effect is to land identically in both, it has to be handled deliberately or the Dynamic Link promise quietly breaks. Decide this before the builder is written.
- Shared store on disk (`~/Library/Application Support/ColoredLens/shared`): presets, the scene's answers, the AI's study and accepted suggestion per shot, keyed by source media path + timecode. Either panel picks up what the other decided.

## Order of work (estimate, one engineer-equivalent)
1. Panel technology spike in the founder's After Effects + effect loads and renders in AE (2–3 days).
2. Host adapter: grab frame, layer stack, apply look to an adjustment layer it creates (3–4 days).
3. Builder: duplicate comp, overall look, colour zones, essential properties, consent step, undo group (4–5 days).
4. Item layers from Vision mattes + the one-stroke Object Matte hybrid (4–6 days; overlaps with the Premiere segmentation work).
5. SAM for arbitrary objects (3–4 days).
6. Shared store + "continue in the other app" (2–3 days).

Independent of the above, and shippable into Premiere first: palette-eyedrop assignment (1–2 days), deal-and-reroll with scoring (2–3 days), encyclopedia proposals + review in the standalone app (2–3 days).

**Minimum that delivers most of the vision:** one suggestion → one comp → the speaker separated by Vision, everything else by colour zones, grades live, essential properties exposed. Stages 1–4 without SAM.

## Risks
- UXP availability/maturity in After Effects; CEP is the fallback.
- Per-frame segmentation speed and temporal stability (flicker) on long shots.
- Colour management divergence between hosts breaking the "same look in both" promise.
- Project weight: comps, layers and matte sequences add up fast; the discipline rules above are not optional. Duplicate-per-item makes this risk sharper, not looser.
- Reroll producing mostly bad deals if it is not constrained by role and area and scored by the quality gate.
- Encyclopedia drift if user picks are written back without review.
- Two hosts doubles live testing; keep one shared test checklist.

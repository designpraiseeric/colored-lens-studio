# Release notes
Each `## <version>` block becomes the text of the in-app update banner and the GitHub Release.

## 0.2.4
Scenes, the shots around a shot, and where a look goes.
- True readings of graded shots: if a clip already has Lukuluku Look, Colored Lens switches it off for the moment of the reading and back on (two steps in your undo history), so it reads the shot, not its own look. The effect gains a Bypass setting for this.
- Scenes: range markers, or markers named "Scene …", mark scenes. Each scene keeps its own answers.
- Continuity: Colored Lens reads the shots either side and says whether this shot, and each direction, sits in line with them or lands warmer, cooler, brighter or more colourful.
- Apply to: this clip, every clip from the same source, the whole scene, or the adjustment layer over the shot.
- The Mac installer now shows its name.

## 0.2.3
Shots that are more than one thing, several faces, and the timeline around the shot.
- Up to two answers per question (for example tender and tense, or commercial and documentary). The first leads; directions that serve both say so.
- Your answers are remembered per sequence.
- Every face in the frame gets its own exposure reading. Pick the lead face and the skin checks follow it.
- Colored Lens names the clip it is reading (track and name) and anything above it, such as titles or adjustment layers, and notices an existing Lumetri grade or Lukuluku Look.
- It suggests, never decides: mark a still or graphic as a title shot, or switch to normal video when Premiere already converts a log clip.
- Apply works without a selection: it uses the clip under the playhead, and updates a look that is already there.

## 0.2.2
Polish from the first session with 0.2.1 in Premiere Pro.
- Your answers in "What is this for?" are clearly marked (filled red, with a tick); Premiere had been hiding the selected state.
- Picking a direction takes you straight to the large preview, with Apply, Tweak and Save right under it.
- "Back to the original" returns the preview to your untouched frame.

## 0.2.1
Fixes "Install update" in Premiere Pro, which could hand macOS Installer an empty file ("Couldn't open ColoredLensStudio-….pkg").
- The installer is now downloaded whole, checked (size and file type) and saved to your Downloads folder before it opens.
- If anything goes wrong, the banner says what happened and offers the download from GitHub instead.
- Includes everything in 0.2.0: directions you can preview, tweak, apply and save as presets, and the fixed Lukuluku Look effect.

## 0.2.0
Colored Lens now asks what a shot is for and suggests looks you can preview, tweak, apply and save.
- Shot: read the frame, say what the project is, how the scene should feel and what the shot is, and get directions you can preview on your own frame with a before / after wipe. Each one says what it will do to this frame and to faces.
- Tweak: adjust any direction with a live preview on your frame, then apply it or save it.
- Presets: save looks with what they were for, apply them to other shots (adapting to each shot's exposure and balance), and share them as a code.
- Fixed: the Lukuluku Look effect no longer turns clips black in Premiere Pro, and its dropdowns no longer land one option off.
- The neutral look now leaves Rec.709 footage untouched, so a look only changes what it says it changes.
- Truer readings: letterbox bars, deep shadow and blown highlights no longer count as the colour of the shot, skin checks only face-sized regions and use the usual 40–75 IRE range, and you can click a face to check it.
- Scene (the colour script) only talks about motifs and omens when you say the piece tells a story.

## 0.1.4
Fixes from the first real session in Premiere Pro.
- Read, Skin, Script and Look work again: frame grabs no longer fail with "format not supported" (Colored Lens now reads PNG and JPEG grabs, and waits for Premiere to finish writing them).
- The panel scrolls, with the tabs and header kept in place.
- New sliders: drag or click to set, double-click to reset, type an exact value in the box. Trackpad scrolling scrolls the panel instead of moving a slider.
- The active tab is clearly marked.

## 0.1.3
The Lukuluku Look effect for Premiere Pro now installs on Mac too (0.1.1 and 0.1.2 brought it to Windows only).

## 0.1.2
Build fixes for the Mac Premiere effect.

## 0.1.1
The Lukuluku Look effect now comes to Premiere Pro.
- Premiere Pro: the Colored Lens panel's Apply adds the Lukuluku Look effect to the selected clips and sets every setting, including Skin Guard and Match to Reference. Grain, halation and glow now work in Premiere.
- Windows: the Premiere effect installs to Adobe's shared plug-in folder.

## 0.1.0
First release of Colored Lens Studio.
- Colored Lens panel for Premiere Pro and DaVinci Resolve Studio: Read (frame reading in the encyclopedia's terms), Skin (§7 as a live check), Script (color script from markers or a scan), Look (Lukuluku looks, Skin Guard, Match to Reference), Library (the full encyclopedia, searchable).
- Lukuluku Look effect: OpenFX for Resolve (free and Studio) and an effect for Premiere Pro, with Skin Guard and Match to Reference.
- Content (encyclopedia, frames, looks, LUTs) updates by itself from GitHub; new versions install with one click from the panel.

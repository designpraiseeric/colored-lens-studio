# Release notes
Each `## <version>` block becomes the text of the in-app update banner and the GitHub Release.

## 0.5.1
- Mac: updating no longer leaves the Colored Lens Helper stopped ("the helper is not running"). The installer now waits for the old helper to close before starting the new one.
- Everything in 0.5.0: the brighter DesignPraise colours and the Simple view.

## 0.5.0
A brighter look and a simpler panel.
- New colours from the DesignPraise palette: a bright panel with violet as the main colour, amber and magenta accents, and a gradient header. Prefer dark? Press "Dark" at the top right.
- Simple view is now the default: one question (how should the scene feel), a one-line reading, and the top three directions. "Show details" at the top right brings back every measurement, the skin check and all directions.
- "More questions" and "Show more directions" open just the part you want.

## 0.4.2
- Mac: if Adobe's plugin installer fails (it does when the Creative Cloud app is closed), the installer now hands the panel to Creative Cloud itself, which asks you to confirm. Before, the panel could silently stay on the old version.
- The installer no longer gets stuck on "Running package scripts".
- Everything in 0.4.0: Apple Intelligence through the Colored Lens Helper, the hands-on tour, step-by-step Smart setup, and a wipe you can drag.

## 0.4.1
- The Mac installer no longer gets stuck on "Running package scripts" when the Creative Cloud app is closed. It finishes straight away and the Premiere panel is installed in the background.
- Everything in 0.4.0: Apple Intelligence through the Colored Lens Helper, the hands-on tour, step-by-step Smart setup, and a wipe you can drag.

## 0.4.0
Apple Intelligence, a hands-on tour, and a wipe you can drag.
- Apple Intelligence on Mac: Smart mode can now use the AI built into your Mac. Free, private, nothing to download. The installer adds a small Colored Lens Helper that connects the panel to it. "Automatic" picks it first when it is ready.
- Ollama on Mac now works from Premiere Pro (it goes through the same helper).
- The wipe is smooth: drag the Wipe slider, or drag straight across the picture. A plain click on a face still checks skin.
- The tour is now hands-on: it outlines each part of the panel in turn, explains it, and waits while you try it. A sample picture is offered if no sequence is open. It is always under "Guide".
- Smart mode setup is one small step per screen, with "You should see" for every step and help when something did not happen.
- Mac users: this update needs the installer (not just the panel) so the helper is added. Use "Install update" and enter your Mac password when asked.

## 0.3.1
A guide for new users, and Smart mode setup anyone can follow.
- A one-minute tour opens the first time you use Colored Lens, and is always under "Guide" at the top of the panel.
- Set up Smart mode step by step for your computer: plain-language steps, buttons that open the right pages, one-tap copy for the one line you paste, and a button that checks it worked and switches Smart mode on.
- Prompts you can copy into any AI assistant for a patient, hand-held walkthrough of the plugin or of the Smart mode setup.
- The pop-out preview now fits its panel and follows it when you resize.

## 0.3.0
Smart mode: an optional AI that looks at the frame, talks it through with you and picks looks. Free to you.
- Choose where it runs: Ollama on your computer (free and private), a local OpenAI-compatible server such as Microsoft Foundry Local or LM Studio, or Google Gemini with your own key (free tier). "Automatic" uses Ollama when it is running, otherwise your Gemini key.
- In Shot, ask about the frame or tell it what the scene needs ("warmer, but not nostalgic"). It says what it sees and what the colour is doing, asks short questions you can tap to answer, can suggest answers to "What is this for?" (you decide), and adds Smart picks to the directions.
- It only picks from Colored Lens's own recipes, with small adjustments inside safe limits, so every Smart pick previews, tweaks, applies and saves like any other direction.
- API keys are kept in your computer's secure storage. Off by default; with it off, nothing leaves your computer.
- Apple Intelligence and the Windows AI on Copilot+ PCs come later through a small helper app; on Windows, Foundry Local works now through "Local server".

## 0.2.9
The preview can have a panel of its own.
- "Pop out" opens the preview as its own Premiere panel (Colored Lens Preview): dock it beside the Program Monitor or anywhere you like, and the Colored Lens panel is all options. It is also under Window › UXP Plugins.
- "Bring it back" returns it to the Colored Lens panel.

## 0.2.8
Continuity at the cut, found in a real edit.
- "The shots either side" are now whatever is on screen just before this shot cuts in and just after it cuts out, on any track (for a nested B-roll layer, the cut of the clip inside it), not the neighbouring pieces on the same track.
- Clearer wording when a look moves a shot toward its neighbours but not all the way ("Even with this look it stays darker than the shots either side").

## 0.2.7
The preview stays in view.
- The before / after preview now sits above the options in Shot and Tweak, so it stays put while you scroll and adjust.
- Three preview sizes (S, M, L), and a button to hide it when you need the room.
- Apply, Tweak and Save for the chosen direction sit right under the preview.

## 0.2.6
Layout fixes from a vertical edit.
- Vertical (9:16) frames preview at a sensible size, so the buttons stay in view.
- The "Apply to" choices sit on one row, and choices with nothing to apply to are clearly greyed out.

## 0.2.5
Nested sequences, found in a real edit.
- Colored Lens looks inside nested sequences: a wrapper nest (a B-roll layer, say) that is empty at the playhead is no longer mistaken for the shot, and a nest with content is named with the clip showing inside it.
- "Whole scene" no longer recolours a nest that runs the length of the timeline; only nests that sit inside the scene.

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

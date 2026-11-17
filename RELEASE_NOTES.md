# Release notes
Each `## <version>` block becomes the text of the in-app update banner and the GitHub Release.

## 0.10.3
Reading a frame tells you when it fails, and tries a second way first.
- **A failed read stays on screen.** It used to say what went wrong in a message that faded after six seconds — on a job that can take a minute and a half, by which time you have looked away. Now the reason sits in the Shot tab with what to try, and a **Show what Premiere wrote** button listing the folders that were watched and what was actually in them.
- **A second place to look.** On some installs Premiere reports that it exported the frame and never writes it anywhere the panel can see. If nothing appears in Premiere's own temporary folder after nine seconds, the frame is asked for again in your ColoredLens folder, and both are watched from then on — by the exact name Premiere was given, which works even where listing a folder is refused.
- **The wait says how long it has been waiting**, and it now runs to a minute and a half rather than a minute.

## 0.10.2
Superseded by 0.10.3 the same morning.
- **A failed read stays on screen.** It used to say what went wrong in a message that faded after six seconds — on a job that can take a minute and a half, by which time you have looked away. Now the reason sits in the Shot tab with what to try, and a **Show what Premiere wrote** button listing the folders that were watched and what was actually in them.
- **A second place to look.** On some installs Premiere reports that it exported the frame and never writes it anywhere the panel can see. If nothing appears in Premiere's own temporary folder after nine seconds, the frame is asked for again in your ColoredLens folder, and both are watched from then on.
- **The wait says how long it has been waiting**, and it now runs to a minute and a half rather than a minute.

## 0.10.1
Colour zones keep their hands off faces, and a pick means what you clicked.
- **Skin Guard now holds the colour zones back too.** A zone aimed at a wall used to paint the shadows on a face, and Skin Guard could not take it back: the guard only ever puts colour into skin, it never removes colour something else added. Zones now obey Skin Guard directly, so a face stays a face while the rest of the shot moves. Raise Skin Guard to protect more, drop it to zero to colour skin on purpose.
- **Picking a colour grabs the colour, not the average.** Clicking a striped shirt used to average the stripes into grey, and a grey pick quietly turned the zone into "every neutral in the shot". The picker now finds the dominant colour under your cursor and takes that.
- **Zones say what they are.** A zone you picked is named for what it grabbed — "The orange you picked", "The greys and neutrals" — instead of "Zone 3".
- **A neutral zone no longer pretends to have a hue.** When a zone grabs the greys, the hue controls that do nothing in that mode are gone, and it tells you to add colour before choosing which.
- **How wide a slice of the wheel** is drawn as the wheel around the hue you picked, with everything outside the slice drained of colour, so widening it visibly swallows its neighbours. The rails repaint as you drag.
- **Apply tells the truth for every destination**, not just "This clip": it names the source, the scene with its clip count, or the adjustment layer it will land on.
- **Saturation's rail** runs grey to vivid in your own shot's leading colour, instead of grey to blue.
- **Vertical footage** gets more of the panel's height, and says when the preview would be bigger popped out.

## 0.10.0
Colour zones you can see and pick yourself.
- **Sliders show their colours.** Every hue slider is the colour wheel itself, with your own frame's colours marked underneath as small ticks, so you can see what you are picking and where you are heading. Colourfulness, brightness, exposure, saturation and temperature sliders are painted the same way.
- **Pick any colour straight from the picture.** Press "Pick a colour from the picture" in Tweak and click the wall, the shirt, the sky: Colored Lens makes a zone from exactly that colour, and you move it wherever you like. No AI needed, no mask.
- **Eight zones instead of four**, so you can re-colour that many separate parts of one shot at once.
- Each zone is its own card with a before-and-after swatch, how much of the picture it is really changing, and buttons to re-pick it or remove it.

## 0.9.1
From a second stress test in Premiere Pro.
- **Strength.** Every direction now has a Strength slider next to the wipe: push a look harder or pull it back without opening Tweak. Many looks are deliberately gentle and looked like nothing on a bright shot.
- **Apply now says what it will really do.** It reads "Apply to the shot under the playhead" when nothing is selected, "Apply to the selected clip", or "Apply to 3 selected clips". Before it always said "Apply to selected clips", even when it was about to use the clip under the playhead.
- **Scanning a sequence no longer runs for an hour without warning.** Colored Lens reads one frame first to see how slow your timeline is, then tells you how long the whole scan will take and lets you go on, stop, or widen the gap. There is a Stop button while it runs, and the seconds you set are remembered.
- The colour script says how many frames it is based on, and warns when that is too few for a confident reading. Each shot in the list now has a thumbnail.
- The Scene and Presets tabs open with how to get started, instead of a setting and a wall of explanation.
- Encyclopedia pictures no longer come out squashed in Premiere Pro.

## 0.9.0
The Tweak tab, rebuilt — and a bug that was throwing away the AI's suggestions.
- **Fixed: "The AI did not return usable suggestions."** Colored Lens was discarding whole suggestions when the AI named an item slightly differently from its own list of the frame ("her skin" against "Woman's skin"). It now matches them properly.
- **Tweak is no longer a wall of sliders.** It opens with what matters: what you are tweaking and where it came from, the four controls that change a shot most, the colour zones, the strength of the look and Skin Guard. "All controls" opens everything, including match to reference and LUT export.
- Any slider you have moved is marked **CHANGED**, and each card has a "Put back" button that undoes just that card.
- Controls that cannot do anything are hidden: no Grain slider when the look has no grain, and so on, with a line saying why.
- Opening Tweak with nothing read now explains what to do instead of showing a live Apply button over an empty look.
- Film look names have lost their codes ("Kodak print film", not "C1 Kodak print film"), and dropdowns are readable again.

## 0.8.3
- Claude is now one of the AIs Colored Lens can use: the strongest readings of a frame and the most useful colour ideas. Choose it under "AI" and paste a key from the Claude Console, or follow the new step-by-step setup. It is paid by use (roughly a penny or two a read) and is not covered by a Claude Pro subscription; pick Opus 5, Fable 5.2, Sonnet 5.5 or Haiku 5.5.

## 0.8.2
More fixes from testing in Premiere Pro.
- The preview now sits beside its controls and takes about a third of the panel at most, so there is room to read underneath (it was taking half the panel).
- The AI no longer lists things that are not in your frame because of other moments in a nested sequence: for "This shot" it studies the frame alone, and a small local AI is never sent the extra moments.
- When Google's free limit runs out, the message offers "Use the AI on this computer for now". The AI card always names the AI that is set now.

## 0.8.1
Fixes from a full test in Premiere Pro.
- The page no longer jumps or closes a suggestion when you press a button inside it; a suggestion opens and closes from its title only.
- A zone is no longer created for a small item whose colour is all over the picture (it said "changing 34% of the picture" for a glint on glasses). Those items are listed as needing a mask.
- Suggestions can no longer mention things that are not in your frame, and one that would not actually change anything is dropped. Items that stay the same are shown as "stays".
- The AI on your own computer (Ollama): asks for fewer suggestions, recovers when it gets stuck repeating itself, and says plainly that a small local model gives simpler advice.
- Encyclopedia pictures are small thumbnails in a row instead of full-width images.
- Text boxes no longer have a heavy two-tone frame. The Tweak tab always shows the preview. Quick looks no longer repeat the same opening sentence.

## 0.8.0
- "On your preview now" is measured, not assumed: for each item it says how much of your frame the zone is really changing, or that it is finding nothing and which slider fixes it. It updates as you tweak.
- Colour zones have their own sliders in the Tweak tab (amount, pick hue, hue width, new hue, new colourfulness, ambience).
- "How to finish this look" is a proper walkthrough in three parts: what is already done, how to correct a zone, and click-by-click masking for items colour alone cannot separate.
- The list no longer jumps away after "Try this on my frame".
- "Show the AI's picture": the AI repaints your frame to show the idea, for comparing with the real preview. This uses Google's image models, which need billing switched on for your key (about 3 US cents a picture); on a free key it explains that instead.
- The encyclopedia now shows its reference pictures, in the Encyclopedia view and under each suggestion's references.
- "Open in Lukuluku" works in Premiere Pro.

## 0.7.2
- Fixed "The exported frame did not appear": Colored Lens now waits up to a minute for Premiere to render the frame on heavy timelines (it gave up after six seconds), and says so while it waits.
- Reading a shot now switches off every Lukuluku Look in the picture for the read, including one on an adjustment layer above the shot, so the reading is of the shot itself and the frame renders faster.

## 0.7.1
Suggestions you can actually see: colour zones.
- "Try this on my frame" on a suggestion now builds it for real: the overall Lukuluku look, the ambience colour, and up to four colour zones that move each item (picked by the colour it has now) to its proposed colour. Before, it only showed one of the standard looks.
- Apply puts all of that on your timeline as one Lukuluku Look effect. The zones are sliders named "Zone 1…4" and "Ambience" in the effect, so you can fine-tune them. This needs the new effect, so use the installer.
- It tells you what it changed and what it could not (two items of the same colour need a mask), and "What is left to do by hand" gives the exact steps for those.
- Skin is kept natural by Skin Guard while zones are on.
- Apply to adjustment layer now uses a layer named "Colored Lens" if you have one, otherwise the adjustment layer closest above the shot (not the top of the stack).
- The steps now show properly in Premiere Pro.
- Sharper suggestions: the AI is now asked for concrete plans (which item takes which colour, which one is the accent, which palette structure) across a wide range, from corrective to bold, instead of mood names; and only references that explain the idea are shown.

## 0.6.3
- Gemini: when Google's model is busy ("high demand") or retired, Colored Lens now waits, retries, and moves to another current Flash model by itself instead of showing the error.

## 0.6.2
- Gemini: the frame is now sent as a small JPEG instead of a large PNG (about a tenth of the size), so the AI answers on ordinary internet connections instead of timing out.
- Gemini: the model name follows Google's current Flash model automatically, and Google's errors (invalid key, free limit reached, country not supported) are explained in plain words.

## 0.6.1
- Fixed: a saved Gemini (or local server) key was not being read back in Premiere Pro, so the AI said the key was missing. Keys saved earlier are picked up; if not, paste the key once more under "AI" and press "Save key".
- Everything in 0.6.0: the AI by default, the layer checklist, the study range, item-by-item study and colour suggestions.

## 0.6.0
Colored Lens is now built around its AI.
- The AI is on by default ("Automatic" uses the best one your computer has). If none is set up yet, Colored Lens offers the three-minute setup; the quick looks still work without it.
- "In this frame": every layer in the picture is listed with a tick. Untick one (a title, say) and read again to leave it out of the reading and of the AI's advice.
- Choose what the AI studies around the shot: this shot, its scene, your In to Out range, or the whole sequence. It looks at several moments across that range.
- "What the AI sees": every item it can find in the frame with its colour, the light, and what the shot seems to be for in its scene. Tell it what it cannot know, or correct it, in the chat box.
- "Suggest colours and looks": up to ten directions. Each says what colour to give which item, what that tells the audience and why, with references from the encyclopedia, a Lukuluku look you can preview, and step-by-step instructions for the item-by-item colours.
- Mac: the helper now starts reliably after an update.
- Item-by-item colour in one click (colour zones in the Lukuluku effect) is the next update.

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

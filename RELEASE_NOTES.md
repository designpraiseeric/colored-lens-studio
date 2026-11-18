# Release notes
Each `## 0.21.0

**Outline the items with AI masks.** A place is a box, so everything of a similar colour inside it changed too: on the forest shot, the woman's golden-brown hair and beige shirt went terracotta with her camo jacket. After trying a suggestion, "Outline the items with AI masks" asks Gemini for a segmentation mask of each placed item and turns it into an outline of up to 24 points on the effect.
- Each colour then stops at its item's edge, in the preview and on the clip (the effect has up to four outlines, in a new "Zone outlines" group).
- An outline is stored relative to its place, so when a place is followed through the shot (keyframed in After Effects), the outline moves with it.
- The background keeps out of the outline, not the whole box, so the forest's colour comes right up to the jacket.
- It needs Gemini (it draws the masks); other AIs keep the boxes.

**Fitting a look no longer weakens the item colours.** When a look is brought down to fit a shot (blown highlights, say), the item colour changes stay at full: they already roll off near white and do not cause those faults. Fitted to 68%, the mustard vest had come out khaki. The Strength slider still scales everything.

## 0.20.2

**Three colour families on one olive now land.** Tried live on the forest shot ("mustard vest, terracotta camo, dark teal forest"), 0.20.0 barely moved anything. Four causes, all fixed:
- Two colours count as the same when they are within 32° (a zone's own reach), not 18°. The vest (86°) and the forest (104°) were treated as different, and the forest's teal landed on the vest.
- An item with a place in the frame is always kept to that place, not only when its colour fills half the frame. Three zones reaching for one olive everywhere fought over every pixel of it.
- The background keeps out of every placed item, whatever its colour.
- Each zone's colour window is now centred on the item's own colourfulness. It was centred far above it, so every target landed at half strength.
On the real forest frame: vest 86° → 81° (mustard, asked 84°), camo 74° → 44° (terracotta, asked 40°), forest 104° → 186° (teal, asked 189°), each two to three times as colourful as before.

Known limit: inside the jacket's place, her hair and beige shirt share the camo's olive-brown and change with it. Colour and a box cannot separate them; that needs a matte of the item.

## 0.20.1

- A garbled answer from the AI is repaired where possible (a quote inside a sentence, a trailing comma, a reply cut off part-way), and otherwise asked for once more, instead of showing an error like "Expected ',' or ']' after array element".
- Waiting on a busy Gemini now stops at about three minutes, as intended; slow calls could stretch it longer.

## 0.20.0

**The background can keep out of several items at once.** In 0.19.0 a forest could keep out of one item of its colour. Now it keeps out of every placed item that shares its colour, so the forest, the boy's olive vest and the woman's olive camo can each go to a different colour family. On a test frame where all three share one olive, they land on mustard, rust and slate teal, each near the colour asked for.
- The background's colour change now goes all the way. Toward a quiet colour like slate, leaving 15% of the old olive pulled the hue about 35° back toward it.

**Milky blacks: the black point is set back, not the whole look.** When a look lifts the blacks to a milky grey, the panel first pulls the Lift wheel down by the smallest amount that clears it without crushing anything, and says so. Only what is still wrong after that turns the strength down. Turning the strength down had taken the accent colours with it: the mustard vest came out pale khaki.

**Following placed colours through the shot works on moving shots.** Frames are now read a quarter of a second apart (about two seconds either side) instead of about 1.3 seconds. On the forest dolly shot, 1.3 seconds apart the boy's vest matched at only 50% as he turned and the trees slid behind him; a quarter second apart it matched at 86–89%. When a colour is lost, the panel says how close the best match was.

**Gemini keeps trying when it is busy.** Instead of giving up after one quick pass, Colored Lens retries in rounds (10, 20, 40 seconds apart, up to about three minutes) and the panel says it is waiting.

## 0.19.0

**The background can change colour around an item of the same colour.** On the forest shot, "a mustard vest in a muted slate forest" turned the vest mustard but left the forest green: the forest shares the vest's olive, so changing it would have changed the vest too.
- Now, when the background (foliage, sky, a wall, a field) shares its colour with one placed item, the background's zone acts everywhere except that item's place. The forest goes slate and the vest goes mustard.
- The panel says so: "everywhere except where the boy's vest is". In Tweak the zone is marked "Keeps out".
- The background is no longer refused for covering most of the frame. It is meant to.
- Like any placed zone, this is left out of exported LUTs.

**Milky blacks are caught.** A grade that lifts the darkest part of the picture to a milky grey (the same suggestion took the forest's blacks from about 16% to 25% grey) is now one of the faults the fitter dials a look back from. Looks whose point is faded blacks (Faded Eterna, Pastel mist, Fogbound) are allowed it.

## 0.18.0

**Placed colours can follow their item through the shot.** A colour change that has a place in the frame (0.17.0) was placed for the one frame you read, so a walking subject left it behind. After trying a suggestion, "Follow the placed colours through the shot" reads a few frames either side within the clip (up to about 4 seconds each way), follows each placed item by what it looks like, and moves its place with it.
- In After Effects, Apply puts these places on the effect as keyframes, in the same single undo step.
- In Premiere, for now, each place stays where it is in the frame you read; following will come to Premiere once it is tested there.
- If an item changes too much between frames (it turns away, or something passes in front of it), following stops at that point and the panel says when; the place stays put from there rather than drifting onto the background.
- It takes as long as reading that many frames, and Stop is there if you change your mind.

After Effects: the panel now writes how long each step of opening takes (in ColoredLens/cep_timing.log), to find out why it can take about 20 seconds to appear.

## 0.17.0

**Per-item colour now works on muted footage.** On a forest shot every colour suggestion used to collapse to "Only the overall look": the boy's olive vest shares its colour with most of a forest, so a colour zone could not pick it out. Now each colour zone can also have a place in the frame.
- Gemini gives a box for each thing it names, and a zone acts only inside that box (softly, fading out before the box's edge). Two items of the same colour in different places, like an olive vest and an olive jacket, each get their own zone.
- With an AI that does not see the picture, or a reading saved earlier, the place comes from the AI's own words ("centre-left, torso"), more roughly.
- On the forest test shot, suggestion 1 went from changing only the sky to changing the vest, the jacket, the path and the sky, with nothing clipped and the faces untouched.
- The panel says when a zone has a place, and that a subject moving out of it during the shot needs a mask. The Tweak tab shows where it is and has "Let it act anywhere".
- Picking a colour from the picture: if that colour is in nearly half the frame or more, the zone stays around where you clicked, and the panel tells you.
- A .cube LUT cannot know where a pixel is, so a zone that has a place is left out of exported LUTs rather than painted over the whole frame.
- Update the effect too: the places are new settings on the Lukuluku Look effect (the installer does this).

## 0.16.0

**Several Gemini keys, used in turn.** Saving a Gemini key under “AI” now adds it to your saved keys instead of replacing the last one. When Google says a key has reached its free limit, Colored Lens moves on to the next saved key by itself and lets the tired one rest: about a minute for a per-minute limit, until midnight Pacific time for the daily one. The AI settings list your keys (shown as AIza…1234) with when each is ready again, and each can be removed. Your current key is kept as the first one.

**After Effects panel, installed with Colored Lens Studio.** After Effects 2027 does not load the new kind of panel yet, so the After Effects panel is now the classic kind that every recent After Effects runs: open it from Window › Extensions › Colored Lens. It reads the comp at the current time, studies it, and applies the Lukuluku Look to the selected layer (or the one at the current time) in one undo step. Fixed while testing it in a real project:
- every setting of the look is set, including the two that share their name with a group (“Skin Guard”, “Lift the face”); if a setting ever cannot be set, the panel names it;
- the panel speaks After Effects (current time, comp, precomp, layer);
- the timecode follows the comp's own start time;
- if After Effects stops answering scripts, the panel says so after 90 seconds instead of waiting forever.

## <version>` block becomes the text of the in-app update banner and the GitHub Release.

## 0.15.0
**Colored Lens for After Effects, first preview** — and more fixes from going through every tab in Premiere.
- **After Effects 2027 gets its own Colored Lens panel**, the same panel as Premiere working on a composition: it reads the frame at the current time, sees the layer stack, and Apply puts the Lukuluku Look on the selected layers (or on a "Colored Lens" adjustment layer it creates), all in one undo step. Install `ColoredLens-AfterEffects-preview-0.15.0.ccx` from this release. It is a preview: it has not yet been run on a real After Effects, and reading a frame in particular may not work yet.
- **"Share code" on a preset did nothing.** It now opens the code right under the preset you clicked, copied and ready to paste. Pasting a Lukuluku link had the same weakness and is fixed too.
- **A colour you pick is named for what it is.** An olive jacket was announced as "the amber you picked", because the encyclopedia has no olive or brown; zones are now named olive, khaki, brown, teal and so on.
- **A reading brought back from earlier now keeps its notes**: whether that AI could see the picture, and whether its suggestions were made before something you told it.
- "Adjusted for this frame" no longer lists adjustments that change nothing ("exposure 0").

## 0.14.1
Fixes from going through every tab of 0.14.0 in a real project.
- **"Scan the sequence" was broken.** It stopped on its first frame with an error. It scans again.
- **The panel could stop responding to clicks with nothing on screen to say why.** Anything that goes wrong while drawing the panel now shows a card saying what broke, with a button to get back, instead of freezing; and the error is written to Premiere's log in full, so it can be found and fixed.
- **Apple Intelligence was reported as "not available" when it was simply asked too much at once.** Its window holds about 4,000 tokens for the question and the answer together, and the suggestions request was over 3,000 before any conversation. It is now about half that, the conversation is dropped first if room runs short, and if it still does not fit it says so plainly.
- **The note under Apple Intelligence's reading was wrong.** It said the AI could not look at the picture and worked only from measurements; in fact it also gets the names of things your Mac recognises in the picture. It now says that, and that positions and exact colours are its best guesses.
- **"Skin Guard" appeared twice in Effect Controls.** The second one is "Lift the face", and is now labelled that. (In Resolve the same mistake defined one control group twice.)
- "in a analogous structure" now reads "in an analogous structure".

## 0.14.0
Suggestions that brighten a face now brighten the face, and the AI stops making you wait twice.
- **The AI was brightening dark faces with whole-picture exposure.** Asked to fix an underexposed face, it reached for about +1.2 stops on the whole frame. In front of a bright wall that blew almost a third of the picture to white and lifted the face's highlights five times more than its shadows, which is why the panel refused two suggestions in a row on your shot at any strength. A request like that now goes to "Lift the face", which brightens her shadows and leaves the wall alone, and the panel tells you when it has done so. The AI is also told plainly that exposure moves the whole picture.
- **Each suggestion now uses its own adjustments.** Suggestions that shared a film look were all borrowing the adjustments of whichever came first, so one bad exposure push spread to several.
- **Strength now scales everything, including "Lift the face" and colour zones 5–8.** The slider and the fitter were working from two different definitions; now they share one.
- **When a look does not suit the shot, you are told the worst two reasons, not just the first.** The first one was hiding "blows 31% of the picture".
- **Burned-in captions are no longer treated as things to recolour.** Change a caption's colour in the caption itself.
- **Suggestions start the moment the AI has studied the frame**, while you are still reading what it saw, instead of waiting for you to press Suggest.
- **Reading the same shot again brings back what the AI already said about it**, at once, instead of costing another two to four minutes. "Study it again" is there when you want a fresh one.
- **The AI's progress shows the seconds as they pass, and there is a Stop button.** Telling the AI something while suggestions are being worked out no longer has to wait for them; if the suggestions on screen were made before what you said, the panel says so.

## 0.13.0
The encyclopedia's palette structures are now something you use, not just something you read.
- **Pick a structure, point at a thing, point at a colour.** Every colour zone you have set up — picked from the picture, or built by a suggestion — is listed with how much of the frame it covers. Tap one, tap a swatch from the structure, and it takes that colour. The rest of the shot is left alone.
- **Or deal the whole structure across everything at once**, and keep re-dealing until you like one. Each deal is numbered, so a deal you liked can be asked for again.
- A deal is not a lottery. The most colourful swatch in a structure is its accent, and an accent on the biggest surface in the frame is how a palette reads as a mistake — so it is dealt to the smallest. Structures that have no accent, like Monochromatic, get no such rule.
- **Every deal is measured before you see it.** If it would blow the highlights or damage a face, it is thrown away and another is tried; if nothing clean can be found, you are told what is wrong with the best of them rather than being handed it quietly.
- Pressing "Try another" never hands you back the deal already on screen. If there genuinely is no other way to deal that structure across those items, it says so.

## 0.12.2
"Lift the face" was lifting the room with it.
- A lift by skin weight reaches anything skin-coloured, and this shot has a warm wall and a wooden door. Lifting the face was therefore lifting those too, and blowing them. A lift is for **shadows** now: a bright skin-coloured surface gets almost none of it, and what is left can never push a pixel past white.
- **A colour zone can no longer spend room the picture does not have.** It brightens freely until the picture runs short, and beyond that only as far as the shot already reached. Colour piled onto a near-white area — a zone's colour, and the ambience — rolls off the same way, because that is what pins a channel and twists the hues at the top. Taking colour away is untouched: it was never the problem.
- Measured on the shot all of this was found on, building a grade item by item now adds **no clipping at all** over the plain overall look, where yesterday it added six per cent of the picture. Two looks still cannot be worn by this shot at any strength, and the panel still says so rather than offering them quietly.

## 0.12.1
Talking to the AI is no longer as slow as asking it to start over.
- **Answering one of its questions took as long as a fresh study** — a minute or two — because telling it anything re-ran the whole inventory of the frame. It now replies to what you said, keeping the reading it already has, and only changes the parts your answer actually changes. The contact sheet is not sent again either.
- **Tapping one of its questions used to paste the question into the box**, so pressing Send without looking asked the AI its own question back. The question now sits above the box as "Answering: …" and the box is yours for the answer alone, which travels with it.

## 0.12.0
Dark skin is recognised as skin, and a face that is too dark can finally be lifted.
- **The skin model excluded deep skin.** It started at hue 28° and colourfulness 0.022; a real subject in this project measures 24.1° at 0.0158, so every protection built on it — Skin Guard, the hold that keeps colour zones off faces, the checks that say whether a grade damaged a face — scored her face at 0.001 and looked straight through her. The gamut used for protection is now wide enough for the skin that actually turns up in front of this plugin. Finding a face and protecting one now use separate gamuts, because they want opposite things.
- **"Lift the face" is a new control**, in the Skin Guard card. A colour zone is picked by colour, and a dark face's shadows are exactly where the colour runs out, so the pixels that most need lifting got the least of it. This lifts by how much a pixel reads as skin instead, so it reaches them — and it is what a suggestion asking for a brighter face now uses.
- On the shot this was all found on: the face comes up 0.093 in the shadows with a tenth of a per cent of clipping, where the best suggestion this morning lifted it by blowing a tenth of her face to white. She now separates from the wall behind her instead of sinking into it.
- Across the catalogue, looks that damage a picture: **1**, down from 35 this morning.

## 0.11.1
The per-item half of a suggestion finally fires on real footage.
- **A suggestion that wants a brighter face now gets one.** "The face is underexposed" is the commonest thing wrong with a shot, and a colour zone is the only tool that can answer it — but skin was refused outright, so the plugin could spot the problem and had no way to act on it. Skin now gets a zone that moves its exposure while its colour stays with Skin Guard. A suggestion that wants to repaint a face still does not get one.
- **A pale colour is a colour.** Anything under 0.035 colourfulness was treated as grey, which on real footage meant a mint shirt, a cream wall and a shadowed doorway were all the same thing and none of them could be targeted. The line is now where grey actually begins, so soft colours in a room can be moved on their own.
- Together these are why "Only the overall look could be previewed for this one" came back on nearly every suggestion.

## 0.11.0
Every look is now fitted to the shot instead of landing at full strength on whatever arrives.
- **Looks are brought down until your picture can carry them.** A contrast look used to clip a bright face and crush a dark one, because it was built at one strength and applied at that strength to everything. Colored Lens now measures what the look does to your frame and backs it off, the way a colourist would — and tells you, in a line under the preview, how far it came down and what it was doing at full strength. Drag Strength back up any time you want it anyway.
- **A look that does not suit a shot says so**, instead of being quietly offered. You still see it, so you can judge for yourself.
- **Skin Guard holds skin on the skin-tone line.** It used to resist a hue shift proportionally, which meant a strong enough look still dragged skin 13° to 22° away. The drift is now capped, so skin stays skin. It also holds skin out of both ends of the scale — it only ever resisted darkening before, so nothing stopped a look blowing a face to white — and holds back colourfulness piled onto skin, not just colourfulness drained from it.
- Measured across the catalogue on three kinds of frame, this takes the number of looks that damage a picture from 35 to 2.

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

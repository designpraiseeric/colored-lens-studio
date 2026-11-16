// The guide: a short first-run tour of Colored Lens, a step-by-step setup for Smart mode written for people who
// have never opened a terminal, and prompts to paste into any AI assistant for a slower, hand-held walkthrough.
// The hands-on tour. Each step points at a real part of the panel (sel), on a tab, explains it, and where it says
// `wait` asks the user to do the thing ("frame": read a frame; "feeling": tap an answer; "chosen": pick a direction).
// Steps marked opt are skipped when their part of the panel is not on screen.
export const COACH = [
  { tab: 'shot', sel: '.tabs', t: 'Welcome. This is Colored Lens.', b: 'It reads a shot, asks what it is for, and suggests looks you can try on your own picture. Let\'s grade one shot together: it takes about two minutes, and nothing is changed in your project unless you press Apply.' },
  { tab: 'shot', sel: '.tabs', t: 'Four tabs', b: 'Shot is where you work on one shot. Scene looks at the whole sequence. Tweak has every setting of a look. Presets keeps the looks you save. Colored Lens starts in a simple view; “Show details” at the top right reveals everything it measured.' },
  { tab: 'shot', sel: '#grab', t: 'Read a shot', b: 'In your timeline, park the playhead on a shot. Then press this button. Colored Lens takes a picture of that frame and studies it.', wait: 'frame', do: 'Press “Read the frame under the playhead” now.', sample: true },
  { tab: 'shot', sel: '#dock', t: 'The preview', b: 'This is your frame. It stays here while you scroll. When you try a look, you see before and after: drag across the picture, or the Wipe slider, to compare. S, M and L change its size, and “Pop out” gives it a panel of its own.' },
  { tab: 'shot', sel: '.card.ctx', opt: true, t: 'What it read', b: 'Colored Lens names the clip it read and anything layered above it, such as titles or adjustment layers. It also tells you how this shot sits next to the shots before and after it.' },
  { tab: 'shot', sel: '#reading .card', t: 'What the picture is doing', b: 'One sentence on the picture and its main colours. If there are people, click a face in the preview to check its exposure and skin colour. “Show details” at the top adds the full measurements and the skin check.' },
  { tab: 'shot', sel: '#intent', t: 'Say what the shot is for', b: 'Tap how the scene should feel. You can tap two when it is more than one thing. “More questions” lets you also say what the project is and what kind of shot this is. Your answers are remembered.', wait: 'feeling', do: 'Tap one answer under “This scene should feel”.' },
  { tab: 'shot', sel: '#scope', opt: true, t: 'What is in the frame', b: 'Every layer that makes up this picture is listed and ticked. Untick one (a title, say) and press “Read again” to leave it out of the reading and of the AI\'s advice. Below, choose how much around the shot the AI should study: this shot, its scene, your In to Out range, or the whole sequence.' },
  { tab: 'shot', sel: '#aicard', opt: true, t: 'What the AI sees', b: 'The AI lists what it can see, item by item with its colour, then says what the shot seems to be for in its scene. If it got something wrong, or there is context it cannot know, type it in the box and press “Tell the AI”. Then press “Suggest colours and looks”: each suggestion says what colour to give which item, what that tells the audience, why, and where to read more in the encyclopedia.' },
  { tab: 'shot', sel: '#dirs', t: 'Quick looks', b: 'These are whole-picture looks chosen by Colored Lens\'s own rules for this picture and your answers. Each one says what it will do to this frame and to faces, and whether it will match the shots around it.', wait: 'chosen', do: 'Click one of the looks.' },
  { tab: 'shot', sel: '#dock', t: 'Compare, then decide', b: 'The preview now shows before and after. Drag across the picture to compare. “Apply to” chooses where the look goes: this clip, every clip from the same source, the whole scene, or an adjustment layer. “Apply” puts it on your clip in one undo step. You do not have to apply anything now.' },
  { tab: 'tweak', sel: '#body .cols', t: 'Tweak', b: 'Every setting of the look, with the preview updating as you move things: the colour science, the film or video medium, lens and diffusion, then strength, grade and Skin Guard below. Double-click a slider to reset it.' },
  { tab: 'tweak', sel: '#saveNew', t: 'Save it as a preset', b: 'A preset keeps the look together with what it was for, so you can use it on other shots.' },
  { tab: 'presets', sel: '#body', t: 'Presets', b: 'Your saved looks live here. Apply one to other shots, let it adapt to each shot\'s exposure and balance, open it to change it, or share it with someone as a code.' },
  { tab: 'scene', sel: '#scan', t: 'Scene', b: '“Scan the sequence” reads a frame every few seconds and draws the colour of your whole edit as a strip, then tells you whether it matches the feeling you chose. Markers named “Scene 1 …”, “Scene 2 …” give each scene its own answers.' },
  { tab: 'shot', sel: '.links', t: 'Help is always here', b: '“Guide” brings this tour back. “Encyclopedia” is the full Colored Lens colour encyclopedia. “AI” chooses which AI Colored Lens uses.' },
  { tab: 'shot', sel: null, t: 'That\'s it', b: 'Read a shot, let the AI study it, tell it what it cannot know, ask for suggestions, preview, apply or tweak, save. You can take this tour again from “Guide”.', end: true },
];

/**
 * Setup routes for Smart mode, written for someone who has never opened a settings screen. One small action per
 * step: `t` the action, `b` how to do it, `see` what should happen, `fix` what to do if it did not.
 * Optional per step: url+label (a button that opens a page), copy (a line to copy), key (a box to paste a key),
 * check (the panel tests it for you: 'apple' | 'ollama' | 'gemini').
 */
export function routes(os) {
  const mac = os !== 'win', ret = mac ? 'Return' : 'Enter';
  const apple = { id: 'apple', n: 'Apple Intelligence (already in your Mac)', tag: 'Free · private · nothing to download · about 2 minutes', best: true,
    who: 'The easiest choice on a Mac with an Apple chip (M1 or newer). The AI is part of macOS, so your frames never leave your computer.',
    steps: [
      { t: 'Check that your Mac has an Apple chip', b: 'Click the Apple logo at the very top left of your screen, then click “About This Mac”. A small window opens.',
        see: 'Next to “Chip” it says Apple M1, M2, M3, M4 or newer.', fix: 'If it says “Processor … Intel” instead, this Mac cannot run Apple Intelligence. Press “Choose a different way” below and pick Ollama or Gemini.' },
      { t: 'Open System Settings', b: 'Click the Apple logo at the top left again, then click “System Settings…”.', see: 'A window opens with a list down its left side.', fix: 'On older versions of macOS it is called “System Preferences”. If that is what you see, update macOS first: Apple logo › System Settings › General › Software Update.' },
      { t: 'Switch Apple Intelligence on', b: 'In the list on the left, click “Apple Intelligence & Siri”. At the top of the page, switch “Apple Intelligence” on.',
        see: 'The switch turns green. Your Mac may say it is downloading; that is normal and can take a while on slow internet.',
        fix: 'If you cannot find “Apple Intelligence & Siri”: update macOS (System Settings › General › Software Update). If the switch is missing, set your Mac\'s language and Siri\'s language to the same supported language (for example English) in System Settings › General › Language & Region, then look again.' },
      { t: 'Let Colored Lens check it', b: 'Press the button below. Colored Lens asks your Mac whether Apple Intelligence is ready and, if it is, switches Smart mode on.', check: 'apple',
        fix: 'If it says it is still downloading, keep your Mac plugged in and on Wi-Fi, wait ten minutes and press the button again. If it says the helper is not running, install the newest Colored Lens Studio from the update banner, then log out of your Mac and back in.' },
    ] };
  const ollama = { id: 'ollama', n: 'Ollama (a free AI app on this computer)', tag: 'Free · private · a 3 GB download · about 15 minutes',
    who: 'Your frames never leave your computer. Works on Windows and on any Mac; it is quicker on computers with 16 GB of memory or more.',
    steps: [
      { t: 'Download Ollama', b: 'Press the button below. A web page opens. Press its big “Download” button and wait for the download to finish.', url: 'https://ollama.com/download', label: 'Open the Ollama download page',
        see: mac ? 'A file called Ollama.dmg (or Ollama-darwin.zip) appears in your Downloads folder.' : 'A file called OllamaSetup.exe appears in your Downloads folder.', fix: 'If nothing downloads, check your internet connection and press the Download button on that page again.' },
      { t: 'Install it', b: mac ? 'Open your Downloads folder and double-click the Ollama file. If a window shows the Ollama icon next to an Applications folder, drag the icon onto the folder.' : 'Open your Downloads folder, double-click OllamaSetup.exe and press “Install”.',
        see: mac ? 'Ollama is now in your Applications folder.' : 'The installer finishes and closes.', fix: mac ? 'If your Mac says the app is from the internet and asks whether to open it, press “Open”.' : 'If Windows asks whether to allow the app to make changes, press “Yes”.' },
      { t: 'Open Ollama', b: mac ? 'Open your Applications folder and double-click Ollama.' : 'Press the Windows key, type Ollama and press Enter.',
        see: 'A small llama icon appears ' + (mac ? 'in the menu bar at the top right of your screen.' : 'near the clock at the bottom right (you may need to click the small ^ arrow).') + ' That means Ollama is running. A chat window may open too; you can close it.',
        fix: 'If you do not see the llama icon, open Ollama again and wait a few seconds. If you keep your Ollama models on an external drive, plug the drive in first.' },
      { t: mac ? 'Open Terminal' : 'Open PowerShell', b: mac ? 'Hold the Cmd key and press the Space bar. A search box appears. Type the word Terminal and press Return.' : 'Press the Windows key, type PowerShell and press Enter.',
        see: 'A plain window with text and a blinking cursor opens. This is just a place to type one instruction; you cannot break anything here.', fix: mac ? 'If the search box does not appear, open Applications › Utilities and double-click Terminal.' : 'If nothing opens, click the Start button and type PowerShell there.' },
      { t: 'Give Ollama a model that can see pictures', b: `Press “Copy” below. Click once inside the ${mac ? 'Terminal' : 'PowerShell'} window, paste (${mac ? 'Cmd + V' : 'Ctrl + V'}) and press ${ret}.`, copy: 'ollama pull gemma3:4b',
        see: 'Lines with a progress bar appear. It downloads about 3 GB, one time only. When it finishes it says “success”. This can take 5 to 30 minutes.',
        fix: `If it says “command not found” or “not recognized”: close the ${mac ? 'Terminal' : 'PowerShell'} window, make sure the llama icon is showing, then repeat the previous step and this one.` },
      { t: 'Let Colored Lens find it', b: `When the download says “success”, you can close the ${mac ? 'Terminal' : 'PowerShell'} window. Then press the button below.`, check: 'ollama',
        fix: 'If it is not found: make sure the llama icon is showing (open Ollama again) and that the download in the previous step said “success”. Then press the button again.' },
    ] };
  const gemini = { id: 'gemini', n: 'Google Gemini (a free online AI)', tag: 'Free · nothing to install · about 3 minutes · frames go to Google',
    who: 'The quickest on any computer. A small copy of the frame you ask about is sent to Google, and on the free plan Google may use it to improve its products. Do not use it for confidential client footage.',
    steps: [
      { t: 'Open Google AI Studio', b: 'Press the button below. A web page opens. Sign in with any Google account (the one you use for Gmail or YouTube is fine).', url: 'https://aistudio.google.com/apikey', label: 'Open Google AI Studio',
        see: 'A page titled “API keys”. If it asks you to accept terms, tick the box and continue.', fix: 'If the page says it is not available in your country, this way will not work for you. Press “Choose a different way” below.' },
      { t: 'Create your key', b: 'On that page, press “Create API key”. If it asks about a project, choose “Create API key in new project”.', see: 'A long line of letters and numbers appears, starting with “AIza”. This is your key. It works like a password, so do not share it.', fix: 'If the button is greyed out, reload the page and make sure you are signed in.' },
      { t: 'Copy the key', b: 'Press the “Copy” button next to the key on that page.', see: 'The page briefly says “Copied”.', fix: 'If there is no copy button, select the whole key with your mouse and press ' + (mac ? 'Cmd + C.' : 'Ctrl + C.') },
      { t: 'Paste the key here', b: `Click in the box below, paste (${mac ? 'Cmd + V' : 'Ctrl + V'}) and press “Save”. The key is kept in your computer's secure storage, never in your project.`, key: 'gemini', see: 'A message says “Key saved on this computer”.', fix: 'If pasting does nothing, click inside the box first so the cursor blinks there.' },
      { t: 'Let Colored Lens test it', b: 'Press the button below. Colored Lens sends a tiny test picture to check the key works.', check: 'gemini', fix: 'If the test fails: go back one step and paste the key again, making sure the whole key was copied.' },
    ] };
  const local = { id: 'openai', n: os === 'win' ? 'Microsoft Foundry Local' : 'LM Studio', tag: 'Free · private · only if you already use it', advanced: true,
    who: 'An alternative to Ollama for people who already have it set up.',
    steps: os === 'win' ? [
      { t: 'Install Foundry Local', b: 'Open PowerShell (Windows key, type PowerShell, Enter), paste this line and press Enter.', copy: 'winget install Microsoft.FoundryLocal', see: 'It says “Successfully installed”.' },
      { t: 'Start its server', b: 'Paste this line in PowerShell and press Enter. Note the address it prints.', copy: 'foundry service start', see: 'A line with an address that starts with http://localhost.' },
      { t: 'Point Colored Lens at it', b: 'Press the button below. In Smart settings, paste the address followed by /v1, press “Find the server and its models” and pick a model that can see images.', check: 'settings' },
    ] : [
      { t: 'Install LM Studio', b: 'Press the button below, download LM Studio and install it.', url: 'https://lmstudio.ai', label: 'Open the LM Studio site', see: 'LM Studio is in your Applications folder.' },
      { t: 'Download a model and start the server', b: 'In LM Studio, download a vision model (for example Gemma 3 4B). Then open the Developer tab and press “Start server”.', see: 'It says the server is running on port 1234.' },
      { t: 'Point Colored Lens at it', b: 'Press the button below. In Smart settings the address is http://localhost:1234/v1. Press “Find the server and its models” and pick the model.', check: 'settings' },
    ] };
  const winai = { id: 'builtin', n: 'Windows built-in AI (Copilot+ PCs)', tag: 'Coming in a later update', who: 'Copilot+ PCs have an AI built in. Colored Lens needs a small helper to reach it from Premiere, and that helper is not ready yet. Ollama gives you the same privacy today.', steps: [] };
  return mac ? [apple, ollama, gemini, local] : [ollama, gemini, local, winai];
}

/** A prompt the editor can paste into any AI assistant for a slower, hand-held walkthrough. */
export function helpPrompt(kind, { os, hostLabel, version, route }) {
  const sys = os === 'win' ? 'Windows' : 'a Mac';
  if (kind === 'use') return `I have just installed a plugin called Colored Lens Studio (version ${version}) in ${hostLabel} on ${sys}. I am not technical. Please teach me how to use it, one small step at a time, waiting for me to say "done" before the next step.

What the plugin does: it has a panel called Colored Lens (in Premiere Pro: Window > UXP Plugins > Colored Lens). The panel has four tabs: Shot, Scene, Tweak and Presets.
- Shot: I park the playhead on a shot and press "Read the frame under the playhead". It shows a preview, tells me which clip it read and what the colour is doing. Under "What is this for?" I tap what the project is, how the scene should feel and what the shot is (up to two answers each). It then lists "Directions": looks I can click to preview on my own frame with a before/after wipe. Under the preview are "Apply", "Tweak" and "Save as preset", and an "Apply to" row (this clip, same source, whole scene, adjustment layer).
- Tweak: every setting of the look with a live preview.
- Presets: saved looks I can apply to other shots or share as a code.
- Scene: a colour script of the whole sequence. Markers named "Scene 1 ...", "Scene 2 ..." split the sequence into scenes with their own answers.
- Apply adds an effect called "Lukuluku Look" to the clip. It is one undo step.
- There is an optional "Smart mode" (an AI helper) that is off by default.

Start by asking me what kind of video I am editing, then walk me through grading my first shot with it. Use plain words and explain any colour term you use.`;
  const r = { apple: 'Apple Intelligence, the AI built into my Mac. The plugin reaches it through its own small helper, which its installer adds. I need Apple Intelligence switched on in System Settings > Apple Intelligence & Siri, and then I press "Check Apple Intelligence" in the plugin\'s guide.',
    ollama: 'Ollama running on my own computer with a vision model (the plugin suggests the command: ollama pull gemma3:4b). The plugin looks for Ollama at http://localhost:11434 and has a button "Find Ollama and its models".',
    gemini: 'a free Google Gemini API key from https://aistudio.google.com/apikey, which I paste into the plugin\'s Smart settings and save.',
    openai: 'a local "OpenAI-compatible" server (Microsoft Foundry Local on Windows, or LM Studio), whose address ending in /v1 I paste into the plugin\'s Smart settings.' }[route] || (os === 'win' ? '' : 'Apple Intelligence if my Mac has an Apple chip (easiest), otherwise ') + 'either Ollama on my own computer (private) or a free Google Gemini API key (quickest). Please first ask me two or three simple questions to help me choose, including whether my footage is confidential and how old my computer is.';
  return `I use a video plugin called Colored Lens Studio (version ${version}) in ${hostLabel} on ${sys}. It has an optional "Smart mode" that needs an AI model, and I want to set it up. I am not technical: please walk me through it one small step at a time, tell me exactly what to click or type and what I should see, and wait for me to say "done" (or tell you what I see instead) before the next step.

What I want to set up: ${r}

Useful facts:
- In the plugin, Smart settings are behind the word "Smart" at the top of the Colored Lens panel. The choices are: Off, Automatic,${os === 'win' ? '' : ' Apple Intelligence (this Mac),'} Ollama (this computer), Local server (OpenAI-compatible), Google Gemini (your key).
${os === 'win' ? '' : `- For Apple Intelligence: it needs a Mac with an Apple chip (Apple menu > About This Mac shows "Chip: Apple M..."), a recent macOS, and Apple Intelligence switched on in System Settings > Apple Intelligence & Siri. The plugin's helper is installed by the Colored Lens Studio installer; if the plugin says the helper is not running, I should reinstall the latest version, or log out of my Mac and back in.
`}- For Ollama: download from https://ollama.com/download, open the app so its llama icon shows, then in ${os === 'win' ? 'PowerShell' : 'Terminal'} run: ollama pull gemma3:4b (about 3 GB). Models that can see images include gemma3 and qwen2.5vl. If the plugin says Ollama is not answering, help me check that it is running.
- For Gemini: the key is created at https://aistudio.google.com/apikey. Frames I ask about are sent to Google.
- When it works, the Shot tab shows a "Smart mode" box where I can type a question about my frame.

If something goes wrong, ask me what I see on screen and help me fix it before moving on.`;
}

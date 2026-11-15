// The guide: a short first-run tour of Colored Lens, a step-by-step setup for Smart mode written for people who
// have never opened a terminal, and prompts to paste into any AI assistant for a slower, hand-held walkthrough.
export const TOUR = [
  { t: 'Welcome to Colored Lens', b: 'Colored Lens reads a shot, asks what it is for, and suggests looks you can preview on your own frame, adjust, apply and save. This takes one minute.', tip: 'You can come back to this guide any time from “Guide” at the top of the panel.' },
  { t: '1 · Read a shot', b: 'Park the playhead on a shot in your timeline and press “Read the frame under the playhead”. Colored Lens tells you which clip it is reading, what the colour is doing, and how the shot sits next to the shots around it.', tip: 'If people are in the shot, click a face in the preview to check its exposure and skin colour.' },
  { t: '2 · Say what it is for', b: 'Under “What is this for?”, tap what the project is, how the scene should feel, and what the shot is. You can tap two answers when a shot is more than one thing. Your answers are remembered for the sequence (or the scene, if you mark scenes).', tip: 'To mark scenes, add markers named “Scene 1 …”, “Scene 2 …” to your sequence.' },
  { t: '3 · Pick a direction', b: 'Colored Lens offers a few directions. Click one and the preview at the top shows your frame before and after, with a wipe you can drag. Each direction says what it will do to this frame and to faces.', tip: '“Pop out” puts the preview in its own panel, to dock beside the Program Monitor.' },
  { t: '4 · Apply, or tweak first', b: '“Apply” puts the look on your clip as the Lukuluku Look effect. Choose where it goes: this clip, every clip from the same source, the whole scene, or an adjustment layer. “Tweak” opens every setting with a live preview.', tip: 'Apply is one undo step. Applying again updates the look instead of stacking a second one.' },
  { t: '5 · Save it as a preset', b: '“Save as preset” keeps the look together with what it was for. In Presets you can apply it to other shots, adapt it to each shot, and share it as a code.', tip: 'The Scene tab builds a colour script of the whole sequence.' },
  { t: 'Optional: Smart mode', b: 'Smart mode adds an AI that looks at the frame, talks it through with you in plain words and picks looks. It is free: it runs on your own computer, or with your own free key. It is off until you set it up.', tip: 'You never need Smart mode. Everything else works without it and without the internet.' },
];

/** Setup routes for Smart mode, per operating system. Each step is plain language; `copy` is text to copy, `url` a page to open. */
export function routes(os) {
  const term = os === 'win' ? 'PowerShell (press the Windows key, type PowerShell, press Enter)' : 'Terminal (press Cmd + Space, type Terminal, press Return)';
  const ollama = { id: 'ollama', n: 'On this computer, with Ollama', tag: 'Free · private · needs about 4 GB of disk space',
    who: 'Best if you do not want your frames to leave your computer. Works on most computers from the last few years; faster with 16 GB of memory or more.',
    steps: [
      { t: 'Download Ollama and install it like any other app.', url: 'https://ollama.com/download', label: 'Open the Ollama download page' },
      { t: 'Open Ollama. You will see a small llama icon ' + (os === 'win' ? 'near the clock (bottom right).' : 'in the menu bar (top right).') + ' That means it is running.' },
      { t: `Give it a model that can see pictures. Open ${term}, paste this line and press ${os === 'win' ? 'Enter' : 'Return'}. It downloads about 3 GB, once.`, copy: 'ollama pull gemma3:4b' },
      { t: 'Come back here and press the button below. Colored Lens finds Ollama and switches Smart mode on.' },
    ], check: 'ollama',
    trouble: 'If it is not found: make sure the llama icon is showing (open Ollama again), wait for the download in step 3 to finish, then try again. If your models live on an external drive, plug it in before opening Ollama.' };
  const gemini = { id: 'gemini', n: 'With a free Google Gemini key', tag: 'Free tier · nothing to install · frames go to Google',
    who: 'Quickest to set up, and works on any computer. A small copy of the frame you ask about is sent to Google, and on the free tier Google may use it to improve its products, so avoid it for confidential client footage.',
    steps: [
      { t: 'Open Google AI Studio and sign in with a Google account.', url: 'https://aistudio.google.com/apikey', label: 'Open Google AI Studio' },
      { t: 'Press “Create API key”, then copy the key it shows you (a long line of letters and numbers).' },
      { t: 'Paste the key in the box below and press Save. It is kept in your computer\'s secure storage, not in your project.', key: 'gemini' },
    ], check: 'gemini',
    trouble: 'If the test fails: check the whole key was pasted, and that your country is supported by Google AI Studio.' };
  const local = { id: 'openai', n: os === 'win' ? 'On this computer, with Microsoft Foundry Local' : 'On this computer, with LM Studio', tag: 'Free · private · for people comfortable installing developer tools',
    who: 'An alternative to Ollama. Choose this only if you already use it.',
    steps: os === 'win' ? [
      { t: 'Open PowerShell and install Foundry Local with this line.', copy: 'winget install Microsoft.FoundryLocal' },
      { t: 'Start its local server and note the address it prints.', copy: 'foundry service start' },
      { t: 'In Smart settings choose “Local server”, paste the address followed by /v1, press “Find the server and its models” and pick a model that can see images.' },
    ] : [
      { t: 'Download LM Studio and install it.', url: 'https://lmstudio.ai', label: 'Open the LM Studio site' },
      { t: 'In LM Studio, download a vision model (for example Gemma 3 4B), then open the Developer tab and press “Start server”.' },
      { t: 'In Smart settings choose “Local server”, use the address http://localhost:1234/v1, press “Find the server and its models” and pick the model.' },
    ], check: 'settings', trouble: '' };
  const builtin = { id: 'builtin', n: os === 'win' ? 'Windows’ built-in AI (Copilot+ PCs)' : 'Apple Intelligence (built into recent Macs)', tag: 'Coming in a later update',
    who: os === 'win' ? 'Copilot+ PCs have an AI built in that can see images. Colored Lens needs a small helper app to reach it from Premiere; that helper is not ready yet.'
      : 'Recent Macs have an AI built in that can see images, with nothing to install. Premiere panels cannot reach it directly, so Colored Lens needs a small helper app; that helper is not ready yet. Until then, Ollama gives you the same privacy on a Mac.',
    steps: [], check: null, trouble: '' };
  return [ollama, gemini, local, builtin];
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
  const r = { ollama: 'Ollama running on my own computer with a vision model (the plugin suggests the command: ollama pull gemma3:4b). The plugin looks for Ollama at http://localhost:11434 and has a button "Find Ollama and its models".',
    gemini: 'a free Google Gemini API key from https://aistudio.google.com/apikey, which I paste into the plugin\'s Smart settings and save.',
    openai: 'a local "OpenAI-compatible" server (Microsoft Foundry Local on Windows, or LM Studio), whose address ending in /v1 I paste into the plugin\'s Smart settings.' }[route] || 'either Ollama on my own computer (private) or a free Google Gemini API key (quickest). Please first ask me two or three simple questions to help me choose, including whether my footage is confidential and how old my computer is.';
  return `I use a video plugin called Colored Lens Studio (version ${version}) in ${hostLabel} on ${sys}. It has an optional "Smart mode" that needs an AI model, and I want to set it up. I am not technical: please walk me through it one small step at a time, tell me exactly what to click or type and what I should see, and wait for me to say "done" (or tell you what I see instead) before the next step.

What I want to set up: ${r}

Useful facts:
- In the plugin, Smart settings are behind the word "Smart" at the top of the Colored Lens panel. The choices are: Off, Automatic, Ollama (this computer), Local server (OpenAI-compatible), Google Gemini (your key).
- For Ollama: download from https://ollama.com/download, open the app so its llama icon shows, then in ${os === 'win' ? 'PowerShell' : 'Terminal'} run: ollama pull gemma3:4b (about 3 GB). Models that can see images include gemma3 and qwen2.5vl. If the plugin says Ollama is not answering, help me check that it is running.
- For Gemini: the key is created at https://aistudio.google.com/apikey. Frames I ask about are sent to Google.
- When it works, the Shot tab shows a "Smart mode" box where I can type a question about my frame.

If something goes wrong, ask me what I see on screen and help me fix it before moving on.`;
}

// Smart mode: an optional AI that looks at the frame, reads what the scene is doing, talks with the editor and
// picks from Colored Lens's own recipes. It never invents a look: every pick is checked against the recipe
// catalogue and the allowed adjustments, then previewed and applied by the same rules engine as everything else.
//
// Providers are all free to the editor: a model on their own machine (Ollama, or any OpenAI-compatible local
// server such as Microsoft Foundry Local or LM Studio) or their own API key (Google Gemini has a free tier).
import { RECIPES, GENRES, FEELINGS, ROLES } from './directions.js';

export const PROVIDERS = [
  { id: 'off', n: 'Off', where: 'Rules only. Nothing leaves this computer.' },
  { id: 'auto', n: 'Automatic', where: 'Uses the best free option this computer has: Apple Intelligence on a Mac that has it, else Ollama when it is running with a vision model, else your Gemini key.' },
  { id: 'apple', n: 'Apple Intelligence (this Mac)', where: 'Built into recent Macs: free, private, nothing to install. Needs Apple Intelligence switched on in System Settings.', mac: true },
  { id: 'ollama', n: 'Ollama (this computer)', where: 'Free and private: the frame stays on this computer. Install Ollama, then a vision model, e.g. ollama pull gemma3:4b (or qwen2.5vl:7b).' },
  { id: 'openai', n: 'Local server (OpenAI-compatible)', where: 'Microsoft Foundry Local (Windows and Mac), LM Studio and similar. The frame stays on this computer when the server is local.' },
  { id: 'gemini', n: 'Google Gemini (your key)', where: 'Free tier with your own key from Google AI Studio. The frame is sent to Google, and free-tier requests may be used to improve Google products.' },
];
export const DEFAULTS = { provider: 'off', ollamaUrl: 'http://localhost:11434', ollamaModel: '', openaiUrl: 'http://localhost:5273/v1', openaiModel: '', geminiModel: 'gemini-2.5-flash' };
const VISION = /llava|gemma3|gemma4|qwen2\.5vl|qwen3-vl|qwen3\.5|qwen3\.6|moondream|minicpm-v|llama3\.2-vision|llama4|granite3\.2-vision|mistral-small3|bakllava/i;

/** The adjustments the AI may make, with their limits (anything else is ignored). */
export const TWEAKS = { exp: [-1.5, 1.5], con: [0.7, 1.4], sat: [0.3, 1.6], vib: [-0.6, 0.6], temp: [-0.6, 0.6], tint: [-0.5, 0.5], hi: [-0.6, 0.6], sh: [-0.6, 0.6],
  bk: [-0.5, 0.5], wh: [-0.5, 0.5], lutMix: [0, 1], grainK: [0, 1.8], halK: [0, 1.8], diffK: [0, 1.8], vigK: [0, 1.8], skinGuard: [0, 1] };

const SYSTEM_FULL = `You are the colourist's assistant inside Colored Lens, a colour panel in a video editor.
You see one frame and measurements of it, what the editor said the shot is for, and where it sits on the timeline.
Your job: say plainly what you see, read what the colour is doing for this moment, ask at most two short questions when the purpose is unclear, and pick 2 to 4 looks from the RECIPES list that fit what the editor wants.
Rules:
- Only use recipe ids from RECIPES. Only use adjustment keys from TWEAKS, inside their ranges, and only when a small change makes the recipe fit this frame better.
- Faces: if there are people, protect their skin (skinGuard 0.6 to 0.9) unless the editor wants a stylised look on purpose.
- Be specific to this frame (what is lit, where the colour is, what the faces need). No film-school boilerplate.
- If the editor's answers look wrong for the picture, suggest better ones in "answers"; the editor decides.
<<JSON>>- Reply with JSON only, in this shape:
{"sees":"one or two sentences","reading":"what the colour is doing for this moment","reply":"a short direct answer to the editor's message, if any","questions":["..."],"answers":{"genre":[],"feeling":[],"role":[]},"picks":[{"recipe":"id","why":"one sentence tied to this frame","tweaks":{"key":0}}]}`;

const SYSTEM = SYSTEM_FULL.replace('<<JSON>>', ''), SYSTEM_PLAIN = SYSTEM_FULL.slice(0, SYSTEM_FULL.indexOf('<<JSON>>')); // Apple's model fills a fixed structure instead

/** Why Apple Intelligence is not available, in words an editor can act on. */
export function appleReason(r) {
  const s = String(r || '');
  if (/helper/i.test(s)) return 'The Colored Lens helper is not running. Install the latest Colored Lens Studio (the installer adds it), or log out of your Mac and back in.';
  if (/NotEnabled/i.test(s)) return 'Apple Intelligence is switched off. Open System Settings › Apple Intelligence & Siri and turn it on.';
  if (/NotEligible/i.test(s)) return 'This Mac cannot run Apple Intelligence (it needs Apple silicon).';
  if (/NotReady/i.test(s)) return 'Apple Intelligence is still downloading its model. Leave the Mac on Wi-Fi and power for a while, then try again.';
  if (/needsNewerMacOS/i.test(s)) return 'Apple Intelligence in Colored Lens needs a newer macOS. Update macOS in System Settings › General › Software Update.';
  if (/notInThisBuild/i.test(s)) return 'This Mac (or this build of the helper) has no Apple Intelligence. Use Ollama or a Gemini key instead.';
  return 'Apple Intelligence is not available on this Mac right now' + (s ? ` (${s}).` : '.');
}
/** Asks the helper whether Apple Intelligence is ready. bridge(req, ms) is supplied by the host; absent off the Mac. */
export async function detectApple(bridge) {
  if (!bridge) return { ok: false, reason: 'notInThisBuild' };
  try { const r = await bridge({ type: 'status' }, 4000), a = r.apple || {}; return { ok: !!a.available, image: !!a.image, reason: a.reason || '', helper: r.helper, variant: r.variant }; }
  catch { return { ok: false, reason: 'helper' }; }
}

/** Everything the model needs, as text (the frame goes with it as an image). */
export function buildPrompt({ reading, skin, intent, ctx, neigh, message, summary }) {
  const ids = l => l.map(x => x.id).join(', ');
  const facts = {
    frame: summary || '', palette: reading && reading.pal ? reading.pal.id : '', colours: reading ? reading.hues.filter(h => h.share >= 0.03).slice(0, 6).map(h => `${h.id} ${Math.round(h.share * 100)}%`) : [],
    tones: reading ? { deepShadow: +reading.tones.shadow.toFixed(2), contrast: +reading.stats.contrast.toFixed(2), warmth: reading.stats.warmth, saturation: reading.stats.saturation } : {},
    faces: skin && skin.found ? (skin.faces || []).map(f => `face ${f.n}: ${f.ire} IRE`) : [],
  };
  const timeline = ctx && ctx.subject ? { shot: `${ctx.subject.kind} on V${ctx.subject.track}`, above: (ctx.above || []).map(l => l.kind), scene: ctx.scene ? ctx.scene.name : null,
    neighbours: (neigh || []).map(n => `${n.side}: ${n.name}`) } : null;
  return [
    `EDITOR'S ANSWERS (ids): ${JSON.stringify({ genre: intent.genre, feeling: intent.feeling, role: intent.role, note: intent.note || '' })}`,
    `ANSWER IDS: genre: ${ids(GENRES)} | feeling: ${ids(FEELINGS)} | role: ${ids(ROLES)}`,
    `MEASUREMENTS: ${JSON.stringify(facts)}`,
    timeline ? `TIMELINE: ${JSON.stringify(timeline)}` : '',
    `RECIPES: ${RECIPES.map(r => `${r.id} (${r.name}; ${r.feel.join('/')}; ${r.line})`).join(' | ')}`,
    `TWEAKS: ${Object.entries(TWEAKS).map(([k, [a, b]]) => `${k} ${a}..${b}`).join(', ')}`,
    `EDITOR'S MESSAGE: ${message || '(none: read the frame and suggest)'}`,
  ].filter(Boolean).join('\n');
}

/** Pulls the JSON object out of a model's text (tolerates code fences and chatter around it). */
export function parseReply(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The model did not answer in the expected format');
  return JSON.parse(s.slice(a, b + 1));
}

/** Keeps only what is valid: known recipes, known answer ids, adjustments clamped to their ranges. */
export function validate(o) {
  const str = (v, n = 600) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const ok = (list, v) => (Array.isArray(v) ? v : v ? [v] : []).filter(x => list.some(y => y.id === x)).slice(0, 2);
  const picks = (Array.isArray(o.picks) ? o.picks : []).map(p => {
    const r = RECIPES.find(x => x.id === (p && p.recipe)); if (!r) return null; const tweaks = {};
    for (const [k, v] of Object.entries((p && p.tweaks) || {})) if (TWEAKS[k] && Number.isFinite(+v)) tweaks[k] = Math.min(TWEAKS[k][1], Math.max(TWEAKS[k][0], +v));
    return { recipe: r.id, why: str(p.why, 300), tweaks };
  }).filter(Boolean).filter((p, i, a) => a.findIndex(q => q.recipe === p.recipe) === i).slice(0, 4);
  const ans = o.answers || {};
  return { sees: str(o.sees), reading: str(o.reading), reply: str(o.reply, 900), questions: (Array.isArray(o.questions) ? o.questions : []).map(q => str(q, 200)).filter(Boolean).slice(0, 2),
    answers: { genre: ok(GENRES, ans.genre), feeling: ok(FEELINGS, ans.feeling), role: ok(ROLES, ans.role) }, picks };
}

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' took too long (over ' + Math.round(ms / 1000) + ' s)')), ms))]);
async function postJSON(post, url, headers, body, ms = 120000) {
  const r = await withTimeout(post(url, { 'content-type': 'application/json', ...headers }, JSON.stringify(body)), ms, 'The model');
  if (r.status < 200 || r.status >= 300) throw new Error(`The model answered ${r.status}: ${String(r.text).slice(0, 200)}`);
  return JSON.parse(r.text);
}
const trim = u => String(u || '').replace(/\/+$/, '');

/** One request to the chosen provider. history = [{role:'user'|'assistant', text}] from earlier turns. */
export async function ask(cfg, { prompt, imageB64, history = [] }, post, bridge) {
  const hist = history.slice(-6);
  if (cfg.provider === 'apple') {
    if (!bridge) throw new Error(appleReason('notInThisBuild'));
    const past = hist.length ? '\nEARLIER IN THIS CONVERSATION: ' + hist.map(h => `${h.role === 'user' ? 'Editor' : 'You'}: ${h.text.slice(0, 300)}`).join(' | ') : '';
    let r; try { r = await bridge({ type: 'apple', system: SYSTEM_PLAIN, prompt: prompt + past, imageB64 }, 180000); } catch { throw new Error(appleReason('helper')); }
    if (r.error) throw new Error(appleReason(r.error));
    return r.text || '';
  }
  if (cfg.provider === 'ollama') {
    const msgs = [{ role: 'system', content: SYSTEM }, ...hist.map(h => ({ role: h.role, content: h.text })), { role: 'user', content: prompt, images: [imageB64] }];
    const j = await postJSON(post, trim(cfg.ollamaUrl) + '/api/chat', {}, { model: cfg.ollamaModel, messages: msgs, format: 'json', stream: false, options: { temperature: 0.4 } });
    return (j.message && j.message.content) || '';
  }
  if (cfg.provider === 'openai') {
    const msgs = [{ role: 'system', content: SYSTEM }, ...hist.map(h => ({ role: h.role, content: h.text })),
      { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + imageB64 } }] }];
    const j = await postJSON(post, trim(cfg.openaiUrl) + '/chat/completions', cfg.openaiKey ? { authorization: 'Bearer ' + cfg.openaiKey } : {}, { model: cfg.openaiModel, messages: msgs, temperature: 0.4 });
    return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  }
  if (cfg.provider === 'gemini') {
    if (!cfg.geminiKey) throw new Error('Add your Gemini API key in Smart mode settings');
    const contents = [...hist.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: imageB64 } }] }];
    const j = await postJSON(post, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel || DEFAULTS.geminiModel)}:generateContent`, { 'x-goog-api-key': cfg.geminiKey },
      { systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content ? j.candidates[0].content.parts : [];
    return (parts || []).map(p => p.text || '').join('');
  }
  throw new Error('Smart mode is off');
}

/** What this computer offers: is Ollama running, and which of its models can see images? */
export async function detectOllama(url, get) {
  try { const r = await withTimeout(get(trim(url) + '/api/tags'), 2500, 'Ollama'); if (r.status !== 200) return { ok: false };
    const models = (JSON.parse(r.text).models || []).map(m => m.name || m.model).filter(Boolean);
    return { ok: true, models, vision: models.filter(m => VISION.test(m)) };
  } catch { return { ok: false }; }
}
/** Lists an OpenAI-compatible server's models (Foundry Local, LM Studio …). */
export async function detectOpenAI(url, key, get) {
  try { const r = await withTimeout(get(trim(url) + '/models', key ? { authorization: 'Bearer ' + key } : {}), 2500, 'The local server'); if (r.status !== 200) return { ok: false };
    return { ok: true, models: (JSON.parse(r.text).data || []).map(m => m.id).filter(Boolean) };
  } catch { return { ok: false }; }
}

/** Resolves "Automatic" to a concrete provider for this computer, or null when nothing is available. */
export async function resolveProvider(cfg, get, bridge) {
  if (cfg.provider !== 'auto') return cfg.provider === 'off' ? null : cfg;
  if (bridge && (await detectApple(bridge)).ok) return { ...cfg, provider: 'apple' };
  const o = await detectOllama(cfg.ollamaUrl || DEFAULTS.ollamaUrl, get);
  if (o.ok && o.vision.length) return { ...cfg, provider: 'ollama', ollamaModel: cfg.ollamaModel && o.models.includes(cfg.ollamaModel) ? cfg.ollamaModel : o.vision[0] };
  if (cfg.geminiKey) return { ...cfg, provider: 'gemini' };
  return null;
}

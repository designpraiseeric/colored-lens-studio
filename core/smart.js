// Smart mode: an optional AI that looks at the frame, reads what the scene is doing, talks with the editor and
// picks from Colored Lens's own recipes. It never invents a look: every pick is checked against the recipe
// catalogue and the allowed adjustments, then previewed and applied by the same rules engine as everything else.
//
// Providers are all free to the editor: a model on their own machine (Ollama, or any OpenAI-compatible local
// server such as Microsoft Foundry Local or LM Studio) or their own API key (Google Gemini has a free tier).
import { srgbToOklab } from './color.js';
import { RECIPES, GENRES, FEELINGS, ROLES } from './directions.js';

export const PROVIDERS = [
  { id: 'off', n: 'Off', where: 'Rules only. Nothing leaves this computer.' },
  { id: 'auto', n: 'Automatic', where: 'Uses the best free option this computer has: Apple Intelligence on a Mac that has it, else Ollama when it is running with a vision model, else your Claude or Gemini key.' },
  { id: 'apple', n: 'Apple Intelligence (this Mac)', where: 'Built into recent Macs: free, private, nothing to install. Needs Apple Intelligence switched on in System Settings.', mac: true },
  { id: 'ollama', n: 'Ollama (this computer)', where: 'Free and private: the frame stays on this computer. Install Ollama, then a vision model, e.g. ollama pull gemma3:4b (or qwen2.5vl:7b).' },
  { id: 'openai', n: 'Local server (OpenAI-compatible)', where: 'Microsoft Foundry Local (Windows and Mac), LM Studio and similar. The frame stays on this computer when the server is local.' },
  { id: 'claude', n: 'Claude (your key)', where: 'The strongest suggestions, with your own key from the Claude Console. Paid by use, not included in a Claude Pro subscription. The frame is sent to Anthropic and is not used to train its models.' },
  { id: 'gemini', n: 'Google Gemini (your key)', where: 'Free tier with your own key from Google AI Studio. The frame is sent to Google, and free-tier requests may be used to improve Google products.' },
];
export const DEFAULTS = { provider: 'auto', autoAsk: true, ollamaUrl: 'http://localhost:11434', ollamaModel: '', openaiUrl: 'http://localhost:5273/v1', openaiModel: '', geminiModel: 'gemini-flash-latest', claudeModel: 'claude-sonnet-5-5' };
export const CLAUDE_MODELS = [['claude-opus-5', 'Opus 5 — the best reader of a frame; the dearest'], ['claude-fable-5-2', 'Fable 5.2 — the most imaginative'], ['claude-sonnet-5-5', 'Sonnet 5.5 — very good, a fraction of the cost (recommended)'], ['claude-haiku-5-5', 'Haiku 5.5 — quickest and cheapest']];
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
  if (r.status < 200 || r.status >= 300) { let msg = String(r.text).slice(0, 200); try { const j = JSON.parse(r.text); msg = (j.error && (j.error.message || j.error)) || msg; } catch { /* not JSON */ }
    if (/repeat limit|prediction aborted/i.test(msg)) throw new Error('REPEAT: the AI on this computer got stuck repeating itself and stopped.');
    throw new Error(`The model answered ${r.status}: ${String(msg).slice(0, 200)}`); }
  return JSON.parse(r.text);
}
const trim = u => String(u || '').replace(/\/+$/, '');

/** One request to the chosen provider. history = [{role:'user'|'assistant', text}] from earlier turns. */
export async function ask(cfg, { prompt, imageB64, images = [], history = [], system = null, lite = false, mime = 'image/png' }, post, bridge) {
  const hist = history.slice(-6), SYS = system || SYSTEM, more = images.filter(Boolean);
  if (cfg.provider === 'apple') {
    if (!bridge) throw new Error(appleReason('notInThisBuild'));
    const past = hist.length ? '\nEARLIER IN THIS CONVERSATION: ' + hist.map(h => `${h.role === 'user' ? 'Editor' : 'You'}: ${h.text.slice(0, 300)}`).join(' | ') : '';
    let r; try { r = await bridge(system ? { type: 'apple', plain: true, system, prompt: prompt + past, imageB64 } : { type: 'apple', system: SYSTEM_PLAIN, prompt: prompt + past, imageB64 }, 240000); } catch { throw new Error(appleReason('helper')); }
    if (r.error) throw new Error(appleReason(r.error));
    return r.text || '';
  }
  if (cfg.provider === 'ollama') {
    const msgs = [{ role: 'system', content: SYS }, ...hist.map(h => ({ role: h.role, content: h.text })), { role: 'user', content: prompt, images: [imageB64, ...more] }];
    const j = await postJSON(post, trim(cfg.ollamaUrl) + '/api/chat', {}, { model: cfg.ollamaModel, messages: msgs, format: 'json', stream: false, options: { temperature: 0.5, num_ctx: 8192, repeat_penalty: 1.15, num_predict: 3500 } }, 300000);
    return (j.message && j.message.content) || '';
  }
  if (cfg.provider === 'openai') {
    const msgs = [{ role: 'system', content: SYS }, ...hist.map(h => ({ role: h.role, content: h.text })),
      { role: 'user', content: [{ type: 'text', text: prompt }, ...[imageB64, ...more].map(b => ({ type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + b } }))] }];
    const j = await postJSON(post, trim(cfg.openaiUrl) + '/chat/completions', cfg.openaiKey ? { authorization: 'Bearer ' + cfg.openaiKey } : {}, { model: cfg.openaiModel, messages: msgs, temperature: 0.4 });
    return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  }
  if (cfg.provider === 'claude') {
    if (!cfg.claudeKey) throw new Error('Colored Lens could not find your Claude key. Open “AI” at the top, paste the key again and press “Save key”.');
    const content = [{ type: 'text', text: prompt }, ...[imageB64, ...more].map(b => ({ type: 'image', source: { type: 'base64', media_type: mime, data: b } }))];
    const msgs = [...hist.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })), { role: 'user', content },
      { role: 'assistant', content: '{' }]; // starts the answer as JSON, so nothing is wrapped in chatter
    const head = { 'x-api-key': cfg.claudeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const call = model => postJSON(post, 'https://api.anthropic.com/v1/messages', head, { model, max_tokens: 4000, temperature: 0.4, system: SYS, messages: msgs }, 180000);
    const first = cfg.claudeModel || DEFAULTS.claudeModel, order = [first, ...CLAUDE_MODELS.map(m => m[0]).filter(m => m !== first)];
    let j = null, last = null;
    for (const model of order) { try { j = await call(model); break; } catch (e) { last = e; const m = String(e.message);
      if (/answered 404/.test(m)) continue; // this model name is gone or not on this account: try the next
      if (/answered (503|529|500|502|504)/.test(m)) { await new Promise(r => setTimeout(r, 4000)); try { j = await call(model); break; } catch (e2) { last = e2; continue; } }
      throw claudeError(e); } }
    if (!j) throw claudeError(last);
    return '{' + (j.content || []).map(p => p.text || '').join('');
  }
  if (cfg.provider === 'gemini') {
    if (!cfg.geminiKey) throw new Error('Colored Lens could not find your Gemini key. Open “AI” at the top, paste the key again and press “Save key”.');
    const contents = [...hist.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }, ...[imageB64, ...more].map(b => ({ inline_data: { mime_type: mime, data: b } }))] }];
    const call = model => postJSON(post, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': cfg.geminiKey },
      { systemInstruction: { parts: [{ text: SYS }] }, contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }, 90000);
    // Google retires model names and its models are sometimes overloaded: wait and retry once, then move down a
    // list of current Flash models until one answers.
    const first = cfg.geminiModel || DEFAULTS.geminiModel, order = [first, ...GEMINI_FALLBACKS.filter(m => m !== first)];
    const wait = ms => new Promise(r => setTimeout(r, ms)); let j = null, lastErr = null;
    for (let i = 0; i < order.length && !j; i++) {
      for (let attempt = 0; attempt < (i === 0 ? 2 : 1) && !j; attempt++) {
        try { j = await call(order[i]); } catch (e) { lastErr = e; const m = String(e.message);
          if (/answered (503|500|502|504)/.test(m) || /took too long/.test(m)) { if (i === 0 && attempt === 0) await wait(4000); continue; } // busy: retry, then next model
          if (/answered 404/.test(m)) break; // this name is gone: next model
          throw geminiError(e); } } }
    if (!j) throw geminiError(lastErr);
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content ? j.candidates[0].content.parts : [];
    return (parts || []).map(p => p.text || '').join('');
  }
  throw new Error('Smart mode is off');
}

export const GEMINI_FALLBACKS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
/** Anthropic's errors, in words an editor can act on. */
function claudeError(e) { const m = String((e && e.message) || e);
  if (/answered 401/.test(m)) return new Error('Anthropic says this API key is not valid. Copy it again from console.anthropic.com (Settings › API keys) and save it under “AI”.');
  if (/credit balance|answered 400.*credit/i.test(m)) return new Error('This Claude key has no credit left. Add credits at console.anthropic.com (Plans & billing). A Claude Pro subscription does not pay for API keys.');
  if (/answered 429/.test(m)) return new Error('Anthropic says this key has been used too fast for now. Wait a minute and try again.');
  if (/answered 403/.test(m)) return new Error('Anthropic refused this key (it may be restricted, or billing is not set up for it).');
  if (/took too long/.test(m)) return new Error('Anthropic did not answer in time. Check your internet connection and try again.');
  if (/answered 529/.test(m)) return new Error('Claude is very busy right now. Try again in a minute.');
  return e instanceof Error ? e : new Error(m); }

/** Google's errors, in words an editor can act on. */
function geminiError(e) { const m = String(e.message || e);
  if (/API key not valid|API_KEY_INVALID|answered 400.*key/i.test(m)) return new Error('Google says this API key is not valid. Copy the key again from aistudio.google.com/apikey and save it under “AI”.');
  if (/answered 429/.test(m)) return new Error('Google says the free limit for this key has been reached for now. Wait a minute and try again (the daily limit resets overnight, Pacific time).');
  if (/answered 403|location is not supported|FAILED_PRECONDITION/i.test(m)) return new Error('Google does not allow this key to be used from here (the free Gemini API is not offered in every country, or the key is restricted). Details: ' + m.slice(0, 160));
  if (/answered (503|500|502|504)/.test(m)) return new Error('Google\'s AI is very busy right now and turned the request away, on every model Colored Lens tried. This is on Google\'s side and usually passes within a few minutes: press the button again shortly.');
  if (/took too long/.test(m)) return new Error('Google did not answer in time. Check your internet connection and try again.');
  return e; }

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
  if (cfg.claudeKey) return { ...cfg, provider: 'claude' };
  if (cfg.geminiKey) return { ...cfg, provider: 'gemini' };
  return null;
}


// ===================== 0.6: study the frame, then suggest colours and looks =====================
// Two requests. STUDY: everything in the picture, item by item, and what the shot is for in its scene.
// SUGGEST: many colour ideas, each with a colour for each item, why, encyclopedia references and a Lukuluku look.

/** Names the model may cite from the encyclopedia. lite = a shorter list for small on-device models. */
export function catalogue(enc, lite = false) {
  const first = t => String(t || '').split(/(?<=\.)\s/)[0].slice(0, 110);
  const out = [...enc.HUES.map(h => ({ name: h.name, kind: 'Colour', line: h.tag })), ...enc.PALS.map(p => ({ name: p.n, kind: 'Palette', line: first(p.t), ex: p.ex }))];
  if (!lite) out.push(...enc.NARR.map(n => ({ name: n.n, kind: 'Storytelling', line: first(n.t), ex: n.ex })), ...enc.ITTEN.map(n => ({ name: n.n, kind: 'Contrast', line: first(n.t) })),
    ...enc.AUTS.map(a => ({ name: a.n, kind: 'Filmmaker', line: first(a.t), ex: a.f })));
  return out;
}
/** Matches an item name from a suggestion to the item the study found (the AI rarely words them identically). */
export function matchItem(items, name) {
  const n = String(name || '').toLowerCase().trim(); if (!n || !items || !items.length) return null;
  const norm = x => x.toLowerCase().replace(/^(the|a|an|her|his|their|its)\s+/, '').replace(/['’]s\b/g, '').trim();
  const t = norm(n);
  let hit = items.find(x => norm(x.name) === t) || items.find(x => norm(x.name).includes(t) || t.includes(norm(x.name)));
  if (hit) return hit;
  // last resort: share a meaningful word (skin, shirt, wall, hair…)
  const words = t.split(/[^a-z]+/).filter(w => w.length > 3);
  return items.find(x => { const w2 = norm(x.name).split(/[^a-z]+/); return words.some(w => w2.includes(w)); }) || null;
}
const hexOk = h => (/^#?[0-9a-f]{6}$/i.test(String(h || '').trim()) ? '#' + String(h).trim().replace('#', '').toLowerCase() : '');
/** The encyclopedia colour nearest a hex (by hue; greys, black and white by lightness). */
export function nearestHue(enc, hex) {
  const h = hexOk(hex); if (!h) return null; const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  const by = id => enc.HUES.find(x => x.id === id) || null;
  if (d < 0.1) return by(l < 0.18 ? 'black' : l > 0.85 ? 'white' : 'grey') || by('grey');
  const hueOf = (R, G, B) => { const M = Math.max(R, G, B), m = Math.min(R, G, B), D = M - m; if (!D) return -1; let H = M === R ? ((G - B) / D) % 6 : M === G ? (B - R) / D + 2 : (R - G) / D + 4; return (H * 60 + 360) % 360; };
  const hue = hueOf(r, g, b); let best = null, bd = 1e9;
  for (const e of enc.HUES) { const x = hexOk(e.hex); if (!x) continue; const [R, G, B] = [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255), eh = hueOf(R, G, B); if (eh < 0) continue;
    // brown and pink share hues with orange and red: tell them apart by lightness and strength
    const dd = Math.min(Math.abs(eh - hue), 360 - Math.abs(eh - hue)) + Math.abs(((Math.max(R, G, B) + Math.min(R, G, B)) / 2) - l) * 60; if (dd < bd) { bd = dd; best = e; } }
  return best;
}

const JSON_ONLY = 'Reply with JSON only (no markdown, no text around it), in exactly this shape:';
export const SYSTEM_STUDY = `You are the colourist's eye inside Colored Lens, a colour panel in a video editor. You are shown one frame of a shot (first image). A second image, when present, is a contact sheet of other moments from the surrounding scene or sequence, in time order.
Your job is to understand this frame before any colour is suggested.
1. ITEMS: list every distinct thing you can see IN THE FIRST IMAGE ONLY (the frame), however small. Never list anything that appears only in the contact sheet or that you merely expect in such a scene: people (and what each wears, piece by piece), skin, hair, props, furniture, lamps and other light sources, walls, floor, sky, vegetation, vehicles, screens, text and graphics, background areas. For each: where it is in the frame, and its colour now as a plain name and a hex code. Aim for 8 to 20 items. Never invent items you cannot see. If you were not given the picture itself, list only what the measurements and descriptions support and say so in "caveat".
2. LIGHT: where the light comes from, its quality and colour, time of day if it shows.
3. PURPOSE: what this shot is doing in its scene, inferred from the frame, the contact sheet, the timeline notes and what the editor said. Say what you are unsure of.
4. Ask at most two short questions only if the answer would change the colour advice.
Only the layers listed under LAYERS IN SCOPE matter: ignore anything that belongs to an excluded layer (for example a title the editor unticked).
If the editor wrote a message, answer it in "reply" and update your understanding with what they told you.
${JSON_ONLY}
{"items":[{"name":"","where":"","colour":"","hex":"#000000"}],"light":"","mood":"what the picture feels like now","purpose":"","scene":"what the surrounding scene seems to be","caveat":"","reply":"","questions":[""],"answers":{"genre":[],"feeling":[],"role":[]}}`;

export const SYSTEM_SUGGEST = `You are a senior film colourist and production designer advising inside Colored Lens. You have already studied a frame (UNDERSTANDING lists its items, each with the colour it has now). Now propose colour directions for it.
A direction is NOT a mood label or a preset name. It is a concrete plan of which thing in the frame takes which colour, and what that arrangement makes the audience feel. Think the way a production designer and a colourist would plan it together: dress, walls, props, practical lights, sky, graphics, and the colour of the light itself.
Give the number of directions asked for, and make them range widely. Across the set, cover at least these kinds:
- one that stays close to what is there but resolves it (cleans the palette, separates the subject, fixes what distracts);
- two or three built on different colour structures from the encyclopedia (for example complementary, analogous, split-complementary, triadic, neutral + accent, monochromatic), each changing clearly which item carries the accent;
- one or two bold, stylised options a brave director might choose;
- one that deliberately plays against the obvious reading of the scene (counterpoint), if the scene allows it.
For each direction:
- "title": names the colour idea itself using this frame's own items (which item takes which colour), never just a mood or genre.
- "idea": one sentence on the colour idea. "structure": the palette structure it uses, by its ENCYCLOPEDIA name.
- "ambience": the colour of the light and air (name + hex).
- "items": for every important item in ITEMS, the colour it should become (plain name + hex) and why in one clause. At least four items. At least two of them must change visibly from the colour they have now, and say which single item is the accent the eye should land on. Use the items' names exactly as given, and only items that are in ITEMS: never mention things that are not in this frame. Skin stays believable unless the direction is openly stylised; say what happens to skin.
- "communicates": what this arrangement tells the audience about the person, place or moment. "because": the colour reasoning: the relationships between the items' colours, contrast of hue / value / saturation, where the eye goes first and why, and what it does for the face.
- "refs": 2 to 4 names copied exactly from ENCYCLOPEDIA that genuinely explain this direction (its structure, a storytelling use, a filmmaker known for it). No filler.
- "recipe": last and least: the id from RECIPES of the film look that sits best underneath this direction (the item colours are applied on top of it), with optional "tweaks" from TWEAKS.
Respect LAYERS IN SCOPE, the editor's answers and everything said in the conversation: if the editor asked for something specific, most directions should serve it. The editor's "feeling" answers describe the scene, they are not a ceiling on boldness. Be specific to this frame. No film-school boilerplate, no repeating the same palette under different names.
${JSON_ONLY}
{"reply":"","suggestions":[{"title":"","idea":"","structure":"","ambience":{"colour":"","hex":"#000000"},"items":[{"item":"","colour":"","hex":"#000000","why":"","accent":false}],"communicates":"","because":"","refs":[""],"recipe":"","tweaks":{}}]}`;

const scopeLines = layers => { const L = layers || []; if (!L.length) return '';
  const f = l => `V${l.track} ${l.kind} "${l.name}"`; const on = L.filter(l => l.on !== false), off = L.filter(l => l.on === false);
  return `LAYERS IN SCOPE: ${on.map(f).join('; ') || '(none)'}${off.length ? `\nEXCLUDED LAYERS (ignore what they add to the picture): ${off.map(f).join('; ')}` : ''}`; };
const common = ({ reading, skin, intent, ctx, neigh, summary, layers, range, vision }) => {
  const ids = l => l.map(x => x.id).join(', ');
  const facts = { frame: summary || '', palette: reading && reading.pal ? reading.pal.id : '', colours: reading ? reading.hues.filter(h => h.share >= 0.03).slice(0, 6).map(h => `${h.id} ${Math.round(h.share * 100)}%`) : [],
    swatches: reading && reading.swatches ? reading.swatches.slice(0, 6).map(sw => sw.hex || sw).filter(x => typeof x === 'string') : [],
    tones: reading ? { deepShadow: +reading.tones.shadow.toFixed(2), contrast: +reading.stats.contrast.toFixed(2), warmth: reading.stats.warmth, saturation: reading.stats.saturation } : {},
    faces: skin && skin.found ? (skin.faces || []).map(f => `face ${f.n}: ${f.ire} IRE`) : [] };
  return [
    vision === false ? 'NOTE: you were NOT given the picture itself, only measurements.' : '',
    `EDITOR'S ANSWERS (ids): ${JSON.stringify({ genre: intent.genre, feeling: intent.feeling, role: intent.role, note: intent.note || '' })}`,
    `ANSWER IDS: genre: ${ids(GENRES)} | feeling: ${ids(FEELINGS)} | role: ${ids(ROLES)}`,
    `MEASUREMENTS: ${JSON.stringify(facts)}`,
    scopeLines(layers),
    ctx && ctx.subject ? `TIMELINE: ${JSON.stringify({ shot: `${ctx.subject.kind} "${ctx.subject.name}" on V${ctx.subject.track}`, scene: ctx.scene ? ctx.scene.name : null, neighbours: (neigh || []).map(n => `${n.side}: ${n.name}`) })}` : '',
    range && range.samples && range.samples.length ? `STUDIED RANGE: ${range.label}. Contact sheet moments, in order: ${range.samples.map(x => `${x.t} (${x.note})`).join('; ')}` : range ? `STUDIED RANGE: ${range.label}` : '',
  ].filter(Boolean);
};
export function buildStudy(a) { return [...common(a), `EDITOR'S MESSAGE: ${a.message || '(none: study the frame)'}`].join('\n'); }
export function buildSuggest(a) {
  const cat = catalogue(a.enc, a.lite), u = a.understanding || {};
  return [...common(a),
    `UNDERSTANDING: ${JSON.stringify({ items: (u.items || []).map(i => `${i.name} (${i.where}; ${i.colour} ${i.hex})`), light: u.light, mood: u.mood, purpose: u.purpose, scene: u.scene })}`,
    `ENCYCLOPEDIA: ${cat.map(c => `${c.name} [${c.kind}: ${c.line}]`).join(' | ')}`,
    `RECIPES: ${RECIPES.map(r => `${r.id} (${r.name}; ${r.feel.join('/')}; ${r.line})`).join(' | ')}`,
    `TWEAKS: ${Object.entries(TWEAKS).map(([k, [x, y]]) => `${k} ${x}..${y}`).join(', ')}`,
    `HOW MANY: ${a.count || 8} directions${a.lite ? '' : ' (do not give fewer than ' + Math.max(4, (a.count || 8) - 2) + ')'}.`,
    `EDITOR'S MESSAGE: ${a.message || '(none)'}`].join('\n');
}
const S_ = (v, n = 500) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
export function validateStudy(o) {
  const okIds = (list, v) => (Array.isArray(v) ? v : v ? [v] : []).filter(x => list.some(y => y.id === x)).slice(0, 2), ans = o.answers || {};
  const items = (Array.isArray(o.items) ? o.items : []).map(i => ({ name: S_(i && i.name, 80), where: S_(i && i.where, 80), colour: S_(i && i.colour, 40), hex: hexOk(i && i.hex) })).filter(i => i.name).slice(0, 24);
  // an older helper answers in the old shape: keep what it said
  return { items, light: S_(o.light, 300), mood: S_(o.mood || o.reading, 300), purpose: S_(o.purpose, 500), scene: S_(o.scene, 400), caveat: S_(o.caveat || (!items.length ? o.sees : ''), 400), reply: S_(o.reply, 900),
    questions: (Array.isArray(o.questions) ? o.questions : []).map(q => S_(q, 200)).filter(Boolean).slice(0, 2), answers: { genre: okIds(GENRES, ans.genre), feeling: okIds(FEELINGS, ans.feeling), role: okIds(ROLES, ans.role) } };
}
/** Keeps valid suggestions and attaches encyclopedia references: the ones the model named, plus the entry for every colour it proposed. */
export function validateSuggest(o, enc, study) {
  const known = (study && study.items || []), cur = n => matchItem(known, n);
  const far = (a, b) => { const A = lchOf(a), B = lchOf(b); return !A || !B ? true : Math.hypot(A.lab[1] - B.lab[1], A.lab[2] - B.lab[2]) + Math.abs(A.L - B.L) * 0.5 > 0.03; };
  const cat = catalogue(enc), find = n => cat.find(c => c.name.toLowerCase() === String(n || '').trim().toLowerCase());
  const col = c => ({ colour: S_(c && c.colour, 40), hex: hexOk(c && c.hex) });
  const out = (Array.isArray(o.suggestions) ? o.suggestions : []).map(sg => { if (!sg) return null;
    const items = (Array.isArray(sg.items) ? sg.items : []).map(i => ({ item: S_(i && i.item, 80), ...col(i), why: S_(i && i.why, 240), accent: !!(i && i.accent) })).filter(i => i.item && (i.colour || i.hex)).map(i => { const c = cur(i.item); return { ...i, known: !!c, changes: !c || far(c.hex, i.hex) }; }).slice(0, 14);
    // a suggestion that changes nothing at all is not a suggestion; anything else is kept
    if (items.length && !items.some(i => i.changes) && !col(sg.ambience).colour) return null;
    const amb = col(sg.ambience), r = RECIPES.find(x => x.id === sg.recipe), tweaks = {};
    for (const [k, v] of Object.entries(sg.tweaks || {})) if (TWEAKS[k] && Number.isFinite(+v)) tweaks[k] = Math.min(TWEAKS[k][1], Math.max(TWEAKS[k][0], +v));
    const refs = []; const add = (c, via) => { if (c && !refs.some(x => x.name === c.name)) refs.push({ ...c, via }); };
    add(find(sg.structure), 'structure'); for (const n of Array.isArray(sg.refs) ? sg.refs : []) add(find(n), 'cited');
    // plus the encyclopedia's entry for the accent colour and the ambience: the two colours that carry the idea
    const acc = items.find(i => i.accent); for (const c of [acc, amb]) { const h = c && nearestHue(enc, c.hex); if (h && !['white', 'black', 'grey'].includes(h.id)) add(find(h.name), 'colour'); }
    const title = S_(sg.title, 80); if (!title || (!items.length && !amb.colour)) return null;
    return { title, idea: S_(sg.idea, 300), structure: (find(sg.structure) || {}).name || '', ambience: amb, items, communicates: S_(sg.communicates, 400), because: S_(sg.because, 600), refs: refs.slice(0, 8), recipe: r ? r.id : '', tweaks };
  }).filter(Boolean).slice(0, 14);
  return { reply: S_(o.reply, 900), suggestions: out };
}
const lchOf = hex => { const h = hexOk(hex); if (!h) return null; const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255), lab = srgbToOklab(r, g, b), C = Math.hypot(lab[1], lab[2]); let hue = Math.atan2(lab[2], lab[1]) * 57.29578; if (hue < 0) hue += 360; return { L: lab[0], C, h: hue, lab }; };
/**
 * Turns a suggestion into colour zones for the Lukuluku effect: each item is picked by the colour it has now
 * (from the AI's study, snapped to the nearest real colour measured in the frame) and moved to its proposed colour.
 * Up to four zones; skin is left to Skin Guard. Returns { params, mapped:[{item,from,to}], skipped:[{item,why}] }.
 */
export function zonesFor(sg, study, swatches = [], frame = null) {
  const params = {}, mapped = [], skipped = [], sw = swatches.map(x => (typeof x === 'string' ? x : x && (x.hex || x[0]))).map(lchOf).filter(Boolean);
  const amb = lchOf(sg.ambience && sg.ambience.hex); if (amb && amb.C > 0.02) { params.ambHue = +amb.h.toFixed(1); params.ambAmt = 0.5; }
  const cands = [];
  for (const it of sg.items || []) {
    const st = matchItem((study && study.items) || [], it.item);
    const to = lchOf(it.hex); let from = lchOf(st && st.hex);
    // Skin used to be refused outright. But "the face is underexposed" is the most common thing wrong with a shot,
    // and a zone is the only tool that can answer it, so skin gets a zone that moves its EXPOSURE and leaves its
    // colour to Skin Guard. A suggestion that wants to recolour a face still does not get one.
    const isSkin = /\b(skin|face|complexion|cheek|forehead|hands?)\b/i.test(it.item);
    if (!to || !from) { skipped.push({ item: it.item, why: 'the AI did not give a usable colour for it' }); continue; }
    if (isSkin) { const dL = to.L - from.L;
      if (Math.abs(dL) < 0.03) { skipped.push({ item: it.item, why: 'it is already about this bright, and its colour is left to Skin Guard' }); continue; }
      cands.push({ it, from, to: { ...from, L: to.L }, change: Math.abs(dL), skin: true, dL }); continue; }
    // the AI's idea of the current colour is approximate: use the nearest colour actually measured in the frame
    let best = null, bd = 0.12; for (const c of sw) { const d = Math.hypot(c.lab[0] - from.lab[0], (c.lab[1] - from.lab[1]) * 2, (c.lab[2] - from.lab[2]) * 2); if (d < bd) { bd = d; best = c; } } if (best) from = best;
    let dh = Math.abs(from.h - to.h); if (dh > 180) dh = 360 - dh; const change = Math.hypot(to.lab[1] - from.lab[1], to.lab[2] - from.lab[2]) + Math.abs(to.L - from.L) * 0.5;
    if (change < 0.025) { skipped.push({ item: it.item, why: 'it is already about this colour' }); continue; }
    cands.push({ it, from, to, change });
  }
  // two items that have the same colour now cannot be told apart by colour alone
  cands.sort((a, b) => b.change - a.change); const used = [];
  for (const c of cands) {
    const clash = used.find(u => (u.from.C < 0.035) === (c.from.C < 0.035) && (c.from.C < 0.035 ? Math.abs(u.from.L - c.from.L) < 0.12 : Math.min(Math.abs(u.from.h - c.from.h), 360 - Math.abs(u.from.h - c.from.h)) < 18 && Math.abs(u.from.L - c.from.L) < 0.25));
    if (clash) { skipped.push({ item: c.it.item, why: `it is the same colour as the ${clash.it.item} now, so it needs a mask` }); continue; }
    if (used.length >= 8) { skipped.push({ item: c.it.item, why: 'all eight colour zones are already in use' }); continue; }
    // A mint shirt sits at about 0.02 colourfulness: pale, but with a hue anyone can name. Treating anything under
    // 0.035 as "grey" meant the shirt, the wall and every other soft colour in a room were all the same zone, which
    // is why per-item work almost never fired on real footage.
    const n = c.from.C < 0.015;
    // how much of the picture has this colour? A small item whose colour is all over the frame cannot be picked by colour.
    if (frame) { let hit = 0, tot = 0; const N = frame.w * frame.h, step = Math.max(1, Math.floor(N / 5000));
      for (let q = 0; q < N; q += step) { const lab = srgbToOklab(frame.data[q * 4] / 255, frame.data[q * 4 + 1] / 255, frame.data[q * 4 + 2] / 255), C = Math.hypot(lab[1], lab[2]); let h = Math.atan2(lab[2], lab[1]) * 57.29578; if (h < 0) h += 360; let dh = Math.abs(h - c.from.h); if (dh > 180) dh = 360 - dh;
        // the same test the zone itself will use, or the share is measured against a different set of pixels
        const wid = c.from.C < 0.035 ? 34 : 24;
        if (n ? C < 0.015 && Math.abs(lab[0] - c.from.L) < 0.14 : dh < wid && C > Math.max(0.010, c.from.C * 0.45) && Math.abs(lab[0] - c.from.L) < 0.32) hit++; tot++; }
      const share = hit / Math.max(1, tot), small = /\b(glare|reflection|stud|earring|button|trim|frame|frames|text|logo|subtitle|ring|watch|lip|eye)/i.test(c.it.item);
      // skin is exempt: a face is meant to be a large part of the frame, and its zone only moves exposure
      if (!c.skin && (share > (n ? 0.12 : 0.5) || (small && share > 0.08))) { skipped.push({ item: c.it.item, why: `about ${Math.round(share * 100)}% of the picture has that same colour, so it needs a mask` }); continue; }
      if (share < 0.002) { skipped.push({ item: c.it.item, why: 'that colour could not be found in the frame' }); continue; } }
    used.push(c); const i = used.length, P = (k, v) => { params[`z${i}${k}`] = +(+v).toFixed(4); };
    P('Amt', 0.85); P('Hue', c.from.h); P('Wid', c.from.C < 0.035 ? 34 : 24);
    P('Cmin', n ? 0 : Math.max(0.010, c.from.C * 0.45)); P('Cmax', n ? 0.015 : 0.5);
    P('Lmin', Math.max(0, c.from.L - (n ? 0.14 : 0.32))); P('Lmax', Math.min(1, c.from.L + (n ? 0.14 : 0.32)));
    P('ToHue', c.to.h); P('ToC', Math.min(0.4, c.to.C)); P('dL', Math.max(-0.15, Math.min(0.15, (c.to.L - c.from.L) * 0.5)));
    mapped.push({ item: c.it.item, to: c.it.colour, zone: i });
  }
  return { params, mapped, skipped };
}
/**
 * A walkthrough for finishing a suggestion: what is already on the preview, how to correct a zone that caught the
 * wrong thing, and click-by-click masking for the items colour alone cannot separate.
 * z = zonesFor(...) result; cov = zoneCoverage(...) for what is on the preview now (optional).
 * Returns sections: [{ h, steps: [..] }].
 */
export function howTo(sg, hostName, z, cov) {
  const resolve = hostName === 'resolve', out = [], share = n => { const c = (cov || []).find(x => x.zone === n); return c ? c.share : null; };
  const tgt = n => { const it = (sg.items || []).find(i => i.item === n); return it ? `${it.colour}${it.hex ? ` (${it.hex})` : ''}` : 'its new colour'; };
  const left = z ? z.skipped.filter(x => !/Skin Guard|already about/.test(x.why)) : (sg.items || []).map(i => ({ item: i.item, why: '' }));
  if (z && (z.mapped.length || z.params.ambAmt)) out.push({ h: 'Already done by “Try this on my frame”', steps: [
    ...(z.params.ambAmt ? [`The ${sg.ambience.colour} ambience: a gentle tint over the mid-tones and highlights. Stronger or weaker: Tweak tab › Colour zones › “Ambience amount”.`] : []),
    ...z.mapped.map(m => { const sh = share(m.zone); return `${m.item} → ${m.to} (Zone ${m.zone})${sh == null ? '' : sh < 0.004 ? ': this zone found almost nothing, see the next section' : `: reaches about ${Math.max(1, Math.round(sh * 100))}% of the picture`}.`; }),
    'Press Apply to put all of this on your timeline as one Lukuluku Look effect. Nothing is baked in: every zone stays adjustable.'] });
  if (z && z.mapped.length) out.push({ h: 'If a zone changed the wrong thing, or too little', steps: [
    'Open the Tweak tab and find the “Colour zones” card. Each zone has five sliders. Watch the preview as you move them.',
    '“Pick hue” chooses which colour in your shot the zone grabs. If the zone missed the item, drag it slowly until the item changes.',
    '“Hue width” is how far around that colour it reaches. Narrow it if neighbours are changing too; widen it if only part of the item changes.',
    '“New hue” and “New colourfulness” set the colour it becomes. “Amount” fades the whole zone in and out; 0 switches it off.',
    'Faces changing? Raise “Skin Guard” on the same tab.'] });
  if (left.length) out.push({ h: `Needs a mask: ${left.map(x => x.item).join(', ')}`, steps: resolve ? [
    `Why: ${left.map(x => `${x.item} (${x.why || 'colour alone cannot separate it'})`).join('; ')}.`,
    'Go to the Color page. Click the last node, then press Alt/Option + S to add a new node after it.',
    'Open the Window palette (the circle icon under the viewer). Click the circle or the pen, and draw around the item in the viewer. Drag the inner and outer handles apart to soften the edge.',
    'Open the Tracker palette (the crosshair icon) and press the forward-track button so the window follows the item through the shot.',
    ...left.map(x => `${x.item}: with that node selected, turn Hue in the Primaries palette (and Sat) until it reads ${tgt(x.item)}.`),
    'Add one new node per item. Check faces last.'] : [
    `Why: ${left.map(x => `${x.item} (${x.why || 'colour alone cannot separate it'})`).join('; ')}.`,
    'In the timeline, click the adjustment layer over the shot (or the clip itself) so it is selected.',
    'Open the Effects panel (Window › Effects), type “Lumetri Color” in its search box, and drag Lumetri Color onto that layer.',
    'Open Effect Controls (Window › Effect Controls). Under the new Lumetri Color you will see three small icons: an ellipse, a rectangle and a pen. Click the pen.',
    'In the Program monitor, click around the item to draw its outline, and click the first point again to close it.',
    'Back in Effect Controls, set “Mask Feather” to about 40 so the edge is soft. Then press the play arrow next to “Mask Path”: Premiere tracks the outline through the shot.',
    ...left.map(x => `${x.item}: in that same Lumetri Color, open “Color Wheels & Match” and drag the Midtones wheel toward ${tgt(x.item)}. Open “Creative” and use Saturation to set how strong it is.`),
    'One Lumetri Color per item. Rename each (right-click › Rename) so you can find it later. Check faces last.'] });
  if (!out.length) out.push({ h: 'Nothing to do by hand', steps: ['Press “Try this on my frame” to build this suggestion on your preview.'] });
  return out;
}

/** An AI-made picture of the frame wearing a suggestion (Gemini image models; needs billing on the key). Returns a data URL. */
export const GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'];
export async function picture(cfg, sg, imageB64, post, mime = 'image/jpeg') {
  if (!cfg.geminiKey) throw new Error('An AI picture needs a Google Gemini key. Add one under “AI”.');
  const text = `Recolour this exact photograph. Keep every person, object, position, pose, expression, framing, lens and lighting direction exactly as they are: change colour only, as a film colourist and production designer would.\nColour direction “${sg.title}”: ${sg.idea}\nAmbience (colour of the light and air): ${sg.ambience.colour || 'unchanged'}.\n${sg.items.map(i => `- ${i.item}: ${i.colour}${i.hex ? ` (${i.hex})` : ''}`).join('\n')}\nKeep skin tones believable. Do not add, remove or redraw anything. Return the image only.`;
  const order = [...(cfg.geminiImageModel ? [cfg.geminiImageModel] : []), ...GEMINI_IMAGE_MODELS.filter(m => m !== cfg.geminiImageModel)]; let last = null;
  for (const model of order) {
    let r; try { r = await Promise.race([post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
      JSON.stringify({ contents: [{ role: 'user', parts: [{ text }, { inline_data: { mime_type: mime, data: imageB64 } }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })), new Promise((_, rej) => setTimeout(() => rej(new Error('took too long')), 120000))]); }
    catch (e) { last = e; continue; }
    if (r.status === 404) { last = new Error('gone'); continue; }
    if (r.status === 429 || r.status === 403 || /billing|free tier|quota/i.test(r.text) && r.status >= 400) throw new Error('Google does not make pictures on a free key: its image models need billing switched on for your key (about 3 US cents a picture). You can turn that on at aistudio.google.com, or keep using “Try this on my frame”, which is free.');
    if (r.status < 200 || r.status >= 300) { last = new Error(`Google answered ${r.status}: ${r.text.slice(0, 160)}`); continue; }
    let j; try { j = JSON.parse(r.text); } catch { last = new Error('unreadable answer'); continue; }
    const part = ((j.candidates || [])[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data), d = part && (part.inlineData || part.inline_data);
    if (d && d.data) return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
    last = new Error('Google returned no picture for this one (it sometimes declines pictures of people). Try another suggestion.');
  }
  throw last && !/gone/.test(last.message) ? last : new Error('Google\'s picture models could not be reached with this key.');
}

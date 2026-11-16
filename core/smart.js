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
export const DEFAULTS = { provider: 'auto', autoAsk: true, ollamaUrl: 'http://localhost:11434', ollamaModel: '', openaiUrl: 'http://localhost:5273/v1', openaiModel: '', geminiModel: 'gemini-flash-latest' };
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
export async function ask(cfg, { prompt, imageB64, images = [], history = [], system = null, lite = false }, post, bridge) {
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
    const j = await postJSON(post, trim(cfg.ollamaUrl) + '/api/chat', {}, { model: cfg.ollamaModel, messages: msgs, format: 'json', stream: false, options: { temperature: 0.4, num_ctx: 8192 } }, 300000);
    return (j.message && j.message.content) || '';
  }
  if (cfg.provider === 'openai') {
    const msgs = [{ role: 'system', content: SYS }, ...hist.map(h => ({ role: h.role, content: h.text })),
      { role: 'user', content: [{ type: 'text', text: prompt }, ...[imageB64, ...more].map(b => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b } }))] }];
    const j = await postJSON(post, trim(cfg.openaiUrl) + '/chat/completions', cfg.openaiKey ? { authorization: 'Bearer ' + cfg.openaiKey } : {}, { model: cfg.openaiModel, messages: msgs, temperature: 0.4 });
    return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  }
  if (cfg.provider === 'gemini') {
    if (!cfg.geminiKey) throw new Error('Add your Gemini API key in Smart mode settings');
    const contents = [...hist.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: prompt }, ...[imageB64, ...more].map(b => ({ inline_data: { mime_type: 'image/png', data: b } }))] }];
    const j = await postJSON(post, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.geminiModel || DEFAULTS.geminiModel)}:generateContent`, { 'x-goog-api-key': cfg.geminiKey },
      { systemInstruction: { parts: [{ text: SYS }] }, contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
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
1. ITEMS: list every distinct thing you can see, however small: people (and what each wears, piece by piece), skin, hair, props, furniture, lamps and other light sources, walls, floor, sky, vegetation, vehicles, screens, text and graphics, background areas. For each: where it is in the frame, and its colour now as a plain name and a hex code. Aim for 8 to 20 items. Never invent items you cannot see. If you were not given the picture itself, list only what the measurements and descriptions support and say so in "caveat".
2. LIGHT: where the light comes from, its quality and colour, time of day if it shows.
3. PURPOSE: what this shot is doing in its scene, inferred from the frame, the contact sheet, the timeline notes and what the editor said. Say what you are unsure of.
4. Ask at most two short questions only if the answer would change the colour advice.
Only the layers listed under LAYERS IN SCOPE matter: ignore anything that belongs to an excluded layer (for example a title the editor unticked).
If the editor wrote a message, answer it in "reply" and update your understanding with what they told you.
${JSON_ONLY}
{"items":[{"name":"","where":"","colour":"","hex":"#000000"}],"light":"","mood":"what the picture feels like now","purpose":"","scene":"what the surrounding scene seems to be","caveat":"","reply":"","questions":[""],"answers":{"genre":[],"feeling":[],"role":[]}}`;

export const SYSTEM_SUGGEST = `You are the colourist's assistant inside Colored Lens. You have already studied a frame (UNDERSTANDING lists its items). Now propose colour directions for it.
Give as many genuinely different directions as you can, up to the number asked for. Each one must be worth trying, and must differ from the others in its idea, not just in strength.
For each direction:
- "title": a short name. "idea": one sentence on the colour idea.
- "ambience": the overall colour of the light and air (name + hex).
- "items": go through the ITEMS of the frame and say what colour each important one should be in this direction (name + hex), and why, in one short clause. Cover at least four items; keep skin believable unless the idea is deliberately stylised, and say so. Use the items' names exactly as given.
- "communicates": what this configuration tells the audience. "because": why it works for this frame and this scene (colour relationships, contrast, where the eye goes, what it does to faces).
- "refs": 2 to 5 names copied exactly from ENCYCLOPEDIA that explain or exemplify the direction.
- "recipe": the id from RECIPES of the Lukuluku look that gets the whole picture closest to this direction, and optional "tweaks" from TWEAKS within their ranges.
Respect LAYERS IN SCOPE and the editor's answers and messages. Be specific to this frame; no film-school boilerplate.
${JSON_ONLY}
{"reply":"","suggestions":[{"title":"","idea":"","ambience":{"colour":"","hex":"#000000"},"items":[{"item":"","colour":"","hex":"#000000","why":""}],"communicates":"","because":"","refs":[""],"recipe":"","tweaks":{}}]}`;

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
    `HOW MANY: up to ${a.count || 8} directions.`,
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
export function validateSuggest(o, enc) {
  const cat = catalogue(enc), find = n => cat.find(c => c.name.toLowerCase() === String(n || '').trim().toLowerCase());
  const col = c => ({ colour: S_(c && c.colour, 40), hex: hexOk(c && c.hex) });
  const out = (Array.isArray(o.suggestions) ? o.suggestions : []).map(sg => { if (!sg) return null;
    const items = (Array.isArray(sg.items) ? sg.items : []).map(i => ({ item: S_(i && i.item, 80), ...col(i), why: S_(i && i.why, 240) })).filter(i => i.item && (i.colour || i.hex)).slice(0, 14);
    const amb = col(sg.ambience), r = RECIPES.find(x => x.id === sg.recipe), tweaks = {};
    for (const [k, v] of Object.entries(sg.tweaks || {})) if (TWEAKS[k] && Number.isFinite(+v)) tweaks[k] = Math.min(TWEAKS[k][1], Math.max(TWEAKS[k][0], +v));
    const refs = []; const add = (c, via) => { if (c && !refs.some(x => x.name === c.name)) refs.push({ ...c, via }); };
    for (const n of Array.isArray(sg.refs) ? sg.refs : []) add(find(n), 'cited');
    for (const c of [amb, ...items]) { const h = nearestHue(enc, c.hex); if (h) add(find(h.name), 'colour'); }
    const title = S_(sg.title, 80); if (!title || (!items.length && !amb.colour)) return null;
    return { title, idea: S_(sg.idea, 300), ambience: amb, items, communicates: S_(sg.communicates, 400), because: S_(sg.because, 600), refs: refs.slice(0, 8), recipe: r ? r.id : '', tweaks };
  }).filter(Boolean).slice(0, 14);
  return { reply: S_(o.reply, 900), suggestions: out };
}
/** Plain steps for doing a suggestion by hand in the host's own colour tools (until colour zones can do it in one click). */
export function howTo(sg, hostName) {
  const resolve = hostName === 'resolve', steps = [];
  steps.push(resolve ? 'Work on a new serial node (Alt/Option + S) so the original grade stays untouched.' : 'Put an adjustment layer over the shot (Project panel › New Item › Adjustment Layer) and work on it, so the clip itself stays untouched.');
  if (sg.recipe) steps.push('Press “Preview look” here, then Apply: that sets the overall grade and film character for this direction.');
  if (sg.ambience && sg.ambience.colour) steps.push(resolve ? `Ambience (${sg.ambience.colour}): on the first node push Gain and Gamma slightly toward ${sg.ambience.colour}; keep Lift neutral so blacks stay clean.` : `Ambience (${sg.ambience.colour}): in Lumetri › Color Wheels push Midtones and Highlights slightly toward ${sg.ambience.colour}; leave Shadows neutral so blacks stay clean.`);
  if (sg.items.length) steps.push(resolve ? 'For each item below: add a serial node, click the item with the Qualifier eyedropper, soften the key, then turn Hue and Sat until it reads the target colour. If other things of the same colour change too, add a Power Window around the item and track it.'
    : 'For each item below: add another Lumetri Color effect on the adjustment layer, open HSL Secondary, click the item with the Set Color eyedropper, tick “Color/Gray” to check what is selected, clean it with Denoise and Blur, then move the colour wheel underneath until it reads the target colour. If other things of the same colour change too, draw a mask on that Lumetri effect around the item and track it.');
  sg.items.forEach(i => steps.push(`${i.item} → ${i.colour}${i.hex ? ` (about ${i.hex})` : ''}.`));
  steps.push('Check faces last: if skin drifted, lower that step’s strength or exclude skin from its key.');
  return steps;
}

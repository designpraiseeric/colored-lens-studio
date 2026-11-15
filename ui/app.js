// Colored Lens panel: one app for Premiere Pro (UXP), DaVinci Resolve Studio (Workflow Integration) and the web.
// Everything host-specific goes through `host` (see hosts/README.md). Plain DOM + flexbox so it runs inside UXP.
//
// The loop: read the frame -> say what it is for -> get directions -> preview them on the frame -> tweak live ->
// apply to clips -> save as a preset -> apply the preset to other shots.
import { readFrame } from '../core/analysis.js';
import { checkSkin, vectorscope } from '../core/skin.js';
import { pngDataUrl, encodePNG } from '../core/image.js';
import { shotRecord, encodeShot, decodeShot, renderStrip, readSequence, scriptCSV } from '../core/script.js';
import { parseLookInput, formatCode, fullGrade, makePixelFn, bakeCube, lookToEngineParams, shareLink, computeMatch, matchStats, hasCurves, GRADE0 } from '../core/look.js';
import { GENRES, FEELINGS, ROLES, KIND_LABEL, pickDirections, describeEffect, whyFor, frameSummary, answers, isDark } from '../core/directions.js';
import { previewer, wipe } from '../core/preview.js';
import { listPresets, savePreset, deletePreset, duplicatePreset, presetCode, importPresetCode, settings } from '../core/presets.js';
import { Updater } from '../core/updates.js';
import config from '../studio.config.json';
import { sliderHTML, wireSliders } from './slider.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = s => String(s ?? '').replace(/<[^>]+>/g, '');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const pct = v => Math.round(v * 100) + '%';
const clone = o => JSON.parse(JSON.stringify(o));
const XDEF = { skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1 };
const NEUTRAL_LOOK = () => ({ L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C0', M: 'M0', A: '2.39', G: fullGrade({}) });
const normIntent = i => ({ genre: answers(i.genre), feeling: answers(i.feeling), role: answers(i.role), note: i.note || '' });
const lookCode = (l, matte) => { const c = formatCode(l); return matte ? c : c.replace(/·[\d.]+$/, ''); };

export async function startApp(host, root) {
  const S = { tab: 'shot', back: 'shot', frame: null, meta: null, reading: null, skin: null, sample: null, shots: [],
    intent: normIntent(settings.get('intent', {})), seqId: '', ctx: null, lead: 0, input: settings.get('input', 'rec709'),
    directions: [], chosen: -1, look: NEUTRAL_LOOK(), extra: { ...XDEF }, matte: false, recipe: { name: '', presetId: null }, view: 'split', wipe: 0.5,
    refFrameStats: null, refName: '', adapt: settings.get('adapt', true), encQ: '', shownCode: '', confirmDel: '', busy: false, showSkin: false, showRefs: false };
  let PV = null;
  const up = new Updater(host, config.pagesBase);
  root.innerHTML = `
    <div class="cl">
      <div id="banner" class="banner" hidden></div>
      <div class="head"><div class="brand">Colored Lens <span class="dim">· ${esc(host.label || host.name)}</span></div><div class="row tight"><span id="status" class="dim small"></span><div role="button" tabindex="0" id="encBtn" class="linkbtn small">Encyclopedia</div></div></div>
      <div class="tabs">${['shot:Shot', 'scene:Scene', 'tweak:Tweak', 'presets:Presets'].map(t => { const [id, n] = t.split(':'); return `<div data-tab="${id}" class="tab" role="tab" tabindex="0">${n}</div>`; }).join('')}</div>
      <div id="body" class="body"></div>
      <div id="toast" class="toast" hidden></div>
    </div>`;
  const toast = (t, ms = 2600) => { const e = $('#toast', root); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms); };
  const busy = async (label, fn) => { if (S.busy) return; S.busy = true; status(label + '…'); try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 6000); } finally { S.busy = false; status(); } };
  const status = t => { const c = up.content && up.content.manifest; $('#status', root).textContent = t || `v${host.version}${c ? ' · content ' + c.contentVersion.slice(0, 7) : ''}`; };
  const go = tab => { if (tab === 'enc' && S.tab !== 'enc') S.back = S.tab; S.tab = tab; render(); };
  root.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  $('#encBtn', root).onclick = () => { S.encQ = ''; go('enc'); };

  // ---------- content + updates (silent) ----------
  await up.load();
  if (!up.content.encyclopedia) { $('#body', root).innerHTML = '<p class="warn">The encyclopedia could not be loaded. Connect to the internet once so it can be downloaded.</p>'; }
  status();
  up.sync().then(changed => { if (changed) { toast('Encyclopedia updated from GitHub'); render(); } status(); }).catch(() => {});
  up.check().then(info => {
    if (!info.ok || !info.newer) return;
    const b = $('#banner', root); b.hidden = false;
    b.innerHTML = `<b>Colored Lens ${esc(info.latest)} is available</b> <span class="dim">(you have ${esc(info.current)})</span><div class="small">${esc(info.notes || '').slice(0, 220)}</div>
      <div class="row"><button id="doUpdate" class="primary">Install update</button><button id="seeUpdate">What's new</button><button id="hideUpdate">Later</button></div>`;
    $('#doUpdate', root).onclick = async () => {
      if (S.busy) return; S.busy = true; status('Downloading update…');
      try {
        const where = await up.install(info, p => status(`Downloading update ${pct(p)}`));
        b.innerHTML = `<b>The installer is open.</b> Follow it, then restart ${esc(host.label || host.name)}.${where ? `<div class="small dim">Saved at ${esc(where)}</div>` : ''}`;
      } catch (e) {
        console.error(e);
        b.innerHTML = `<b>The update could not be installed from here.</b><div class="small">${esc(e.message || String(e))}</div>
          <div class="row"><button id="manualUpdate" class="primary">Download from GitHub</button><button id="hideUpdate2">Later</button></div>
          <div class="small dim">Open the downloaded installer, then restart ${esc(host.label || host.name)}.</div>`;
        $('#manualUpdate', root).onclick = () => host.openUrl(info.page); $('#hideUpdate2', root).onclick = () => (b.hidden = true);
      } finally { S.busy = false; status(); }
    };
    $('#seeUpdate', root).onclick = () => host.openUrl(info.page);
    $('#hideUpdate', root).onclick = () => (b.hidden = true);
  });

  const enc = () => up.content.encyclopedia, cat = () => up.content.looks.catalog, refs = () => up.content.refs;
  const lutsFor = async look => ({ C0: await up.lut('C0'), [look.C]: await up.lut(look.C) });
  const swatchBar = sw => `<div class="swbar">${sw.map(s => `<div style="flex:${Math.max(0.02, s.share ?? s[1])};background:${s.hex || s[0]}" title="${s.hex || s[0]}"></div>`).join('')}</div>`;
  const axisTable = id => ({ L: cat().lighting, O: cat().optics, H: cat().atmosphere, K: cat().lens, D: cat().diffusion, C: cat().color, M: cat().medium })[id[0]];
  const lookName = id => { const t = axisTable(id); return t && t[id] ? t[id].name : id; };
  const shortName = id => { const t = axisTable(id); return t && t[id] ? t[id].short : ''; };
  const lookChips = ids => ids.length ? `<div class="chips">${ids.map(id => `<button class="chip" data-look="${id}" title="${esc(lookName(id))}">${id} ${esc(shortName(id))}</button>`).join('')}</div>` : '';
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-look]'); if (!c) return; const id = c.dataset.look;
    if ('KDCM'.includes(id[0])) { S.look[id[0]] = id; S.recipe = { name: S.recipe.name || lookName(id), presetId: S.recipe.presetId }; go('tweak'); toast(`${id} ${shortName(id)} set in Tweak`); }
    else toast(`${id} ${lookName(id)} is an in-camera choice (lighting / lens / atmosphere): see it in Lukuluku`);
  });
  root.addEventListener('click', e => { const a = e.target.closest('[data-url]'); if (a) { e.preventDefault(); host.openUrl(a.dataset.url); } });
  root.addEventListener('click', e => { const a = e.target.closest('[data-more]'); if (a) { e.preventDefault(); S.encQ = a.dataset.more; go('enc'); } });

  // ---------- reading ----------
  // answers are remembered per sequence: switching sequences brings back that sequence's answers
  function saveIntent() { settings.set('intent', S.intent); if (S.seqId) { const m = settings.get('intentBySeq', {}); m[S.seqId] = S.intent; settings.set('intentBySeq', m); } }
  function useSequence(id) {
    if (!id || id === S.seqId) return; S.seqId = id; const m = settings.get('intentBySeq', {});
    if (m[id]) S.intent = normIntent(m[id]); else saveIntent();
  }
  async function grab() {
    const g = await host.grabFrame(); S.frame = g.frame; S.meta = g; S.sample = null; S.chosen = -1; S.lead = 0;
    useSequence(g.sequenceId); S.ctx = null;
    if (host.clipContext) try { S.ctx = await host.clipContext(); } catch (e) { console.warn('timeline context', e); }
    PV = previewer(S.frame, cat(), lutsFor); stageCache.key = '';
    S.reading = readFrame(S.frame, enc(), refs()); runSkin(); return g;
  }
  const lowKey = () => isDark(S.intent);
  function runSkin() { if (S.frame) S.skin = checkSkin(S.frame, { sample: S.sample, input: S.input, lowKey: lowKey(), lead: S.lead }); }
  async function suggest() {
    if (!S.frame) return;
    const ds = pickDirections(S.intent, { reading: S.reading, skin: S.skin, input: S.input });
    for (const d of ds) {
      const fn = makePixelFn(d.look, cat(), await lutsFor(d.look), { input: S.input, keepExposure: true, extra: { ...XDEF, ...d.extra } });
      d.effect = describeEffect(fn, S.reading, S.skin); d.why = whyFor(d, S.intent, enc());
      d.thumb = pngDataUrl(await PV.render(d.look, { ...XDEF, ...d.extra }, S.input, 200));
    }
    S.directions = ds; if (S.chosen >= ds.length) S.chosen = -1;
  }
  function choose(i) {
    const d = S.directions[i]; if (!d) return; S.chosen = i;
    S.look = clone(d.look); S.extra = { ...XDEF, ...d.extra }; S.matte = false; S.recipe = { name: d.name, presetId: null };
  }

  // ---------- the stage: a large before / after preview with a wipe ----------
  const stageCache = { key: '', before: null, after: null };
  const stageHTML = (clickable, hint) => `<div class="stage">
      ${S.frame ? `<img id="stage" class="frame ${clickable ? 'click' : ''}" src="">
      <div class="row tight">${['before:Before', 'split:Split', 'after:After'].map(v => { const [id, n] = v.split(':'); return `<div role="button" tabindex="0" class="seg ${S.view === id ? 'on' : ''}" data-view="${id}">${n}</div>`; }).join('')}
        <div class="grow">${S.view === 'split' ? sliderHTML({ id: 'wipe', label: 'Wipe', min: 0, max: 1, step: 0.01, value: S.wipe, def: 0.5 }) : ''}</div></div>
      <div class="small dim">${hint || ''}</div>` : ''}</div>`;
  function wireStage(body, onClickImg) {
    body.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; render(); });
    wireSliders(body.querySelector('.stage') || body, (id, v) => { if (id === 'wipe') { S.wipe = v; composite(); } });
    const img = $('#stage', body); if (img && onClickImg) img.onclick = e => { const r = img.getBoundingClientRect(); onClickImg((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    drawStage();
  }
  let stageT = 0, stageSeq = 0;
  function drawStage() {
    clearTimeout(stageT); const seq = ++stageSeq;
    stageT = setTimeout(async () => {
      if (!S.frame || !$('#stage', root)) return;
      const showLook = !(S.tab === 'shot' && S.chosen < 0);
      const key = JSON.stringify([showLook, S.look, S.extra, S.input]);
      if (stageCache.key !== key) {
        const before = PV.before(640), after = showLook ? await PV.render(S.look, S.extra, S.input, 640) : before;
        if (seq !== stageSeq) return; Object.assign(stageCache, { key, before, after });
      }
      composite();
    }, 60);
  }
  function composite() {
    const img = $('#stage', root); if (!img || !stageCache.before) return;
    const same = stageCache.after === stageCache.before;
    img.src = pngDataUrl(same ? stageCache.before : wipe(stageCache.before, stageCache.after, S.wipe, S.view));
  }

  // ---------- applying ----------
  async function applyLookToClips(look, extra, input, matte) {
    const C = cat(), params = lookToEngineParams(look, C, { matte, params: { ...extra, input: input === 'logc3' ? 1 : 0 } });
    const res = await host.applyLook({ params, look, makeCube: async () => bakeCube(look, C, await lutsFor(look), { input, keepExposure: true, extra }) });
    toast(res.message, 6000); return res;
  }
  async function saveCurrentAsPreset(name, asNew) {
    const thumb = S.frame && PV ? pngDataUrl(await PV.render(S.look, S.extra, S.input, 120)) : '';
    const p = savePreset({ id: asNew ? null : S.recipe.presetId, name: name || S.recipe.name || 'Untitled look', look: S.look, extra: S.extra, input: S.input, matte: S.matte,
      intent: clone(S.intent), from: S.meta ? `${S.meta.clipName || ''} ${S.meta.timecode || ''}`.trim() : '', ref: S.frame ? matchStats(S.frame) : null, thumb });
    S.recipe = { name: p.name, presetId: p.id }; toast(`Saved preset “${p.name}”`); return p;
  }
  function presetExtra(p) {
    const extra = { ...XDEF, ...p.extra };
    if (S.adapt && p.ref && S.frame) Object.assign(extra, computeMatch(matchStats(S.frame), p.ref), { matchAmt: 0.6 });
    return extra;
  }

  // ---------- tabs ----------
  function render() {
    root.querySelectorAll('.tab').forEach(b => { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const body = $('#body', root); if (body && render.lastTab !== S.tab) { body.scrollTop = 0; render.lastTab = S.tab; }
    if (!up.content.encyclopedia) return;
    ({ shot: renderShot, scene: renderScene, tweak: renderTweak, presets: renderPresets, enc: renderEnc })[S.tab](body);
  }

  // SHOT ------------------------------------------------------------------
  const chipRow = (list, key) => { const cur = answers(S.intent[key]);
    return `<div class="chips">${list.map(x => { const k = cur.indexOf(x.id); return `<div role="button" tabindex="0" class="chip ${k === 0 ? 'on' : k === 1 ? 'on2' : ''}" data-intent="${key}:${x.id}" title="${k === 0 ? 'Main answer' : k === 1 ? 'Second answer' : 'Tap to add (up to two)'}">${k === 0 ? '✓ ' : k === 1 ? '+ ' : ''}${esc(x.n)}</div>`; }).join('')}</div>`; };
  function renderShot(body) {
    const r = S.reading, k = S.skin, I = S.intent;
    const hint = S.chosen >= 0 ? `Previewing <b>${esc(S.directions[S.chosen].name)}</b> (colour, grain and vignette; halation and glow show on the clip).
        <div class="row wrap"><button class="primary" data-dapply="${S.chosen}">Apply to selected clips</button><button data-dtweak="${S.chosen}">Tweak</button><button data-dsave="${S.chosen}">Save as preset</button><button id="dclear">Back to the original</button></div>` : 'Click a face in the picture to check its skin. Pick a direction below to preview it here.';
    body.innerHTML = `
      <div class="row"><button id="grab" class="primary">${esc(host.grabLabel || 'Read the frame under the playhead')}</button>${S.frame ? `<span class="small dim">${esc(S.meta.clipName || '')} ${esc(S.meta.timecode || '')}</span>` : ''}</div>
      ${S.frame ? stageHTML(true, hint) : `<p class="dim">Park the playhead on a shot and read it. Colored Lens tells you what the frame is doing, asks what it is for, and suggests directions you can preview, tweak, apply and save.</p>`}
      ${S.ctx ? contextCard(S.ctx) : ''}
      <div id="reading">${r ? readingCard(r, k) : ''}</div>
      <div class="card"><div class="k">What is this for?</div>
        <p class="small dim">Tap up to two answers per question when a shot is more than one thing; the first is the main one.${S.seqId ? ` Remembered for the sequence “${esc(S.meta && S.meta.sequenceName || '')}”.` : ''}</p>
        <div class="q">The project</div>${chipRow(GENRES, 'genre')}
        <div class="q">This scene should feel</div>${chipRow(FEELINGS, 'feeling')}
        <div class="q">This shot is</div>${chipRow(ROLES, 'role')}
        <div class="q">The footage is</div><div class="chips"><div role="button" tabindex="0" class="chip ${S.input === 'rec709' ? 'on' : ''}" data-input="rec709">${S.input === 'rec709' ? '✓ ' : ''}Normal video (Rec.709)</div><div role="button" tabindex="0" class="chip ${S.input === 'logc3' ? 'on' : ''}" data-input="logc3">${S.input === 'logc3' ? '✓ ' : ''}Log (ARRI LogC3)</div></div>
        <div class="row"><input id="note" placeholder="Anything else about this scene? (saved with presets)" value="${esc(I.note)}"></div>
        ${!S.frame ? '<p class="small dim">Your answers are remembered. Read a frame to get directions.</p>' : ''}</div>
      <div id="dirs">${directionsHTML()}</div>
      ${k ? skinCard(k) : ''}
      ${r && r.matches.length ? `<div class="card"><div class="row tight"><div class="k grow">Similar frames in the encyclopedia</div><button class="small" id="togRefs">${S.showRefs ? 'Hide' : 'Show'}</button></div>${S.showRefs ? refsHTML(r) : ''}</div>` : ''}`;
    $('#grab', body).onclick = () => busy('Reading frame', async () => { await grab(); await suggest(); render(); });
    body.querySelectorAll('[data-intent]').forEach(b => b.onclick = () => {
      const [key, id] = b.dataset.intent.split(':'), cur = answers(S.intent[key]);
      S.intent[key] = cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 2 ? [...cur, id] : [cur[0], id]; saveIntent();
      if (key === 'feeling') runSkin();
      if (S.frame) busy('Finding directions', async () => { await suggest(); S.chosen = -1; render(); }); else render();
    });
    body.querySelectorAll('[data-input]').forEach(b => b.onclick = () => { S.input = b.dataset.input; settings.set('input', S.input); runSkin(); stageCache.key = '';
      if (S.frame) busy('Finding directions', async () => { await suggest(); render(); }); else render(); });
    $('#note', body).onchange = e => { S.intent.note = e.target.value; saveIntent(); };
    body.querySelectorAll('[data-suggest]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.suggest.split(':');
      if (k === 'input') { S.input = v; settings.set('input', v); stageCache.key = ''; } else { S.intent[k] = [v, ...answers(S.intent[k]).filter(x => x !== v)].slice(0, 2); saveIntent(); }
      runSkin(); busy('Finding directions', async () => { await suggest(); render(); }); });
    body.querySelectorAll('[data-lead]').forEach(b => b.onclick = () => busy('Checking skin', async () => { S.lead = +b.dataset.lead; S.sample = null; runSkin(); await suggest(); render(); }));
    if ($('#togRefs', body)) $('#togRefs', body).onclick = () => { S.showRefs = !S.showRefs; render(); };
    if ($('#togSkin', body)) $('#togSkin', body).onclick = () => { S.showSkin = !S.showSkin; render(); };
    if ($('#autoSkin', body)) $('#autoSkin', body).onclick = () => busy('Checking skin', async () => { S.sample = null; runSkin(); await suggest(); render(); });
    body.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
      const f = k.fixes[+b.dataset.fix]; if (S.chosen < 0 && !S.recipe.name) { S.look = NEUTRAL_LOOK(); S.recipe = { name: 'Skin fix', presetId: null }; }
      for (const [key, v] of Object.entries(f.params)) { if (key in S.extra) S.extra[key] = v; else S.look.G[key] = v; }
      go('tweak'); toast('Fix set in Tweak');
    });
    body.querySelectorAll('[data-matchref]').forEach(b => b.onclick = () => {
      const m = r.matches[+b.dataset.matchref], ref = refs().frames.find(f => f.id === m.id);
      S.extra = { ...S.extra, ...computeMatch(matchStats(S.frame), ref.ms) }; S.refName = m.title; go('tweak'); toast(`Match to “${m.title}” set in Tweak`);
    });
    wireDirections(body);
    if (S.frame) wireStage(body, (x, y) => busy('Checking skin', async () => { S.sample = [x, y]; runSkin(); await suggest(); S.showSkin = true; render(); toast(S.skin.found ? `Skin sampled: about ${S.skin.ire} IRE` : 'No skin there; try the middle of a cheek'); }));
  }
  // What the timeline says about this shot. Context proposes; the editor decides.
  function contextCard(c) {
    const sub = c.subject, kinds = { video: 'footage', nested: 'nested sequence', graphic: 'graphic / title', adjustment: 'adjustment layer' };
    if (!sub) return `<div class="card ctx"><p class="small">No clip under the playhead on an enabled video track.</p></div>`;
    const lines = [], tips = [];
    lines.push(`Reading <b>V${sub.track} · ${esc(sub.name)}</b> (${kinds[sub.kind]})${sub.selected ? ', selected' : ', under the playhead'}.`);
    if (c.above.length) lines.push(`Also in the picture above it: ${c.above.map(l => `V${l.track} ${esc(kinds[l.kind])} “${esc(l.name)}”`).join(', ')}. The reading includes ${c.above.length === 1 ? 'it' : 'them'}.`);
    if (sub.lumetri) lines.push('This clip already has a Lumetri grade, so the reading is of the graded image.');
    if (sub.look) lines.push('This clip already has Lukuluku Look: Apply will update it rather than add a second one.');
    if (sub.inputLUT && S.input === 'logc3') tips.push(['input:rec709', 'Premiere already converts this clip with an input LUT, so it plays as normal video.', 'Set footage to normal video']);
    if (sub.kind === 'graphic' && !answers(S.intent.role).includes('graphic')) tips.push(['role:graphic', `V${sub.track} holds a graphic or still, not camera footage.`, 'Mark this shot as title / graphic']);
    if (sub.kind === 'adjustment') lines.push('This is an adjustment layer: a look here colours every track beneath it.');
    return `<div class="card ctx"><div class="k">On the timeline</div>${lines.map(l => `<p class="small">${l}</p>`).join('')}
      ${tips.map(([key, why, label]) => `<div class="row wrap"><span class="small grow">${esc(why)}</span><button data-suggest="${key}">${esc(label)}</button></div>`).join('')}</div>`;
  }
  function readingCard(r, k) {
    const e = enc(), named = r.hues.filter(h => h.entry && h.share >= 0.03).slice(0, 5), lead = r.lead;
    const skinLine = !k ? '' : k.mode === 'sampled' && k.found ? `<b>Face (sampled):</b> about ${k.ire} IRE${k.ire < 40 ? ', dark for a key-lit face (40–75)' : k.ire > 80 ? ', hot for a face (40–75)' : ', inside the usual 40–75'}.`
      : k.found ? `<b>${k.faces.length > 1 ? `${k.faces.length} possible faces` : 'Possible face'}</b>${k.faces.length > 1 ? `; face ${k.lead + 1} at about ${k.ire} IRE` : ` at about ${k.ire} IRE`} (found by colour, so it may be a warm object). Click a face in the picture to confirm${k.faces.length > 1 ? ', or pick the lead face in Skin check' : ''}.` : 'No face found by colour. If there is a person, click their face in the picture.';
    return `<div class="card"><div class="k">What the frame is doing</div>
      <p>${esc(frameSummary(r, e))}</p>
      ${swatchBar(r.swatches)}
      <div class="small">${named.map(h => `<span class="pill" style="border-color:${h.entry.hex}">${esc(h.entry.name.split(' / ')[0])} ${pct(h.share)}</span>`).join(' ')}</div>
      <div class="facts small">Deep shadow ${pct(r.tones.shadow)} of the picture${r.tones.highlight > 0.02 ? ` · blown highlights ${pct(r.tones.highlight)}` : ''} · contrast ${r.stats.contrast.toFixed(2)}${r.area.bars ? ` · ${r.area.bars} bars ignored` : ''}</div>
      ${lead ? `<p class="small"><b>${esc(lead.entry.name)}</b>: ${esc(lead.entry.tag.toLowerCase())}. <a href="#" data-more="${esc(lead.entry.name.split(' / ')[0])}">More</a></p>` : ''}
      ${r.pal.entry ? `<p class="small"><b>${esc(r.pal.entry.n)}</b> palette${r.pal.confidence < 0.55 ? ' (borderline)' : ''}: ${esc(r.pal.why[r.pal.why.length - 1])} <a href="#" data-more="${esc(r.pal.entry.n)}">More</a></p>` : ''}
      ${r.confidence.level !== 'high' ? `<p class="small warn">${esc(r.confidence.why.join(' '))}</p>` : ''}
      <p class="small">${skinLine}</p></div>`;
  }
  function skinCard(k) {
    const icon = l => ({ good: '●', warn: '▲', info: '◆' })[l];
    return `<div class="card"><div class="row tight"><div class="k grow">Skin check ${k.mode === 'sampled' ? '(sampled)' : '(automatic)'}</div>${k.mode === 'sampled' ? '<button class="small" id="autoSkin">Automatic</button>' : ''}<button class="small" id="togSkin">${S.showSkin ? 'Hide' : 'Show'}</button></div>
      ${S.showSkin ? `${k.mask ? `<img class="frame" src="${pngDataUrl(k.mask)}">` : ''}
      ${k.faces && k.faces.length > 1 ? `<div class="faces">${k.faces.map((f, i) => `<div class="face ${i === k.lead ? 'on' : ''}"><span class="sw" style="background:${f.swatch}"></span><b>Face ${f.n}</b> <span class="small">${f.ire} IRE · ${f.ire < 40 ? 'dark' : f.ire > 80 ? 'hot' : 'in range'}${i === 0 ? ' · largest' : ''}</span>${i === k.lead ? '<span class="small dim"> · lead</span>' : `<button class="small" data-lead="${i}">Make lead</button>`}</div>`).join('')}<p class="small dim">Boxes on the picture: red is the lead face, white the others; ticks count the face number.</p></div>` : ''}
      ${k.L != null ? `<div class="facts small">${pct(k.coverage)} of the picture · about ${k.ire} IRE · density ${(k.C * 100).toFixed(1)} · hue ${Math.round(k.H)}° <span class="sw" style="background:${k.swatch}"></span></div>` : ''}
      ${k.findings.map(f => `<div class="finding ${f.level}"><b>${icon(f.level)} ${esc(f.title)}</b><p class="small">${esc(f.text)}</p></div>`).join('')}
      ${k.fixes.length ? `<div class="row wrap">${k.fixes.map((f, i) => `<button data-fix="${i}">${esc(f.label)}</button>`).join('')}</div>` : ''}
      <div class="row"><img class="scope" src="${pngDataUrl(vectorscope(S.frame))}"><p class="small dim">Vectorscope. The orange line is the skin-tone line: healthy skin of every complexion sits along it; how far out it reaches is saturation, not complexion.</p></div>
      <p class="small"><a href="#" data-more="Skin, Exposure">Skin, exposure and equity (§7)</a></p>` : `<p class="small dim">${esc((k.findings.find(f => f.level === 'warn') || k.findings[0] || {}).title || '')}</p>`}</div>`;
  }
  const refsHTML = r => `<div class="refs">${r.matches.map((m, i) => `
    <div class="ref"><img src="${up.frameUrl(m.thumb)}" onerror="this.style.display='none'"><div><b>${esc(m.title)}</b> <span class="dim small">${esc(m.section)}</span>
    <p class="small">${esc(m.reading)}</p>${lookChips(m.looks.slice(0, 4))}
    <div class="row wrap">${m.link ? `<button data-url="${esc(m.link)}">Real stills (FILMGRAB)</button>` : ''}<button data-matchref="${i}">Match my shot to this</button></div></div></div>`).join('')}</div>`;
  function directionsHTML() {
    if (!S.frame) return '';
    if (!S.directions.length) return '<div class="card"><p class="dim small">Finding directions…</p></div>';
    const ask = !answers(S.intent.feeling).length ? '<p class="small warn">Pick how the scene should feel for sharper directions. These are based on the frame alone.</p>' : '';
    return `<div class="k sect">Directions</div><p class="small dim">Click one to preview it on your frame. Apply it, tweak it, or keep it as a preset.</p>${ask}
      ${S.directions.map((d, i) => `<div class="dir ${S.chosen === i ? 'on' : ''}" data-dir="${i}">
        <img src="${d.thumb}"><div class="dtext">
          <div><b>${esc(d.name)}</b> <span class="badge ${d.kind}">${esc(KIND_LABEL[d.kind])}</span></div>
          <p class="small">${esc(d.why.lines[0])}</p>${d.why.lines[1] ? `<p class="small dim">${esc(d.why.lines[1])}</p>` : ''}
          <p class="small">${esc([...d.effect, ...d.notes].join(' '))}</p>
          <div class="small dim mono">${esc(lookCode(d.look, false))}</div>
          ${S.chosen === i ? `<div class="row wrap"><button class="primary" data-dapply="${i}">Apply to selected clips</button><button data-dtweak="${i}">Tweak</button><button data-dsave="${i}">Save as preset</button>${d.why.hue ? `<button data-more="${esc(d.why.hue.name.split(' / ')[0])}">About ${esc(d.why.hue.name.split(' / ')[0])}</button>` : ''}</div>` : ''}
        </div></div>`).join('')}`;
  }
  function wireDirections(body) {
    body.querySelectorAll('[data-dir]').forEach(el => el.onclick = e => { if (e.target.closest('button')) return; const i = +el.dataset.dir; if (S.chosen === i) return; choose(i); S.view = 'split'; render(); body.scrollTop = 0; });
    if ($('#dclear', body)) $('#dclear', body).onclick = () => { S.chosen = -1; render(); };
    body.querySelectorAll('[data-dapply]').forEach(b => b.onclick = () => busy('Applying', () => applyLookToClips(S.look, S.extra, S.input, S.matte)));
    body.querySelectorAll('[data-dtweak]').forEach(b => b.onclick = () => go('tweak'));
    body.querySelectorAll('[data-dsave]').forEach(b => b.onclick = () => busy('Saving', async () => {
      const f = FEELINGS.find(x => x.id === answers(S.intent.feeling)[0]); await saveCurrentAsPreset(S.recipe.name + (f ? ' · ' + f.n.toLowerCase() : ''), true); }));
  }

  // SCENE -----------------------------------------------------------------
  function renderScene(body) {
    const sh = S.shots;
    body.innerHTML = `
      <div class="row"><input id="tags" placeholder="Tags for this shot: character, place, act…"><button id="add" class="primary">Add this shot</button></div>
      <div class="row wrap"><button id="load">Load tagged shots from markers</button><button id="scan">Scan the sequence</button><span class="row tight"><span class="small dim">every</span><input id="every" type="number" min="1" value="5" style="width:44px"><span class="small dim">s</span></span></div>
      ${sh.length ? `<img class="strip" src="${pngDataUrl(renderStrip(sh))}"><div class="row wrap"><button id="png">Save strip (PNG)</button><button id="csv">Save as CSV</button><button id="clear">Clear</button></div>
        <div class="card"><div class="k">What the sequence says</div>${readSequence(sh, enc(), S.intent).map(o => `<p><b>${esc(o.n)}.</b> ${esc(o.why)}</p>${o.entry ? `<p class="small dim">${esc(o.entry.t)}</p>` : ''}`).join('')}
          ${!answers(S.intent.genre).length ? '<p class="small dim">Set what the project is in Shot to get story-level readings (motifs, leitmotifs) for narrative work.</p>' : ''}</div>
        <div class="shots">${sh.map((s, i) => `<div class="shot"><span class="tc">${esc(s.tc)}</span>${swatchBar(s.sw)}<span class="small">${esc(cap(s.hue))} · ${esc((enc().PALS.find(p => p.id === s.pal) || {}).n || '')}${s.tags.length ? ' · ' + esc(s.tags.join(', ')) : ''}</span><button data-del="${i}">✕</button></div>`).join('')}</div>`
        : '<p class="dim">Build a colour script as you edit: add shots (saved as markers in your sequence, so they travel with the project) or scan the whole sequence, then see how colour moves across it and whether it matches the feeling you set.</p>'}`;
    const addShot = async (g, tags) => { const rd = readFrame(g.frame, enc(), null); const rec = shotRecord(rd, { seconds: g.seconds, timecode: g.timecode, name: g.clipName, tags });
      S.shots.push(rec); S.shots.sort((a, b) => a.t - b.t); return rec; };
    $('#add', body).onclick = () => busy('Adding shot', async () => {
      const g = await host.grabFrame(), tags = $('#tags', body).value.split(',').map(t => t.trim()).filter(Boolean), rec = await addShot(g, tags);
      await host.addMarker({ seconds: g.seconds, name: 'Colored Lens: ' + cap(rec.hue), note: encodeShot(rec), color: 'purple' }).catch(e => toast('Shot added (marker not saved: ' + e.message + ')'));
      render(); });
    $('#load', body).onclick = () => busy('Reading markers', async () => { const ms = await host.listMarkers(); const got = ms.map(m => decodeShot(m.note)).filter(Boolean);
      S.shots = got.sort((a, b) => a.t - b.t); toast(`${got.length} tagged shots loaded`); render(); });
    $('#scan', body).onclick = () => busy('Scanning', async () => {
      const every = Math.max(1, +$('#every', body).value || 5), dur = await host.sequenceDuration(); S.shots = [];
      for (let t = 0; t < dur; t += every) { status(`Scanning ${Math.round(t)} / ${Math.round(dur)} s`); const g = await host.grabFrame(t); await addShot(g, []); }
      render(); });
    if (!sh.length) return;
    $('#png', body).onclick = () => host.saveFile('color_script.png', encodePNG(renderStrip(sh, { colW: 24, height: 200 })), { title: 'Save the color script' }).then(p => p && toast('Saved ' + p));
    $('#csv', body).onclick = () => host.saveFile('color_script.csv', scriptCSV(sh), { title: 'Save the color script' }).then(p => p && toast('Saved ' + p));
    $('#clear', body).onclick = () => { S.shots = []; render(); };
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.shots.splice(+b.dataset.del, 1); render(); });
  }

  // TWEAK -----------------------------------------------------------------
  function renderTweak(body) {
    const C = cat(), L = S.look, G = L.G, X = S.extra;
    const byNum = o => Object.keys(o).sort((a, b) => +a.replace(/\D/g, '') - +b.replace(/\D/g, ''));
    const sel = (k, table) => `<label>${esc({ K: 'Lens character', D: 'Diffusion', C: 'Colour science', M: 'Film / video medium' }[k])}<select data-axis="${k}">${byNum(table).map(id => `<option value="${id}" ${L[k] === id ? 'selected' : ''}>${id} ${esc(table[id].short || table[id].name)}</option>`).join('')}</select></label>`;
    const slider = (obj, key, label, min, max, step) => sliderHTML({ id: obj + ':' + key, label: esc(label), min, max, step, value: +(obj === 'G' ? G : X)[key], def: obj === 'G' ? GRADE0[key] : ({ ...XDEF, matchAmt: 1 })[key] });
    const editing = S.recipe.presetId ? listPresets().find(p => p.id === S.recipe.presetId) : null;
    body.innerHTML = `
      ${S.frame ? stageHTML(false, 'Live preview on your frame: colour, grain and vignette. Halation and diffusion glow show on the clip.') : '<p class="dim small">Read a frame in Shot to preview the look live while you adjust it.</p>'}
      <div class="row"><input id="rname" placeholder="Name this look" value="${esc(S.recipe.name)}"></div>
      ${editing ? `<p class="small dim">Editing preset “${esc(editing.name)}”.</p>` : ''}
      <div class="row wrap"><button id="apply" class="primary">Apply to selected clips</button>${editing ? '<button id="update">Update preset</button>' : ''}<button id="saveNew">${editing ? 'Save as new preset' : 'Save as preset'}</button><button id="reset">Start from neutral</button></div>
      <div class="cols">${sel('C', C.color)}${sel('M', C.medium)}${sel('K', C.lens)}${sel('D', C.diffusion)}
        <label>Footage is<select id="input"><option value="rec709" ${S.input === 'rec709' ? 'selected' : ''}>Normal video (Rec.709)</option><option value="logc3" ${S.input === 'logc3' ? 'selected' : ''}>Log (ARRI LogC3)</option></select></label>
        <label>Aspect matte<select id="matte"><option value="none" ${!S.matte ? 'selected' : ''}>No matte</option>${Object.keys(C.aspect).sort((a, b) => a - b).map(a => `<option value="${a}" ${S.matte && L.A === a ? 'selected' : ''}>${esc(C.aspect[a].name)}</option>`).join('')}</select></label></div>
      <p class="small dim">${esc((C.color[L.C] || {}).recipe || '')} ${esc((C.medium[L.M] || {}).recipe || '')}</p>
      <div class="card"><div class="k">Strength</div>${slider('G', 'lutMix', 'Colour look', 0, 1, 0.01)}${slider('G', 'grainK', 'Grain', 0, 2, 0.01)}${slider('G', 'halK', 'Halation', 0, 2, 0.01)}${slider('G', 'diffK', 'Diffusion glow', 0, 2, 0.01)}${slider('G', 'vigK', 'Vignette', 0, 2, 0.01)}</div>
      <div class="card"><div class="k">Grade</div>${slider('G', 'exp', 'Exposure', -3, 3, 0.05)}${slider('G', 'con', 'Contrast', 0.5, 1.6, 0.01)}${slider('G', 'sat', 'Saturation', 0, 2, 0.01)}${slider('G', 'vib', 'Vibrance', -1, 1, 0.01)}${slider('G', 'temp', 'Temperature', -1, 1, 0.01)}${slider('G', 'tint', 'Tint', -1, 1, 0.01)}${slider('G', 'hi', 'Highlights', -1, 1, 0.01)}${slider('G', 'sh', 'Shadows', -1, 1, 0.01)}${slider('G', 'bk', 'Blacks', -1, 1, 0.01)}${slider('G', 'wh', 'Whites', -1, 1, 0.01)}</div>
      <div class="card"><div class="k">Skin Guard</div><p class="small dim">The look may add to skin, but cannot take away its hue, density or light beyond what you allow.</p>
        ${slider('X', 'skinGuard', 'Skin Guard', 0, 1, 0.01)}${slider('X', 'skinHue', 'Protect hue', 0, 1, 0.01)}${slider('X', 'skinDensity', 'Protect density', 0, 1, 0.01)}${slider('X', 'skinLight', 'Protect light', 0, 1, 0.01)}</div>
      <div class="card"><div class="k">Match to reference</div>${X.matchAmt > 0 ? `<p class="small">Matching ${esc(S.refName || 'a reference')}.</p>${slider('X', 'matchAmt', 'Match amount', 0, 1, 0.01)}` : '<p class="small dim">Set a frame from your timeline as the reference, then park on the shot to match. Or use “Match my shot to this” on a similar frame in Shot.</p>'}
        <div class="row wrap"><button id="setref">Use the current frame as reference</button><button id="matchref" ${S.refFrameStats ? '' : 'disabled'}>Match this frame to it</button>${X.matchAmt > 0 ? '<button id="nomatch">Clear match</button>' : ''}</div></div>
      ${hasCurves(G) ? '<p class="warn small">This look has curves from Lukuluku. The effect applies everything except curves; the .cube LUT includes them.</p>' : ''}
      <div class="card"><div class="k">More</div>
        <div class="row"><input id="code" placeholder="Paste a Lukuluku look code or share link" value="${esc(lookCode(L, S.matte))}"><button id="parse">Use</button></div>
        <div class="row wrap"><button id="cube">Export .cube</button><button id="open">Open in Lukuluku</button></div>
        <p class="small dim">${esc(host.applyNote || '')}</p></div>`;
    const changed = () => { $('#code', body).value = lookCode(S.look, S.matte); drawStage(); };
    body.querySelectorAll('[data-axis]').forEach(s => s.onchange = () => { S.look[s.dataset.axis] = s.value; changed(); });
    $('#input', body).onchange = e => { S.input = e.target.value; settings.set('input', S.input); changed(); };
    $('#matte', body).onchange = e => { S.matte = e.target.value !== 'none'; if (S.matte) S.look.A = e.target.value; changed(); };
    $('#rname', body).onchange = e => { S.recipe.name = e.target.value; };
    wireSliders(body.querySelector('.stage') ? body : body, (id, v) => { if (id === 'wipe') { S.wipe = v; composite(); return; } const [obj, key] = id.split(':'); (obj === 'G' ? S.look.G : S.extra)[key] = v; drawStage(); });
    $('#apply', body).onclick = () => busy('Applying', () => applyLookToClips(S.look, S.extra, S.input, S.matte));
    if ($('#update', body)) $('#update', body).onclick = () => busy('Saving', () => saveCurrentAsPreset($('#rname', body).value, false));
    $('#saveNew', body).onclick = () => busy('Saving', async () => { await saveCurrentAsPreset($('#rname', body).value, true); render(); });
    $('#reset', body).onclick = () => { S.look = NEUTRAL_LOOK(); S.extra = { ...XDEF }; S.matte = false; S.recipe = { name: '', presetId: null }; S.chosen = -1; render(); };
    $('#parse', body).onclick = () => { try { const l = parseLookInput($('#code', body).value, C); S.look = l; toast('Look loaded: ' + formatCode(l)); render(); } catch (e) { toast(e.message, 4000); } };
    $('#setref', body).onclick = () => busy('Grabbing reference', async () => { const g = await host.grabFrame(); S.refFrameStats = matchStats(g.frame); S.refName = `${g.clipName || 'frame'} ${g.timecode || ''}`; toast('Reference set: now park on the shot to match'); render(); });
    $('#matchref', body).onclick = () => busy('Matching', async () => { await grab(); S.extra = { ...S.extra, ...computeMatch(matchStats(S.frame), S.refFrameStats) }; render(); });
    if ($('#nomatch', body)) $('#nomatch', body).onclick = () => { S.extra.matchAmt = 0; render(); };
    $('#cube', body).onclick = () => busy('Baking LUT', async () => {
      const cube = bakeCube(S.look, C, await lutsFor(S.look), { input: S.input, extra: S.extra }); const p = await host.saveFile(cube.name + '.cube', cube.text, { title: 'Save the LUT' }); if (p) toast('Saved ' + p); });
    $('#open', body).onclick = () => host.openUrl(shareLink(S.look, up.content.looks.app));
    if (S.frame) { body.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; render(); }); drawStage(); }
  }

  // PRESETS ---------------------------------------------------------------
  const intentText = i => [GENRES, FEELINGS, ROLES].map((l, k) => answers(i[['genre', 'feeling', 'role'][k]]).map(id => (l.find(x => x.id === id) || {}).n).filter(Boolean).join(' + ')).filter(Boolean).join(' · ');
  function renderPresets(body) {
    const list = listPresets();
    body.innerHTML = `
      <div class="row wrap"><div role="button" tabindex="0" class="chip ${S.adapt ? 'on' : ''}" id="adapt">${S.adapt ? '✓ ' : ''}Adapt to each shot: ${S.adapt ? 'on' : 'off'}</div></div>
      <p class="small dim">${S.adapt ? 'Applying a preset first matches the shot under the playhead to the shot the preset was made on (exposure, contrast, balance), so the look lands the same way. Read the frame in Shot first.' : 'Presets are applied exactly as saved.'}</p>
      ${S.shownCode ? `<div class="card"><div class="k">Preset code</div><p class="small dim">Copy this and paste it into Colored Lens on another machine.</p><textarea id="codeOut" rows="3" readonly>${esc(S.shownCode)}</textarea><div class="row"><button id="hideCode">Done</button></div></div>` : ''}
      ${list.length ? list.map(p => `<div class="preset">${p.thumb ? `<img src="${p.thumb}">` : '<div class="nothumb"></div>'}<div class="dtext">
          <b>${esc(p.name)}</b><div class="small dim">${esc(intentText(p.intent || {}) || 'No intent recorded')}${p.from ? ' · made on ' + esc(p.from) : ''}</div>
          <div class="small dim mono">${esc(lookCode(p.look, p.matte))}${p.input === 'logc3' ? ' · log footage' : ''}${p.extra && p.extra.skinGuard ? ' · Skin Guard ' + p.extra.skinGuard : ''}</div>
          ${p.intent && p.intent.note ? `<p class="small">${esc(p.intent.note)}</p>` : ''}
          <div class="row wrap"><button class="primary" data-papply="${p.id}">Apply to selected clips</button><button data-popen="${p.id}">Open in Tweak</button><button data-pcode="${p.id}">Share code</button><button data-pdup="${p.id}">Duplicate</button><button data-pdel="${p.id}">${S.confirmDel === p.id ? 'Confirm delete' : 'Delete'}</button></div>
        </div></div>`).join('') : '<p class="dim">No presets yet. Pick a direction in Shot or build a look in Tweak, then save it. Presets keep the look, the colour configuration, Skin Guard and what the shot was for, so you can reuse them on other scenes.</p>'}
      <div class="card"><div class="k">Add a preset from a code</div><div class="row"><input id="pcode" placeholder="Paste a preset code (CLP1:…)"><button id="pimport">Add</button></div></div>`;
    $('#adapt', body).onclick = () => { S.adapt = !S.adapt; settings.set('adapt', S.adapt); render(); };
    if ($('#hideCode', body)) $('#hideCode', body).onclick = () => { S.shownCode = ''; render(); };
    const byId = id => listPresets().find(p => p.id === id);
    body.querySelectorAll('[data-papply]').forEach(b => b.onclick = () => busy('Applying', async () => { const p = byId(b.dataset.papply);
      if (S.adapt && !S.frame) toast('Read a frame in Shot first to adapt the preset; applying it as saved.');
      await applyLookToClips(p.look, presetExtra(p), p.input, p.matte); }));
    body.querySelectorAll('[data-popen]').forEach(b => b.onclick = () => { const p = byId(b.dataset.popen);
      S.look = clone(p.look); S.extra = presetExtra(p); S.input = p.input || S.input; S.matte = !!p.matte; S.recipe = { name: p.name, presetId: p.id }; S.chosen = -1; S.view = 'split'; go('tweak'); });
    body.querySelectorAll('[data-pcode]').forEach(b => b.onclick = () => { S.shownCode = presetCode(byId(b.dataset.pcode)); try { navigator.clipboard.writeText(S.shownCode); toast('Preset code copied'); } catch {} render(); });
    body.querySelectorAll('[data-pdup]').forEach(b => b.onclick = () => { duplicatePreset(b.dataset.pdup); render(); });
    body.querySelectorAll('[data-pdel]').forEach(b => b.onclick = () => { const id = b.dataset.pdel; if (S.confirmDel === id) { deletePreset(id); S.confirmDel = ''; toast('Preset deleted'); } else S.confirmDel = id; render(); });
    $('#pimport', body).onclick = () => { try { const p = importPresetCode($('#pcode', body).value); toast(`Added “${p.name}”`); render(); } catch (e) { toast(e.message, 4000); } };
  }

  // ENCYCLOPEDIA ----------------------------------------------------------
  function libraryEntries() {
    const e = enc(), out = [];
    e.HUES.forEach(h => out.push({ s: 'Colour psychology', t: h.name + ': ' + h.tag, body: h.p.join(' ') + ' Bright side: ' + h.pos + ' Dark side: ' + h.neg + ' Craft: ' + h.craft, looks: h.looks, ex: h.ex.map(x => `${x[0]} (${x[1]}, ${x[2]}): ${x[3]}`), hex: h.hex }));
    e.PALS.forEach(p => out.push({ s: 'Palette structures', t: p.n, body: p.t + ' ' + (e.PALI[p.id] || '') + ' Examples: ' + p.ex, looks: p.looks, pal: p.pal }));
    e.DIMS.forEach(d => out.push({ s: 'Dimensions', t: d.n, body: d.t, hex: d.c }));
    e.ITTEN.forEach(d => out.push({ s: "Itten's contrasts", t: d.n, body: d.t, hex: d.c }));
    e.NARR.forEach(n => out.push({ s: 'Narrative devices', t: n.n, body: n.t + ' ' + (e.NARRI[n.n] || '') + ' ' + n.ex, hex: n.c }));
    e.AUTS.forEach(a => out.push({ s: 'Auteurs & cinematographers', t: a.n, body: (a.w || '') + '. ' + a.t + ' ' + (e.AUTI[a.n] || '') + ' Films: ' + a.f, looks: String(a.l || '').split(/\s*·\s*/).filter(Boolean), pal: a.pal }));
    e.TECH.forEach(t => out.push({ s: 'Processes & stocks', t: `${t[1]} (${t[0]})`, body: strip(t[2]), looks: String(t[3] || '').split(/[\s,·]+/).filter(x => /^[LOHKDCM]\d+$/.test(x)) }));
    e.GLOS.forEach(g => out.push({ s: 'Glossary', t: g[0], body: strip(g[1]) }));
    out.push({ s: 'Skin, exposure & equity', t: 'Skin, Exposure & Equity', body: strip(e.SKIN_HTML) });
    e.BIB.forEach(b => b.items.forEach(i => out.push({ s: 'Bibliography · ' + b.h, t: strip(i[0]), body: strip(i[1]) })));
    return out;
  }
  function renderEnc(body) {
    const all = libraryEntries(), q = S.encQ.toLowerCase().trim();
    const list = q ? all.filter(x => x.t.toLowerCase().includes(q)).concat(all.filter(x => !x.t.toLowerCase().includes(q) && (x.body + ' ' + (x.ex || []).join(' ')).toLowerCase().includes(q))) : all;
    body.innerHTML = `<div class="row"><button id="encBack">← Back</button><input id="q" placeholder="Search the encyclopedia (red, Deakins, bleach bypass, skin…)" value="${esc(S.encQ)}"></div>
      <div class="dim small">${list.length} entries · ${esc(enc().title)} <a data-url="${esc(config.sources.encyclopedia.app)}" href="#">open the full encyclopedia</a></div>
      ${list.slice(0, 60).map(x => `<div class="card"><div class="k">${esc(x.s)}</div><h3>${x.hex ? `<span class="sw" style="background:${x.hex}"></span>` : ''}${esc(x.t)}</h3>${x.pal ? swatchBar(x.pal.map(h => ({ hex: h, share: 1 }))) : ''}<p class="small">${esc(x.body)}</p>${x.ex ? `<ul class="small">${x.ex.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${lookChips(x.looks || [])}</div>`).join('')}`;
    $('#encBack', body).onclick = () => go(S.back || 'shot');
    const q$ = $('#q', body); q$.oninput = () => { S.encQ = q$.value; clearTimeout(renderEnc.t); renderEnc.t = setTimeout(() => { renderEnc(body); const n = $('#q', body); n.focus(); try { n.setSelectionRange(S.encQ.length, S.encQ.length); } catch {} }, 250); };
  }

  render();
  return { state: S, updater: up, render };
}

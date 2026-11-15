// Colored Lens panel: one app for Premiere Pro (UXP), DaVinci Resolve Studio (Workflow Integration) and the web.
// Everything host-specific goes through `host` (see hosts/README.md). Plain DOM + flexbox so it runs inside UXP.
//
// The loop: read the frame -> say what it is for -> get directions -> preview them on the frame -> tweak live ->
// apply to clips -> save as a preset -> apply the preset to other shots.
import { readFrame, frameStats, labPixels } from '../core/analysis.js';
import { checkSkin, vectorscope } from '../core/skin.js';
import { pngDataUrl, encodePNG, downsample, toBase64 } from '../core/image.js';
import { PROVIDERS, DEFAULTS as SMART0, buildPrompt, parseReply, validate, ask, detectOllama, detectOpenAI, detectApple, appleReason, resolveProvider } from '../core/smart.js';
import { shotRecord, encodeShot, decodeShot, renderStrip, readSequence, scriptCSV } from '../core/script.js';
import { parseLookInput, formatCode, fullGrade, makePixelFn, bakeCube, lookToEngineParams, shareLink, computeMatch, matchStats, hasCurves, GRADE0 } from '../core/look.js';
import { GENRES, FEELINGS, ROLES, KIND_LABEL, pickDirections, describeEffect, whyFor, frameSummary, answers, isDark, continuity, pictureOf, directionsFromPicks } from '../core/directions.js';
import { previewer, wipe } from '../core/preview.js';
import { listPresets, savePreset, deletePreset, duplicatePreset, presetCode, importPresetCode, settings } from '../core/presets.js';
import { Updater } from '../core/updates.js';
import config from '../studio.config.json';
import { sliderHTML, wireSliders } from './slider.js';
import { TOUR, routes, helpPrompt } from './guide.js';

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
    intent: normIntent(settings.get('intent', {})), seqId: '', ctx: null, lead: 0, neigh: [], scope: settings.get('scope', 'clip'), input: settings.get('input', 'rec709'),
    directions: [], chosen: -1, look: NEUTRAL_LOOK(), extra: { ...XDEF }, matte: false, recipe: { name: '', presetId: null }, view: 'split', wipe: 0.5,
    guide: { view: 'tour', step: 0, route: '' }, dockSize: settings.get('dockSize', 'M'), dockHidden: false, detached: false, smartDirs: [],
    smart: { cfg: { ...SMART0, ...settings.get('smart', {}) }, turns: [], history: [], detect: null, using: '' }, refFrameStats: null, refName: '', adapt: settings.get('adapt', true), encQ: '', shownCode: '', confirmDel: '', busy: false, showSkin: false, showRefs: false };
  let PV = null, pvEl = null; // pvEl: the separate Preview panel's container, once it has been opened
  const up = new Updater(host, config.pagesBase);
  root.innerHTML = `
    <div class="cl">
      <div id="banner" class="banner" hidden></div>
      <div class="head"><div class="brand">Colored Lens <span class="dim">· ${esc(host.label || host.name)}</span></div><span id="status" class="dim small"></span></div>
      <div class="links"><div role="button" tabindex="0" id="guideBtn" class="linkbtn small">Guide</div><div role="button" tabindex="0" id="smartBtn" class="linkbtn small">Smart</div><div role="button" tabindex="0" id="encBtn" class="linkbtn small">Encyclopedia</div></div>
      <div class="tabs">${['shot:Shot', 'scene:Scene', 'tweak:Tweak', 'presets:Presets'].map(t => { const [id, n] = t.split(':'); return `<div data-tab="${id}" class="tab" role="tab" tabindex="0">${n}</div>`; }).join('')}</div>
      <div id="dock" class="dock" hidden></div>
      <div id="body" class="body"></div>
      <div id="toast" class="toast" hidden></div>
    </div>`;
  const toast = (t, ms = 2600) => { const e = $('#toast', root); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms); };
  const busy = async (label, fn) => { if (S.busy) return; S.busy = true; status(label + '…'); try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 6000); } finally { S.busy = false; status(); } };
  const status = t => { const c = up.content && up.content.manifest; $('#status', root).textContent = t || `v${host.version}${c ? ' · content ' + c.contentVersion.slice(0, 7) : ''}`; };
  const SIDE = ['enc', 'smart', 'guide'];
  const go = tab => { if (SIDE.includes(tab) && !SIDE.includes(S.tab)) S.back = S.tab; S.tab = tab; render(); };
  root.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  $('#encBtn', root).onclick = () => { S.encQ = ''; go('enc'); };
  $('#smartBtn', root).onclick = () => go('smart');
  $('#guideBtn', root).onclick = () => { S.guide = { view: 'home', step: 0, route: '' }; go('guide'); };

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
    S.ctx = null; S.neigh = [];
    if (host.clipContext) try { S.ctx = await host.clipContext(); } catch (e) { console.warn('timeline context', e); }
    // a clean read: our own look on this shot is switched off for the moment of the export
    const g = await host.grabFrame(undefined, { clean: true }); S.frame = g.frame; S.meta = g; S.sample = null; S.chosen = -1; S.lead = 0;
    S.smartDirs = []; S.smart.turns = []; S.smart.history = [];
    // answers belong to the scene (marker range) when there is one, otherwise to the sequence
    useSequence(S.ctx && S.ctx.scene ? `${g.sequenceId}|${S.ctx.scene.start.toFixed(2)}` : g.sequenceId);
    // the finished shots either side, for continuity
    if (S.ctx) for (const [side, n] of [['before', S.ctx.before], ['after', S.ctx.after]]) if (n) try {
      status(`Reading the shot ${side}…`); const f = (await host.grabFrame(n.seconds)).frame; S.neigh.push({ side, name: n.name, pic: pictureOf(frameStats(labPixels(f))) }); } catch (e) { console.warn('neighbour', e); }
    PV = previewer(S.frame, cat(), lutsFor); stageCache.key = '';
    S.reading = readFrame(S.frame, enc(), refs()); runSkin(); return g;
  }
  const lowKey = () => isDark(S.intent);
  function runSkin() { if (S.frame) S.skin = checkSkin(S.frame, { sample: S.sample, input: S.input, lowKey: lowKey(), lead: S.lead }); }
  const allDirs = () => [...S.smartDirs, ...S.directions]; // Smart picks first, then the rule-based directions
  async function enrich(ds) {
    for (const d of ds) {
      const fn = makePixelFn(d.look, cat(), await lutsFor(d.look), { input: S.input, keepExposure: true, extra: { ...XDEF, ...d.extra } });
      d.effect = describeEffect(fn, S.reading, S.skin); d.why = whyFor(d, S.intent, enc()); if (d.smartWhy) d.why.lines[0] = d.smartWhy; d.cont = continuity(fn, S.reading, S.neigh);
      d.thumb = pngDataUrl(await PV.render(d.look, { ...XDEF, ...d.extra }, S.input, 200));
    }
    return ds;
  }
  async function suggest() {
    if (!S.frame) return;
    S.directions = await enrich(pickDirections(S.intent, { reading: S.reading, skin: S.skin, input: S.input }));
    if (S.chosen >= allDirs().length) S.chosen = -1;
  }
  function choose(i) {
    const d = allDirs()[i]; if (!d) return; S.chosen = i;
    S.look = clone(d.look); S.extra = { ...XDEF, ...d.extra }; S.matte = false; S.recipe = { name: d.name, presetId: null };
  }

  // ---------- the stage: a large before / after preview with a wipe ----------
  const stageCache = { key: '', before: null, after: null };
  // The preview lives in a dock above the scrolling area, so it stays in view while you scroll through the options.
  const DOCK_H = { S: 140, M: 220, L: 330 };
  function dockHTML() {
    const shot = S.tab === 'shot', d = shot && S.chosen >= 0 ? allDirs()[S.chosen] : null;
    const seg = (id, n, on, attr) => `<div role="button" tabindex="0" class="seg ${on ? 'on' : ''}" ${attr}="${id}">${n}</div>`;
    if (S.dockHidden) return `<div class="row tight"><span class="small dim grow">Preview hidden</span><button id="dockShow" class="small">Show preview</button></div>`;
    const pvBox = S.detached && pvEl ? pvSize() : null;
    const a = S.frame.w / S.frame.h, avail = Math.max(80, (pvBox ? pvBox.w : (root.clientWidth || 360)) - 26);
    let h = pvBox ? Math.max(60, pvBox.h - (shot && S.chosen >= 0 ? 200 : 100)) : Math.min(DOCK_H[S.dockSize] || 220, Math.round((window.innerHeight || 800) * 0.42));
    let w = Math.round(h * a); if (w > avail) { w = avail; h = Math.round(w / a); }
    // Two stacked pictures: "before" underneath, "after" on top, clipped at the wipe. Dragging only moves the clip
    // edge, so it is instant (re-encoding a picture on every mouse move made the wipe feel stuck).
    return `<div id="stage" class="stage2 ${shot ? 'click' : ''}" data-w="${w}" style="width:${w}px;height:${h}px;">
        <img id="stB" src="" style="width:${w}px;height:${h}px;"><div id="stClip" style="height:${h}px;"><img id="stA" src="" style="width:${w}px;height:${h}px;"></div><div id="stLine" style="height:${h}px;"><div id="stGrip"></div></div></div>
      <div class="row tight"><div class="segs">${['before:Before', 'split:Split', 'after:After'].map(v => { const [id, n] = v.split(':'); return seg(id, n, S.view === id, 'data-view'); }).join('')}</div>
        <div class="grow"></div>${S.detached ? '' : `<div class="segs" title="Preview size">${['S', 'M', 'L'].map(z => seg(z, z, S.dockSize === z, 'data-dsize')).join('')}</div>`}
        ${host.openPreviewPanel ? `<button id="dockPop" class="small" title="${S.detached ? 'Put the preview back in the Colored Lens panel' : 'Open the preview as its own panel, to dock anywhere'}">${S.detached ? 'Back to panel' : 'Pop out'}</button>` : ''}${S.detached ? '' : '<button id="dockHide" class="small" title="Hide the preview">✕</button>'}</div>
      ${S.view === 'split' ? sliderHTML({ id: 'wipe', label: 'Wipe', min: 0, max: 1, step: 0.01, value: S.wipe, def: 0.5 }) : ''}
      ${d ? `<div class="small">Previewing <b>${esc(d.name)}</b> <span class="dim">(colour, grain and vignette; halation and glow show on the clip)</span></div>
        ${scopeRow()}<div class="row wrap"><button class="primary" data-dapply="${S.chosen}">${S.scope === 'clip' ? 'Apply to selected clips' : 'Apply'}</button><button data-dtweak="${S.chosen}">Tweak</button><button data-dsave="${S.chosen}">Save as preset</button><button id="dclear">Back to the original</button></div>`
        : `<div class="small dim">${shot ? 'Click a face in the picture to check its skin. Pick a direction below to preview it here.' : 'Live preview: colour, grain and vignette. Halation and diffusion glow show on the clip.'}</div>`}`;
  }
  // the Preview panel's real size (its own root node), re-checked while it is open so the picture follows a resize
  const pvSize = () => { const n = pvEl.parentNode || pvEl, r = n.getBoundingClientRect ? n.getBoundingClientRect() : {}; return { w: Math.round(r.width || n.clientWidth || 320), h: Math.round(r.height || n.clientHeight || 240) }; };
  let pvLast = '';
  setInterval(() => { if (!S.detached || !pvEl || !S.frame) return; const z = pvSize(), k = z.w + 'x' + z.h; if (k !== pvLast) { pvLast = k; renderDock(); } }, 800);
  const dockEl = () => (S.detached && pvEl ? pvEl : $('#dock', root));
  function renderDock() {
    const main = $('#dock', root), show = !!S.frame && (S.tab === 'shot' || S.tab === 'tweak' || S.detached);
    if (S.detached && pvEl) { // the preview lives in its own panel; the main panel keeps a one-line note
      main.hidden = false; main.innerHTML = `<div class="row tight"><span class="small dim grow">The preview is in its own panel.</span><button id="dockBack" class="small">Bring it back</button></div>`;
      $('#dockBack', main).onclick = () => { S.detached = false; pvEl.innerHTML = '<p class="small dim pvnote">The preview is back in the Colored Lens panel. Pop it out again from there; you can close this panel.</p>'; render(); };
      if (!S.frame) { pvEl.innerHTML = '<p class="small dim pvnote">Read a frame in the Colored Lens panel; its preview appears here.</p>'; return; }
    } else { main.hidden = !show; if (!show) { main.innerHTML = ''; return; } }
    const dock = dockEl();
    dock.innerHTML = dockHTML();
    if ($('#dockShow', dock)) { $('#dockShow', dock).onclick = () => { S.dockHidden = false; renderDock(); }; return; }
    if ($('#dockHide', dock)) $('#dockHide', dock).onclick = () => { S.dockHidden = true; renderDock(); };
    if ($('#dockPop', dock)) $('#dockPop', dock).onclick = () => S.detached
      ? $('#dockBack', root) && $('#dockBack', root).onclick()
      : busy('Opening the preview panel', async () => { await host.openPreviewPanel(); if (pvEl) { S.detached = true; render(); } else toast('Find it under Window › UXP Plugins › Colored Lens Preview'); });
    dock.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; renderDock(); });
    dock.querySelectorAll('[data-dsize]').forEach(b => b.onclick = () => { S.dockSize = b.dataset.dsize; settings.set('dockSize', S.dockSize); renderDock(); });
    wireSliders(dock, (id, v) => { if (id === 'wipe') { S.wipe = v; placeWipe(); } });
    wireActions(dock);
    // On the picture itself: drag to move the wipe; a plain click checks the skin at that point.
    const st = $('#stage', dock), canSample = S.tab === 'shot' || S.detached;
    const sample = (x, y) => busy('Checking skin', async () => { S.sample = [x, y]; runSkin(); await suggest(); S.showSkin = true; render(); toast(S.skin.found ? `Skin sampled: about ${S.skin.ire} IRE` : 'No skin there; try the middle of a cheek'); });
    let drag = null;
    const posOf = e => { const r = st.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))), Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height)))]; };
    const move = e => { if (!drag) return; if (!drag.moved && Math.abs(e.clientX - drag.x) < 4) return;
      if (!drag.moved) { drag.moved = true; if (S.view !== 'split') S.view = 'split'; }
      S.wipe = posOf(e)[0]; placeWipe(); e.preventDefault && e.preventDefault(); };
    const up = e => { if (!drag) return; const d = drag; drag = null;
      for (const t of ['pointermove', 'mousemove']) document.removeEventListener(t, move); for (const t of ['pointerup', 'mouseup']) document.removeEventListener(t, up);
      if (d.moved) renderDock(); else if (canSample) { const [x, y] = posOf(e); sample(x, y); } };
    const down = e => { if (e.button != null && e.button !== 0) return; drag = { x: e.clientX, moved: false };
      const P = e.type === 'pointerdown'; document.addEventListener(P ? 'pointermove' : 'mousemove', move); document.addEventListener(P ? 'pointerup' : 'mouseup', up); e.preventDefault && e.preventDefault(); };
    st.addEventListener(typeof window !== 'undefined' && 'PointerEvent' in window ? 'pointerdown' : 'mousedown', down);
    stageCache.key = stageCache.key || ''; drawStage(true);
  }
  let stageT = 0, stageSeq = 0;
  function drawStage(rebuilt) {
    if (rebuilt && stageCache.before) composite();
    clearTimeout(stageT); const seq = ++stageSeq;
    stageT = setTimeout(async () => {
      if (!S.frame || !$('#stage', dockEl())) return;
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
    const st = $('#stage', dockEl()); if (!st || !stageCache.before) return;
    if (stageCache.urlKey !== stageCache.key) { stageCache.urlB = pngDataUrl(stageCache.before); stageCache.urlA = stageCache.after === stageCache.before ? stageCache.urlB : pngDataUrl(stageCache.after); stageCache.urlKey = stageCache.key; }
    const B = $('#stB', st), A = $('#stA', st); if (B.dataset.k !== stageCache.key) { B.src = stageCache.urlB; A.src = stageCache.urlA; B.dataset.k = stageCache.key; }
    placeWipe();
  }
  /** Moves the wipe: cheap enough to run on every mouse move. */
  function placeWipe() {
    const st = $('#stage', dockEl()); if (!st) return; const w = +st.dataset.w, same = stageCache.after === stageCache.before;
    const pos = S.view === 'before' ? 1 : S.view === 'after' ? 0 : S.wipe, x = Math.round(pos * w);
    const clip = $('#stClip', st), A = $('#stA', st), line = $('#stLine', st);
    clip.style.left = x + 'px'; clip.style.width = (w - x) + 'px'; A.style.marginLeft = -x + 'px';
    line.style.left = (x - 1) + 'px'; line.style.display = S.view === 'split' && !same ? 'block' : 'none';
  }

  // ---------- applying ----------
  async function applyLookToClips(look, extra, input, matte) {
    const C = cat(), params = lookToEngineParams(look, C, { matte, params: { ...extra, input: input === 'logc3' ? 1 : 0 } });
    const res = await host.applyLook({ params, look, scope: S.ctx ? S.scope : 'clip', makeCube: async () => bakeCube(look, C, await lutsFor(look), { input, keepExposure: true, extra }) });
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
    renderDock();
    ({ shot: renderShot, scene: renderScene, tweak: renderTweak, presets: renderPresets, enc: renderEnc, smart: renderSmart, guide: renderGuide })[S.tab](body);
  }

  // SHOT ------------------------------------------------------------------
  const chipRow = (list, key) => { const cur = answers(S.intent[key]);
    return `<div class="chips">${list.map(x => { const k = cur.indexOf(x.id); return `<div role="button" tabindex="0" class="chip ${k === 0 ? 'on' : k === 1 ? 'on2' : ''}" data-intent="${key}:${x.id}" title="${k === 0 ? 'Main answer' : k === 1 ? 'Second answer' : 'Tap to add (up to two)'}">${k === 0 ? '✓ ' : k === 1 ? '+ ' : ''}${esc(x.n)}</div>`; }).join('')}</div>`; };
  function renderShot(body) {
    const r = S.reading, k = S.skin, I = S.intent;
    body.innerHTML = `
      <div class="row"><button id="grab" class="primary">${esc(host.grabLabel || 'Read the frame under the playhead')}</button>${S.frame ? `<span class="small dim">${esc(S.meta.clipName || '')} ${esc(S.meta.timecode || '')}</span>` : ''}</div>
      ${S.frame ? '' : `<p class="dim">Park the playhead on a shot and read it. Colored Lens tells you what the frame is doing, asks what it is for, and suggests directions you can preview, tweak, apply and save.</p>`}
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
      ${S.frame ? smartCard() : ''}
      <div id="dirs">${directionsHTML()}</div>
      ${k ? skinCard(k) : ''}
      ${r && r.matches.length ? `<div class="card"><div class="row tight"><div class="k grow">Similar frames in the encyclopedia</div><button class="small" id="togRefs">${S.showRefs ? 'Hide' : 'Show'}</button></div>${S.showRefs ? refsHTML(r) : ''}</div>` : ''}`;
    $('#grab', body).onclick = () => busy('Reading frame', async () => { await grab(); await suggest(); render();
      if (S.smart.cfg.provider !== 'off' && S.smart.cfg.autoAsk) askSmart(''); });
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
    wireDirections(body); wireSmart(body);
  }
  // What the timeline says about this shot. Context proposes; the editor decides.
  function contextCard(c) {
    const sub = c.subject, kinds = { video: 'footage', nested: 'nested sequence', graphic: 'graphic / title', adjustment: 'adjustment layer' };
    if (!sub) return `<div class="card ctx"><p class="small">No clip under the playhead on an enabled video track.</p></div>`;
    const lines = [], tips = [];
    lines.push(`Reading <b>V${sub.track} · ${esc(sub.name)}</b> (${kinds[sub.kind]}${sub.inner ? `, showing V${sub.inner.track} · ${esc(sub.inner.name)} inside` : ''})${sub.selected ? ', selected' : ', under the playhead'}.`);
    if (c.emptyAbove && c.emptyAbove.length) lines.push(`<span class="dim">${c.emptyAbove.map(l => `V${l.track} “${esc(l.name)}”`).join(', ')} ${c.emptyAbove.length === 1 ? 'is' : 'are'} empty at this moment, so not part of the picture.</span>`);
    if (c.above.length) lines.push(`Also in the picture above it: ${c.above.map(l => `V${l.track} ${esc(kinds[l.kind])} “${esc(l.name)}”`).join(', ')}. The reading includes ${c.above.length === 1 ? 'it' : 'them'}.`);
    if (sub.lumetri) lines.push('This clip already has a Lumetri grade, so the reading is of the graded image.');
    if (sub.look) lines.push(S.meta && S.meta.withoutLook ? 'This clip already has Lukuluku Look. It was switched off for a moment so the reading is of the shot itself (two steps in your undo history), and Apply will update it rather than add a second one.'
      : 'This clip already has Lukuluku Look: Apply will update it rather than add a second one. The reading includes it (update the effect to 0.2.4 or later for a clean read).');
    if (c.scene) lines.push(`Scene <b>“${esc(c.scene.name)}”</b> (${fmtT(c.scene.start)}–${fmtT(c.scene.end)}): your answers below are kept for this scene.`);
    else lines.push(c.scenes ? 'The playhead is outside the marked scenes; answers are kept for the whole sequence.' : 'No scenes marked, so answers are kept for the whole sequence. Range markers, or markers named “Scene …”, give each scene its own answers.');
    const cont = continuity(null, S.reading, S.neigh); if (cont) lines.push(`${cont} <span class="dim">(${S.neigh.map(n => `${n.side}: ${esc(n.name)}`).join(' · ')})</span>`);
    if (sub.inputLUT && S.input === 'logc3') tips.push(['input:rec709', 'Premiere already converts this clip with an input LUT, so it plays as normal video.', 'Set footage to normal video']);
    if (sub.kind === 'graphic' && !answers(S.intent.role).includes('graphic')) tips.push(['role:graphic', `V${sub.track} holds a graphic or still, not camera footage.`, 'Mark this shot as title / graphic']);
    if (sub.kind === 'adjustment') lines.push('This is an adjustment layer: a look here colours every track beneath it.');
    return `<div class="card ctx"><div class="k">On the timeline</div>${lines.map(l => `<p class="small">${l}</p>`).join('')}
      ${tips.map(([key, why, label]) => `<div class="row wrap"><span class="small grow">${esc(why)}</span><button data-suggest="${key}">${esc(label)}</button></div>`).join('')}</div>`;
  }
  const fmtT = sec => { const m = Math.floor(sec / 60), x = Math.floor(sec % 60); return `${m}:${String(x).padStart(2, '0')}`; };
  // Where Apply puts the look. Counts come from the timeline; options with nothing to apply to are greyed out.
  function scopeRow() {
    const c = S.ctx && S.ctx.counts; if (!c) return '';
    const opts = [['clip', 'This clip', 1], ['source', `Same source${c.source > 1 ? ` (${c.source})` : ''}`, c.source], ['scene', `Whole scene${c.scene ? ` (${c.scene})` : ''}`, c.scene], ['adjust', 'Adjustment layer', c.adjust]];
    if (!opts.find(o => o[0] === S.scope && o[2])) S.scope = 'clip';
    return `<div class="applyto"><span class="small dim">Apply to</span>${opts.map(([id, n, k]) => `<div role="button" tabindex="0" class="chip ${S.scope === id ? 'on' : ''} ${k ? '' : 'off'}" data-scope="${id}" title="${k ? '' : id === 'scene' ? 'Mark scenes with range markers or markers named “Scene …”' : id === 'adjust' ? 'Put an adjustment layer over the shot' : 'Nothing to apply to'}">${S.scope === id ? '✓ ' : ''}${esc(n)}</div>`).join('')}</div>`;
  }
  root.addEventListener('click', e => { const b = e.target.closest('[data-scope]'); if (!b || b.classList.contains('off')) return; S.scope = b.dataset.scope; settings.set('scope', S.scope); render(); });
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
    if (!allDirs().length) return '<div class="card"><p class="dim small">Finding directions…</p></div>';
    const ask = !answers(S.intent.feeling).length ? '<p class="small warn">Pick how the scene should feel for sharper directions. These are based on the frame alone.</p>' : '';
    return `<div class="k sect">Directions</div><p class="small dim">Click one to preview it on your frame. Apply it, tweak it, or keep it as a preset.</p>${ask}
      ${allDirs().map((d, i) => `<div class="dir ${S.chosen === i ? 'on' : ''}" data-dir="${i}">
        <img src="${d.thumb}"><div class="dtext">
          <div><b>${esc(d.name)}</b> <span class="badge ${d.kind}">${esc(KIND_LABEL[d.kind])}</span></div>
          <p class="small">${esc(d.why.lines[0])}</p>${d.why.lines[1] ? `<p class="small dim">${esc(d.why.lines[1])}</p>` : ''}
          <p class="small">${esc([...d.effect, ...d.notes].join(' '))}</p>${d.cont ? `<p class="small cont">${esc(d.cont)}</p>` : ''}
          <div class="small dim mono">${esc(lookCode(d.look, false))}</div>
          ${S.chosen === i ? `<div class="row wrap"><button class="primary" data-dapply="${i}">Apply to selected clips</button><button data-dtweak="${i}">Tweak</button><button data-dsave="${i}">Save as preset</button>${d.why.hue ? `<button data-more="${esc(d.why.hue.name.split(' / ')[0])}">About ${esc(d.why.hue.name.split(' / ')[0])}</button>` : ''}</div>` : ''}
        </div></div>`).join('')}`;
  }
  function wireDirections(body) {
    body.querySelectorAll('[data-dir]').forEach(el => el.onclick = e => { if (e.target.closest('button')) return; const i = +el.dataset.dir; if (S.chosen === i) return; const top = body.scrollTop; choose(i); S.view = 'split'; render(); body.scrollTop = top; });
    wireActions(body);
  }
  function wireActions(body) {
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
      ${S.frame ? '' : '<p class="dim small">Read a frame in Shot to preview the look live while you adjust it.</p>'}
      <div class="row"><input id="rname" placeholder="Name this look" value="${esc(S.recipe.name)}"></div>
      ${editing ? `<p class="small dim">Editing preset “${esc(editing.name)}”.</p>` : ''}
      ${scopeRow()}<div class="row wrap"><button id="apply" class="primary">${S.scope === 'clip' ? 'Apply to selected clips' : 'Apply'}</button>${editing ? '<button id="update">Update preset</button>' : ''}<button id="saveNew">${editing ? 'Save as new preset' : 'Save as preset'}</button><button id="reset">Start from neutral</button></div>
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
    wireSliders(body, (id, v) => { const [obj, key] = id.split(':'); (obj === 'G' ? S.look.G : S.extra)[key] = v; drawStage(); });
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
    if (S.frame) drawStage();
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
    body.querySelectorAll('[data-pcode]').forEach(b => b.onclick = () => { S.shownCode = presetCode(byId(b.dataset.pcode)); copyText(S.shownCode).then(ok => ok && toast('Preset code copied')); render(); });
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

  // ---------- Smart mode ----------
  const httpPost = host.post || (async (url, headers, body) => { const r = await host.fetch(url, { method: 'POST', headers, body }); return { status: r.status, text: await r.text() }; });
  const httpGet = host.get || (async (url, headers = {}) => { const r = await host.fetch(url, { headers }); return { status: r.status, text: await r.text() }; });
  const secret = host.secret || { get: async k => settings.get('secret.' + k, ''), set: async (k, v) => settings.set('secret.' + k, v) };
  async function smartCfg() { const c = { ...S.smart.cfg }; c.geminiKey = await secret.get('gemini'); c.openaiKey = await secret.get('openai'); return c; }
  function saveSmart() { settings.set('smart', S.smart.cfg); }
  const provName = id => (PROVIDERS.find(p => p.id === id) || {}).n || id;
  let smartBusy = false;
  async function askSmart(message) {
    if (smartBusy || !S.frame) return; smartBusy = true; S.smart.error = ''; S.smart.pending = message || '(read this frame)'; render();
    try {
      const real = await resolveProvider(await smartCfg(), httpGet, host.bridge);
      if (!real) throw new Error(S.smart.cfg.provider === 'auto' ? 'Automatic found no model: Ollama is not running with a vision model, and no Gemini key is set. See Smart settings.' : 'Smart mode is off.');
      if (real.provider === 'ollama' && !real.ollamaModel) throw new Error('Choose an Ollama vision model in Smart settings');
      if (real.provider === 'openai' && !real.openaiModel) throw new Error('Choose a model for your local server in Smart settings');
      if (real.provider === 'apple') { const a = await detectApple(host.bridge); if (!a.ok) throw new Error(appleReason(a.reason)); S.smart.appleImage = a.image; }
      S.smart.using = provName(real.provider) + (real.ollamaModel && real.provider === 'ollama' ? ' · ' + real.ollamaModel : real.provider === 'openai' ? ' · ' + real.openaiModel : real.provider === 'gemini' ? ' · ' + real.geminiModel : '');
      status('Smart mode is thinking…');
      const prompt = buildPrompt({ reading: S.reading, skin: S.skin, intent: S.intent, ctx: S.ctx, neigh: S.neigh, message, summary: frameSummary(S.reading, enc()) });
      const text = await ask(real, { prompt, imageB64: toBase64(encodePNG(downsample(S.frame, 512))), history: S.smart.history }, httpPost, host.bridge);
      const res = validate(parseReply(text));
      S.smart.history.push({ role: 'user', text: message || '(read this frame)' }, { role: 'assistant', text: JSON.stringify(res).slice(0, 1500) });
      S.smart.turns.push({ q: message, res, using: S.smart.using });
      if (res.picks.length) { const keep = S.chosen >= S.smartDirs.length ? S.chosen - S.smartDirs.length : -1;
        S.smartDirs = await enrich(directionsFromPicks(res.picks, S.intent, { reading: S.reading, skin: S.skin, input: S.input })); S.chosen = keep >= 0 ? keep + S.smartDirs.length : -1; }
    } catch (e) { console.error(e); S.smart.error = e.message || String(e); }
    finally { smartBusy = false; S.smart.pending = ''; status(); render(); }
  }
  function smartCard() {
    const c = S.smart.cfg;
    if (c.provider === 'off') return `<div class="card smart"><div class="row tight"><div class="k grow">Smart mode</div><button id="smSetup" class="small">Set up</button></div><p class="small dim">Optional: a free AI on this computer (or your own key) that looks at the frame, talks it through with you and picks looks. Off by default.</p></div>`;
    const t = S.smart.turns, last = t[t.length - 1];
    return `<div class="card smart"><div class="row tight"><div class="k grow">Smart mode <span class="dim">· ${esc(S.smart.using || provName(c.provider))}</span></div><button id="smSetup" class="small">Settings</button></div>
      ${t.map(x => `${x.q ? `<p class="small you"><b>You:</b> ${esc(x.q)}</p>` : ''}${x.res.sees ? `<p class="small"><b>Sees:</b> ${esc(x.res.sees)}</p>` : ''}${x.res.reading ? `<p class="small"><b>Reading:</b> ${esc(x.res.reading)}</p>` : ''}${x.res.reply ? `<p class="small">${esc(x.res.reply)}</p>` : ''}${x.res.picks.length ? `<p class="small dim">${x.res.picks.length} Smart pick${x.res.picks.length === 1 ? '' : 's'} added to the directions below.</p>` : ''}`).join('')}
      ${last && last.res.questions.length ? `<div class="chips">${last.res.questions.map(q => `<div role="button" tabindex="0" class="chip" data-smq="${esc(q)}">${esc(q)}</div>`).join('')}</div>` : ''}
      ${last && ['genre', 'feeling', 'role'].some(k => last.res.answers[k].length && JSON.stringify(last.res.answers[k]) !== JSON.stringify(answers(S.intent[k]))) ? `<div class="row wrap"><span class="small grow">Suggests answers: ${esc([['genre', GENRES], ['feeling', FEELINGS], ['role', ROLES]].map(([k, l]) => last.res.answers[k].map(id => (l.find(x => x.id === id) || {}).n).join(' + ')).filter(Boolean).join(' · '))}</span><button id="smUse" class="small">Use these answers</button></div>` : ''}
      ${S.smart.pending ? `<p class="small dim">Thinking about “${esc(S.smart.pending)}”… (a local model can take a minute)</p>` : ''}
      ${S.smart.error ? `<p class="small warn">${esc(S.smart.error)}</p>` : ''}
      <textarea id="smMsg" rows="2" placeholder="${t.length ? 'Answer, or ask for something else (e.g. warmer but not nostalgic)' : 'Tell it about the scene, or just ask'}"></textarea>
      <div class="row wrap"><button id="smAsk" class="primary">${t.length ? 'Send' : 'Ask about this frame'}</button>${t.length ? '<button id="smClear" class="small">New conversation</button>' : ''}</div></div>`;
  }
  function wireSmart(body) {
    if ($('#smSetup', body)) $('#smSetup', body).onclick = () => { if (S.smart.cfg.provider === 'off') { S.guide = { view: 'smart', step: 0, route: '' }; go('guide'); } else go('smart'); };
    if ($('#smAsk', body)) $('#smAsk', body).onclick = () => { const m = $('#smMsg', body).value.trim(); askSmart(m); };
    if ($('#smClear', body)) $('#smClear', body).onclick = () => { S.smart.turns = []; S.smart.history = []; S.smartDirs = []; S.chosen = -1; render(); };
    body.querySelectorAll('[data-smq]').forEach(b => b.onclick = () => { const t = $('#smMsg', body); t.value = b.dataset.smq + ' '; t.focus(); });
    if ($('#smUse', body)) $('#smUse', body).onclick = () => { const a = S.smart.turns[S.smart.turns.length - 1].res.answers;
      for (const k of ['genre', 'feeling', 'role']) if (a[k].length) S.intent[k] = a[k]; saveIntent(); busy('Finding directions', async () => { await suggest(); render(); }); };
  }
  function renderSmart(body) {
    const c = S.smart.cfg, d = S.smart.detect || {};
    if (S.smart.hasGemini == null) { S.smart.hasGemini = false; secret.get('gemini').then(k => { if (k) { S.smart.hasGemini = true; if (S.tab === 'smart') render(); } }); }
    const field = (id, label, val, ph, type = 'text') => `<label class="fld"><span class="small dim">${label}</span><input id="${id}" type="${type}" value="${esc(val || '')}" placeholder="${esc(ph || '')}"></label>`;
    body.innerHTML = `<div class="row"><button id="smBack">← Back</button><b class="grow">Smart mode</b><button id="smGuide" class="small">Step-by-step setup</button></div>
      <p class="small">Optional, and free to you: an AI that looks at the frame, reads what the scene is doing, talks it through with you and picks looks from Colored Lens's own recipes. Every pick is checked and previewed like any other direction; nothing is applied until you say so.</p>
      <div class="chips">${PROVIDERS.filter(p => !p.mac || host.bridge).map(p => `<div role="button" tabindex="0" class="chip ${c.provider === p.id ? 'on' : ''}" data-prov="${p.id}">${c.provider === p.id ? '✓ ' : ''}${esc(p.n)}</div>`).join('')}</div>
      <p class="small dim">${esc((PROVIDERS.find(p => p.id === c.provider) || {}).where || '')}</p>
      ${c.provider === 'ollama' || c.provider === 'auto' ? `<div class="card"><div class="k">Ollama</div>${field('olUrl', 'Address', c.ollamaUrl, SMART0.ollamaUrl)}
        ${d.ollama ? (d.ollama.ok ? (d.ollama.vision.length ? `<label class="fld"><span class="small dim">Vision model</span><select id="olModel">${d.ollama.vision.map(m => `<option ${m === c.ollamaModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : `<p class="small warn">Ollama is running, but none of its models can see images. In a terminal: ollama pull gemma3:4b</p>`) : '<p class="small warn">Ollama is not answering at that address. Install it from ollama.com and open it.</p>') : ''}
        <button id="olTest" class="small">Find Ollama and its models</button></div>` : ''}
      ${c.provider === 'openai' ? `<div class="card"><div class="k">Local server</div>${field('oaUrl', 'Address (ends in /v1)', c.openaiUrl, SMART0.openaiUrl)}
        <p class="small dim">Foundry Local: run <span class="mono">foundry service status</span> to see its address. LM Studio: Developer › Start server (usually http://localhost:1234/v1).</p>
        ${d.openai ? (d.openai.ok ? `<label class="fld"><span class="small dim">Model (pick one that can see images)</span><select id="oaModel">${d.openai.models.map(m => `<option ${m === c.openaiModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : '<p class="small warn">Nothing answered at that address.</p>') : field('oaModel', 'Model', c.openaiModel, 'model id')}
        ${field('oaKey', 'Key (only if your server needs one)', '', '••••', 'password')}<button id="oaTest" class="small">Find the server and its models</button></div>` : ''}
      ${c.provider === 'gemini' || c.provider === 'auto' ? `<div class="card"><div class="k">Google Gemini</div>${field('gmKey', 'Your API key (from aistudio.google.com)', '', S.smart.hasGemini ? 'saved: paste to replace' : 'paste your key', 'password')}
        ${field('gmModel', 'Model', c.geminiModel, SMART0.geminiModel)}<p class="small dim">Your key stays on this computer. Check Google's pricing page for which models are free on your account.</p><button id="gmSave" class="small">Save key</button></div>` : ''}
      ${c.provider === 'apple' || (c.provider === 'auto' && host.bridge) ? `<div class="card"><div class="k">Apple Intelligence</div>
        ${d.apple ? (d.apple.ok ? `<p class="small okmsg">Ready on this Mac.${d.apple.image ? '' : ' This version reads Colored Lens\'s measurements of the frame; it cannot look at the picture itself yet.'}</p>` : `<p class="small warn">${esc(appleReason(d.apple.reason))}</p>`) : ''}
        <button id="apTest" class="small">Check Apple Intelligence</button></div>` : ''}
      ${host.os === 'win' ? '<div class="card"><div class="k">Windows built-in AI</div><p class="small">The AI built into Copilot+ PCs will be supported through a small helper in a later update. Until then, Ollama or Microsoft Foundry Local (“Local server”) run on your PC for free.</p></div>' : ''}
      ${c.provider !== 'off' ? `<div role="button" tabindex="0" class="chip ${c.autoAsk ? 'on' : ''}" id="smAuto">${c.autoAsk ? '✓ ' : ''}Ask Smart mode every time I read a frame</div>` : ''}`;
    $('#smBack', body).onclick = () => go(S.back || 'shot');
    $('#smGuide', body).onclick = () => { S.guide = { view: 'smart', step: 0, route: '' }; S.tab = 'guide'; render(); };
    body.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { c.provider = b.dataset.prov; saveSmart(); S.smart.detect = null; render(); });
    const v = id => ($('#' + id, body) || {}).value;
    const keep = () => { if (v('olUrl') != null) c.ollamaUrl = v('olUrl'); if (v('olModel') != null) c.ollamaModel = v('olModel'); if (v('oaUrl') != null) c.openaiUrl = v('oaUrl'); if (v('oaModel') != null) c.openaiModel = v('oaModel'); if (v('gmModel') != null) c.geminiModel = v('gmModel'); saveSmart(); };
    body.querySelectorAll('input, select').forEach(i => i.onchange = keep);
    if ($('#apTest', body)) $('#apTest', body).onclick = () => busy('Checking Apple Intelligence', async () => { S.smart.detect = { ...d, apple: await detectApple(host.bridge) }; render(); });
    if ($('#olTest', body)) $('#olTest', body).onclick = () => busy('Looking for Ollama', async () => { keep(); const r = await detectOllama(c.ollamaUrl, httpGet); S.smart.detect = { ...d, ollama: r };
      if (r.ok && r.vision.length && !r.vision.includes(c.ollamaModel)) { c.ollamaModel = r.vision[0]; saveSmart(); } render(); });
    if ($('#oaTest', body)) $('#oaTest', body).onclick = () => busy('Looking for the server', async () => { keep(); if (v('oaKey')) await secret.set('openai', v('oaKey')); const r = await detectOpenAI(c.openaiUrl, await secret.get('openai'), httpGet);
      S.smart.detect = { ...d, openai: r }; if (r.ok && r.models.length && !r.models.includes(c.openaiModel)) { c.openaiModel = r.models[0]; saveSmart(); } render(); });
    if ($('#gmSave', body)) $('#gmSave', body).onclick = () => busy('Saving', async () => { keep(); if (v('gmKey')) { await secret.set('gemini', v('gmKey')); S.smart.hasGemini = true; toast('Gemini key saved on this computer'); } render(); });
    if ($('#smAuto', body)) $('#smAuto', body).onclick = () => { c.autoAsk = !c.autoAsk; saveSmart(); render(); };
  }

  // ---------- Guide: first-run tour, Smart mode setup, prompts for an AI assistant ----------
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    try { await navigator.clipboard.setContent({ 'text/plain': t }); return true; } catch {}
    return false;
  }
  async function testSmart() { // a tiny real request: proves the whole path works
    const real = await resolveProvider(await smartCfg(), httpGet, host.bridge); if (!real) throw new Error('No model is set up yet');
    const px = { w: 8, h: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(128) };
    const text = await ask(real, { prompt: 'This is a connection test. Reply with exactly this JSON: {"sees":"ok","picks":[]}', imageB64: toBase64(encodePNG(px)) }, httpPost, host.bridge);
    parseReply(text); return real;
  }
  function renderGuide(body) {
    const G = S.guide, done = () => { settings.set('guideSeen', 1); };
    const info = { os: host.os === 'win' ? 'win' : 'mac', hostLabel: host.label || host.name, version: host.version, route: G.route };
    const promptBox = (kind, label) => `<div class="card"><div class="k">${label}</div><p class="small dim">Copy this and paste it into any AI assistant (ChatGPT, Claude, Gemini, Copilot…). It will walk you through, one step at a time.</p>
      <textarea class="prompt" rows="5" readonly data-prompt="${kind}">${esc(helpPrompt(kind, info))}</textarea><div class="row"><button data-copyprompt="${kind}">Copy the prompt</button></div></div>`;
    if (G.view === 'tour') {
      const st = TOUR[G.step], last = G.step === TOUR.length - 1;
      body.innerHTML = `<div class="card tour"><div class="k">Getting started · ${G.step + 1} of ${TOUR.length}</div><h3>${esc(st.t)}</h3><p>${esc(st.b)}</p><p class="small tip">${esc(st.tip)}</p>
        <div class="dots">${TOUR.map((_, i) => `<span class="dot ${i === G.step ? 'on' : ''}"></span>`).join('')}</div>
        <div class="row wrap">${G.step ? '<button id="gBack">Back</button>' : ''}${last ? '<button id="gSmart" class="primary">Set up Smart mode</button><button id="gDone">Start without it</button>' : '<button id="gNext" class="primary">Next</button>'}${last ? '' : '<button id="guideSkip">Skip the tour</button>'}</div></div>`;
      if ($('#gBack', body)) $('#gBack', body).onclick = () => { G.step--; render(); };
      if ($('#gNext', body)) $('#gNext', body).onclick = () => { G.step++; render(); };
      if ($('#guideSkip', body)) $('#guideSkip', body).onclick = () => { done(); go('shot'); };
      if ($('#gDone', body)) $('#gDone', body).onclick = () => { done(); go('shot'); };
      if ($('#gSmart', body)) $('#gSmart', body).onclick = () => { done(); G.view = 'smart'; G.route = ''; render(); };
      return;
    }
    if (G.view === 'home') {
      body.innerHTML = `<div class="row"><button id="gClose">← Back</button><b class="grow">Guide</b></div>
        <div class="card"><h3>Take the one-minute tour</h3><p class="small">How to read a shot, pick a direction, apply it and save it.</p><button id="gTour" class="primary">Start the tour</button></div>
        <div class="card"><h3>Set up Smart mode</h3><p class="small">Step by step, for your ${info.os === 'win' ? 'Windows PC' : 'Mac'}. No technical knowledge needed.</p><button id="gSetup">Show me how</button></div>
        ${promptBox('use', 'Want a patient teacher?')}`;
      $('#gClose', body).onclick = () => go(S.back || 'shot');
      $('#gTour', body).onclick = () => { G.view = 'tour'; G.step = 0; render(); };
      $('#gSetup', body).onclick = () => { G.view = 'smart'; G.route = ''; render(); };
    } else { // Smart mode setup
      const R = routes(info.os), r = R.find(x => x.id === G.route);
      body.innerHTML = `<div class="row"><button id="gHome">← Guide</button><b class="grow">Set up Smart mode</b></div>
        ${!r ? `<p class="small">Smart mode needs an AI model to talk to. Pick the way that suits you; you can change it later.</p>
          ${R.map(x => `<div class="card route ${x.steps.length ? '' : 'soon'}" data-route="${x.id}"><h3>${esc(x.n)}</h3><div class="small tag">${esc(x.tag)}</div><p class="small">${esc(x.who)}</p>${x.steps.length ? `<button data-route="${x.id}">Choose this</button>` : ''}</div>`).join('')}
          ${promptBox('smart', 'Not sure which to choose?')}`
        : `<div class="card"><h3>${esc(r.n)}</h3><div class="small tag">${esc(r.tag)}</div>
            ${r.steps.map((st, i) => `<div class="step"><div class="num">${i + 1}</div><div class="grow"><p class="small">${esc(st.t)}</p>
              ${st.url ? `<button data-url="${esc(st.url)}">${esc(st.label)}</button>` : ''}${st.copy ? `<div class="row"><span class="mono code grow">${esc(st.copy)}</span><button data-copy="${esc(st.copy)}">Copy</button></div>` : ''}
              ${st.key ? `<div class="row"><input id="gKey" type="password" placeholder="Paste your key here"><button id="gKeySave">Save</button></div>` : ''}</div></div>`).join('')}
            ${r.check === 'settings' ? '<button id="gSettings" class="primary">Open Smart settings</button>' : `<button id="gCheck" class="primary">${r.check === 'ollama' ? 'Find Ollama and switch Smart mode on' : 'Test my key and switch Smart mode on'}</button>`}
            ${G.msg ? `<p class="small ${G.ok ? 'okmsg' : 'warn'}">${esc(G.msg)}</p>` : ''}${G.ok ? '<div class="row"><button id="gGo" class="primary">Try it on a shot</button></div>' : ''}
            ${r.trouble ? `<p class="small dim">${esc(r.trouble)}</p>` : ''}</div>
          <div class="row"><button id="gOther">Choose a different way</button></div>
          ${promptBox('smart', 'Stuck? Get a hand-held walkthrough')}`}`;
      $('#gHome', body).onclick = () => { G.view = 'home'; G.msg = ''; render(); };
      body.querySelectorAll('button[data-route]').forEach(b => b.onclick = () => { G.route = b.dataset.route; G.msg = ''; G.ok = false; render(); });
      if ($('#gOther', body)) $('#gOther', body).onclick = () => { G.route = ''; G.msg = ''; G.ok = false; render(); };
      if ($('#gSettings', body)) $('#gSettings', body).onclick = () => { S.smart.cfg.provider = 'openai'; saveSmart(); go('smart'); };
      if ($('#gGo', body)) $('#gGo', body).onclick = () => go('shot');
      if ($('#gKeySave', body)) $('#gKeySave', body).onclick = async () => { const k = $('#gKey', body).value.trim(); if (!k) return toast('Paste your key first'); await secret.set('gemini', k); S.smart.hasGemini = true; toast('Key saved on this computer'); };
      if ($('#gCheck', body)) $('#gCheck', body).onclick = () => busy('Checking', async () => {
        const c = S.smart.cfg; G.ok = false;
        try {
          if (r.check === 'ollama') {
            const d = await detectOllama(c.ollamaUrl || SMART0.ollamaUrl, httpGet);
            if (!d.ok) throw new Error('Ollama is not answering yet. Is the llama icon showing? Open Ollama, then press the button again.');
            if (!d.vision.length) throw new Error('Ollama is running, but it has no model that can see pictures yet. Do step 3, wait for the download to finish, then try again.');
            c.provider = 'ollama'; c.ollamaModel = d.vision.includes(c.ollamaModel) ? c.ollamaModel : d.vision[0]; saveSmart();
            G.msg = `Found Ollama with ${c.ollamaModel}. Smart mode is on, and your frames stay on this computer.`; G.ok = true;
          } else {
            const k = ($('#gKey', body) || {}).value; if (k && k.trim()) { await secret.set('gemini', k.trim()); S.smart.hasGemini = true; }
            if (!(await secret.get('gemini'))) throw new Error('Paste your key in step 3 first.');
            c.provider = 'gemini'; saveSmart(); await testSmart();
            G.msg = 'Your key works. Smart mode is on.'; G.ok = true;
          }
        } catch (e) { G.msg = e.message || String(e); if (r.check === 'gemini') { c.provider = 'off'; saveSmart(); } }
        render();
      });
    }
    body.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => toast((await copyText(b.dataset.copy)) ? 'Copied' : 'Select the text and copy it by hand'));
    body.querySelectorAll('[data-copyprompt]').forEach(b => b.onclick = async () => { const t = body.querySelector(`textarea[data-prompt="${b.dataset.copyprompt}"]`);
      if (await copyText(t.value)) toast('Prompt copied: paste it into your AI assistant'); else { t.focus(); t.select && t.select(); toast('Press Cmd/Ctrl + C to copy the selected text'); } });
  }

  /** Called by the host when the separate Preview panel shows: the preview moves there. */
  function attachPreview(el) { pvEl = el; S.detached = true; render(); }
  if (!settings.get('guideSeen', 0)) { S.back = 'shot'; S.tab = 'guide'; S.guide = { view: 'tour', step: 0, route: '' }; }
  render();
  return { state: S, updater: up, render, attachPreview };
}

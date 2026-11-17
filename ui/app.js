// Colored Lens panel: one app for Premiere Pro (UXP), DaVinci Resolve Studio (Workflow Integration) and the web.
// Everything host-specific goes through `host` (see hosts/README.md). Plain DOM + flexbox so it runs inside UXP.
//
// The loop: read the frame -> say what it is for -> get directions -> preview them on the frame -> tweak live ->
// apply to clips -> save as a preset -> apply the preset to other shots.
import { readFrame, frameStats, labPixels } from '../core/analysis.js';
import { checkSkin, vectorscope } from '../core/skin.js';
import { pngDataUrl, encodePNG, downsample, toBase64 } from '../core/image.js';
import { PROVIDERS, CLAUDE_MODELS, DEFAULTS as SMART0, buildPrompt, parseReply, validate, ask, buildStudy, buildSuggest, validateStudy, validateSuggest, howTo, zonesFor, picture, SYSTEM_STUDY, SYSTEM_SUGGEST, detectOllama, detectOpenAI, detectApple, appleReason, resolveProvider } from '../core/smart.js';
import { shotRecord, encodeShot, decodeShot, renderStrip, readSequence, scriptCSV } from '../core/script.js';
import { zoneDefaults, zoneCoverage, hasZones, parseLookInput, formatCode, fullGrade, makePixelFn, bakeCube, lookToEngineParams, shareLink, computeMatch, matchStats, hasCurves, GRADE0 } from '../core/look.js';
import { GENRES, FEELINGS, ROLES, KIND_LABEL, pickDirections, describeEffect, whyFor, frameSummary, answers, isDark, continuity, pictureOf, directionsFromPicks } from '../core/directions.js';
import { previewer, wipe } from '../core/preview.js';
import { listPresets, savePreset, deletePreset, duplicatePreset, presetCode, importPresetCode, settings } from '../core/presets.js';
import { Updater } from '../core/updates.js';
import config from '../studio.config.json';
import { sliderHTML, wireSliders } from './slider.js';
import { COACH, routes, helpPrompt } from './guide.js';
import { decodeImage, makeFrame } from '../core/image.js';
import { encodeJPEG } from '../core/jpeg.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = s => String(s ?? '').replace(/<[^>]+>/g, '');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const pct = v => Math.round(v * 100) + '%';
const clone = o => JSON.parse(JSON.stringify(o));
const XDEF = { skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1, ...zoneDefaults() };
const NEUTRAL_LOOK = () => ({ L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C0', M: 'M0', A: '2.39', G: fullGrade({}) });
const normIntent = i => ({ genre: answers(i.genre), feeling: answers(i.feeling), role: answers(i.role), note: i.note || '' });
const lookCode = (l, matte) => { const c = formatCode(l); return matte ? c : c.replace(/·[\d.]+$/, ''); };

export async function startApp(host, root) {
  const S = { tab: 'shot', back: 'shot', frame: null, meta: null, reading: null, skin: null, sample: null, shots: [],
    intent: normIntent(settings.get('intent', {})), seqId: '', ctx: null, lead: 0, neigh: [], scope: settings.get('scope', 'clip'), input: settings.get('input', 'rec709'),
    directions: [], chosen: -1, look: NEUTRAL_LOOK(), extra: { ...XDEF }, matte: false, recipe: { name: '', presetId: null }, view: 'split', wipe: 0.5,
    guide: { view: 'home', step: 0, route: '' }, tour: null, simple: !!settings.get('simple', 1), layerOff: [], range: settings.get('range', 'shot'), study: null, sugg: [], suggOpen: -1, suggHow: -1, rangeInfo: null, ai: { busy: '', error: '', chat: [], none: false }, theme: settings.get('theme', 'bright'), moreQ: false, moreD: false, dockSize: settings.get('dockSize', 'M'), dockHidden: false, detached: false, smartDirs: [],
    smart: { cfg: (c => { if (c.geminiModel === 'gemini-2.5-flash') c.geminiModel = SMART0.geminiModel; return c; })({ ...SMART0, ...settings.get('smart', {}) }), turns: [], history: [], detect: null, using: '' }, refFrameStats: null, refName: '', adapt: settings.get('adapt', true), encQ: '', shownCode: '', confirmDel: '', busy: false, showSkin: false, showRefs: false };
  let PV = null, pvEl = null; // pvEl: the separate Preview panel's container, once it has been opened
  const up = new Updater(host, config.pagesBase);
  root.innerHTML = `
    <div class="cl">
      <div id="banner" class="banner" hidden></div>
      <div class="head"><div class="brand">Colored Lens <span class="dim">· ${esc(host.label || host.name)}</span></div><span id="status" class="dim small"></span></div>
      <div class="links"><div role="button" tabindex="0" id="guideBtn" class="linkbtn small">Guide</div><div role="button" tabindex="0" id="smartBtn" class="linkbtn small">AI</div><div role="button" tabindex="0" id="encBtn" class="linkbtn small">Encyclopedia</div><span class="grow"></span><div role="button" tabindex="0" id="modeBtn" class="linkbtn small"></div><div role="button" tabindex="0" id="themeBtn" class="linkbtn small"></div></div>
      <div class="tabs">${['shot:Shot', 'scene:Scene', 'tweak:Tweak', 'presets:Presets'].map(t => { const [id, n] = t.split(':'); return `<div data-tab="${id}" class="tab" role="tab" tabindex="0">${n}</div>`; }).join('')}</div>
      <div id="dock" class="dock" hidden></div>
      <div id="body" class="body"></div>
      <div id="coach" class="coach" hidden></div>
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
  const chrome = () => { const cl = root.querySelector('.cl'); if (cl) cl.classList.toggle('dark', S.theme === 'dark');
    $('#modeBtn', root).textContent = S.simple ? 'Show details' : 'Simple view'; $('#themeBtn', root).textContent = S.theme === 'dark' ? 'Bright' : 'Dark'; };
  $('#modeBtn', root).onclick = () => { S.simple = !S.simple; settings.set('simple', S.simple ? 1 : 0); S.moreQ = S.moreD = false; chrome(); render(); };
  $('#themeBtn', root).onclick = () => { S.theme = S.theme === 'dark' ? 'bright' : 'dark'; settings.set('theme', S.theme); chrome(); };
  chrome();
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
    // a new shot starts with every layer ticked; re-reading the same shot keeps the editor's ticks
    const key = S.ctx && S.ctx.subject ? `${S.ctx.subject.track}|${S.ctx.subject.name}|${S.ctx.subject.start}` : ''; if (key !== S.layerKey) { S.layerOff = []; S.layerKey = key; }
    const g = await host.grabFrame(undefined, { clean: true, hide: S.layerOff, onSlow: () => status('Premiere is still rendering this frame (heavy timelines take a while)…') }); S.frame = g.frame; S.meta = g; g.readWithout = S.layerOff.slice().sort(); S.sample = null; S.chosen = -1; S.lead = 0;
    S.study = null; S.sugg = []; S.suggOpen = S.suggHow = -1; S.rangeInfo = null; S.ai = { busy: '', error: '', chat: [], none: false };
    S.smartDirs = []; S.smart.turns = []; S.smart.history = [];
    // answers belong to the scene (marker range) when there is one, otherwise to the sequence
    useSequence(S.ctx && S.ctx.scene ? `${g.sequenceId}|${S.ctx.scene.start.toFixed(2)}` : g.sequenceId);
    // the finished shots either side, for continuity
    if (S.ctx) for (const [side, n] of [['before', S.ctx.before], ['after', S.ctx.after]]) if (n) try {
      status(`Reading the shot ${side}…`); const f = (await host.grabFrame(n.seconds)).frame; S.neigh.push({ side, name: n.name, pic: pictureOf(frameStats(labPixels(f))) }); } catch (e) { console.warn('neighbour', e); }
    PV = previewer(S.frame, cat(), lutsFor); stageCache.key = '';
    S.reading = readFrame(S.frame, enc(), refs()); runSkin(); return g;
  }
  /** A sample picture from the encyclopedia, for trying Colored Lens without a sequence open. */
  async function useSample() {
    const r = await host.fetch(up.frameUrl('frames/ctx-pink-urban.jpg')); if (!r.ok) throw new Error('The sample picture could not be downloaded. Connect to the internet, or read one of your own shots.');
    S.frame = decodeImage(new Uint8Array(await r.arrayBuffer())); S.meta = { clipName: 'Sample picture', timecode: '' }; S.ctx = null; S.neigh = []; S.sample = null; S.chosen = -1; S.lead = 0;
    S.smartDirs = []; S.smart.turns = []; S.smart.history = []; S.study = null; S.sugg = []; S.suggOpen = S.suggHow = -1; S.rangeInfo = null; S.ai = { busy: '', error: '', chat: [], none: false };
    PV = previewer(S.frame, cat(), lutsFor); stageCache.key = ''; S.reading = readFrame(S.frame, enc(), refs()); runSkin(); await suggest();
    if (S.smart.cfg.provider !== 'off' && S.smart.cfg.autoAsk !== false) studyFrame('');
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
    const d = allDirs()[i]; if (!d) return; S.chosen = i; S.suggOn = -1; S.suggZ = null;
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
    const a = S.frame.w / S.frame.h, panelW = pvBox ? pvBox.w : (root.clientWidth || 360), panelH = root.clientHeight || window.innerHeight || 800;
    // In the main panel the picture sits beside its controls when there is room, and never takes more than about a
    // third of the panel's height, so there is always space to read below it.
    const side = !pvBox && panelW >= 430, avail = Math.max(80, (side ? Math.round(panelW * 0.5) : panelW) - 26);
    let h = pvBox ? Math.max(60, pvBox.h - (shot && S.chosen >= 0 ? 200 : 100)) : Math.min(DOCK_H[S.dockSize] || 220, Math.round(panelH * (S.dockSize === 'L' ? 0.5 : S.dockSize === 'S' ? 0.2 : 0.32)));
    let w = Math.round(h * a); if (w > avail) { w = avail; h = Math.round(w / a); }
    const stage = `<div id="stage" class="stage2 ${shot ? 'click' : ''}" data-w="${w}" style="width:${w}px;height:${h}px;${side ? 'margin:0 12px 4px 0;flex:none;' : ''}">
        <img id="stB" src="" style="width:${w}px;height:${h}px;"><div id="stClip" style="height:${h}px;"><img id="stA" src="" style="width:${w}px;height:${h}px;"></div><div id="stLine" style="height:${h}px;"><div id="stGrip"></div></div></div>`;
    const controls = `<div class="row tight"><div class="segs">${['before:Before', 'split:Split', 'after:After'].map(v => { const [id, n] = v.split(':'); return seg(id, n, S.view === id, 'data-view'); }).join('')}</div>
        <div class="grow"></div>${S.detached ? '' : `<div class="segs" title="Preview size">${['S', 'M', 'L'].map(z => seg(z, z, S.dockSize === z, 'data-dsize')).join('')}</div>`}</div>
      <div class="row tight">${host.openPreviewPanel ? `<button id="dockPop" class="small" title="${S.detached ? 'Put the preview back in the Colored Lens panel' : 'Open the preview as its own panel, to dock anywhere'}">${S.detached ? 'Back to panel' : 'Pop out'}</button>` : ''}${S.detached ? '' : '<button id="dockHide" class="small" title="Hide the preview">Hide</button>'}</div>`;
    const rest = `${S.view === 'split' ? sliderHTML({ id: 'wipe', label: 'Wipe', min: 0, max: 1, step: 0.01, value: S.wipe, def: 0.5 }) : ''}
      ${d ? `<div class="small">Previewing <b>${esc(S.suggOn >= 0 && S.sugg[S.suggOn] ? S.sugg[S.suggOn].title : d.name)}</b> <span class="dim">(colour, grain and vignette; halation and glow show on the clip)</span></div>
        ${scopeRow()}<div class="row wrap"><button class="primary" data-dapply="${S.chosen}">${S.scope === 'clip' ? 'Apply to selected clips' : 'Apply'}</button><button data-dtweak="${S.chosen}">Tweak</button><button data-dsave="${S.chosen}">Save as preset</button><button id="dclear">Back to the original</button></div>`
        : `<div class="small dim">${shot ? 'Click a face in the picture to check its skin. Pick a direction below to preview it here.' : 'Live preview: colour, grain and vignette. Halation and diffusion glow show on the clip.'}</div>`}`;
    return side ? `<div class="dockrow">${stage}<div class="grow dockside">${controls}${rest}</div></div>` : stage + controls + rest;
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
    const up = e => { if (!drag) return; const d = drag; drag = null; stageDrag = false;
      for (const t of ['pointermove', 'mousemove']) document.removeEventListener(t, move); for (const t of ['pointerup', 'mouseup']) document.removeEventListener(t, up);
      if (d.moved) renderDock(); else if (canSample) { const [x, y] = posOf(e); sample(x, y); } };
    const down = e => { if (e.button != null && e.button !== 0) return; drag = { x: e.clientX, moved: false }; stageDrag = true;
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
    // Same tab: keep the reader where they were (re-drawing must never throw them to the top or bottom of the page).
    const body = $('#body', root), same = body && render.lastTab === S.tab, keep = same ? body.scrollTop : 0; render.lastTab = S.tab;
    if (!up.content.encyclopedia) return;
    if (S.tab === 'tweak' && S.dockHidden && S.frame && !same) S.dockHidden = false; // tweaking blind is pointless
    renderDock();
    ({ shot: renderShot, scene: renderScene, tweak: renderTweak, presets: renderPresets, enc: renderEnc, smart: renderSmart, guide: renderGuide })[S.tab](body);
    body.scrollTop = keep;
    renderCoach();
  }

  // ---------- the hands-on tour: highlights one real part of the panel at a time ----------
  const coachDone = k => k === 'frame' ? !!S.frame : k === 'feeling' ? answers(S.intent.feeling).length > 0 : k === 'chosen' ? S.chosen >= 0 : true;
  function startTour() { S.tour = { i: 0, dir: 1 }; S.tab = 'shot'; render(); }
  function endTour(next) { S.tour = null; settings.set('guideSeen', 1); if (next === 'smart') { S.guide = { view: 'smart', step: 0, route: '' }; S.back = 'shot'; S.tab = 'guide'; } render(); }
  function renderCoach() {
    const el = $('#coach', root); root.querySelectorAll('.spot').forEach(n => n.classList.remove('spot')); if (pvEl) pvEl.classList.remove('spot');
    if (!S.tour) { el.hidden = true; el.innerHTML = ''; return; }
    let st = COACH[S.tour.i];
    if (st.tab && S.tab !== st.tab) { S.tab = st.tab; return render(); }
    let target = st.sel ? (st.sel === '#dock' && S.detached && pvEl ? pvEl : root.querySelector(st.sel)) : null;
    if (st.sel === '#dock' && target && target.hidden) target = null;
    if (st.sel && !target && st.opt) { const j = S.tour.i + S.tour.dir; if (j >= 0 && j < COACH.length) { S.tour.i = j; return renderCoach(); } }
    if (target) { target.classList.add('spot'); const body = $('#body', root);
      if (body.contains(target)) { const d = target.getBoundingClientRect().top - body.getBoundingClientRect().top; if (d < 0 || d > body.clientHeight * 0.5) body.scrollTop += d - 8; } }
    const ok = !st.wait || coachDone(st.wait), last = !!st.end, n = S.tour.i + 1;
    el.hidden = false;
    el.innerHTML = `<div class="k">Tour · ${n} of ${COACH.length}${target ? ' · look for the pink outline' : ''}</div><h3>${esc(st.t)}</h3><p class="small">${esc(st.b)}</p>
      ${st.wait ? `<p class="small ${ok ? 'okmsg' : 'todo'}">${ok ? '✓ Done. Press Next.' : '👉 ' + esc(st.do)}</p>` : ''}
      <div class="row wrap">${S.tour.i ? '<button id="cBack">Back</button>' : ''}
        ${last ? `<button id="cSmart" class="primary">Set up the AI</button><button id="cEnd">Finish</button>` : `<button id="cNext" class="${ok ? 'primary' : ''}">${ok ? 'Next' : 'Skip this step'}</button>`}
        ${st.sample && !ok ? '<button id="cSample">Use a sample picture instead</button>' : ''}${last ? '' : '<button id="cEnd" class="small">End tour</button>'}</div>`;
    if ($('#cBack', el)) $('#cBack', el).onclick = () => { S.tour.i--; S.tour.dir = -1; render(); };
    if ($('#cNext', el)) $('#cNext', el).onclick = () => { S.tour.i++; S.tour.dir = 1; render(); };
    if ($('#cEnd', el)) $('#cEnd', el).onclick = () => endTour();
    if ($('#cSmart', el)) $('#cSmart', el).onclick = () => endTour('smart');
    if ($('#cSample', el)) $('#cSample', el).onclick = () => busy('Loading a sample picture', async () => { await useSample(); render(); });
  }

  // SHOT ------------------------------------------------------------------
  const chipRow = (list, key) => { const cur = answers(S.intent[key]);
    return `<div class="chips">${list.map(x => { const k = cur.indexOf(x.id); return `<div role="button" tabindex="0" class="chip ${k === 0 ? 'on' : k === 1 ? 'on2' : ''}" data-intent="${key}:${x.id}" title="${k === 0 ? 'Main answer' : k === 1 ? 'Second answer' : 'Tap to add (up to two)'}">${k === 0 ? '✓ ' : k === 1 ? '+ ' : ''}${esc(x.n)}</div>`; }).join('')}</div>`; };
  function intentBody() { const I = S.intent;
    if (S.simple && !S.moreQ) return `<div class="q">This scene should feel <span class="dim">(tap one or two)</span></div>${chipRow(FEELINGS, 'feeling')}
        <div class="more" id="moreQ">More questions: the project, the kind of shot, log footage ›</div>`;
    return `        <p class="small dim">Tap up to two answers per question when a shot is more than one thing; the first is the main one.${S.seqId ? ` Remembered for the sequence “${esc(S.meta && S.meta.sequenceName || '')}”.` : ''}</p>
        <div class="q">The project</div>${chipRow(GENRES, 'genre')}
        <div class="q">This scene should feel</div>${chipRow(FEELINGS, 'feeling')}
        <div class="q">This shot is</div>${chipRow(ROLES, 'role')}
        <div class="q">The footage is</div><div class="chips"><div role="button" tabindex="0" class="chip ${S.input === 'rec709' ? 'on' : ''}" data-input="rec709">${S.input === 'rec709' ? '✓ ' : ''}Normal video (Rec.709)</div><div role="button" tabindex="0" class="chip ${S.input === 'logc3' ? 'on' : ''}" data-input="logc3">${S.input === 'logc3' ? '✓ ' : ''}Log (ARRI LogC3)</div></div>
        <div class="row"><input id="note" placeholder="Anything else about this scene? (saved with presets)" value="${esc(I.note)}"></div>`; }
  function readingSimple(r, k) {
    const warn = k && k.findings ? k.findings.find(f => f.level === 'warn') : null;
    return `<div class="card"><div class="k">What the frame is doing</div><p>${esc(frameSummary(r, enc()))}</p>${swatchBar(r.swatches)}
      ${r.confidence.level !== 'high' ? `<p class="small warn">${esc(r.confidence.why.join(' '))}</p>` : ''}${warn ? `<p class="small warn">▲ ${esc(warn.title)}</p>` : ''}</div>`; }
  function renderShot(body) {
    const r = S.reading, k = S.skin, I = S.intent;
    body.innerHTML = `
      <div class="row"><button id="grab" class="primary">${esc(host.grabLabel || 'Read the frame under the playhead')}</button>${S.frame ? `<span class="small dim">${esc(S.meta.clipName || '')} ${esc(S.meta.timecode || '')}</span>` : ''}</div>
      ${S.frame ? '' : `<p class="dim">Park the playhead on a shot and read it. Colored Lens tells you what the frame is doing, asks what it is for, and suggests directions you can preview, tweak, apply and save.</p>`}
      ${S.ctx ? contextCard(S.ctx) : ''}
      <div id="reading">${r ? (S.simple ? readingSimple(r, k) : readingCard(r, k)) : ''}</div>
      <div class="card" id="intent"><div class="k">What is this for?</div>
        ${intentBody()}
        ${!S.frame ? '<p class="small dim">Your answers are remembered. Read a frame to get directions.</p>' : ''}</div>
      ${S.frame ? scopeCard() + aiCard() + suggHTML() : ''}
      <div id="dirs">${directionsHTML()}</div>
      ${k && !S.simple ? skinCard(k) : ''}
      ${r && r.matches.length && !S.simple ? `<div class="card"><div class="row tight"><div class="k grow">Similar frames in the encyclopedia</div><button class="small" id="togRefs">${S.showRefs ? 'Hide' : 'Show'}</button></div>${S.showRefs ? refsHTML(r) : ''}</div>` : ''}`;
    $('#grab', body).onclick = () => busy('Reading frame', async () => { await grab(); await suggest(); render();
      if (S.smart.cfg.provider !== 'off' && S.smart.cfg.autoAsk !== false) studyFrame(''); });
    body.querySelectorAll('[data-intent]').forEach(b => b.onclick = () => {
      const [key, id] = b.dataset.intent.split(':'), cur = answers(S.intent[key]);
      S.intent[key] = cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 2 ? [...cur, id] : [cur[0], id]; saveIntent();
      if (key === 'feeling') runSkin();
      if (S.frame) busy('Finding directions', async () => { await suggest(); S.chosen = -1; render(); }); else render();
    });
    body.querySelectorAll('[data-input]').forEach(b => b.onclick = () => { S.input = b.dataset.input; settings.set('input', S.input); runSkin(); stageCache.key = '';
      if (S.frame) busy('Finding directions', async () => { await suggest(); render(); }); else render(); });
    if ($('#note', body)) $('#note', body).onchange = e => { S.intent.note = e.target.value; saveIntent(); };
    if ($('#moreQ', body)) $('#moreQ', body).onclick = () => { S.moreQ = true; render(); };
    if ($('#moreD', body)) $('#moreD', body).onclick = () => { S.moreD = true; render(); };
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
    wireDirections(body); wireAI(body);
  }

  // ---------- the AI: what is in scope, what it sees, and its colour suggestions ----------
  const KINDS = { video: 'footage', nested: 'nested sequence', graphic: 'graphic / title', adjustment: 'adjustment layer' };
  const scopeLayers = () => { const c = S.ctx; if (!c || !c.subject) return []; return [...(c.above || []).slice().reverse(), c.subject].map(l => ({ track: l.track, name: l.name, kind: KINDS[l.kind] || l.kind, on: !S.layerOff.includes(l.track) })); };
  function ranges() { const c = S.ctx, out = []; if (!c || !c.subject) return out; const sub = c.subject.inner && c.subject.inner.start != null ? c.subject.inner : c.subject;
    out.push({ id: 'shot', n: 'This shot', a: sub.start, b: sub.end });
    if (c.scene) out.push({ id: 'scene', n: `Scene “${c.scene.name}”`, a: c.scene.start, b: c.scene.end });
    if (c.inOut) out.push({ id: 'inout', n: `In to Out (${fmtT(c.inOut.start)}–${fmtT(c.inOut.end)})`, a: c.inOut.start, b: c.inOut.end });
    if (c.end) out.push({ id: 'seq', n: 'Whole sequence', a: 0, b: c.end });
    return out; }
  const curRange = () => { const R = ranges(); return R.find(r => r.id === S.range) || R[0] || null; };
  function scopeCard() {
    const L = scopeLayers(), R = ranges(), cur = curRange(); if (!L.length && !R.length) return '';
    const dirty = S.meta && (S.meta.readWithout || []).join() !== S.layerOff.slice().sort().join();
    return `<div class="card" id="scope"><div class="k">In this frame</div>
      ${L.length ? `<p class="small dim">Untick a layer to leave it out of the reading and of the AI's advice (a title, for example).</p>
      ${L.map(l => `<div class="lay ${l.on ? 'on' : ''}" role="button" tabindex="0" data-lay="${l.track}"><span class="tick">${l.on ? '✓' : ''}</span><span class="grow"><b>V${l.track}</b> ${esc(l.name)} <span class="dim">· ${esc(l.kind)}</span></span></div>`).join('')}
      ${dirty ? `<div class="row"><button id="reread" class="primary">Read again with these layers</button></div>` : ''}` : ''}
      ${R.length > 1 ? `<div class="q">The AI also studies</div><div class="chips">${R.map(r => `<div role="button" tabindex="0" class="chip ${cur && cur.id === r.id ? 'on' : ''}" data-range="${r.id}">${cur && cur.id === r.id ? '✓ ' : ''}${esc(r.n)}</div>`).join('')}</div>
      <p class="small dim">${cur && cur.id === 'shot' ? 'Only this shot. Pick a wider range to let it read the scene around it.' : 'It looks at a few moments across this range to understand the scene. Set In and Out in the timeline for your own range.'}</p>` : ''}</div>`;
  }
  /** A few moments across the chosen range, as one contact-sheet picture plus a note per moment. */
  async function sampleRange() {
    const r = curRange(); if (!r || !host.clipContext) return null; if (S.rangeInfo && S.rangeInfo.id === r.id) return S.rangeInfo;
    const info = { id: r.id, label: r.n, samples: [], sheet: null }; if (r.id === 'shot') return (S.rangeInfo = info); // the frame itself stands for the shot
    const n = 4, frames = [], here = S.meta.seconds;
    for (let i = 0; i < n; i++) { const t = r.a + (r.b - r.a) * (i + 0.5) / n; if (here != null && Math.abs(t - here) < 0.4) continue;
      try { status(`Looking across ${r.n.toLowerCase()} (${i + 1} of ${n})…`); const f = downsample((await host.grabFrame(t)).frame, 256), st = frameStats(labPixels(f));
        frames.push(f); info.samples.push({ t: fmtT(t), note: `${st.meanB > 0.01 ? 'warm' : st.meanB < -0.01 ? 'cool' : 'neutral'}, ${st.p50 < 0.3 ? 'dark' : st.p50 > 0.6 ? 'bright' : 'mid'}` }); } catch (e) { console.warn('range frame', e); } }
    if (frames.length) { const w = frames[0].w, h = frames[0].h, cols = Math.min(2, frames.length), rows = Math.ceil(frames.length / cols), sheet = makeFrame(w * cols, h * rows);
      frames.forEach((f, k) => { const ox = (k % cols) * w, oy = Math.floor(k / cols) * h; for (let y = 0; y < Math.min(h, f.h); y++) sheet.data.set(f.data.subarray(y * f.w * 4, y * f.w * 4 + Math.min(w, f.w) * 4), ((oy + y) * sheet.w + ox) * 4); });
      for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255; info.sheet = sheet; }
    return (S.rangeInfo = info);
  }
  let aiBusy = false, stageDrag = false;
  /** Re-draws when the AI answers without throwing away what the editor is in the middle of (typing, scroll position). */
  function softRender() { if (S.tab !== 'shot') return; if (stageDrag) return void setTimeout(softRender, 300); const body = $('#body', root), top = body.scrollTop, m = $('#smMsg', body), txt = m ? m.value : '', had = m && document.activeElement === m;
    render(); body.scrollTop = top; const m2 = $('#smMsg', body); if (m2 && txt) { m2.value = txt; if (had) m2.focus(); } }
  async function aiCall(kind, message) {
    const real = await resolveProvider(await smartCfg(), httpGet, host.bridge);
    if (!real) { S.ai.none = true; throw new Error('none'); } S.ai.none = false;
    if (real.provider === 'ollama' && !real.ollamaModel) throw new Error('Choose an Ollama vision model in AI settings');
    if (real.provider === 'openai' && !real.openaiModel) throw new Error('Choose a model for your local server in AI settings');
    let vision = true; if (real.provider === 'apple') { const a = await detectApple(host.bridge); if (!a.ok) throw new Error(appleReason(a.reason)); vision = !!a.image; }
    S.ai.vision = vision; S.smart.using = provName(real.provider) + (real.provider === 'ollama' ? ' · ' + real.ollamaModel : real.provider === 'openai' ? ' · ' + real.openaiModel : '');
    const range = await sampleRange(), lite = real.provider === 'apple';
    const a = { reading: S.reading, skin: S.skin, intent: S.intent, ctx: S.ctx, neigh: S.neigh, summary: frameSummary(S.reading, enc()), layers: scopeLayers(), range, vision, message, enc: enc(), lite, understanding: S.study, count: lite || S.ai.small || real.provider === 'ollama' || real.provider === 'openai' ? (S.ai.small ? 3 : 5) : 10 };
    status(kind === 'study' ? 'The AI is studying the frame…' : 'The AI is working out colour suggestions…');
    const text = await ask(real, { prompt: kind === 'study' ? buildStudy(a) : buildSuggest(a), system: kind === 'study' ? SYSTEM_STUDY : SYSTEM_SUGGEST, imageB64: toBase64(encodeJPEG(downsample(S.frame, 768), 84)), mime: 'image/jpeg',
      images: range && range.sheet && !['ollama', 'openai'].includes(real.provider) ? [toBase64(encodeJPEG(range.sheet, 80))] : [], history: S.smart.history }, httpPost, host.bridge);
    return parseReply(text);
  }
  async function studyFrame(message) {
    if (aiBusy || !S.frame) return; aiBusy = true; S.ai.error = ''; S.ai.busy = message ? 'Thinking about what you said…' : 'Studying the frame…'; render();
    try { let rawS; try { rawS = await aiCall('study', message); } catch (e) { if (!/^REPEAT/.test(e.message)) throw e; rawS = await aiCall('study', message); }
      const res = validateStudy(rawS);
      if (message) S.ai.chat.push({ you: message, ai: res.reply || 'Understood. I have updated my reading of the frame.' });
      S.smart.history.push({ role: 'user', text: message || '(study this frame)' }, { role: 'assistant', text: JSON.stringify({ purpose: res.purpose, mood: res.mood, reply: res.reply }).slice(0, 900) });
      if (res.items.length || !S.study) S.study = res; else S.study = { ...S.study, ...Object.fromEntries(Object.entries(res).filter(([k, v]) => v && v.length && k !== 'items')) };
    } catch (e) { if (e.message !== 'none') { console.error(e); S.ai.error = String(e.message || e).replace(/^REPEAT: /, ''); } }
    finally { aiBusy = false; S.ai.busy = ''; status(); softRender(); }
  }
  async function suggestColours(message) {
    if (aiBusy || !S.frame) return; aiBusy = true; S.ai.error = ''; S.ai.busy = 'Working out colour suggestions… (this can take a minute)'; render();
    try { if (!S.study) S.study = validateStudy(await aiCall('study', ''));
      let raw; try { raw = await aiCall('suggest', message); } catch (e) { if (!/^REPEAT/.test(e.message)) throw e; S.ai.small = true; status('The AI stumbled; asking for fewer suggestions…'); try { raw = await aiCall('suggest', message); } catch (e2) { throw new Error(/^REPEAT/.test(e2.message) ? 'The AI on this computer keeps getting stuck on this frame. Try again, or switch to Gemini under “AI” for fuller suggestions.' : e2.message); } }
      const res = validateSuggest(raw, enc(), S.study);
      if (!res.suggestions.length) throw new Error('The AI did not return usable suggestions. Try again, or tell it more about the scene.');
      if (message) S.ai.chat.push({ you: message, ai: res.reply || `${res.suggestions.length} new suggestions below.` });
      S.sugg = res.suggestions; S.suggOpen = -1; S.suggHow = -1; S.suggOn = -1; S.suggZ = null;
      const picks = res.suggestions.filter(x => x.recipe).map(x => ({ recipe: x.recipe, why: x.idea || x.communicates, tweaks: x.tweaks })).filter((p, i, arr) => arr.findIndex(q => q.recipe === p.recipe) === i);
      S.smartDirs = picks.length ? await enrich(directionsFromPicks(picks, S.intent, { reading: S.reading, skin: S.skin, input: S.input })) : []; S.chosen = -1;
    } catch (e) { if (e.message !== 'none') { console.error(e); S.ai.error = String(e.message || e).replace(/^REPEAT: /, ''); } }
    finally { aiBusy = false; S.ai.busy = ''; status(); softRender(); }
  }
  const sw = hex => (hex ? `<span class="sw" style="background:${hex}"></span>` : '');
  function aiCard() {
    const c = S.smart.cfg, u = S.study;
    if (c.provider === 'off') return `<div class="card smart"><div class="row tight"><div class="k grow">The AI is switched off</div><button id="smSetup" class="small">Switch it on</button></div><p class="small dim">Colored Lens is working from its own rules only.</p></div>`;
    if (S.ai.none) return `<div class="card smart" id="aicard"><div class="k">Give Colored Lens its eyes</div><p class="small">Colored Lens is built around an AI that looks at your frame, names what is in it and suggests colours item by item. It is free, but this computer needs one to be set up first (about three minutes, once).</p>
      <div class="row wrap"><button id="aiSetup" class="primary">Set it up now</button><button id="aiRetry">Try again</button></div><p class="small dim">Until then you still get the quick looks below.</p></div>`;
    return `<div class="card smart" id="aicard"><div class="row tight"><div class="k grow">What the AI sees <span class="dim">· ${esc(c.provider === 'auto' ? (S.smart.using || 'Automatic') : provName(c.provider))}</span></div><button id="smSetup" class="small">AI settings</button></div>
      ${u && ['ollama', 'openai'].includes(c.provider) ? '<p class="small dim">A small AI on this computer is doing this. It is private, but its colour suggestions are simpler and it can make mistakes; Gemini gives fuller ones.</p>' : ''}
      ${u ? `${S.ai.vision === false ? '<p class="small warn">This AI cannot look at the picture yet, so this is built from measurements. For item-by-item detail, set up Gemini or Ollama in AI settings.</p>' : ''}
        ${u.caveat ? `<p class="small dim">${esc(u.caveat)}</p>` : ''}
        ${u.items.length ? `<div class="items">${u.items.map(i => `<div class="it">${sw(i.hex)}<span><b>${esc(i.name)}</b> <span class="dim">${esc([i.colour, i.where].filter(Boolean).join(' · '))}</span></span></div>`).join('')}</div>` : ''}
        ${u.light ? `<p class="small"><b>Light:</b> ${esc(u.light)}</p>` : ''}${u.mood ? `<p class="small"><b>Feels like:</b> ${esc(u.mood)}</p>` : ''}
        ${u.purpose ? `<p class="small"><b>What the shot is for:</b> ${esc(u.purpose)}</p>` : ''}${u.scene ? `<p class="small"><b>The scene around it:</b> ${esc(u.scene)}</p>` : ''}
        ${['genre', 'feeling', 'role'].some(k => u.answers[k].length && JSON.stringify(u.answers[k]) !== JSON.stringify(answers(S.intent[k]))) ? `<div class="row wrap"><span class="small grow">It would answer: ${esc([['genre', GENRES], ['feeling', FEELINGS], ['role', ROLES]].map(([k, l]) => u.answers[k].map(id => (l.find(x => x.id === id) || {}).n).join(' + ')).filter(Boolean).join(' · '))}</span><button id="aiUse" class="small">Use these answers</button></div>` : ''}`
        : (S.ai.busy ? '' : `<p class="small dim">The AI has not studied this frame yet.</p><div class="row"><button id="aiStudy" class="primary">Study this frame</button></div>`)}
      ${S.ai.chat.map(x => `<p class="small you"><b>You:</b> ${esc(x.you)}</p><p class="small"><b>AI:</b> ${esc(x.ai)}</p>`).join('')}
      ${u && u.questions.length ? `<div class="chips">${u.questions.map(q => `<div role="button" tabindex="0" class="chip" data-smq="${esc(q)}">${esc(q)}</div>`).join('')}</div>` : ''}
      ${S.ai.busy ? `<p class="small todo">${esc(S.ai.busy)}</p>` : ''}${S.ai.error ? `<p class="small warn">${esc(S.ai.error)}</p>${/free limit|very busy/i.test(S.ai.error) ? '<div class="row"><button id="aiLocal" class="small">Use the AI on this computer for now</button></div>' : ''}` : ''}
      ${u ? `<textarea id="smMsg" rows="2" placeholder="Tell it more about this shot or scene, or correct it (e.g. “she has just lost her job; the lamp is the only warm thing left”)"></textarea>
      <div class="row wrap"><button id="aiTell">Tell the AI</button><button id="aiSuggest" class="primary">${S.sugg.length ? 'Suggest again' : 'Suggest colours and looks'}</button></div>` : ''}</div>`;
  }
  function suggHTML() {
    if (!S.sugg.length) return '';
    return `<div class="k sect" id="sugg">Colour suggestions (${S.sugg.length})</div><p class="small dim">Each one says what colour to give what, what that tells the audience, and why. Tap one to open it.</p>
      ${S.sugg.map((g, i) => { const open = S.suggOpen === i, di = g.recipe ? S.smartDirs.findIndex(d => d.id === g.recipe) : -1;
        return `<div class="sg ${open ? 'on' : ''}"><div class="sghead" role="button" tabindex="0" data-sg="${i}"><div class="row tight"><b class="grow">${i + 1}. ${esc(g.title)}</b><span class="pal">${[g.ambience, ...g.items].map(c => sw(c.hex)).join('')}</span></div>
        <p class="small">${g.structure ? `<span class="badge">${esc(g.structure)}</span> ` : ''}${esc(g.idea || g.communicates)}</p><div class="more">${open ? 'Close ▴' : 'Open: colours item by item, why, references, try it ▾'}</div></div>
        ${open ? `${g.ambience.colour ? `<div class="it">${sw(g.ambience.hex)}<span><b>Ambience</b> → ${esc(g.ambience.colour)}</span></div>` : ''}
          ${g.items.map(it => `<div class="it">${sw(it.hex)}<span class="${it.changes === false ? 'dim' : ''}"><b>${esc(it.item)}</b> ${it.changes === false ? 'stays' : '→'} ${esc(it.colour)}${it.accent ? ' <span class="badge smart">accent</span>' : ''}${it.why ? ` <span class="dim">· ${esc(it.why)}</span>` : ''}</span></div>`).join('')}
          ${g.communicates ? `<p class="small"><b>This tells the audience:</b> ${esc(g.communicates)}</p>` : ''}${g.because ? `<p class="small"><b>Because:</b> ${esc(g.because)}</p>` : ''}
          ${g.refs.length ? `<div class="k">From the encyclopedia</div>${g.refs.map(r => `<p class="small ref1"><a href="#" data-more="${esc(r.name.split(' / ')[0])}">${esc(r.name)}</a> <span class="dim">(${esc(r.kind)})</span>: ${esc(r.line)}${r.ex ? ` <span class="dim">See: ${esc(String(r.ex).slice(0, 160))}</span>` : ''}</p>${imgStrip(r.name, 2)}`).join('')}` : ''}
          ${S.suggOn === i && S.suggZ ? suggStatus(g) : ''}
          <div class="row wrap"><button class="primary" data-sgprev="${i}">${S.suggOn === i ? 'Rebuild it' : 'Try this on my frame'}</button>${S.suggOn === i ? `<button data-dapply="0">Apply</button><button data-dtweak="0">Tweak</button>` : ''}<button data-sghow="${i}">${S.suggHow === i ? 'Hide the walkthrough' : 'How to finish this look'}</button><button data-sgpic="${i}">${g.pic ? 'Hide the AI’s picture' : 'Show the AI’s picture'}</button></div>
          ${g.picBusy ? '<p class="small todo">The AI is painting its version of your frame… (about half a minute)</p>' : ''}${g.picErr ? `<p class="small warn">${esc(g.picErr)}</p>` : ''}
          ${g.pic ? `<div class="k">The AI’s picture of this idea</div><img class="aipic" src="${g.pic}"><p class="small dim">An AI repainted your frame to show the idea. It is a concept, not a grade: it can change details a colour grade cannot. Compare it with “Try this on my frame”, which is what you can actually apply.</p>` : ''}
          ${S.suggHow === i ? `<div class="how">${howTo(g, host.name, S.suggOn === i ? S.suggZ : zonesFor(g, S.study, S.reading ? S.reading.swatches : [], S.frame ? downsample(S.frame, 160) : null), S.suggOn === i ? liveCoverage() : null).map(sec => `<div class="k">${esc(sec.h)}</div>${sec.steps.map((x, k) => `<div class="howrow"><span class="num">${k + 1}</span><span class="small grow">${esc(x)}</span></div>`).join('')}`).join('')}</div><div class="row"><button data-sgcopy="${i}">Copy the walkthrough</button></div>` : ''}` : ''}</div>`; }).join('')}`;
  }
  /** What the colour zones on the preview reach right now (follows every tweak). */
  function liveCoverage() { return S.frame && hasZones(S.extra) ? zoneCoverage(downsample(S.frame, 160), S.extra) : []; }
  function suggStatus(g) {
    const z = S.suggZ, cov = liveCoverage(), rows = [];
    if ((S.extra.ambAmt || 0) > 0 && g.ambience.colour) rows.push(`<div class="it">${sw(g.ambience.hex)}<span><b>Ambience</b> → ${esc(g.ambience.colour)}: on, at ${Math.round(S.extra.ambAmt * 100)}%</span></div>`);
    for (const m of z.mapped) { const c = cov.find(x => x.zone === m.zone), amt = S.extra[`z${m.zone}Amt`] || 0, it = g.items.find(x => x.item === m.item) || {};
      rows.push(`<div class="it">${sw(it.hex)}<span><b>${esc(m.item)}</b> → ${esc(m.to)}: ${amt <= 0 ? '<span class="warn">switched off</span>' : !c || c.share < 0.004 ? '<span class="warn">this zone is finding almost nothing in your frame. Open Tweak › Colour zones and drag “Zone ' + m.zone + ' pick hue” until it changes.</span>' : `changing about ${Math.max(1, Math.round(c.share * 100))}% of the picture`}</span></div>`); }
    return `<div class="k">On your preview now</div>${rows.join('') || '<p class="small">Only the overall look.</p>'}
      ${z.skipped.length ? `<p class="small dim">Not changed: ${esc(z.skipped.map(x => `${x.item} (${x.why})`).join('; '))}.</p>` : ''}<p class="small dim">Measured from your frame; it updates as you tweak. Drag across the picture to compare.</p>`;
  }
  function wireAI(body) {
    wireSmart(body);
    body.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => { const t = +b.dataset.lay; S.layerOff = S.layerOff.includes(t) ? S.layerOff.filter(x => x !== t) : [...S.layerOff, t]; render(); });
    body.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { S.range = b.dataset.range; settings.set('range', S.range); S.rangeInfo = null; render(); });
    if ($('#reread', body)) $('#reread', body).onclick = () => $('#grab', body).onclick();
    if ($('#aiLocal', body)) $('#aiLocal', body).onclick = () => busy('Looking for an AI on this computer', async () => {
      const cfg = S.smart.cfg, a = host.bridge ? await detectApple(host.bridge) : { ok: false }, o = await detectOllama(cfg.ollamaUrl || SMART0.ollamaUrl, httpGet);
      if (o.ok && o.vision.length) { cfg.provider = 'ollama'; cfg.ollamaModel = o.vision.includes(cfg.ollamaModel) ? cfg.ollamaModel : o.vision[0]; }
      else if (a.ok) cfg.provider = 'apple'; else { toast('No AI was found on this computer. Open Ollama, or wait for Google\'s limit to reset.'); return; }
      saveSmart(); S.ai.error = ''; toast(`Switched to ${provName(cfg.provider)}. Switch back under “AI” any time.`); render(); });
    if ($('#aiSetup', body)) $('#aiSetup', body).onclick = () => { S.guide = { view: 'smart', step: 0, route: '' }; go('guide'); };
    if ($('#aiRetry', body)) $('#aiRetry', body).onclick = () => studyFrame('');
    if ($('#aiStudy', body)) $('#aiStudy', body).onclick = () => studyFrame('');
    if ($('#aiTell', body)) $('#aiTell', body).onclick = () => { const m = $('#smMsg', body).value.trim(); if (!m) return toast('Type something for the AI first'); studyFrame(m); };
    if ($('#aiSuggest', body)) $('#aiSuggest', body).onclick = () => suggestColours(($('#smMsg', body).value || '').trim());
    if ($('#aiUse', body)) $('#aiUse', body).onclick = () => { for (const k of ['genre', 'feeling', 'role']) if (S.study.answers[k].length) S.intent[k] = S.study.answers[k]; saveIntent(); busy('Finding directions', async () => { await suggest(); render(); }); };
    body.querySelectorAll('[data-sg]').forEach(el => el.onclick = () => { const i = +el.dataset.sg; S.suggOpen = S.suggOpen === i ? -1 : i; S.suggHow = -1; render(); });
    body.querySelectorAll('[data-sghow]').forEach(b => b.onclick = () => { const i = +b.dataset.sghow, top = body.scrollTop; S.suggHow = S.suggHow === i ? -1 : i; render(); body.scrollTop = top; });
    body.querySelectorAll('[data-sgcopy]').forEach(b => b.onclick = async () => { const g = S.sugg[+b.dataset.sgcopy]; toast((await copyText(`${g.title}\n\n` + howTo(g, host.name, zonesFor(g, S.study, S.reading ? S.reading.swatches : [], S.frame ? downsample(S.frame, 160) : null)).map(sec => sec.h + '\n' + sec.steps.map((x, k) => `${k + 1}. ${x}`).join('\n')).join('\n\n'))) ? 'Walkthrough copied' : 'Could not copy'); });
    body.querySelectorAll('[data-sgpic]').forEach(b => b.onclick = async () => { const i = +b.dataset.sgpic, g = S.sugg[i]; if (g.pic) { g.pic = ''; S.focusSg = i; return render(); } if (g.picBusy) return;
      g.picBusy = true; g.picErr = ''; S.focusSg = i; render();
      try { g.pic = await picture(await smartCfg(), g, toBase64(encodeJPEG(downsample(S.frame, 768), 86)), httpPost); } catch (e) { g.picErr = e.message || String(e); }
      g.picBusy = false; if (S.tab === 'shot') { S.focusSg = i; softRender(); } });
    body.querySelectorAll('[data-sgprev]').forEach(b => b.onclick = () => busy('Building this suggestion', async () => { const i = +b.dataset.sgprev, g = S.sugg[i], top = body.scrollTop;
      // the Lukuluku look for the overall grade (a clean pass-through when the AI named none), then one colour zone per item
      const di = S.smartDirs.findIndex(d => d.id === g.recipe); if (di >= 0) choose(di); else { S.chosen = -1; S.look = NEUTRAL_LOOK(); S.extra = { ...XDEF }; }
      const z = zonesFor(g, S.study, S.reading ? S.reading.swatches : [], S.frame ? downsample(S.frame, 160) : null); S.extra = { ...S.extra, ...zoneDefaults(), ...z.params, skinGuard: Math.max(S.extra.skinGuard || 0, 0.7) };
      S.recipe = { name: g.title, presetId: null }; S.suggOn = i; S.suggZ = z; S.view = 'split'; S.dockHidden = false; stageCache.key = ''; S.focusSg = i; render();
      toast(z.mapped.length || z.params.ambAmt ? `“${g.title}” is on your preview: drag across the picture to compare` : 'Only the overall look could be previewed for this one; see “What is left to do by hand”'); }));
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
    const shown = S.simple ? [lines[0], ...(cont ? [lines[lines.length - (sub.kind === 'adjustment' ? 2 : 1)]] : [])] : lines;
    return `<div class="card ctx"><div class="k">On the timeline</div>${shown.map(l => `<p class="small">${l}</p>`).join('')}
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
    return `<div class="k sect">${S.smart.cfg.provider === 'off' ? 'Directions' : 'Quick looks'}</div><p class="small dim">${S.smart.cfg.provider === 'off' ? '' : 'Whole-picture looks from Colored Lens\'s own rules, no AI needed. '}Click one to preview it on your frame. Apply it, tweak it, or keep it as a preset.</p>${ask}
      ${allDirs().map((d, i) => S.simple && !S.moreD && i >= Math.max(3, S.smartDirs.length + 2) && S.chosen !== i ? '' : `<div class="dir ${S.simple ? 'simple' : ''} ${S.chosen === i ? 'on' : ''}" data-dir="${i}">
        <img src="${d.thumb}"><div class="dtext">
          <div><b>${esc(d.name)}</b> <span class="badge ${d.kind}">${esc(KIND_LABEL[d.kind])}</span></div>
          <p class="small">${esc(S.simple && d.kind !== 'smart' && d.why.lines[0].includes(': ') ? d.why.lines[0].slice(d.why.lines[0].indexOf(': ') + 2).replace(/^./, c => c.toUpperCase()) : d.why.lines[0])}</p>${S.simple ? (d.cont ? `<p class="small cont">${esc(d.cont)}</p>` : '') : `${d.why.lines[1] ? `<p class="small dim">${esc(d.why.lines[1])}</p>` : ''}
          <p class="small">${esc([...d.effect, ...d.notes].join(' '))}</p>${d.cont ? `<p class="small cont">${esc(d.cont)}</p>` : ''}
          <div class="small dim mono">${esc(lookCode(d.look, false))}</div>`}
          ${S.chosen === i ? `<div class="row wrap"><button class="primary" data-dapply="${i}">Apply to selected clips</button><button data-dtweak="${i}">Tweak</button><button data-dsave="${i}">Save as preset</button>${d.why.hue ? `<button data-more="${esc(d.why.hue.name.split(' / ')[0])}">About ${esc(d.why.hue.name.split(' / ')[0])}</button>` : ''}</div>` : ''}
        </div></div>`).join('')}
      ${S.simple && !S.moreD && allDirs().length > Math.max(3, S.smartDirs.length + 2) ? `<div class="more" id="moreD">Show ${allDirs().length - Math.max(3, S.smartDirs.length + 2)} more directions ›</div>` : ''}`;
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
        ${hasZones(S.extra) ? `<div class="card" id="zonesCard"><div class="k">Colour zones</div><p class="small dim">Each zone grabs one colour in your shot and moves it to a new one. They come from an AI suggestion; adjust them here.</p>
          ${slider('X', 'ambAmt', 'Ambience amount', 0, 1, 0.01)}${(S.extra.ambAmt || 0) > 0 ? slider('X', 'ambHue', 'Ambience hue', 0, 360, 1) : ''}
          ${[1, 2, 3, 4].filter(n => (S.extra[`z${n}Amt`] || 0) > 0 || (S.suggZ && S.suggZ.mapped.some(m => m.zone === n))).map(n => { const m = S.suggZ && S.suggZ.mapped.find(x => x.zone === n);
            return `<div class="q">Zone ${n}${m ? `: ${esc(m.item)} → ${esc(m.to)}` : ''}</div>${slider('X', `z${n}Amt`, 'Amount', 0, 1, 0.01)}${slider('X', `z${n}Hue`, 'Pick hue', 0, 360, 1)}${slider('X', `z${n}Wid`, 'Hue width', 5, 120, 1)}${slider('X', `z${n}ToHue`, 'New hue', 0, 360, 1)}${slider('X', `z${n}ToC`, 'New colourfulness', 0, 0.4, 0.005)}`; }).join('')}</div>` : ''}
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
  /** Pictures for an encyclopedia entry: its own reference frame, plus the context frames that belong to it. */
  function encImages(title) { const t = String(title).split(':')[0].trim().toLowerCase(), F = (refs() && refs().frames) || [];
    return F.filter(f => ['psy', 'pal', 'nar', 'aut'].includes(f.kind) && f.title.toLowerCase() === t).concat(F.filter(f => f.kind === 'ctx' && f.title.toLowerCase().startsWith(t + ':'))).slice(0, 4); }
  const imgStrip = (title, max = 4) => { const im = encImages(title).slice(0, max); return im.length ? `<div class="encimgs">${im.map(f => `<div class="encimg"><img src="${up.frameUrl(f.thumb)}" onerror="this.parentNode.style.display='none'"><div class="small dim">${esc(f.kind === 'ctx' ? f.title.split(':').slice(1).join(':').trim() : f.reading || '')}</div></div>`).join('')}</div>` : ''; };
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
      ${list.slice(0, 60).map(x => `<div class="card"><div class="k">${esc(x.s)}</div><h3>${x.hex ? `<span class="sw" style="background:${x.hex}"></span>` : ''}${esc(x.t)}</h3>${x.pal ? swatchBar(x.pal.map(h => ({ hex: h, share: 1 }))) : ''}${imgStrip(x.t)}<p class="small">${esc(x.body)}</p>${x.ex ? `<ul class="small">${x.ex.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${lookChips(x.looks || [])}</div>`).join('')}`;
    $('#encBack', body).onclick = () => go(S.back || 'shot');
    const q$ = $('#q', body); q$.oninput = () => { S.encQ = q$.value; clearTimeout(renderEnc.t); renderEnc.t = setTimeout(() => { renderEnc(body); const n = $('#q', body); n.focus(); try { n.setSelectionRange(S.encQ.length, S.encQ.length); } catch {} }, 250); };
  }

  // ---------- Smart mode ----------
  const httpPost = host.post || (async (url, headers, body) => { const r = await host.fetch(url, { method: 'POST', headers, body }); return { status: r.status, text: await r.text() }; });
  const httpGet = host.get || (async (url, headers = {}) => { const r = await host.fetch(url, { headers }); return { status: r.status, text: await r.text() }; });
  const secret = host.secret || { get: async k => settings.get('secret.' + k, ''), set: async (k, v) => settings.set('secret.' + k, v) };
  async function smartCfg() { const c = { ...S.smart.cfg }; c.geminiKey = await secret.get('gemini'); c.claudeKey = await secret.get('claude'); c.openaiKey = await secret.get('openai'); return c; }
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
    if (S.smart.hasClaude == null) { S.smart.hasClaude = false; secret.get('claude').then(k => { if (k) { S.smart.hasClaude = true; if (S.tab === 'smart') render(); } }); }
    const field = (id, label, val, ph, type = 'text') => `<label class="fld"><span class="small dim">${label}</span><input id="${id}" type="${type}" value="${esc(val || '')}" placeholder="${esc(ph || '')}"></label>`;
    body.innerHTML = `<div class="row"><button id="smBack">← Back</button><b class="grow">The AI</b><button id="smGuide" class="small">Step-by-step setup</button></div>
      <p class="small">Colored Lens uses an AI to look at the frame, name what is in it, understand the scene and suggest colours item by item. It is free to you. “Automatic” uses the best one this computer has. Nothing is applied to your project until you say so.</p>
      <div class="chips">${PROVIDERS.filter(p => !p.mac || host.bridge).map(p => `<div role="button" tabindex="0" class="chip ${c.provider === p.id ? 'on' : ''}" data-prov="${p.id}">${c.provider === p.id ? '✓ ' : ''}${esc(p.n)}</div>`).join('')}</div>
      <p class="small dim">${esc((PROVIDERS.find(p => p.id === c.provider) || {}).where || '')}</p>
      ${c.provider === 'ollama' || c.provider === 'auto' ? `<div class="card"><div class="k">Ollama</div>${field('olUrl', 'Address', c.ollamaUrl, SMART0.ollamaUrl)}
        ${d.ollama ? (d.ollama.ok ? (d.ollama.vision.length ? `<label class="fld"><span class="small dim">Vision model</span><select id="olModel">${d.ollama.vision.map(m => `<option ${m === c.ollamaModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : `<p class="small warn">Ollama is running, but none of its models can see images. In a terminal: ollama pull gemma3:4b</p>`) : '<p class="small warn">Ollama is not answering at that address. Install it from ollama.com and open it.</p>') : ''}
        <button id="olTest" class="small">Find Ollama and its models</button></div>` : ''}
      ${c.provider === 'openai' ? `<div class="card"><div class="k">Local server</div>${field('oaUrl', 'Address (ends in /v1)', c.openaiUrl, SMART0.openaiUrl)}
        <p class="small dim">Foundry Local: run <span class="mono">foundry service status</span> to see its address. LM Studio: Developer › Start server (usually http://localhost:1234/v1).</p>
        ${d.openai ? (d.openai.ok ? `<label class="fld"><span class="small dim">Model (pick one that can see images)</span><select id="oaModel">${d.openai.models.map(m => `<option ${m === c.openaiModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : '<p class="small warn">Nothing answered at that address.</p>') : field('oaModel', 'Model', c.openaiModel, 'model id')}
        ${field('oaKey', 'Key (only if your server needs one)', '', '••••', 'password')}<button id="oaTest" class="small">Find the server and its models</button></div>` : ''}
      ${c.provider === 'claude' || c.provider === 'auto' ? `<div class="card"><div class="k">Claude</div>${field('clKey', 'Your API key (from console.anthropic.com)', '', S.smart.hasClaude ? 'saved: paste to replace' : 'paste your key', 'password')}
        <label class="fld"><span class="small dim">Model</span><select id="clModel">${CLAUDE_MODELS.map(([id, n]) => `<option value="${id}" ${(c.claudeModel || SMART0.claudeModel) === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <p class="small dim">Your key stays on this computer. Claude API keys are paid by use and are <b>not</b> included in a Claude Pro subscription; add credits in the Claude Console. Anthropic does not train its models on what you send.</p><button id="clSave" class="small">Save key</button></div>` : ''}
      ${c.provider === 'gemini' || c.provider === 'auto' ? `<div class="card"><div class="k">Google Gemini</div>${field('gmKey', 'Your API key (from aistudio.google.com)', '', S.smart.hasGemini ? 'saved: paste to replace' : 'paste your key', 'password')}
        ${field('gmModel', 'Model', c.geminiModel, SMART0.geminiModel)}<p class="small dim">Your key stays on this computer. Check Google's pricing page for which models are free on your account.</p><button id="gmSave" class="small">Save key</button></div>` : ''}
      ${c.provider === 'apple' || (c.provider === 'auto' && host.bridge) ? `<div class="card"><div class="k">Apple Intelligence</div>
        ${d.apple ? (d.apple.ok ? `<p class="small okmsg">Ready on this Mac.${d.apple.image ? '' : ' This version reads Colored Lens\'s measurements of the frame; it cannot look at the picture itself yet.'}</p>` : `<p class="small warn">${esc(appleReason(d.apple.reason))}</p>`) : ''}
        <button id="apTest" class="small">Check Apple Intelligence</button></div>` : ''}
      ${host.os === 'win' ? '<div class="card"><div class="k">Windows built-in AI</div><p class="small">The AI built into Copilot+ PCs will be supported through a small helper in a later update. Until then, Ollama or Microsoft Foundry Local (“Local server”) run on your PC for free.</p></div>' : ''}
      ${c.provider !== 'off' ? `<div role="button" tabindex="0" class="chip ${c.autoAsk ? 'on' : ''}" id="smAuto">${c.autoAsk ? '✓ ' : ''}Study every frame I read</div>` : ''}`;
    $('#smBack', body).onclick = () => go(S.back || 'shot');
    $('#smGuide', body).onclick = () => { S.guide = { view: 'smart', step: 0, route: '' }; S.tab = 'guide'; render(); };
    body.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { c.provider = b.dataset.prov; saveSmart(); S.smart.detect = null; render(); });
    const v = id => ($('#' + id, body) || {}).value;
    const keep = () => { if (v('clModel') != null) c.claudeModel = v('clModel'); if (v('olUrl') != null) c.ollamaUrl = v('olUrl'); if (v('olModel') != null) c.ollamaModel = v('olModel'); if (v('oaUrl') != null) c.openaiUrl = v('oaUrl'); if (v('oaModel') != null) c.openaiModel = v('oaModel'); if (v('gmModel') != null) c.geminiModel = v('gmModel'); saveSmart(); };
    body.querySelectorAll('input, select').forEach(i => i.onchange = keep);
    if ($('#apTest', body)) $('#apTest', body).onclick = () => busy('Checking Apple Intelligence', async () => { S.smart.detect = { ...d, apple: await detectApple(host.bridge) }; render(); });
    if ($('#olTest', body)) $('#olTest', body).onclick = () => busy('Looking for Ollama', async () => { keep(); const r = await detectOllama(c.ollamaUrl, httpGet); S.smart.detect = { ...d, ollama: r };
      if (r.ok && r.vision.length && !r.vision.includes(c.ollamaModel)) { c.ollamaModel = r.vision[0]; saveSmart(); } render(); });
    if ($('#oaTest', body)) $('#oaTest', body).onclick = () => busy('Looking for the server', async () => { keep(); if (v('oaKey')) await secret.set('openai', v('oaKey')); const r = await detectOpenAI(c.openaiUrl, await secret.get('openai'), httpGet);
      S.smart.detect = { ...d, openai: r }; if (r.ok && r.models.length && !r.models.includes(c.openaiModel)) { c.openaiModel = r.models[0]; saveSmart(); } render(); });
    if ($('#clSave', body)) $('#clSave', body).onclick = () => busy('Saving', async () => { keep(); if (v('clKey')) { await secret.set('claude', v('clKey').trim()); S.smart.hasClaude = (await secret.get('claude')) === v('clKey').trim(); toast(S.smart.hasClaude ? 'Claude key saved on this computer' : 'The key could not be saved on this computer'); } render(); });
    if ($('#gmSave', body)) $('#gmSave', body).onclick = () => busy('Saving', async () => { keep(); if (v('gmKey')) { await secret.set('gemini', v('gmKey').trim()); S.smart.hasGemini = (await secret.get('gemini')) === v('gmKey').trim(); toast(S.smart.hasGemini ? 'Gemini key saved on this computer' : 'The key could not be saved on this computer'); } render(); });
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
    if (G.view === 'home') {
      body.innerHTML = `<div class="row"><button id="gClose">← Back</button><b class="grow">Guide</b></div>
        <div class="card"><h3>Take the guided tour</h3><p class="small">Colored Lens walks you through grading one shot, pointing at each part of the panel as you go. About two minutes.</p><button id="gTour" class="primary">Start the tour</button></div>
        <div class="card"><h3>Set up the AI</h3><p class="small">Step by step, for your ${info.os === 'win' ? 'Windows PC' : 'Mac'}. No technical knowledge needed.</p><button id="gSetup">Show me how</button></div>
        ${promptBox('use', 'Want a patient teacher?')}`;
      $('#gClose', body).onclick = () => go(S.back || 'shot');
      $('#gTour', body).onclick = () => startTour();
      $('#gSetup', body).onclick = () => { G.view = 'smart'; G.route = ''; render(); };
    } else { // Smart mode setup: pick a way, then one small step per screen
      const R = routes(info.os), r = R.find(x => x.id === G.route);
      if (!r) {
        body.innerHTML = `<div class="row"><button id="gHome">← Guide</button><b class="grow">Set up the AI</b></div>
          <div class="card"><p class="small"><b>What is this?</b> Colored Lens uses an AI that looks at your frame, names what is in it and suggests colours in plain words. To do that it needs an AI to talk to. There are ${R.filter(x => x.steps.length).length} free ways to give it one. Pick one; you can change it later, and Colored Lens works fine without any of them.</p></div>
          ${R.map(x => `<div class="card route ${x.steps.length ? '' : 'soon'} ${x.best ? 'best' : ''}" data-route="${x.id}">${x.best ? '<div class="badge smart">Easiest on a Mac</div>' : ''}<h3>${esc(x.n)}</h3><div class="small tag">${esc(x.tag)}</div><p class="small">${esc(x.who)}</p>${x.steps.length ? `<button data-route="${x.id}" class="${x.best ? 'primary' : ''}">Choose this · ${x.steps.length} small steps</button>` : ''}</div>`).join('')}
          ${promptBox('smart', 'Not sure which to choose? Ask any AI assistant')}`;
      } else {
        const n = r.steps.length, i = Math.min(G.step || 0, n - 1), st = r.steps[i], last = i === n - 1;
        const checkLabel = { apple: 'Check Apple Intelligence and switch the AI on', ollama: 'Find Ollama and switch the AI on', gemini: 'Test my key and switch the AI on', claude: 'Test my key and switch the AI on', settings: 'Open Smart settings' }[st.check];
        body.innerHTML = `<div class="row"><button id="gOther">← All ways</button><b class="grow">${esc(r.n)}</b></div>
          <div class="card wiz"><div class="k">Step ${i + 1} of ${n}</div>
            <div class="dots">${r.steps.map((_, j) => `<span class="dot ${j < i ? 'done' : j === i ? 'now' : ''}"></span>`).join('')}</div>
            <h3>${esc(st.t)}</h3><p>${esc(st.b)}</p>
            ${st.url ? `<button data-url="${esc(st.url)}" class="primary">${esc(st.label)}</button>` : ''}
            ${st.copy ? `<div class="row"><span class="mono code grow">${esc(st.copy)}</span><button data-copy="${esc(st.copy)}" class="primary">Copy</button></div>` : ''}
            ${st.key ? `<div class="row"><input id="gKey" type="password" placeholder="Paste your key here"><button id="gKeySave" class="primary">Save</button></div>` : ''}
            ${st.see ? `<div class="see small"><b>You should see:</b> ${esc(st.see)}</div>` : ''}
            ${st.check ? `<button id="gCheck" class="primary">${checkLabel}</button>` : ''}
            ${G.msg ? `<p class="small ${G.ok ? 'okmsg' : 'warn'}">${G.ok ? '✓ ' : ''}${esc(G.msg)}</p>` : ''}
            ${G.ok ? '<div class="row"><button id="gGo" class="primary">Try it on a shot</button></div>' : ''}
            ${G.help && st.fix ? `<div class="fix small"><b>If that did not happen:</b> ${esc(st.fix)}</div>` : ''}
            <div class="row wrap">${i ? '<button id="gPrev">Back</button>' : ''}${!last ? '<button id="gNextStep">Done, next step</button>' : ''}${st.fix && !G.help ? '<button id="gHelp">That didn’t happen</button>' : ''}</div></div>
          <div class="row"><button id="gOther2">Choose a different way</button></div>
          ${promptBox('smart', 'Still stuck? Let any AI assistant walk you through it')}`;
        const stepTo = j => { G.step = j; G.help = false; G.msg = ''; G.ok = false; render(); };
        if ($('#gPrev', body)) $('#gPrev', body).onclick = () => stepTo(i - 1);
        if ($('#gNextStep', body)) $('#gNextStep', body).onclick = () => stepTo(i + 1);
        if ($('#gHelp', body)) $('#gHelp', body).onclick = () => { G.help = true; render(); };
        $('#gOther2', body).onclick = $('#gOther', body).onclick = () => { G.route = ''; G.step = 0; G.msg = ''; G.ok = false; G.help = false; render(); };
        if ($('#gGo', body)) $('#gGo', body).onclick = () => go('shot');
        if ($('#gKeySave', body)) $('#gKeySave', body).onclick = async () => { const k = $('#gKey', body).value.trim(), which = st.key; if (!k) return toast('Paste your key first'); await secret.set(which, k);
          const ok = (await secret.get(which)) === k; if (which === 'claude') S.smart.hasClaude = ok; else S.smart.hasGemini = ok; toast(ok ? 'Key saved on this computer' : 'The key could not be saved on this computer'); };
        if ($('#gCheck', body)) $('#gCheck', body).onclick = () => { if (st.check === 'settings') { S.smart.cfg.provider = 'openai'; saveSmart(); return go('smart'); }
          busy('Checking', async () => {
            const c = S.smart.cfg; G.ok = false;
            try {
              if (st.check === 'apple') {
                const a = await detectApple(host.bridge); if (!a.ok) throw new Error(appleReason(a.reason));
                c.provider = 'apple'; saveSmart(); G.msg = 'Apple Intelligence is ready. The AI is on, and your frames stay on this Mac.' + (a.image ? '' : ' (In this version it works from Colored Lens\'s measurements and your Mac\'s description of the frame.)'); G.ok = true;
              } else if (st.check === 'ollama') {
                const d = await detectOllama(c.ollamaUrl || SMART0.ollamaUrl, httpGet);
                if (!d.ok) throw new Error('Ollama is not answering yet. Is the llama icon showing? Open Ollama, then press the button again.');
                if (!d.vision.length) throw new Error('Ollama is running, but it has no model that can see pictures yet. Go back one step, wait for the download to say “success”, then try again.');
                c.provider = 'ollama'; c.ollamaModel = d.vision.includes(c.ollamaModel) ? c.ollamaModel : d.vision[0]; saveSmart();
                G.msg = `Found Ollama with ${c.ollamaModel}. The AI is on, and your frames stay on this computer.`; G.ok = true;
              } else {
                const which = st.check === 'claude' ? 'claude' : 'gemini';
                if (!(await secret.get(which))) throw new Error('There is no key saved yet. Go back one step and paste your key.');
                c.provider = which; saveSmart(); await testSmart(); G.msg = 'Your key works. The AI is on.'; G.ok = true;
              }
            } catch (e) { G.msg = e.message || String(e); G.help = true; if (st.check === 'gemini' || st.check === 'claude') { c.provider = 'off'; saveSmart(); } }
            render();
          }); };
      }
      if ($('#gHome', body)) $('#gHome', body).onclick = () => { G.view = 'home'; G.msg = ''; render(); };
      body.querySelectorAll('button[data-route]').forEach(b => b.onclick = () => { G.route = b.dataset.route; G.step = 0; G.msg = ''; G.ok = false; G.help = false; render(); });
    }
    body.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => toast((await copyText(b.dataset.copy)) ? 'Copied' : 'Select the text and copy it by hand'));
    body.querySelectorAll('[data-copyprompt]').forEach(b => b.onclick = async () => { const t = body.querySelector(`textarea[data-prompt="${b.dataset.copyprompt}"]`);
      if (await copyText(t.value)) toast('Prompt copied: paste it into your AI assistant'); else { t.focus(); t.select && t.select(); toast('Press Cmd/Ctrl + C to copy the selected text'); } });
  }

  /** Called by the host when the separate Preview panel shows: the preview moves there. */
  function attachPreview(el) { pvEl = el; S.detached = true; render(); }
  if (!settings.get('guideSeen', 0)) S.tour = { i: 0, dir: 1 };
  render();
  return { state: S, updater: up, render, attachPreview };
}

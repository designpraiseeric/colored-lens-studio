// Colored Lens panel: one app for Premiere Pro (UXP), DaVinci Resolve Studio (Workflow Integration) and the web.
// Everything host-specific goes through `host` (see hosts/README.md). Plain DOM + flexbox so it runs inside UXP.
import { readFrame } from '../core/analysis.js';
import { checkSkin, vectorscope } from '../core/skin.js';
import { downsample, pngDataUrl } from '../core/image.js';
import { shotRecord, encodeShot, decodeShot, renderStrip, readSequence, scriptCSV } from '../core/script.js';
import { parseLookInput, formatCode, fullGrade, makePixelFn, bakeCube, lookToEngineParams, shareLink, computeMatch, matchStats, hasCurves, GRADE0 } from '../core/look.js';
import { Updater } from '../core/updates.js';
import { encodePNG } from '../core/image.js';
import config from '../studio.config.json';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = s => String(s ?? '').replace(/<[^>]+>/g, '');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const pct = v => Math.round(v * 100) + '%';

export async function startApp(host, root) {
  const S = { tab: 'read', frame: null, meta: null, reading: null, skin: null, sample: null, shots: [], refFrameStats: null, refName: '',
    look: { L: 'L1', O: 'O1', H: 'H0', K: 'K0', D: 'D0', C: 'C1', M: 'M2', A: '2.39', G: fullGrade({}) }, input: 'rec709',
    extra: { skinGuard: 0, skinHue: 0.8, skinDensity: 0.7, skinLight: 0.5, matchAmt: 0, mLg: 1, mLo: 0, mA: 0, mB: 0, mCg: 1 }, matte: false, busy: false };
  const up = new Updater(host, config.pagesBase);
  root.innerHTML = `
    <div class="cl">
      <div id="banner" class="banner" hidden></div>
      <div class="head"><div class="brand">Colored Lens <span class="dim">· ${esc(host.label || host.name)}</span></div><div id="status" class="dim small"></div></div>
      <div class="tabs">${['read:Read', 'skin:Skin', 'script:Script', 'look:Look', 'library:Library'].map(t => { const [id, n] = t.split(':'); return `<button data-tab="${id}" class="tab">${n}</button>`; }).join('')}</div>
      <div id="body" class="body"></div>
      <div id="toast" class="toast" hidden></div>
    </div>`;
  const toast = (t, ms = 2200) => { const e = $('#toast', root); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms); };
  const busy = async (label, fn) => { if (S.busy) return; S.busy = true; status(label + '…'); try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), 5000); } finally { S.busy = false; status(); } };
  const status = t => { const c = up.content && up.content.manifest; $('#status', root).textContent = t || `v${host.version}${c ? ' · content ' + c.contentVersion.slice(0, 7) : ''}`; };
  root.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; render(); } });

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
    $('#doUpdate', root).onclick = () => busy('Downloading update', async () => { await up.install(info, p => status(`Downloading update ${pct(p)}`)); b.innerHTML = '<b>The installer is open.</b> Follow it, then restart ' + esc(host.label || host.name) + '.'; });
    $('#seeUpdate', root).onclick = () => host.openUrl(info.page);
    $('#hideUpdate', root).onclick = () => (b.hidden = true);
  });

  const enc = () => up.content.encyclopedia, cat = () => up.content.looks.catalog, refs = () => up.content.refs;
  const lutsFor = async look => ({ C0: await up.lut('C0'), [look.C]: await up.lut(look.C) });

  async function grab() {
    const g = await host.grabFrame(); S.frame = g.frame; S.meta = g; S.reading = null; S.skin = null; S.sample = null; return g;
  }
  const preview = (f, max = 420) => pngDataUrl(downsample(f, max));
  const swatchBar = sw => `<div class="swbar">${sw.map(s => `<div style="flex:${Math.max(0.02, s.share ?? s[1])};background:${s.hex || s[0]}" title="${s.hex || s[0]}"></div>`).join('')}</div>`;
  const lookChips = ids => ids.length ? `<div class="chips">${ids.map(id => `<button class="chip" data-look="${id}" title="${esc(lookName(id))}">${id} ${esc(shortName(id))}</button>`).join('')}</div>` : '';
  const axisTable = id => ({ L: cat().lighting, O: cat().optics, H: cat().atmosphere, K: cat().lens, D: cat().diffusion, C: cat().color, M: cat().medium })[id[0]];
  const lookName = id => { const t = axisTable(id); return t && t[id] ? t[id].name : id; };
  const shortName = id => { const t = axisTable(id); return t && t[id] ? t[id].short : ''; };
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-look]'); if (!c) return; const id = c.dataset.look;
    if ('KDCM'.includes(id[0])) { S.look[id[0]] = id; S.tab = 'look'; render(); toast(`${id} ${shortName(id)} set in Look`); }
    else { S.tab = 'look'; render(); toast(`${id} ${lookName(id)} is an in-camera choice (lighting / lens / atmosphere): see it in Lukuluku`); }
  });
  root.addEventListener('click', e => { const a = e.target.closest('[data-url]'); if (a) { e.preventDefault(); host.openUrl(a.dataset.url); } });

  // ---------- tabs ----------
  function render() {
    root.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    const body = $('#body', root);
    if (!up.content.encyclopedia) return;
    ({ read: renderRead, skin: renderSkin, script: renderScript, look: renderLook, library: renderLibrary })[S.tab](body);
  }

  // READ ------------------------------------------------------------------
  function renderRead(body) {
    const r = S.reading;
    body.innerHTML = `
      <div class="row"><button id="grab" class="primary">${esc(host.grabLabel || 'Read the frame under the playhead')}</button></div>
      ${S.frame ? `<img class="frame" src="${preview(S.frame)}"><div class="dim small">${esc(S.meta.clipName || '')} ${esc(S.meta.timecode || '')}</div>` : '<p class="dim">Park the playhead on a shot and read it. Colored Lens describes the frame in the encyclopedia\'s terms and finds the closest references.</p>'}
      <div id="reading"></div>`;
    $('#grab', body).onclick = () => busy('Reading frame', async () => { await grab(); S.reading = readFrame(S.frame, enc(), refs()); render(); });
    if (!r) return;
    const e = enc(), hue = r.hues.find(h => h.entry && !['grey', 'black', 'white', 'bw'].includes(h.id)) || r.hues[0];
    $('#reading', body).innerHTML = `
      ${swatchBar(r.swatches)}
      <div class="facts small">${esc(cap(r.stats.key))} · ${esc(r.stats.saturation)} · ${esc(r.stats.warmth)} · blacks ${esc(r.stats.blacks)} · contrast ${r.stats.contrast.toFixed(2)}</div>
      <div class="card"><div class="k">Dominant colour</div>
        ${r.hues.slice(0, 4).map(h => `<span class="pill" style="border-color:${h.entry ? h.entry.hex : '#666'}">${esc(h.entry ? h.entry.name : cap(h.id))} ${pct(h.share)}</span>`).join(' ')}
        ${hue && hue.entry ? `<h3>${esc(hue.entry.name)}: ${esc(hue.entry.tag)}</h3><p>${esc(hue.entry.p[0])}</p><p class="small"><b>Bright side:</b> ${esc(hue.entry.pos)}<br><b>Dark side:</b> ${esc(hue.entry.neg)}<br><b>How it gets on screen:</b> ${esc(hue.entry.craft)}</p>` : ''}</div>
      <div class="card"><div class="k">Palette structure</div><h3>${esc(r.pal.entry ? r.pal.entry.n : r.pal.id)}</h3>
        ${r.pal.entry ? swatchBar(r.pal.entry.pal.map(h => ({ hex: h, share: 1 }))) : ''}<p class="small">${r.pal.why.map(esc).join(' ')}</p>
        ${r.pal.reading ? `<p>${esc(r.pal.reading)}</p>` : ''}${r.pal.entry ? lookChips(r.pal.entry.looks) : ''}</div>
      <div class="card"><div class="k">Itten's contrasts at work</div>${r.itten.slice(0, 4).map(c => { const it = e.ITTEN.find(x => x.n === c.n);
        return `<div class="bar"><span>${esc(c.n)}</span><div class="track"><div style="width:${pct(c.score)}"></div></div></div>${c.score > 0.45 && it ? `<p class="small dim">${esc(it.t)}</p>` : ''}`; }).join('')}</div>
      ${r.narrative.length ? `<div class="card"><div class="k">Narrative devices this frame could serve</div>${r.narrative.map(n => `<p><b>${esc(n.n)}.</b> ${esc(n.why)}</p>`).join('')}</div>` : ''}
      <div class="card"><div class="k">Closest references in the encyclopedia</div><div class="refs">${r.matches.map((m, i) => `
        <div class="ref"><img src="${up.frameUrl(m.thumb)}" onerror="this.style.display='none'"><div><b>${esc(m.title)}</b> <span class="dim small">${esc(m.section)}</span>
        <p class="small">${esc(m.reading)}</p>${lookChips(m.looks.slice(0, 4))}
        <div class="row">${m.link ? `<button data-url="${esc(m.link)}">Real stills (FILMGRAB)</button>` : ''}<button data-matchref="${i}">Match my shot to this</button></div></div></div>`).join('')}</div></div>
      ${r.auteurs.length ? `<div class="card"><div class="k">Signatures it resembles</div>${r.auteurs.map(a => `<p><b>${esc(a.n)}</b> <span class="dim small">${esc(a.w || '')}</span><br>${esc(a.t)}</p>${lookChips(String(a.l || '').split(/\s*·\s*/).filter(Boolean))}`).join('')}</div>` : ''}
      ${r.looks.length ? `<div class="card"><div class="k">Lukuluku looks to try</div>${lookChips(r.looks)}</div>` : ''}`;
    body.querySelectorAll('[data-matchref]').forEach(b => b.onclick = () => {
      const m = r.matches[+b.dataset.matchref], ref = refs().frames.find(f => f.id === m.id);
      S.extra = { ...S.extra, ...computeMatch(matchStats(S.frame), ref.ms) }; S.refName = m.title; S.tab = 'look'; render(); toast(`Match to “${m.title}” set in Look`);
    });
  }

  // SKIN ------------------------------------------------------------------
  function renderSkin(body) {
    const k = S.skin;
    body.innerHTML = `
      <div class="row"><button id="grab" class="primary">Check skin in this frame</button>${S.sample ? '<button id="unsample">Use automatic detection</button>' : ''}</div>
      ${S.frame ? `<div class="dim small">Click a face in the picture to sample its skin directly.</div><img id="skinimg" class="frame click" src="${k && k.mask ? pngDataUrl(k.mask) : preview(S.frame)}">` : '<p class="dim">Skin, Exposure & Equity (§7), as a working check: exposure on the face, density, hue against the skin line, crushed or clipped skin, and two complexions in one frame.</p>'}
      <div id="sk"></div>`;
    $('#grab', body).onclick = () => busy('Checking skin', async () => { if (!S.frame || !S.skin) await grab(); S.skin = checkSkin(S.frame, { sample: S.sample }); render(); });
    if ($('#unsample', body)) $('#unsample', body).onclick = () => { S.sample = null; S.skin = checkSkin(S.frame); render(); };
    if ($('#skinimg', body)) $('#skinimg', body).onclick = e => { const r = e.target.getBoundingClientRect(); S.sample = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; S.skin = checkSkin(S.frame, { sample: S.sample }); render(); };
    if (!k) return;
    const icon = l => ({ good: '●', warn: '▲', info: '◆' })[l];
    $('#sk', body).innerHTML = `
      ${k.L != null ? `<div class="facts small">Skin ${k.mode} · ${pct(k.coverage)} of frame · about ${k.ire} IRE · density ${(k.C * 100).toFixed(1)} · hue ${Math.round(k.H)}° <span class="sw" style="background:${k.swatch}"></span></div>` : ''}
      ${k.findings.map(f => `<div class="finding ${f.level}"><b>${icon(f.level)} ${esc(f.title)}</b><p class="small">${esc(f.text)}</p></div>`).join('')}
      ${k.fixes.length ? `<div class="card"><div class="k">Fixes</div>${k.fixes.map((f, i) => `<button data-fix="${i}">${esc(f.label)}</button>`).join(' ')}
        <p class="small dim">Fixes go into the Look tab (Skin Guard and exposure), then apply them to clips from there.</p></div>` : ''}
      <div class="row"><img class="scope" src="${pngDataUrl(vectorscope(S.frame))}"><p class="small dim">Vectorscope. The orange line is the skin-tone line: healthy skin of every complexion sits along it; how far out it reaches is saturation, not complexion.</p></div>
      <div class="card prose small"><div class="k">Why this matters (§7)</div>${enc().SKIN_HTML}</div>`;
    body.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
      const f = k.fixes[+b.dataset.fix];
      for (const [key, v] of Object.entries(f.params)) { if (key in S.extra) S.extra[key] = v; else S.look.G[key] = v; }
      S.tab = 'look'; render(); toast('Fix set in Look: apply it to your clips from there');
    });
  }

  // SCRIPT ----------------------------------------------------------------
  function renderScript(body) {
    const sh = S.shots;
    body.innerHTML = `
      <div class="row"><input id="tags" placeholder="Tags for this shot: character, place, act…"><button id="add" class="primary">Add this shot</button></div>
      <div class="row"><button id="load">Load tagged shots from markers</button><button id="scan">Scan the sequence</button><input id="every" type="number" min="1" value="5" style="width:50px"><span class="small dim">s apart</span></div>
      ${sh.length ? `<img class="strip" src="${pngDataUrl(renderStrip(sh))}"><div class="row"><button id="png">Save strip (PNG)</button><button id="csv">Save as CSV</button><button id="clear">Clear</button></div>
        <div class="card"><div class="k">What the sequence says</div>${readSequence(sh, enc()).map(o => `<p><b>${esc(o.n)}.</b> ${esc(o.why)}</p>${o.entry ? `<p class="small dim">${esc(o.entry.t)}</p>` : ''}`).join('')}</div>
        <div class="shots">${sh.map((s, i) => `<div class="shot"><span class="tc">${esc(s.tc)}</span>${swatchBar(s.sw)}<span class="small">${esc(cap(s.hue))} · ${esc((enc().PALS.find(p => p.id === s.pal) || {}).n || '')}${s.tags.length ? ' · ' + esc(s.tags.join(', ')) : ''}</span><button data-del="${i}">✕</button></div>`).join('')}</div>`
        : '<p class="dim">Build a color script as you edit: tag shots (they are saved as markers in your sequence, so they travel with the project), or scan the whole sequence, then read colour across the film.</p>'}`;
    const addShot = async (g, tags) => { const rd = readFrame(g.frame, enc(), null); const rec = shotRecord(rd, { seconds: g.seconds, timecode: g.timecode, name: g.clipName, tags });
      S.shots.push(rec); S.shots.sort((a, b) => a.t - b.t); return rec; };
    $('#add', body).onclick = () => busy('Adding shot', async () => {
      const g = await grab(), tags = $('#tags', body).value.split(',').map(t => t.trim()).filter(Boolean), rec = await addShot(g, tags);
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

  // LOOK ------------------------------------------------------------------
  function renderLook(body) {
    const C = cat(), L = S.look, G = L.G, X = S.extra;
    const byNum = o => Object.keys(o).sort((a, b) => +a.replace(/\D/g, '') - +b.replace(/\D/g, ''));
    const sel = (k, table) => `<label>${esc({ K: 'Lens character', D: 'Diffusion', C: 'Colour science', M: 'Film / video medium' }[k])}<select data-axis="${k}">${byNum(table).map(id => `<option value="${id}" ${L[k] === id ? 'selected' : ''}>${id} ${esc(table[id].short || table[id].name)}</option>`).join('')}</select></label>`;
    const slider = (obj, key, label, min, max, step) => `<label class="sl"><span class="lb">${esc(label)}</span><input type="range" data-obj="${obj}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${(obj === 'G' ? G : X)[key]}"><span>${(+(obj === 'G' ? G : X)[key]).toFixed(2)}</span></label>`;
    body.innerHTML = `
      <div class="row"><input id="code" placeholder="Paste a Lukuluku look code or share link" value="${esc(formatCode(L))}"><button id="parse">Use</button></div>
      <div class="cols">${sel('K', C.lens)}${sel('D', C.diffusion)}${sel('C', C.color)}${sel('M', C.medium)}
        <label>Footage is<select id="input"><option value="rec709" ${S.input === 'rec709' ? 'selected' : ''}>Normal video (Rec.709)</option><option value="logc3" ${S.input === 'logc3' ? 'selected' : ''}>Log (ARRI LogC3)</option></select></label>
        <label>Aspect matte<select id="matte"><option value="">None</option>${Object.keys(C.aspect).sort((a, b) => a - b).map(a => `<option value="${a}" ${S.matte && L.A === a ? 'selected' : ''}>${esc(C.aspect[a].name)}</option>`).join('')}</select></label></div>
      <p class="small dim">${esc((C.color[L.C] || {}).recipe || '')} ${esc((C.medium[L.M] || {}).recipe || '')}</p>
      <div id="prev" class="pair"></div>
      <div class="card"><div class="k">Strength</div>${slider('G', 'lutMix', 'Colour look', 0, 1, 0.01)}${slider('G', 'grainK', 'Grain', 0, 2, 0.01)}${slider('G', 'halK', 'Halation', 0, 2, 0.01)}${slider('G', 'diffK', 'Diffusion glow', 0, 2, 0.01)}${slider('G', 'vigK', 'Vignette', 0, 2, 0.01)}</div>
      <div class="card"><div class="k">Grade</div>${slider('G', 'exp', 'Exposure', -3, 3, 0.05)}${slider('G', 'con', 'Contrast', 0.5, 1.6, 0.01)}${slider('G', 'sat', 'Saturation', 0, 2, 0.01)}${slider('G', 'temp', 'Temperature', -1, 1, 0.01)}${slider('G', 'tint', 'Tint', -1, 1, 0.01)}${slider('G', 'hi', 'Highlights', -1, 1, 0.01)}${slider('G', 'sh', 'Shadows', -1, 1, 0.01)}</div>
      <div class="card"><div class="k">Skin Guard <span class="dim small">new</span></div><p class="small dim">The look may add to skin, but cannot take away its hue, density or light beyond what you allow (§7: “key the skin and limit how much the look affects it”).</p>
        ${slider('X', 'skinGuard', 'Skin Guard', 0, 1, 0.01)}${slider('X', 'skinHue', 'Protect hue', 0, 1, 0.01)}${slider('X', 'skinDensity', 'Protect density', 0, 1, 0.01)}${slider('X', 'skinLight', 'Protect light', 0, 1, 0.01)}</div>
      <div class="card"><div class="k">Match to Reference <span class="dim small">new</span></div>${X.matchAmt > 0 ? `<p class="small">Matching ${esc(S.refName || 'a reference')}.</p>${slider('X', 'matchAmt', 'Match amount', 0, 1, 0.01)}` : '<p class="small dim">Pick “Match my shot to this” on a reference in Read, or set a frame from your own timeline as the reference.</p>'}
        <div class="row"><button id="setref">Use the current frame as reference</button><button id="matchref" ${S.refFrameStats ? '' : 'disabled'}>Match this frame to it</button>${X.matchAmt > 0 ? '<button id="nomatch">Clear match</button>' : ''}</div></div>
      ${hasCurves(G) ? '<p class="warn small">This look has curves from Lukuluku. The effect applies everything except curves; the .cube LUT includes them.</p>' : ''}
      <div class="row wrap"><button id="apply" class="primary">Apply to selected clips</button><button id="cube">Export .cube</button><button id="open">Open in Lukuluku</button></div>
      <p class="small dim">${esc(host.applyNote || '')}</p>`;
    const sync = () => { $('#code', body).value = formatCode(S.look); };
    body.querySelectorAll('[data-axis]').forEach(s => s.onchange = () => { S.look[s.dataset.axis] = s.value; sync(); drawPreview(); });
    $('#input', body).onchange = e => { S.input = e.target.value; drawPreview(); };
    $('#matte', body).onchange = e => { S.matte = !!e.target.value; if (e.target.value) S.look.A = e.target.value; sync(); };
    body.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { const o = r.dataset.obj === 'G' ? S.look.G : S.extra; o[r.dataset.key] = +r.value; r.nextElementSibling.textContent = (+r.value).toFixed(2); drawPreview(); });
    $('#parse', body).onclick = () => { try { const l = parseLookInput($('#code', body).value, C); S.look = l; toast('Look loaded: ' + formatCode(l)); render(); } catch (e) { toast(e.message, 4000); } };
    $('#setref', body).onclick = () => busy('Grabbing reference', async () => { const g = await host.grabFrame(); S.refFrameStats = matchStats(g.frame); S.refName = `${g.clipName || 'frame'} ${g.timecode || ''}`; toast('Reference set: now park on the shot to match'); render(); });
    $('#matchref', body).onclick = () => busy('Matching', async () => { await grab(); S.extra = { ...S.extra, ...computeMatch(matchStats(S.frame), S.refFrameStats) }; render(); });
    if ($('#nomatch', body)) $('#nomatch', body).onclick = () => { S.extra.matchAmt = 0; render(); };
    $('#apply', body).onclick = () => busy('Applying', async () => {
      const params = lookToEngineParams(S.look, C, { matte: S.matte, params: { ...S.extra, input: S.input === 'logc3' ? 1 : 0 } });
      const res = await host.applyLook({ params, look: S.look, makeCube: async () => bakeCube(S.look, C, await lutsFor(S.look), { input: S.input, keepExposure: true, extra: S.extra }) });
      toast(res.message, 6000); });
    $('#cube', body).onclick = () => busy('Baking LUT', async () => {
      const cube = bakeCube(S.look, C, await lutsFor(S.look), { input: S.input, extra: S.extra }); const p = await host.saveFile(cube.name + '.cube', cube.text, { title: 'Save the LUT' }); if (p) toast('Saved ' + p); });
    $('#open', body).onclick = () => host.openUrl(shareLink(S.look, up.content.looks.app));
    drawPreview();
  }
  let previewT = 0;
  function drawPreview() {
    clearTimeout(previewT); previewT = setTimeout(async () => {
      const el = $('#prev', root); if (!el || !S.frame) { if (el) el.innerHTML = '<p class="dim small">Read a frame to preview the look on your own shot (colour only; grain, glow and halation show in the effect).</p>'; return; }
      const small = downsample(S.frame, 300), fn = makePixelFn(S.look, cat(), await lutsFor(S.look), { input: S.input, keepExposure: true, extra: S.extra }), out = { w: small.w, h: small.h, data: new Uint8ClampedArray(small.data.length) };
      for (let i = 0; i < small.w * small.h; i++) { const o = fn([small.data[i * 4] / 255, small.data[i * 4 + 1] / 255, small.data[i * 4 + 2] / 255]); out.data[i * 4] = o[0] * 255; out.data[i * 4 + 1] = o[1] * 255; out.data[i * 4 + 2] = o[2] * 255; out.data[i * 4 + 3] = 255; }
      el.innerHTML = `<div><img src="${pngDataUrl(small)}"><div class="small dim">Before</div></div><div><img src="${pngDataUrl(out)}"><div class="small dim">${esc(formatCode(S.look))}</div></div>`;
    }, 120);
  }

  // LIBRARY ---------------------------------------------------------------
  function libraryEntries() {
    const e = enc(), out = [];
    e.HUES.forEach(h => out.push({ s: 'Colour psychology', t: h.name + ': ' + h.tag, body: h.p.join(' ') + ' Bright side: ' + h.pos + ' Dark side: ' + h.neg + ' Craft: ' + h.craft, looks: h.looks, ex: h.ex.map(x => `${x[0]} (${x[1]}, ${x[2]}): ${x[3]}`), hex: h.hex }));
    e.DIMS.forEach(d => out.push({ s: 'Dimensions', t: d.n, body: d.t, hex: d.c }));
    e.ITTEN.forEach(d => out.push({ s: "Itten's contrasts", t: d.n, body: d.t, hex: d.c }));
    e.PALS.forEach(p => out.push({ s: 'Palette structures', t: p.n, body: p.t + ' ' + (e.PALI[p.id] || '') + ' Examples: ' + p.ex, looks: p.looks, pal: p.pal }));
    e.NARR.forEach(n => out.push({ s: 'Narrative devices', t: n.n, body: n.t + ' ' + (e.NARRI[n.n] || '') + ' ' + n.ex, hex: n.c }));
    e.AUTS.forEach(a => out.push({ s: 'Auteurs & cinematographers', t: a.n, body: (a.w || '') + '. ' + a.t + ' ' + (e.AUTI[a.n] || '') + ' Films: ' + a.f, looks: String(a.l || '').split(/\s*·\s*/).filter(Boolean), pal: a.pal }));
    e.TECH.forEach(t => out.push({ s: 'Processes & stocks', t: `${t[1]} (${t[0]})`, body: strip(t[2]), looks: String(t[3] || '').split(/[\s,·]+/).filter(x => /^[LOHKDCM]\d+$/.test(x)) }));
    e.GLOS.forEach(g => out.push({ s: 'Glossary', t: g[0], body: strip(g[1]) }));
    e.BIB.forEach(b => b.items.forEach(i => out.push({ s: 'Bibliography · ' + b.h, t: strip(i[0]), body: strip(i[1]) })));
    out.push({ s: 'Skin, exposure & equity', t: 'Skin, Exposure & Equity', body: strip(e.SKIN_HTML) });
    return out;
  }
  let libQ = '';
  function renderLibrary(body) {
    const all = libraryEntries(), q = libQ.toLowerCase().trim(), list = q ? all.filter(x => (x.t + ' ' + x.body + ' ' + (x.ex || []).join(' ')).toLowerCase().includes(q)) : all;
    body.innerHTML = `<div class="row"><input id="q" placeholder="Search the encyclopedia (red, Deakins, bleach bypass, skin…)" value="${esc(libQ)}"></div>
      <div class="dim small">${list.length} entries · ${esc(enc().title)}${enc().compiled ? ' · compiled ' + esc(enc().compiled) : ''} <a data-url="${esc(config.sources.encyclopedia.app)}" href="#">open the full encyclopedia</a></div>
      ${list.slice(0, 80).map(x => `<div class="card"><div class="k">${esc(x.s)}</div><h3>${x.hex ? `<span class="sw" style="background:${x.hex}"></span>` : ''}${esc(x.t)}</h3>${x.pal ? swatchBar(x.pal.map(h => ({ hex: h, share: 1 }))) : ''}<p class="small">${esc(x.body)}</p>${x.ex ? `<ul class="small">${x.ex.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${lookChips(x.looks || [])}</div>`).join('')}`;
    const q$ = $('#q', body); q$.oninput = () => { libQ = q$.value; clearTimeout(renderLibrary.t); renderLibrary.t = setTimeout(() => { renderLibrary(body); const n = $('#q', body); n.focus(); try { n.setSelectionRange(libQ.length, libQ.length); } catch {} }, 250); };
  }

  render();
  return { state: S, updater: up, render };
}

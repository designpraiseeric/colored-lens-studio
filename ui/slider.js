// A slider that behaves the same in Premiere (UXP), Resolve (Electron) and browsers.
// UXP draws <input type=range> natively: trackpad scrolling moves it and dragging can snap it to 0. This one is plain
// divs: drag or click the track to set it, scrolling passes through to the panel, double-click resets it, and the
// number box takes typed values. Arrow keys nudge it when it has focus.
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(2));

/**
 * `band` paints the slider's own rail with what it controls — the colour wheel on a hue slider, grey-to-vivid on a
 * colourfulness one — so the editor can see where they are heading instead of guessing from a number.
 */
export function sliderHTML({ id, label, min, max, step, value, def, band, marks, thumbColor }) {
  const pct = ((value - min) / (max - min)) * 100, zero = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : null;
  return `<div class="sl ${band ? 'banded' : ''}"><span class="lb">${label}</span>
    <div class="trk" tabindex="0" data-id="${id}" data-min="${min}" data-max="${max}" data-step="${step}" data-def="${def}" data-val="${value}" title="Drag to set · double-click to reset">
      ${marks && marks.length ? `<div class="marks">${marks.map(m => `<i style="left:${m.at}%;height:${Math.round(3 + m.h * 11)}px;background:${m.c}"></i>`).join('')}</div>` : ''}
      <div class="rail" ${band ? `style="background:${band};height:8px;top:6px"` : ''}></div>${zero != null ? `<div class="zero" style="left:${zero}%"></div>` : ''}${band ? '' : `<div class="fill" style="width:${pct}%"></div>`}<div class="thumb" style="left:${pct}%${thumbColor ? ';background:' + thumbColor : ''}"></div></div>
    <input class="num" data-for="${id}" value="${fmt(value, step)}"></div>`;
}

/** Wires every slider inside `root`. onChange(id, value) is called while dragging and on edits. */
export function wireSliders(root, onChange) {
  root.querySelectorAll('.trk').forEach(trk => {
    const min = +trk.dataset.min, max = +trk.dataset.max, step = +trk.dataset.step, def = +trk.dataset.def, id = trk.dataset.id;
    const num = root.querySelector(`.num[data-for="${id}"]`), fill = trk.querySelector('.fill'), thumb = trk.querySelector('.thumb');
    const set = (v, emit = true) => {
      v = Math.min(max, Math.max(min, Math.round(v / step) * step)); v = +v.toFixed(6);
      trk.dataset.val = v; const pct = ((v - min) / (max - min)) * 100; if (fill) fill.style.width = pct + '%'; thumb.style.left = pct + '%';
      if (num && document.activeElement !== num) num.value = fmt(v, step);
      if (emit) onChange(id, v);
    };
    const fromX = clientX => { const r = trk.getBoundingClientRect(); return min + Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))) * (max - min); };
    let dragging = false;
    const move = e => { if (dragging) { set(fromX(e.clientX)); e.preventDefault && e.preventDefault(); } };
    const up = () => { if (!dragging) return; dragging = false; trk.classList.remove('drag');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    const down = e => { if (e.button != null && e.button !== 0) return; if (dragging) return; dragging = true; trk.classList.add('drag'); set(fromX(e.clientX));
      if (e.type === 'pointerdown') { document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); }
      else { document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); }
      e.preventDefault && e.preventDefault(); };
    // pointer events where the host has them, mouse events otherwise (one of the two fires, never both handled)
    if (typeof window !== 'undefined' && 'PointerEvent' in window) trk.addEventListener('pointerdown', down); else trk.addEventListener('mousedown', down);
    trk.addEventListener('dblclick', () => set(def));
    trk.addEventListener('keydown', e => { const k = e.key, big = e.shiftKey ? 10 : 1;
      if (k === 'ArrowRight' || k === 'ArrowUp') { set(+trk.dataset.val + step * big); e.preventDefault(); }
      if (k === 'ArrowLeft' || k === 'ArrowDown') { set(+trk.dataset.val - step * big); e.preventDefault(); } });
    if (num) {
      const commit = () => { const v = parseFloat(num.value); if (isFinite(v)) set(v); else num.value = fmt(+trk.dataset.val, step); };
      num.addEventListener('change', commit);
      num.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); num.blur && num.blur(); } });
    }
  });
}

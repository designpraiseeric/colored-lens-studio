// Colored Lens — the After Effects side of the CEP panel (ExtendScript, ES3).
// The panel calls these with evalScript and gets a JSON string back. Nothing here runs unless the panel asks.
// saveFrameToPng is undocumented but long-standing and works in every AE the CEP panel supports.

function cl_q(s) { s = String(s); var o = '"'; for (var i = 0; i < s.length; i++) { var c = s.charAt(i), k = s.charCodeAt(i);
  if (c === '"' || c === '\\') o += '\\' + c; else if (k < 32) o += '\\u' + ('000' + k.toString(16)).slice(-4); else o += c; } return o + '"'; }
function cl_json(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v; if (t === 'number') return isFinite(v) ? String(v) : 'null'; if (t === 'boolean') return v ? 'true' : 'false'; if (t === 'string') return cl_q(v);
  if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(cl_json(v[i])); return '[' + a.join(',') + ']'; }
  var p = []; for (var k in v) if (v.hasOwnProperty(k)) p.push(cl_q(k) + ':' + cl_json(v[k])); return '{' + p.join(',') + '}';
}
function cl_ok(v) { return cl_json({ ok: true, v: v }); }
function cl_err(e) { return cl_json({ ok: false, error: String(e && e.message ? e.message : e), line: e && e.line }); }
function cl_comp() { var c = app.project && app.project.activeItem; if (!c || !(c instanceof CompItem)) throw new Error('Open a composition (click in its timeline) first'); return c; }
var CL_MATCH = 'DesignPraise Lukuluku Look';

function cl_lookFx(l) { try { var fx = l.property('ADBE Effect Parade'); for (var i = 1; i <= fx.numProperties; i++) { var p = fx.property(i); if (p.matchName === CL_MATCH || p.name === CL_MATCH) return p; } } catch (e) {} return null; }
function cl_kind(l) {
  if (l.adjustmentLayer) return 'adjustment';
  if (l instanceof TextLayer || l instanceof ShapeLayer || l instanceof CameraLayer || l instanceof LightLayer || l.nullLayer) return 'graphic';
  var s = l.source; if (!s) return 'graphic'; if (s instanceof CompItem) return 'nested';
  try { if (s.mainSource instanceof SolidSource) return 'graphic'; if (s.mainSource && s.mainSource.isStill) return 'graphic'; } catch (e) {}
  return 'video';
}
/** The layers at time t (or all, when t < 0), top first, shaped like the panel's tracks. */
function cl_layers(c, t) {
  var out = [], n = c.numLayers;
  for (var i = 1; i <= n; i++) { var l = c.layer(i); if (!l.enabled) continue; if (t >= 0 && !(t >= l.inPoint && t < l.outPoint)) continue;
    var path = ''; try { if (l.source && l.source.file) path = l.source.file.fsName; } catch (e) {}
    out.push({ track: n - i + 1, index: i, name: l.name, kind: cl_kind(l), path: path, selected: !!l.selected, start: l.inPoint, end: l.outPoint, look: !!cl_lookFx(l), lumetri: false }); }
  return out;
}

function cl_context() {
  try { var c = cl_comp(), wa = null; try { var a = c.workAreaStart, b = a + c.workAreaDuration; if (b > a + 0.2 && (a > 0.05 || b < c.duration - 0.05)) wa = { start: a, end: b }; } catch (e) {}
    return cl_ok({ id: String(c.id), name: c.name, time: c.time, duration: c.duration, fps: c.frameRate, w: c.width, h: c.height, bpc: app.project.bitsPerChannel, inOut: wa, layers: cl_layers(c, c.time), all: cl_layers(c, -1) });
  } catch (e) { return cl_err(e); }
}

/** Saves the comp frame at t to path. clean: switch our own look off for the moment; hide: track numbers to switch off. */
function cl_grab(t, path, clean, hideCsv) {
  var off = [], hidden = [];
  try { var c = cl_comp(); if (t < 0) t = c.time; var n = c.numLayers, hide = ',' + hideCsv + ',';
    for (var i = 1; i <= n; i++) { var l = c.layer(i);
      if (clean) { var fx = cl_lookFx(l); if (fx && fx.enabled) { fx.enabled = false; off.push(fx); } }
      if (hideCsv && hide.indexOf(',' + (n - i + 1) + ',') >= 0 && l.enabled) { l.enabled = false; hidden.push(l); } }
    var f = new File(path); c.saveFrameToPng(t, f);
    return cl_ok({ t: t, fps: c.frameRate, name: c.name, id: String(c.id), off: off.length, hidden: hidden.length, bpc: app.project.bitsPerChannel });
  } catch (e) { return cl_err(e); }
  finally { for (var a = 0; a < off.length; a++) try { off[a].enabled = true; } catch (e2) {} for (var b = 0; b < hidden.length; b++) try { hidden[b].enabled = true; } catch (e3) {} }
}

/** Is the Lukuluku effect installed for AE? */
function cl_canApply() { try { var c = cl_comp(); var L = c.numLayers ? c.layer(1) : null; return cl_ok(L ? L.property('ADBE Effect Parade').canAddProperty(CL_MATCH) : null); } catch (e) { return cl_err(e); } }


/** The effect's settings by name, skipping the group headings: a group may share its name with a setting inside it. */
function cl_controls(fx) { var out = {}; for (var i = 1; i <= fx.numProperties; i++) { var pr = fx.property(i);
  try { if (pr.propertyValueType === PropertyValueType.NO_VALUE) continue; } catch (e) { continue; } if (!out['@' + pr.name]) out['@' + pr.name] = pr; } return out; }
function cl_miss(list, name) { for (var i = 0; i < list.length; i++) if (list[i] === name) return; list.push(name); }

/**
 * Adds or updates the Lukuluku Look. params: [[label, kind, value], ...]. scope 'adjust' = a layer named "Colored Lens"
 * (made the first time, at the top); otherwise the selected layers, else the given track's layer. One undo step.
 */
function cl_apply(params, scope, subjectTrack) {
  var open = false;
  try { var c = cl_comp(), targets = [], where = '', n = c.numLayers;
    if (scope === 'adjust') { app.beginUndoGroup('Colored Lens: apply look'); open = true; var adj = null; for (var i = 1; i <= n; i++) { var l = c.layer(i); if (l.adjustmentLayer && l.name === 'Colored Lens') { adj = l; break; } }
      if (!adj) { adj = c.layers.addSolid([1, 1, 1], 'Colored Lens', c.width, c.height, c.pixelAspect, c.duration); adj.adjustmentLayer = true; try { adj.label = 9; } catch (e) {} where = ' (a new adjustment layer "Colored Lens" at the top of the comp)'; }
      else where = ' (adjustment layer "Colored Lens")'; targets.push(adj);
    } else {
      var sel = c.selectedLayers; for (var s = 0; s < sel.length; s++) if (!sel[s].adjustmentLayer) { try { if (sel[s].property('ADBE Effect Parade').canAddProperty(CL_MATCH)) targets.push(sel[s]); } catch (e) {} }
      if (!targets.length && subjectTrack > 0) { var L2 = c.layer(n - subjectTrack + 1); targets.push(L2); where = ' ("' + L2.name + '", the shot at the current time)'; }
    }
    if (!targets.length) return cl_json({ ok: false, error: 'There is no layer at the current time. Select layers, or move to a shot.' });
    if (!open) { app.beginUndoGroup('Colored Lens: apply look'); open = true; } // only once something will change: no empty undo steps
    var added = 0, updated = 0, missed = [];
    for (var t = 0; t < targets.length; t++) { var L = targets[t], fx = cl_lookFx(L);
      if (fx) updated++; else { fx = L.property('ADBE Effect Parade').addProperty(CL_MATCH); added++; }
      var byName = cl_controls(fx);
      for (var p = 0; p < params.length; p++) { var pr = byName['@' + params[p][0]]; if (!pr) { cl_miss(missed, params[p][0]); continue; }
        var v = params[p][2], k = params[p][1]; v = k === 'B' ? (v ? 1 : 0) : k === 'P' ? Math.round(v) + 1 : Number(v); // AE popups are 1-based
        try { if (k === 'F' && pr.hasMin && v < pr.minValue) v = pr.minValue; if (k === 'F' && pr.hasMax && v > pr.maxValue) v = pr.maxValue; var cur = null; try { cur = pr.value; } catch (e0) {} if (pr.numKeys === 0 && cur === v) continue; // already right: nothing to change
          try { pr.setValue(v); } catch (e1) { if (k !== 'B') throw e1; pr.setValue(!!v); } } catch (e) { var dv = ''; try { dv = '; was ' + pr.value + ', sent ' + v + ', ' + pr.matchName; } catch (e2) {}
          cl_miss(missed, params[p][0] + ' (' + String(e && e.message ? e.message : e).replace(/^.*?:\s*/, '').slice(0, 120) + dv + ')'); } } }
    return cl_ok({ added: added, updated: updated, missing: missed.length, missed: missed, where: where });
  } catch (e) { return cl_err(e); } finally { if (open) app.endUndoGroup(); }
}

function cl_addMarker(t, name, note) { app.beginUndoGroup('Colored Lens shot'); try { var c = cl_comp(), m = new MarkerValue(name); m.comment = note; c.markerProperty.setValueAtTime(t, m); return cl_ok(true); } catch (e) { return cl_err(e); } finally { app.endUndoGroup(); } }
function cl_markers() { try { var c = cl_comp(), mp = c.markerProperty, out = []; for (var i = 1; i <= mp.numKeys; i++) { var v = mp.keyValue(i); out.push({ seconds: mp.keyTime(i), name: v.comment ? String(v.comment).split('\n')[0] : '', note: v.comment || '' }); } return cl_ok(out); } catch (e) { return cl_err(e); } }
function cl_selection() { try { return cl_ok(cl_comp().selectedLayers.length); } catch (e) { return cl_ok(0); } }

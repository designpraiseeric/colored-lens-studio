// Runs the After Effects side of the CEP panel (hosts/cep/cl.jsx, ExtendScript ES3) in Node against a small mock of
// AE's object model. ES3 is plain JavaScript, so the file runs as shipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { kParams } from '../engine/src/generated/params.generated.js';

const SRC = fs.readFileSync(new URL('../hosts/cep/cl.jsx', import.meta.url), 'utf8');
const NO_VALUE = 'NO_VALUE', ONE_D = 'OneD';

/** A Lukuluku Look built the way the plug-in lays it out: a group heading before each group's settings. */
function makeEffect() {
  const props = [], set = {};
  let group = null;
  for (const p of Object.values(kParams)) {
    if (p.group !== group) { group = p.group; props.push({ name: group, propertyValueType: NO_VALUE, setValue() { throw new Error('Can not set the value of a group'); } }); }
    props.push({ name: p.label, propertyValueType: ONE_D, numKeys: 0, value: p.def, hasMin: true, hasMax: true, minValue: p.min, maxValue: p.max, setValue(v) { set[p.label] = v; } });
  }
  return { set, fx: { matchName: 'DesignPraise Lukuluku Look', name: 'Lukuluku Look', numProperties: props.length,
    property: k => typeof k === 'number' ? props[k - 1] : props.find(x => x.name === k) } };
}

function makeAE() {
  const undo = [];
  const parade = { effects: [], numProperties: 0, canAddProperty: () => true,
    property(i) { return this.effects[i - 1]; },
    addProperty() { const e = makeEffect(); this.effects.push(e.fx); this.numProperties++; layer.lastSet = e.set; return e.fx; } };
  const layer = { name: 'shot.mov', enabled: true, adjustmentLayer: false, inPoint: 0, outPoint: 10, property: m => m === 'ADBE Effect Parade' ? parade : null };
  class CompItem {}
  const comp = Object.assign(new CompItem(), { numLayers: 1, layer: () => layer, selectedLayers: [], width: 1920, height: 1080, pixelAspect: 1, duration: 10 });
  const ctx = { CompItem, PropertyValueType: { NO_VALUE }, undo,
    app: { project: { activeItem: comp }, beginUndoGroup: n => undo.push('begin ' + n), endUndoGroup: () => undo.push('end') } };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, layer, parade, comp };
}

const list = ids => ids.map(id => { const p = Object.values(kParams).find(x => x.id === id); return [p.label, p.kind, p.kind === 'B' ? 1 - p.def : p.def === p.max ? p.min : p.max]; });

test('cl_apply sets a setting whose name is also its group heading (Skin Guard, Lift the face)', () => {
  const { ctx, layer } = makeAE();
  const r = JSON.parse(ctx.cl_apply(list(['skinGuard', 'skinLift', 'lens']), 'clip', 1));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.v.added, 1);
  assert.deepEqual(r.v.missed, []);
  assert.ok('Skin Guard' in layer.lastSet && 'Lift the face' in layer.lastSet, 'both collided settings were written');
});

test('cl_apply names a setting the effect does not have, and clamps to the slider range', () => {
  const { ctx, layer } = makeAE();
  const sat = Object.values(kParams).find(p => p.kind === 'F' && p.def !== p.max);
  const r = JSON.parse(ctx.cl_apply([['A setting from the future', 'F', 1], [sat.label, 'F', sat.max + 50]], 'clip', 1));
  assert.deepEqual(r.v.missed, ['A setting from the future']);
  assert.equal(layer.lastSet[sat.label], sat.max);
});

test('cl_apply leaves no undo step when there is nothing to apply to', () => {
  const { ctx } = makeAE();
  const r = JSON.parse(ctx.cl_apply(list(['lens']), 'clip', 0));
  assert.equal(r.ok, false);
  assert.deepEqual([...ctx.undo], []);
});

test('cl_apply skips a setting that already has the value, and retries a refused checkbox as true/false', () => {
  const { ctx, layer } = makeAE();
  ctx.cl_apply(list(['lens']), 'clip', 1); // adds the effect
  const fx = layer.property('ADBE Effect Parade').property(1), cb = fx.property('Anamorphic streaks');
  cb.setValue = v => { if (v === 1) throw new Error('Value 2 out of range 0 to 1'); layer.lastSet['Anamorphic streaks'] = v; };
  const r = JSON.parse(ctx.cl_apply([['Anamorphic streaks', 'B', 1], ['Animate grain', 'B', 1]], 'clip', 1));
  assert.deepEqual(r.v.missed, []);
  assert.equal(layer.lastSet['Anamorphic streaks'], true);
  assert.ok(!('Animate grain' in layer.lastSet) || layer.lastSet['Animate grain'] === undefined, 'Animate grain is on by default, so it is left alone');
});

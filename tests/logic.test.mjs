// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/data.js';
import { makeAnalytics, PERIODS, buckets } from '../js/analytics.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
let st;
const fresh = () => { st = mem(); D.init(st); };
const rowing = () => D.exercise('seated-cable-row');
const add = (w, ex, o) => D.addSet(w.id, ex, ex.cats[0], o);
const A = () => makeAnalytics(D.db());

test('individual sets stay separate; volume correct', () => {
  fresh(); const w = D.startWorkout();
  add(w, rowing(), { machineSetting: 2, weight: 20, reps: 12 });
  add(w, rowing(), { machineSetting: 2, weight: 20, reps: 10 });
  add(w, rowing(), { machineSetting: 3, weight: 20, reps: 8 });
  const s = D.setsFor(w.id);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.setOrder), [1, 2, 3]);
  assert.deepEqual(s.map((x) => x.machineSetting), [2, 2, 3]);
  assert.equal(A().workoutVolume(w.id), 240 + 200 + 160);
});

test('identical sets and decimals kept', () => {
  fresh(); const w = D.startWorkout(); const ex = D.exercise('hammer-curl');
  for (let i = 0; i < 3; i++) add(w, ex, { weight: 12.5, reps: 10 });
  assert.equal(D.setsFor(w.id).length, 3);
  assert.equal(A().workoutVolume(w.id), 750); // hammer curl = 2 dumbbells
});

test('finish, discard empty, relaunch keeps unfinished', () => {
  fresh();
  const e = D.startWorkout(); assert.equal(D.finishWorkout(e.id), false); assert.equal(D.activeWorkout(), null);
  const w = D.startWorkout(); add(w, rowing(), { machineSetting: 1, weight: 10, reps: 5 });
  D.init(st);
  assert.equal(D.activeWorkout().id, w.id); assert.equal(D.setsFor(w.id).length, 1);
  assert.equal(D.finishWorkout(w.id), true); assert.equal(D.activeWorkout(), null);
});

test('multiple workouts same day', () => {
  fresh();
  for (let i = 0; i < 2; i++) { const w = D.startWorkout(); add(w, rowing(), { weight: 20, reps: 10 }); D.finishWorkout(w.id); }
  assert.equal(A().workoutCount('week'), 2);
});

test('edit / delete recalculates bests, volume, numbering', () => {
  fresh(); const w = D.startWorkout();
  const a = add(w, rowing(), { machineSetting: 2, weight: 20, reps: 12 });
  const b = add(w, rowing(), { machineSetting: 3, weight: 30, reps: 8 });
  assert.equal(A().bests('seated-cable-row').bestWeight.value, 30);
  D.updateSet(b.id, { machineSetting: 3, weight: 25, reps: 8, durationSeconds: null });
  assert.equal(A().bests('seated-cable-row').bestWeight.value, 25);
  assert.equal(A().workoutVolume(w.id), 240 + 200);
  const c = add(w, rowing(), { weight: 20, reps: 5 });
  D.deleteSet(a.id);
  assert.deepEqual(D.setsFor(w.id).map((x) => x.setOrder), [1, 2]);
  D.deleteSet(b.id); D.deleteSet(c.id);
  assert.equal(A().bests('seated-cable-row').bestWeight, null);
});

test('machine setting breaks weight ties for PBs', () => {
  fresh(); const w = D.startWorkout();
  add(w, rowing(), { machineSetting: 2, weight: 20, reps: 10 });
  add(w, rowing(), { machineSetting: 3, weight: 20, reps: 10 });
  assert.equal(A().bests('seated-cable-row').bestWeight.detail, '3 / 20 kg');
});

test('multi-muscle exercise appears in both muscles', () => {
  fresh(); const w = D.startWorkout(); add(w, D.exercise('face-pull'), { weight: 100, reps: 5 });
  const a = A();
  assert.ok(a.muscleExercises('back', 'week').length); assert.ok(a.muscleExercises('shoulders', 'week').length);
  assert.equal(a.muscleExercises('chest', 'week').length, 0);
});

test('custom exercise behaves like built-in; delete with history archives', () => {
  fresh();
  D.saveExercise({ id: D.newCustomId(), name: 'Mine', cats: ['arms'], equip: 'machine', weightBehavior: 'machine', repBehavior: 'reps', info: '', image: null, machine: D.defaultStack(), wMin: 5, wMax: 100, wStep: 2.5, custom: true, archived: false });
  const c = D.db().exercises.find((e) => e.name === 'Mine');
  const w = D.startWorkout(); add(w, c, { machineSetting: 4, weight: 20, reps: 12 });
  assert.equal(A().bests(c.id).bestReps.value, 12);
  D.deleteExercise(c.id);
  assert.equal(D.setsFor(w.id).length, 1); assert.ok(!D.activeExercises().some((e) => e.id === c.id));
});

test('period buckets and empty states', () => {
  fresh(); const now = Date.now();
  assert.deepEqual(PERIODS.map((p) => buckets(p, now).length), [7, 30, 13, 12]);
  const a = A();
  assert.equal(a.totalVolume('year'), 0); assert.equal(a.trend(a.bodyWeightPoints(), 'month').current, null);
  assert.equal(a.plateaus(4).length, 0); assert.equal(a.avgSteps('week'), null);
});

test('plateau flagged for unchanged performance, not for progress', () => {
  fresh(); const d = D.db(); const day = 86400000;
  const mk = (daysAgo, weight) => {
    const t = Date.now() - daysAgo * day; const w = { id: D.uid(), startedAt: t, finishedAt: t, planId: null }; d.workouts.push(w);
    d.sets.push({ id: D.uid(), workoutId: w.id, exerciseId: 'seated-cable-row', exerciseName: 'Seated Cable Row', muscleCategory: 'back', muscleCategories: ['back'], equipment: 'machine', machineSetting: 2, weight, reps: 10, durationSeconds: null, timestamp: t, setOrder: 1, workoutOrder: 1 });
  };
  [22, 15, 8, 1].forEach((x) => mk(x, 20));
  assert.equal(A().plateaus(4)[0].exerciseId, 'seated-cable-row');
  mk(0.5, 30);
  assert.equal(A().plateaus(4).length, 0);
});

test('body weight / steps / measurement once per day', () => {
  fresh(); D.setBodyWeight(80); D.setBodyWeight(79.5); D.setSteps(5000); D.setSteps(9000); D.setMeasurement('waist', 86); D.setMeasurement('waist', 85);
  assert.equal(D.db().bodyWeights.length, 1); assert.equal(D.latestBodyWeight().kg, 79.5);
  assert.equal(D.stepsToday(), 9000); assert.equal(D.db().measurements.length, 1);
});

test('goal progress', () => {
  fresh(); const w = D.startWorkout(); add(w, D.exercise('bench-press'), { weight: 40, reps: 5 });
  const p = A().goalProgress({ id: 'g', kind: 'exerciseWeight', target: 80, exerciseId: 'bench-press' });
  assert.equal(p.fraction, 0.5);
});

test('backup round trip, validation, merge never overwrites', () => {
  fresh(); const w = D.startWorkout();
  add(w, rowing(), { machineSetting: 2, weight: 20, reps: 12 }); add(w, rowing(), { machineSetting: 3, weight: 20, reps: 8 });
  D.finishWorkout(w.id); D.setBodyWeight(81.2); D.setSteps(9000); D.setMeasurement('waist', 86);
  const file = JSON.parse(JSON.stringify(D.makeBackup()));
  assert.ok(D.validateBackup(file));
  const before = JSON.stringify(D.db());
  assert.equal(D.merge(file.data).total, 0); assert.equal(JSON.stringify(D.db()), before);
  fresh(); D.replaceAll(file.data);
  assert.deepEqual(D.setsFor(w.id).map((s) => s.machineSetting), [2, 3]);
  assert.equal(D.db().steps[0].steps, 9000);
  const bad = JSON.parse(JSON.stringify(file)); bad.data.sets[0].workoutId = 'nope';
  assert.throws(() => D.validateBackup(bad));
  assert.throws(() => D.validateBackup({ format: 'x' }));
  fresh(); assert.equal(D.merge(file.data).sets, 2);
});

test('corrupt storage is kept aside, not overwritten', () => {
  st = mem(); st.setItem('gim-data', '{broken'); D.init(st);
  assert.ok([...st.m.keys()].some((k) => k.startsWith('gim-data-unreadable-')));
});

test('two-dumbbell exercises count both dumbbells in volume; one-arm does not', () => {
  fresh(); const w = D.startWorkout();
  const press = D.exercise('dumbbell-bench-press'); const row = D.exercise('one-arm-dumbbell-row');
  assert.equal(press.mult, 2); assert.equal(row.mult, 1);
  const a = add(w, press, { weight: 20, reps: 10 }); add(w, row, { weight: 20, reps: 10 });
  assert.equal(a.weightMult, 2);
  const an = A();
  assert.equal(an.workoutVolume(w.id), 20 * 2 * 10 + 20 * 10);
  assert.equal(an.bests('dumbbell-bench-press').bestWeight.value, 20);
  assert.equal(an.bests('dumbbell-bench-press').bestSetVolume.value, 400);
});


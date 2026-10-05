import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as D from '../js/data.js';

const storage = (value) => {
  const data = new Map(value ? [['gim-data', JSON.stringify(value)]] : []);
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
};

test('gym library has only unique document entries and every image exists', () => {
  D.init(storage());
  const exercises = D.activeExercises();
  assert.equal(exercises.length, 60);
  assert.equal(new Set(exercises.map(e => e.id)).size, 60);
  assert.equal(new Set(exercises.map(e => e.gymImage)).size, 59);
  for (const e of exercises) assert.ok(fs.existsSync(new URL('../' + e.gymImage, import.meta.url)), e.name);
  assert.equal(D.exercise('treadmill'), undefined);
  assert.equal(exercises.filter(e => e.name === 'Hack Squat Machine').length, 1);
  assert.equal(exercises.filter(e => e.name === 'Seated Leg Press').length, 1);
});

test('migration hides removed exercises while preserving history, photos, settings and custom exercises', () => {
  const old = D.emptyData();
  old.seedVersion = 3;
  old.exercises = [
    { id: 'rowing-machine', name: 'Rowing Machine', cats: ['back'], equip: 'machine', custom: false, archived: false, mult: 1 },
    { id: 'bench-press', name: 'Bench Press', cats: ['chest', 'arms'], equip: 'barbell', custom: false, archived: false, mult: 1, image: 'data:image/jpeg;base64,PHOTO', wMax: 250 },
    { id: 'my-exercise', name: 'Mine', cats: ['arms'], custom: true, archived: false, mult: 1 },
  ];
  old.workouts = [{ id: 'w1', startedAt: 1, finishedAt: 2 }];
  old.sets = [{ id: 's1', workoutId: 'w1', exerciseId: 'rowing-machine', exerciseName: 'Rowing Machine', weight: 20, reps: 10, weightMult: 1 }];
  const savedSets = JSON.stringify(old.sets);
  const savedWorkouts = JSON.stringify(old.workouts);
  const st = storage(old);
  D.init(st);
  assert.equal(D.exercise('rowing-machine').archived, true);
  assert.ok(!D.activeExercises().some(e => e.id === 'rowing-machine'));
  assert.ok(D.activeExercises().some(e => e.id === 'my-exercise'));
  assert.equal(D.exercise('bench-press').name, 'Flat Bench Press');
  assert.equal(D.exercise('bench-press').image, 'data:image/jpeg;base64,PHOTO');
  assert.equal(D.exercise('bench-press').wMax, 250);
  assert.ok(D.exercise('bench-press').gymImage);
  assert.equal(JSON.stringify(D.db().sets), savedSets);
  assert.equal(JSON.stringify(D.db().workouts), savedWorkouts);
  const before = JSON.stringify(D.db());
  D.init(st);
  assert.equal(JSON.stringify(D.db()), before);
});

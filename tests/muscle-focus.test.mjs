import test from 'node:test';
import assert from 'node:assert/strict';
import { muscleCounts } from '../js/muscle-focus.js';

test('compound exercises highlight each recorded muscle once, with legacy fallback', () => {
  const counts = muscleCounts([
    { muscleCategory: 'chest', muscleCategories: ['chest', 'arms', 'arms'] },
    { muscleCategory: 'mix', muscleCategories: ['back', 'shoulders'] },
    { muscleCategory: 'legs' },
    { muscleCategory: 'cardio', muscleCategories: ['cardio'] },
  ]);
  assert.deepEqual(counts, { chest: 1, back: 1, shoulders: 1, arms: 1, legs: 1, core: 0 });
});


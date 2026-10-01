// Data model, local storage persistence, workout logic and the built-in exercise library.
export const CATS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio'];
export const EQUIP = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight', 'cardio', 'other'];
export const SCHEMA = 1;
export const SEED_VERSION = 3;
const KEY = 'gim-data';

let S = null;
let storage = null;
export let loadNotice = null;

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const ymd = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
export const dayMs = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

// ---------- library ----------
export const defaultStack = (count = 15, kg = 5) =>
  Array.from({ length: Math.max(1, count) }, (_, i) => ({ id: uid(), setting: i + 1, weight: (i + 1) * kg }));

const slug = (n) => n.toLowerCase().replace(/[ ]/g, '-').replace(/['()]/g, '');
const INFO = {
  machine: 'Adjust the seat and pads so the movement is smooth. Control the weight in both directions.',
  cable: 'Set the pulley height and stack pin. Keep tension on the cable through the whole rep.',
  barbell: 'Keep a braced core and controlled tempo. Use collars and a spotter for heavy sets.',
  dumbbell: 'Pick a weight you can control through the full range of motion.',
  bodyweight: 'Use your own bodyweight. Focus on full range and steady tempo.',
  cardio: 'Keep a steady effort. Record the time you spent.',
  other: '',
};

function make(name, cats, equip, min, max, opts = {}) {
  const wb = (equip === 'machine' || equip === 'cable') ? 'machine'
    : (equip === 'barbell' || equip === 'dumbbell' || equip === 'other') ? 'free' : 'none';
  const db = equip === 'dumbbell';
  return {
    id: slug(name), name, cats, equip, weightBehavior: wb,
    repBehavior: (opts.duration || equip === 'cardio') ? 'duration' : 'reps',
    info: opts.info ?? INFO[equip], image: null,
    machine: wb === 'machine' ? defaultStack() : [],
    wMin: min ?? (db ? 2.5 : 5), wMax: max ?? (db ? 50 : 200), wStep: opts.step ?? (equip === 'barbell' ? 5 : 2.5),
    custom: false, archived: false,
  };
}

// [name, categories, equipment, min, max, opts]
const LIB = [
  ['Bench Press', ['chest', 'arms'], 'barbell', 20, 200], ['Incline Bench Press', ['chest', 'shoulders'], 'barbell', 20, 160],
  ['Dumbbell Bench Press', ['chest'], 'dumbbell', 5, 60], ['Incline Dumbbell Press', ['chest', 'shoulders'], 'dumbbell', 5, 55],
  ['Dumbbell Fly', ['chest'], 'dumbbell', 2.5, 35], ['Chest Press Machine', ['chest'], 'machine'],
  ['Incline Chest Press Machine', ['chest', 'shoulders'], 'machine'], ['Pec Deck', ['chest'], 'machine'],
  ['Cable Crossover', ['chest'], 'cable'], ['Push-Up', ['chest', 'arms'], 'bodyweight'], ['Chest Dips', ['chest', 'arms'], 'bodyweight'],
  ['Rowing Machine', ['back'], 'machine'], ['Lat Pulldown', ['back', 'arms'], 'machine'], ['Seated Cable Row', ['back'], 'cable'],
  ['Deadlift', ['back', 'legs'], 'barbell', 20, 300], ['Barbell Row', ['back'], 'barbell', 20, 160],
  ['One-Arm Dumbbell Row', ['back'], 'dumbbell', 5, 60], ['T-Bar Row', ['back'], 'machine'],
  ['Assisted Pull-Up Machine', ['back', 'arms'], 'machine'], ['Pull-Up', ['back', 'arms'], 'bodyweight'],
  ['Chin-Up', ['back', 'arms'], 'bodyweight'], ['Back Extension', ['back', 'legs'], 'bodyweight'],
  ['Straight-Arm Pulldown', ['back'], 'cable'], ['Face Pull', ['back', 'shoulders'], 'cable'],
  ['Overhead Press', ['shoulders', 'arms'], 'barbell', 20, 120], ['Dumbbell Shoulder Press', ['shoulders'], 'dumbbell', 5, 50],
  ['Shoulder Press Machine', ['shoulders'], 'machine'], ['Lateral Raise', ['shoulders'], 'dumbbell', 2.5, 25],
  ['Front Raise', ['shoulders'], 'dumbbell', 2.5, 25], ['Rear Delt Fly Machine', ['shoulders', 'back'], 'machine'],
  ['Cable Lateral Raise', ['shoulders'], 'cable'], ['Upright Row', ['shoulders'], 'barbell', 10, 80],
  ['Dumbbell Shrug', ['shoulders', 'back'], 'dumbbell', 5, 60],
  ['Barbell Curl', ['arms'], 'barbell', 10, 80], ['Dumbbell Curl', ['arms'], 'dumbbell', 2.5, 35],
  ['Hammer Curl', ['arms'], 'dumbbell', 2.5, 35], ['Concentration Curl', ['arms'], 'dumbbell', 2.5, 30],
  ['Preacher Curl Machine', ['arms'], 'machine'], ['Cable Curl', ['arms'], 'cable'], ['Biceps Curl Machine', ['arms'], 'machine'],
  ['Triceps Pushdown', ['arms'], 'cable'], ['Skull Crusher', ['arms'], 'barbell', 10, 80],
  ['Overhead Triceps Extension', ['arms'], 'dumbbell', 2.5, 40], ['Triceps Extension Machine', ['arms'], 'machine'],
  ['Close-Grip Bench Press', ['arms', 'chest'], 'barbell', 20, 140], ['Bench Dips', ['arms'], 'bodyweight'],
  ['Wrist Curl', ['arms'], 'dumbbell', 2.5, 25],
  ['Barbell Squat', ['legs'], 'barbell', 20, 250], ['Leg Press', ['legs'], 'machine'], ['Leg Extension', ['legs'], 'machine'],
  ['Leg Curl', ['legs'], 'machine'], ['Romanian Deadlift', ['legs', 'back'], 'barbell', 20, 200],
  ['Hack Squat Machine', ['legs'], 'machine'], ['Goblet Squat', ['legs'], 'dumbbell', 5, 50],
  ['Walking Lunges', ['legs'], 'dumbbell', 2.5, 40], ['Bulgarian Split Squat', ['legs'], 'dumbbell', 2.5, 40],
  ['Hip Thrust', ['legs'], 'barbell', 20, 250], ['Hip Abduction Machine', ['legs'], 'machine'],
  ['Hip Adduction Machine', ['legs'], 'machine'], ['Standing Calf Raise', ['legs'], 'machine'],
  ['Seated Calf Raise', ['legs'], 'machine'], ['Cable Glute Kickback', ['legs'], 'cable'], ['Bodyweight Squat', ['legs'], 'bodyweight'],
  ['Crunch', ['core'], 'bodyweight'], ['Sit-Up', ['core'], 'bodyweight'], ['Hanging Leg Raise', ['core'], 'bodyweight'],
  ['Plank', ['core'], 'bodyweight', null, null, { duration: true, info: 'Hold a straight line from head to heels. Record the time held.' }],
  ['Russian Twist', ['core'], 'bodyweight'], ['Cable Crunch', ['core'], 'cable'], ['Ab Crunch Machine', ['core'], 'machine'],
  ['Ab Wheel Rollout', ['core'], 'other', 0, 20],
  ['Treadmill', ['cardio'], 'cardio'], ['Stationary Bike', ['cardio'], 'cardio'], ['Elliptical', ['cardio'], 'cardio'],
  ['Stair Climber', ['cardio'], 'cardio'], ['Rowing Erg', ['cardio', 'back'], 'cardio'], ['Jump Rope', ['cardio'], 'cardio'],
  ['Cycling (Outdoor)', ['cardio', 'legs'], 'cardio'], ['Walking', ['cardio'], 'cardio'],
];
// Exercises where TWO dumbbells are used at once: weight = per dumbbell, volume counts both (x2).
export const TWO = new Set(['dumbbell-bench-press', 'incline-dumbbell-press', 'dumbbell-fly', 'dumbbell-shoulder-press', 'lateral-raise', 'front-raise',
  'dumbbell-curl', 'hammer-curl', 'dumbbell-shrug', 'walking-lunges', 'bulgarian-split-squat', 'wrist-curl']);
export const builtIn = () => LIB.map(([n, c, e, mi, ma, o]) => { const x = make(n, c, e, mi, ma, o); x.mult = TWO.has(x.id) ? 2 : 1; return x; });

const DEFAULT_FIELDS = ['Neck', 'Shoulders', 'Chest', 'Waist', 'Hips', 'Left arm', 'Right arm', 'Left thigh', 'Right thigh', 'Left calf', 'Right calf']
  .map((name, i) => ({ id: name.toLowerCase().replace(/ /g, '-'), name, custom: false, order: i }));

export function emptyData() {
  return {
    schema: SCHEMA, seedVersion: 0, exercises: [], workouts: [], sets: [], plans: [], bodyWeights: [],
    fields: [], measurements: [], steps: [], goals: [], profile: { name: '', heightCm: null, plateauWeeks: 4 },
  };
}

function normalize(d) {
  const e = emptyData();
  for (const k of Object.keys(e)) if (d[k] === undefined) d[k] = e[k];
  d.profile = Object.assign(e.profile, d.profile || {});
  if (!d.fields.length) d.fields = DEFAULT_FIELDS.map((f) => ({ ...f }));
  if (d.seedVersion < 2) d.exercises.forEach((e) => { if (!e.custom && e.equip === 'barbell' && e.wStep === 2.5) e.wStep = 5; });
  if (d.seedVersion < 3) {
    d.exercises.forEach((e) => { if (!e.custom && TWO.has(e.id)) e.mult = 2; });
    d.sets.forEach((s) => { if (s.weightMult === undefined && TWO.has(s.exerciseId)) s.weightMult = 2; });
  }
  d.exercises.forEach((e) => { if (!e.mult) e.mult = 1; });
  if (d.seedVersion < SEED_VERSION) {
    const have = new Set(d.exercises.map((x) => x.id));
    for (const x of builtIn()) if (!have.has(x.id)) d.exercises.push(x);
    d.seedVersion = SEED_VERSION;
  }
  return d;
}

// ---------- persistence ----------
export function init(st) {
  storage = st;
  let raw = null;
  try { raw = storage.getItem(KEY); } catch (e) { /* ignore */ }
  let d = null;
  if (raw) {
    try { d = JSON.parse(raw); } catch (e) {
      try { storage.setItem('gim-data-unreadable-' + Date.now(), raw); } catch (e2) { /* ignore */ }
      loadNotice = 'Saved data could not be read. The unreadable copy was kept aside and the app started empty.';
    }
  }
  S = normalize(d || emptyData());
  save();
  return S;
}

export function save() {
  try { storage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { loadNotice = 'Could not save data: ' + e.message; }
}
export const db = () => S;
export const clearNotice = () => { loadNotice = null; };

// ---------- lookups ----------
export const exercise = (id) => S.exercises.find((e) => e.id === id);
export const workout = (id) => S.workouts.find((w) => w.id === id);
export const plan = (id) => S.plans.find((p) => p.id === id);
export const field = (id) => S.fields.find((f) => f.id === id);
export const setById = (id) => S.sets.find((s) => s.id === id);
export const activeExercises = () =>
  S.exercises.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name));
export const exercisesIn = (cat) => activeExercises().filter((e) => e.cats.includes(cat));
export const setsFor = (wid) => S.sets.filter((s) => s.workoutId === wid).sort((a, b) => a.workoutOrder - b.workoutOrder);
export const activeWorkout = () => S.workouts.filter((w) => !w.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] || null;
export const workoutsNewestFirst = () =>
  S.workouts.filter((w) => !w.finishedAt || setsFor(w.id).length).sort((a, b) => b.startedAt - a.startedAt);
export function lastSet(exId) {
  let best = null;
  for (const s of S.sets) if (s.exerciseId === exId && (!best || s.timestamp > best.timestamp)) best = s;
  return best;
}
export function recentExerciseIds(limit = 6) {
  const seen = new Set(); const out = [];
  for (const s of [...S.sets].sort((a, b) => b.timestamp - a.timestamp)) {
    if (seen.has(s.exerciseId)) continue;
    seen.add(s.exerciseId);
    const e = exercise(s.exerciseId);
    if (e && !e.archived) out.push(e.id);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- workout logic ----------
export function startWorkout(planId = null) {
  const a = activeWorkout();
  if (a) { if (planId && !a.planId) { a.planId = planId; save(); } return a; }
  const w = { id: uid(), startedAt: Date.now(), finishedAt: null, planId };
  S.workouts.push(w); save();
  return w;
}

/** Saves ONE new set. Never merges with existing sets. */
export function addSet(workoutId, ex, category, { machineSetting = null, weight = 0, reps = null, durationSeconds = null }) {
  const w = workout(workoutId);
  if (!w) return null;
  const existing = setsFor(workoutId);
  const ts = !w.finishedAt ? Date.now() : ((existing.length ? existing[existing.length - 1].timestamp : w.startedAt) + 1000);
  const rec = {
    id: uid(), workoutId, exerciseId: ex.id, exerciseName: ex.name, muscleCategory: category,
    muscleCategories: [...ex.cats], equipment: ex.equip, machineSetting, weight, reps, durationSeconds, weightMult: ex.mult || 1,
    timestamp: ts, setOrder: existing.filter((s) => s.exerciseId === ex.id).length + 1,
    workoutOrder: (existing.reduce((m, s) => Math.max(m, s.workoutOrder), 0)) + 1,
  };
  S.sets.push(rec); save();
  return rec;
}

export function updateSet(id, { machineSetting, weight, reps, durationSeconds }) {
  const s = setById(id); if (!s) return;
  Object.assign(s, { machineSetting, weight, reps, durationSeconds }); save();
}

function renumber(workoutId) {
  const list = setsFor(workoutId); const counters = {};
  list.forEach((s, i) => { s.workoutOrder = i + 1; counters[s.exerciseId] = (counters[s.exerciseId] || 0) + 1; s.setOrder = counters[s.exerciseId]; });
}

export function deleteSet(id) {
  const s = setById(id); if (!s) return;
  S.sets = S.sets.filter((x) => x.id !== id);
  renumber(s.workoutId);
  const w = workout(s.workoutId);
  if (w && w.finishedAt && !setsFor(w.id).length) S.workouts = S.workouts.filter((x) => x.id !== w.id);
  save();
}

/** Returns true if a workout was saved, false if an empty one was discarded. */
export function finishWorkout(id) {
  const w = workout(id); if (!w) return false;
  if (!setsFor(id).length) { S.workouts = S.workouts.filter((x) => x.id !== id); save(); return false; }
  w.finishedAt = Date.now(); save();
  return true;
}
export function deleteWorkout(id) {
  S.sets = S.sets.filter((s) => s.workoutId !== id);
  S.workouts = S.workouts.filter((w) => w.id !== id); save();
}

// ---------- exercises ----------
export const newCustomId = () => 'custom-' + uid();
export function saveExercise(e) {
  const i = S.exercises.findIndex((x) => x.id === e.id);
  if (i >= 0) S.exercises[i] = e; else S.exercises.push(e);
  save();
}
export function deleteExercise(id) {
  const used = S.sets.some((s) => s.exerciseId === id);
  if (used) { const e = exercise(id); if (e) e.archived = true; }
  else S.exercises = S.exercises.filter((e) => e.id !== id);
  S.plans.forEach((p) => { p.exerciseIds = p.exerciseIds.filter((x) => x !== id); });
  save();
}
export function addMachineSettingIfNeeded(exId, setting, weight) {
  const e = exercise(exId); if (!e) return;
  if (!e.machine.some((m) => m.setting === setting && Math.abs(m.weight - weight) < 1e-4)) {
    e.machine.push({ id: uid(), setting, weight });
    e.machine.sort((a, b) => a.setting - b.setting || a.weight - b.weight); save();
  }
}

// ---------- plans ----------
export function createPlan(name) {
  const p = { id: uid(), name, exerciseIds: [], createdAt: Date.now() };
  S.plans.push(p); save(); return p;
}
export function deletePlan(id) {
  S.plans = S.plans.filter((p) => p.id !== id);
  S.workouts.forEach((w) => { if (w.planId === id) w.planId = null; }); save();
}

// ---------- body tracking ----------
export const latestBodyWeight = () => [...S.bodyWeights].sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
function upsertDaily(list, match, make, update) {
  const f = list.find(match);
  if (f) update(f); else list.push(make());
  save();
}
export const setBodyWeight = (kg, date = ymd(Date.now())) =>
  upsertDaily(S.bodyWeights, (b) => b.date === date, () => ({ id: uid(), date, kg }), (b) => { b.kg = kg; });
export const deleteBodyWeight = (id) => { S.bodyWeights = S.bodyWeights.filter((b) => b.id !== id); save(); };
export const setMeasurement = (fieldId, cm, date = ymd(Date.now())) =>
  upsertDaily(S.measurements, (m) => m.fieldId === fieldId && m.date === date, () => ({ id: uid(), fieldId, date, cm }), (m) => { m.cm = cm; });
export const deleteMeasurement = (id) => { S.measurements = S.measurements.filter((m) => m.id !== id); save(); };
export function addField(name) {
  const f = { id: 'custom-' + uid(), name, custom: true, order: S.fields.reduce((m, x) => Math.max(m, x.order), 0) + 1 };
  S.fields.push(f); save(); return f;
}
export function deleteField(id) {
  S.fields = S.fields.filter((f) => !(f.id === id && f.custom));
  S.measurements = S.measurements.filter((m) => m.fieldId !== id);
  S.goals = S.goals.filter((g) => g.fieldId !== id); save();
}
export const setSteps = (steps, date = ymd(Date.now())) =>
  upsertDaily(S.steps, (s) => s.date === date, () => ({ id: uid(), date, steps }), (s) => { s.steps = steps; });
export const deleteSteps = (id) => { S.steps = S.steps.filter((s) => s.id !== id); save(); };
export const stepsToday = () => (S.steps.find((s) => s.date === ymd(Date.now())) || {}).steps ?? null;

// ---------- goals / profile ----------
export function saveGoal(g) {
  const i = S.goals.findIndex((x) => x.id === g.id);
  if (i >= 0) S.goals[i] = g; else S.goals.push(g); save();
}
export const deleteGoal = (id) => { S.goals = S.goals.filter((g) => g.id !== id); save(); };
export const updateProfile = (patch) => { Object.assign(S.profile, patch); save(); };

// ---------- backup ----------
export const BACKUP_FORMAT = 'GIMBackup';
export const makeBackup = () => ({ format: BACKUP_FORMAT, version: SCHEMA, appVersion: globalThis.GIM_VERSION || null, exportedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(S)) });

/** Throws Error(message) before anything is changed. */
export function validateBackup(file) {
  if (!file || file.format !== BACKUP_FORMAT || !file.data) throw new Error('This file is not a GIM backup.');
  if (file.version > SCHEMA) throw new Error('This backup was made by a newer version of the app.');
  const d = file.data;
  for (const k of ['exercises', 'workouts', 'sets']) if (!Array.isArray(d[k])) throw new Error('Backup is missing "' + k + '".');
  const uniq = (arr, what) => { if (new Set(arr.map((x) => x.id)).size !== arr.length) throw new Error('Backup contains duplicate ' + what + ' IDs.'); };
  uniq(d.exercises, 'exercise'); uniq(d.workouts, 'workout'); uniq(d.sets, 'set'); uniq(d.plans || [], 'plan');
  const wids = new Set(d.workouts.map((w) => w.id)); const eids = new Set(d.exercises.map((e) => e.id));
  for (const s of d.sets) {
    if (!wids.has(s.workoutId)) throw new Error('A set refers to a workout that is not in the backup.');
    if (!eids.has(s.exerciseId)) throw new Error('A set refers to exercise "' + s.exerciseName + '" that is not in the backup.');
    if (!Number.isFinite(s.weight) || s.weight < 0 || s.weight >= 10000) throw new Error('A set contains an invalid weight.');
    if (s.reps != null && (!Number.isFinite(s.reps) || s.reps < 0)) throw new Error('A set contains an invalid rep count.');
    if (s.durationSeconds != null && (!Number.isFinite(s.durationSeconds) || s.durationSeconds < 0)) throw new Error('A set contains an invalid duration.');
  }
  for (const b of d.bodyWeights || []) if (!(b.kg > 0 && b.kg < 1000)) throw new Error('A body-weight entry is invalid.');
  for (const m of d.measurements || []) if (!(m.cm > 0 && m.cm < 1000)) throw new Error('A measurement entry is invalid.');
  for (const s of d.steps || []) if (!(s.steps >= 0)) throw new Error('A steps entry is invalid.');
  return true;
}

export function backupSummary(file) {
  const d = file.data;
  return 'Exported ' + (file.exportedAt || '').slice(0, 10) + ' — ' + d.workouts.length + ' workouts, ' + d.sets.length + ' sets, ' +
    d.exercises.filter((e) => e.custom).length + ' custom exercises, ' + (d.plans || []).length + ' plans, ' +
    (d.bodyWeights || []).length + ' weights, ' + (d.measurements || []).length + ' measurements, ' + (d.steps || []).length + ' step days.';
}

/** Adds what is missing; never overwrites existing records. */
export function merge(other) {
  const o = normalize(JSON.parse(JSON.stringify(other)));
  const c = { exercises: 0, workouts: 0, sets: 0, plans: 0, bodyWeights: 0, measurements: 0, steps: 0, goals: 0 };
  const ids = (a) => new Set(a.map((x) => x.id));
  const ex = ids(S.exercises); o.exercises.forEach((e) => { if (!ex.has(e.id)) { S.exercises.push(e); c.exercises++; } });
  const wIds = ids(S.workouts); const newW = o.workouts.filter((w) => !wIds.has(w.id));
  S.workouts.push(...newW); c.workouts = newW.length;
  const sIds = ids(S.sets); const newS = o.sets.filter((s) => !sIds.has(s.id) && !wIds.has(s.workoutId));
  S.sets.push(...newS); c.sets = newS.length;
  const pl = ids(S.plans); o.plans.forEach((p) => { if (!pl.has(p.id)) { S.plans.push(p); c.plans++; } });
  const bw = new Set(S.bodyWeights.map((b) => b.date)); o.bodyWeights.forEach((b) => { if (!bw.has(b.date)) { S.bodyWeights.push(b); c.bodyWeights++; } });
  const fl = ids(S.fields); o.fields.forEach((f) => { if (!fl.has(f.id)) S.fields.push(f); });
  const mk = new Set(S.measurements.map((m) => m.fieldId + '|' + m.date));
  o.measurements.forEach((m) => { if (!mk.has(m.fieldId + '|' + m.date)) { S.measurements.push(m); c.measurements++; } });
  const sd = new Set(S.steps.map((s) => s.date)); o.steps.forEach((s) => { if (!sd.has(s.date)) { S.steps.push(s); c.steps++; } });
  const gl = ids(S.goals); o.goals.forEach((g) => { if (!gl.has(g.id)) { S.goals.push(g); c.goals++; } });
  save();
  c.total = Object.values(c).reduce((a, b) => a + b, 0);
  return c;
}

/** Callers must have stored a safety copy first. */
export function replaceAll(other) {
  S = normalize(JSON.parse(JSON.stringify(other)));
  save();
}
export function saveSafetyBackup() {
  const json = JSON.stringify(makeBackup());
  try { storage.setItem('gim-safety-backup', json); return true; } catch (e) { return false; }
}
export const hasSafetyBackup = () => { try { return !!storage.getItem('gim-safety-backup'); } catch (e) { return false; } };
export const getSafetyBackup = () => { try { return storage.getItem('gim-safety-backup'); } catch (e) { return null; } };

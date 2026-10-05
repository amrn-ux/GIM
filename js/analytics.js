// Pure calculations over the data object. Nothing is stored: edits/deletes are reflected automatically.
import { dayMs, ymd } from './data.js';

export const PERIODS = ['week', 'month', 'quarter', 'year'];
export const PERIOD_INFO = {
  week: { title: 'Week', window: 'Last 7 days', bucket: 'day' },
  month: { title: 'Month', window: 'Last 30 days', bucket: 'day' },
  quarter: { title: 'Quarter', window: 'Last 13 weeks', bucket: 'week' },
  year: { title: 'Year', window: 'Last 12 months', bucket: 'month' },
};

export const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
const addMonths = (ms, n) => { const d = new Date(ms); d.setMonth(d.getMonth() + n); return d.getTime(); };
const weekStart = (ms) => { const d = new Date(sod(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const monthStart = (ms) => { const d = new Date(sod(ms)); d.setDate(1); return d.getTime(); };

export function interval(p, now) {
  const today = sod(now); const end = addDays(today, 1);
  let start;
  if (p === 'week') start = addDays(today, -6);
  else if (p === 'month') start = addDays(today, -29);
  else if (p === 'quarter') start = addDays(weekStart(today), -84);
  else start = addMonths(monthStart(today), -11);
  return { start, end };
}

export function buckets(p, now) {
  const iv = interval(p, now); const kind = PERIOD_INFO[p].bucket; const out = [];
  let cur = kind === 'day' ? iv.start : kind === 'week' ? weekStart(iv.start) : monthStart(iv.start);
  while (cur < iv.end) {
    const next = kind === 'day' ? addDays(cur, 1) : kind === 'week' ? addDays(cur, 7) : addMonths(cur, 1);
    out.push({ start: cur, end: next }); cur = next;
  }
  return out;
}

const cmpLoad = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
export const setVolume = (s) => (s.reps != null ? s.weight * (s.weightMult || 1) * s.reps : 0);
const sum = (a, f = (x) => x) => a.reduce((t, x) => t + f(x), 0);
const inIv = (t, iv) => t >= iv.start && t < iv.end;

export const loadText = (s) =>
  s.machineSetting != null ? s.machineSetting + ' / ' + num(s.weight) + ' kg' : s.weight > 0 ? num(s.weight) + ' kg' : null;
export const effortText = (s) =>
  s.reps != null ? s.reps + ' reps' : s.durationSeconds != null ? duration(s.durationSeconds) : '—';
export const num = (v) => String(Math.round(v * 100) / 100);
export const duration = (sec) => (sec >= 60 ? Math.floor(sec / 60) + ' min' + (sec % 60 ? ' ' + (sec % 60) + ' s' : '') : sec + ' s');

export function makeAnalytics(d, now = Date.now()) {
  const wdate = {};
  d.workouts.forEach((w) => { wdate[w.id] = w.startedAt; });
  const entries = d.sets.filter((s) => wdate[s.workoutId] !== undefined)
    .map((s) => ({ t: wdate[s.workoutId], s }))
    .sort((a, b) => (a.t - b.t) || (a.s.workoutOrder - b.s.workoutOrder));
  const exName = (id) => (d.exercises.find((e) => e.id === id) || {}).name
    || (entries.find((e) => e.s.exerciseId === id) || { s: {} }).s.exerciseName || 'Exercise';

  const A = {};
  A.now = now;
  A.interval = (p) => interval(p, now);
  A.buckets = (p) => buckets(p, now);
  A.setsIn = (iv) => entries.filter((e) => inIv(e.t, iv)).map((e) => e.s);
  A.totalVolume = (p) => sum(A.setsIn(A.interval(p)), setVolume);
  A.volumeIn = (iv) => sum(A.setsIn(iv), setVolume);
  A.workoutVolume = (wid) => sum(d.sets.filter((s) => s.workoutId === wid), setVolume);
  A.workoutCountIn = (iv) => new Set(entries.filter((e) => inIv(e.t, iv)).map((e) => e.s.workoutId)).size;
  A.workoutCount = (p) => A.workoutCountIn(A.interval(p));
  A.setCount = (p) => A.setsIn(A.interval(p)).length;
  A.volumeSeries = (p) => A.buckets(p).map((b) => ({ t: b.start, v: A.volumeIn(b) }));
  A.workoutCountSeries = (p) => A.buckets(p).map((b) => ({ t: b.start, v: A.workoutCountIn(b) }));
  A.avgWorkoutsPerWeek = (p) => {
    const iv = A.interval(p); const weeks = Math.max((iv.end - iv.start) / (7 * 86400000), 1);
    return A.workoutCountIn(iv) / weeks;
  };
  A.daysSinceLastWorkout = () => {
    if (!entries.length) return null;
    return Math.round((sod(now) - sod(entries[entries.length - 1].t)) / 86400000);
  };

  // ----- exercise history -----
  A.exercisesWithHistory = () => {
    const seen = new Set(); const out = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const id = entries[i].s.exerciseId;
      if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  };

  A.sessions = (exId) => {
    const map = new Map();
    for (const e of entries) {
      if (e.s.exerciseId !== exId) continue;
      if (!map.has(e.s.workoutId)) map.set(e.s.workoutId, { workoutId: e.s.workoutId, date: e.t, sets: [] });
      map.get(e.s.workoutId).sets.push(e.s);
    }
    return [...map.values()].map((x) => {
      const sets = x.sets;
      const volume = sum(sets, setVolume);
      const totalReps = sum(sets, (s) => s.reps || 0);
      const totalSeconds = sum(sets, (s) => s.durationSeconds || 0);
      const topLoad = sets.map((s) => [s.weight, s.machineSetting ?? 0]).sort(cmpLoad).pop() || [0, 0];
      return {
        ...x, volume, totalReps, totalSeconds, topLoad,
        maxWeight: Math.max(0, ...sets.map((s) => s.weight)),
        maxReps: Math.max(0, ...sets.map((s) => s.reps || 0)),
        score: volume > 0 ? volume : totalReps > 0 ? totalReps : totalSeconds,
      };
    });
  };

  A.exerciseSeries = (exId, metric, p) => {
    const iv = A.interval(p);
    return A.sessions(exId).filter((s) => inIv(s.date, iv)).map((s) => ({
      t: s.date,
      v: metric === 'weight' ? s.maxWeight : metric === 'reps' ? s.maxReps : metric === 'volume' ? s.volume : s.sets.length,
    }));
  };

  // ----- personal bests (only from recorded sets) -----
  A.bests = (exId) => {
    const r = { exerciseId: exId, name: exName(exId), bestWeight: null, bestReps: null, bestSetVolume: null, bestSessionVolume: null, history: [] };
    let topLoad = [0, 0]; let topReps = 0; let topSetVol = 0; let topSessVol = 0;
    const events = [];
    for (const sess of A.sessions(exId)) {
      for (const s of sess.sets) {
        const load = [s.weight, s.machineSetting ?? 0];
        if (s.weight > 0 && cmpLoad(load, topLoad) > 0) {
          topLoad = load;
          const text = loadText(s);
          r.bestWeight = { value: s.weight, date: sess.date, detail: text };
          events.push({ date: sess.date, kind: 'Best weight', text });
        }
        if (s.reps != null && s.reps > topReps) {
          topReps = s.reps;
          r.bestReps = { value: s.reps, date: sess.date, detail: s.reps + ' reps' + (loadText(s) ? ' @ ' + loadText(s) : '') };
          events.push({ date: sess.date, kind: 'Best reps', text: s.reps + ' reps' });
        }
        const v = setVolume(s);
        if (v > topSetVol) {
          topSetVol = v;
          const detail = Math.round(v) + ' kg (' + ((s.weightMult || 1) > 1 ? s.weightMult + ' × ' : '') + num(s.weight) + ' kg × ' + (s.reps || 0) + ')';
          r.bestSetVolume = { value: v, date: sess.date, detail };
          events.push({ date: sess.date, kind: 'Best set volume', text: detail });
        }
      }
      if (sess.volume > topSessVol) {
        topSessVol = sess.volume;
        r.bestSessionVolume = { value: sess.volume, date: sess.date, detail: Math.round(sess.volume) + ' kg' };
        events.push({ date: sess.date, kind: 'Best session volume', text: Math.round(sess.volume) + ' kg' });
      }
    }
    r.history = events.reverse();
    return r;
  };
  A.allBests = () => A.exercisesWithHistory().map(A.bests);
  A.pbCountIn = (iv) => sum(A.allBests(), (b) => b.history.filter((e) => inIv(e.date, iv)).length);

  // ----- plateau (informational) -----
  A.plateaus = (weeks) => {
    const start = now - weeks * 7 * 86400000; const flags = [];
    for (const id of A.exercisesWithHistory()) {
      const win = A.sessions(id).filter((s) => s.date >= start);
      if (win.length < 3) continue;
      const first = win[0]; const last = win[win.length - 1];
      if (last.date - first.date < 10 * 86400000) continue;
      const improved = win.slice(1).some((s) => cmpLoad(s.topLoad, first.topLoad) > 0 || s.score > first.score * 1.05);
      if (improved) continue;
      const name = exName(id);
      const best = Math.max(...win.map((s) => s.score));
      const unit = first.volume > 0 ? 'kg volume' : first.totalReps > 0 ? 'total reps' : 'seconds';
      flags.push({
        exerciseId: id, name, sessions: win.length, weeks,
        message: 'Little progress detected on ' + name + ' over the last ' + weeks + ' weeks.',
        reason: win.length + ' sessions in this period. Top weight stayed at ' + num(first.maxWeight) + ' kg and no session beat the first one by more than 5% (' +
          Math.round(first.score) + ' → best ' + Math.round(best) + ' ' + unit + '). This is only an indicator based on your recorded sets.',
      });
    }
    return flags;
  };

  // ----- muscles -----
  const muscleEntries = (cat) => entries.filter((e) => (e.s.muscleCategories || [e.s.muscleCategory]).includes(cat));
  A.muscleVolumeSeries = (cat, p) => {
    const all = muscleEntries(cat);
    return A.buckets(p).map((b) => ({ t: b.start, v: sum(all.filter((e) => inIv(e.t, b)), (e) => setVolume(e.s)) }));
  };
  A.muscleExercises = (cat, p) => {
    const iv = A.interval(p);
    const ids = [...new Set(muscleEntries(cat).map((e) => e.s.exerciseId))];
    return ids.map((id) => {
      const s = A.sessions(id).filter((x) => inIv(x.date, iv));
      if (!s.length) return null;
      return { exerciseId: id, name: exName(id), sessions: s.length, firstWeight: s[0].maxWeight, lastWeight: s[s.length - 1].maxWeight, volume: sum(s, (x) => x.volume) };
    }).filter(Boolean).sort((a, b) => b.volume - a.volume);
  };

  // ----- body -----
  A.bodyWeightPoints = () => [...d.bodyWeights].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ t: dayMs(b.date), v: b.kg }));
  A.measurementPoints = (fid) => d.measurements.filter((m) => m.fieldId === fid).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ t: dayMs(m.date), v: m.cm }));
  A.stepPoints = () => [...d.steps].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ t: dayMs(s.date), v: s.steps }));
  A.pointsIn = (all, p) => { const iv = A.interval(p); return all.filter((x) => inIv(x.t, iv)); };
  A.trend = (all, p) => {
    const iv = A.interval(p); const win = all.filter((x) => inIv(x.t, iv));
    let ref = win.length ? win[0].v : null;
    if (win.length < 2) { const before = [...all].reverse().find((x) => x.t < iv.start); if (before) ref = before.v; }
    const current = all.length ? all[all.length - 1] : null;
    const prev = all.length >= 2 ? all[all.length - 2].v : null;
    return {
      current: current ? current.v : null, currentT: current ? current.t : null, reference: ref, previous: prev,
      windowChange: current && ref != null ? current.v - ref : null,
      changeFromPrevious: current && prev != null ? current.v - prev : null,
    };
  };
  A.avgSteps = (p) => { const pts = A.pointsIn(A.stepPoints(), p); return pts.length ? sum(pts, (x) => x.v) / pts.length : null; };

  // ----- goals -----
  A.goalProgress = (g) => {
    let title = ''; let current = null; let unit = ''; let reduces = false;
    if (g.kind === 'exerciseWeight') { const b = g.exerciseId ? A.bests(g.exerciseId) : null; title = (b ? b.name : 'Exercise') + ' weight'; current = b && b.bestWeight ? b.bestWeight.value : null; unit = 'kg'; }
    else if (g.kind === 'bodyWeight') { const p = A.bodyWeightPoints(); title = 'Body weight'; current = p.length ? p[p.length - 1].v : null; unit = 'kg'; reduces = g.startValue != null && g.target < g.startValue; }
    else if (g.kind === 'measurement') {
      const f = d.fields.find((x) => x.id === g.fieldId); const p = A.measurementPoints(g.fieldId);
      title = f ? f.name : 'Measurement'; current = p.length ? p[p.length - 1].v : null; unit = 'cm'; reduces = g.startValue != null && g.target < g.startValue;
    } else if (g.kind === 'steps') { title = 'Daily steps (7-day avg)'; current = A.avgSteps('week'); unit = 'steps'; }
    else { title = 'Workouts per week'; current = A.workoutCountIn({ start: now - 7 * 86400000, end: now + 1 }); unit = 'workouts'; }
    let fraction = 0;
    if (current != null) {
      if (g.kind === 'steps' || g.kind === 'workoutsPerWeek') fraction = g.target > 0 ? current / g.target : 0;
      else if (reduces && g.startValue != null && g.startValue !== g.target) fraction = (g.startValue - current) / (g.startValue - g.target);
      else if (g.startValue != null && g.kind !== 'exerciseWeight' && g.startValue !== g.target) fraction = (current - g.startValue) / (g.target - g.startValue);
      else fraction = g.target > 0 ? current / g.target : 0;
    }
    return {
      goal: g, title, currentText: current != null ? num(current) + ' ' + unit : 'No data', targetText: num(g.target) + ' ' + unit,
      fraction: Math.min(Math.max(fraction, 0), 1),
    };
  };

  return A;
}

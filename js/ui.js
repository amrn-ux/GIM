import * as D from './data.js';
import { VERSION, BUILD_DATE } from './version.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import {
  makeAnalytics, PERIODS, PERIOD_INFO, loadText, effortText, num, sod, setVolume, setsCSV, bodyWeightCSV, measurementsCSV, stepsCSV,
} from './analytics.js';
import { lineChart, barChart, ring, sparkline, miniBars } from './charts.js';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CAT_COLOR = { chest: '#e6524d', back: '#3a80e6', shoulders: '#9a66d9', arms: '#f2991a', legs: '#26a672', core: '#d9bf1a', cardio: '#e64d8c', mix: '#5b6cf0' };
const CAT_ICON = { chest: '🏋️', back: '🚣', shoulders: '🤸', arms: '💪', legs: '🦵', core: '🧘', cardio: '🏃', mix: '🔀' };
const EQ_ICON = { machine: '⚙️', cable: '🔗', barbell: '🏋️', dumbbell: '💪', bodyweight: '🤸', cardio: '❤️', other: '▫️' };
const big = (v) => Math.round(v).toLocaleString();
const kg = (v) => num(v) + ' kg';
const vol = (v) => big(v) + ' kg';
const signed = (v, u) => (v > 0.0001 ? '+' : v < -0.0001 ? '-' : '') + num(Math.abs(v)) + ' ' + u;
const r2 = (v) => Math.round(v * 100) / 100;
const parseNum = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const longDay = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const monthName = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const dstr = (s) => fmtDay(D.dayMs(s));
const badge = (c) => `<span class="badge" style="background:${CAT_COLOR[c]}2e;color:${CAT_COLOR[c]}">${cap(c)}</span>`;

function thumb(ex, cls = '') {
  const c = CAT_COLOR[ex.cats[0]] || '#888';
  if (ex.image) return `<div class="thumb ${cls}" style="background-image:url('${esc(ex.image)}')"></div>`;
  return `<div class="thumb ${cls}" style="background:linear-gradient(135deg,${c},${c}99)">${EQ_ICON[ex.equip] || ''}<div class="img-over" style="background-image:url('images/${esc(ex.id)}.jpg')"></div></div>`;
}

// ---------- state ----------
const ROOTS = ['home', 'workout', 'plans', 'progress', 'profile'];
const TAB_META = { home: ['🏠', 'Home'], workout: ['🏋️', 'Workout'], plans: ['📋', 'Plans'], progress: ['📈', 'Progress'], profile: ['👤', 'Profile'] };
const U = {
  tab: 'home', stacks: { home: [], workout: [], plans: [], progress: [], profile: [] },
  period: localStorage.getItem('gim-period') || 'month', form: null, sheet: null, q: '', filter: null,
  calMonth: Date.now(), calDay: null, lastFinished: null,
};
let A = null; // analytics for the current render

const view = () => { const s = U.stacks[U.tab]; return s.length ? s[s.length - 1] : { v: U.tab, p: {} }; };
function go(v, p = {}) { U.stacks[U.tab].push({ v, p }); U.q = ''; U.filter = null; render(false); }
function back() { U.stacks[U.tab].pop(); U.q = ''; U.filter = null; U.sheet = null; render(false); }
function switchTab(t) { U.stacks[t] = t === U.tab ? [] : U.stacks[t]; U.tab = t; U.q = ''; U.sheet = null; render(false); }

function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = esc(msg) + (undo ? ' <button class="link" data-a="undo" style="color:#fff;text-decoration:underline;margin-left:8px">Undo</button>' : '');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), undo ? 5000 : 1600);
}

// ---------- shared UI builders ----------
function stepper(key, value, step, { min = 0, max = 100000, unit = '', src = 'form' } = {}) {
  const b = (d, t) => `<button class="rb" data-a="step" data-k="${key}" data-d="${d}" data-min="${min}" data-max="${max}" data-src="${src}">${t}</button>`;
  return `<div class="stepper">${b(-step, '−')}<div class="grow"><input inputmode="decimal" value="${num(value)}" data-bind="${key}" data-src="${src}" aria-label="${key}">${unit ? `<div class="unit">${unit}</div>` : ''}</div>${b(step, '+')}</div>`;
}
function chipRow(values, selected, key, fmt = num, src = 'form') {
  return `<div class="chips">${values.map((v) => `<button class="chip ${Math.abs(v - selected) < 0.001 ? 'sel' : ''}" data-a="setVal" data-k="${key}" data-v="${v}" data-src="${src}">${fmt(v)}</button>`).join('')}</div>`;
}
function seg(options, current, action) {
  return `<div class="seg">${options.map(([v, t]) => `<button class="${v === current ? 'on' : ''}" data-a="${action}" data-v="${v}">${t}</button>`).join('')}</div>`;
}
const periodSeg = () => seg(PERIODS.map((p) => [p, PERIOD_INFO[p].title]), U.period, 'period') + `<div class="small muted center" style="margin:-4px 0 10px">${PERIOD_INFO[U.period].window}</div>`;
const tile = (t, v, sub, cls = '') => `<div class="card tile"><div class="t">${t}</div><div class="v">${v}</div>${sub ? `<div class="small muted ${cls}">${sub}</div>` : ''}</div>`;
const empty = (icon, t, m = '') => `<div class="center muted" style="padding:28px 12px"><div style="font-size:34px">${icon}</div><div style="font-weight:700;color:var(--text)">${t}</div><div class="small">${m}</div></div>`;
const chev = '<span class="chev">›</span>';

function workoutRow(w) {
  const sets = D.setsFor(w.id); const cats = [];
  sets.forEach((s) => { if (!cats.includes(s.muscleCategory)) cats.push(s.muscleCategory); });
  return `<button class="item" data-a="openWorkout" data-id="${w.id}"><div class="grow">
    <div><b>${fmtDay(w.startedAt)}</b> <span class="muted small">${fmtTime(w.startedAt)}</span> ${w.finishedAt ? '' : '<span class="small" style="color:#e08a00;font-weight:700">In progress</span>'}</div>
    <div style="margin:4px 0">${cats.map(badge).join(' ')}</div>
    <div class="small muted">${sets.length} sets · ${new Set(sets.map((s) => s.exerciseId)).size} exercises · ${vol(A.workoutVolume(w.id))}</div></div>${chev}</button>`;
}

/** category → exercise → sets (order of first appearance) */
function groupSets(sets) {
  const groups = [];
  for (const s of sets) {
    let g = groups.find((x) => x.cat === s.muscleCategory);
    if (!g) { g = { cat: s.muscleCategory, ex: [] }; groups.push(g); }
    let e = g.ex.find((x) => x.id === s.exerciseId);
    if (!e) { e = { id: s.exerciseId, name: s.exerciseName, sets: [] }; g.ex.push(e); }
    e.sets.push(s);
  }
  return groups;
}
function setLine(s) {
  return `<div class="set-line"><button class="row grow" data-a="editSet" data-id="${s.id}" style="text-align:left">
    <span class="n">Set ${s.setOrder}</span><span class="l">${esc(loadText(s) || '—')}</span><span>${esc(effortText(s))}</span></button>
    <button class="x" data-a="delSet" data-id="${s.id}" aria-label="Delete set">✕</button></div>`;
}
function setsHtml(wid, addButtons = true) {
  const sets = D.setsFor(wid);
  if (!sets.length) return empty('📝', 'No sets yet', 'Pick a muscle above, choose an exercise and record your first set.');
  return groupSets(sets).map((g) => `<div class="card"><h2 style="color:${CAT_COLOR[g.cat]}">${CAT_ICON[g.cat]} ${g.cat.toUpperCase()}</h2>
    ${g.ex.map((e) => `<div class="exhead"><span>${esc(e.name)}</span>${addButtons ? `<button class="plus" data-a="openEx" data-ex="${e.id}" data-cat="${g.cat}" data-wid="${wid}" aria-label="Add set">＋</button>` : ''}</div>${e.sets.map(setLine).join('')}`).join('')}</div>`).join('');
}
const catGrid = (wid) => `<div class="cats">${[...D.CATS, 'mix'].map((c) => `<button class="cat" style="background:linear-gradient(135deg,${CAT_COLOR[c]},${CAT_COLOR[c]}aa)" data-a="openCat" data-cat="${c}" data-wid="${wid}"><span class="ic">${CAT_ICON[c]}</span>${cap(c)}</button>`).join('')}</div>`;

// ---------- views ----------
const V = {};

V.home = () => {
  const act = D.activeWorkout(); const now = Date.now(); const DAY = 86400000;
  const todayW = D.workoutsNewestFirst().filter((w) => sod(w.startedAt) === sod(now));
  const g = D.db().goals; const wGoal = (g.find((x) => x.kind === 'workoutsPerWeek') || {}).target || 4; const sGoal = (g.find((x) => x.kind === 'steps') || {}).target || 10000;
  const d0 = new Date(sod(now)); const wkStart = sod(now) - ((d0.getDay() + 6) % 7) * DAY;
  const weekIv = { start: wkStart, end: wkStart + 7 * DAY };
  const wkCount = A.workoutCountIn(weekIv); const st = D.stepsToday();
  const trained = new Set(D.workoutsNewestFirst().map((w) => D.ymd(w.startedAt)));
  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => { const t = wkStart + i * DAY; const k = D.ymd(t); return `<div class="d ${trained.has(k) ? 'on' : ''} ${k === D.ymd(now) ? 'today' : ''}">${l}<i></i></div>`; }).join('');
  const bw = A.pointsIn(A.bodyWeightPoints(), 'month'); const bwAll = A.bodyWeightPoints(); const lastBw = bwAll[bwAll.length - 1];
  const wAvg = (a, b) => { const p = bwAll.filter((x) => x.t >= a && x.t < b); return p.length ? p.reduce((s, x) => s + x.v, 0) / p.length : null; };
  const avgNow = wAvg(sod(now) - 6 * DAY, sod(now) + DAY); const avgPrev = wAvg(sod(now) - 13 * DAY, sod(now) - 6 * DAY);
  const bwDiff = avgNow != null && avgPrev != null ? avgNow - avgPrev : null; const stAvg = A.avgSteps('week'); const wkVol = A.totalVolume('week');
  const wks = A.buckets('quarter').slice(-8).map((b) => ({ t: b.start, v: A.volumeIn(b) }));
  const thisV = wks[wks.length - 1].v; const prevV = wks[wks.length - 2].v; const pct = prevV > 0 ? Math.round((thisV - prevV) / prevV * 100) : null;
  const counts = {}; A.setsIn(A.interval('week')).forEach((s) => { const c = s.muscleCategory === 'mix' ? (s.muscleCategories[0] || 'mix') : s.muscleCategory; counts[c] = (counts[c] || 0) + 1; });
  const maxC = Math.max(1, ...Object.values(counts));
  const pbs = A.pbCountIn(A.interval('month')); const flags = A.plateaus(D.db().profile.plateauWeeks).length;
  const last = D.workoutsNewestFirst().filter((w) => w.finishedAt)[0];
  return {
    title: longDay(now), html: `
    <button class="btn" data-a="startWorkout" style="font-size:22px;padding:20px">▶ ${act ? 'Resume Workout' : 'Start Workout'}</button>
    <div class="small muted center" style="margin:6px 0 12px">${act ? `In progress · ${D.setsFor(act.id).length} sets` : `${wkCount} workout${wkCount === 1 ? '' : 's'} this week · ${vol(wkVol)}`}</div>
    <div class="card"><div class="week">${week}</div></div>
    <div class="glance">
      <button data-a="tab" data-v="progress">${ring(wkCount / wGoal, { text: wkCount })}<div class="cap">Workouts / ${wGoal}</div></button>
      <button data-a="stepsEntry">${ring((stAvg || 0) / sGoal, { color: 'var(--green)', text: stAvg != null ? (stAvg >= 1000 ? Math.round(stAvg / 100) / 10 + 'k' : Math.round(stAvg)) : '+' })}<div class="cap">Steps · 7-day avg</div></button>
      <button data-a="weightEntry">${sparkline(bw, { color: 'var(--blue)', height: 46 })}<div class="big">${avgNow != null ? num(Math.round(avgNow * 10) / 10) : lastBw ? num(lastBw.v) : '+'}</div><div class="cap">kg · 7-day avg ${bwDiff != null ? (bwDiff > 0 ? '↑' : bwDiff < 0 ? '↓' : '=') + ' ' + num(Math.round(Math.abs(bwDiff) * 10) / 10) : ''}</div></button>
    </div>
    <button class="card" style="width:100%;text-align:left" data-a="tab" data-v="progress"><div class="row between"><b>Volume · 8 weeks</b><b class="${pct == null ? 'muted' : pct >= 0 ? 'up' : 'down'}">${pct == null ? '' : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '%'}</b></div>${miniBars(wks, { height: 64 })}</button>
    <div class="card"><div class="row between" style="margin-bottom:4px"><b>Muscles · 7 days</b><span class="small muted">sets</span></div>
      ${D.CATS.map((c) => `<div class="mrow"><span class="nm">${cap(c)}</span><span class="trk"><i style="width:${(counts[c] || 0) / maxC * 100}%;background:${CAT_COLOR[c]}"></i></span><span class="ct">${counts[c] || 0}</span></div>`).join('')}</div>
    <div class="pills"><button data-a="go" data-v="bests" style="text-align:center">🏆 ${pbs}<div class="small muted" style="font-weight:400">records · 30d</div></button>
      <button data-a="go" data-v="plateau" style="text-align:center">⚠️ ${flags}<div class="small muted" style="font-weight:400">plateaus</div></button></div>
    <div class="card">${last ? `<div class="list">${workoutRow(last)}</div>` : '<div class="muted">Finished workouts appear here.</div>'}<button class="link" style="margin-top:6px" data-a="go" data-v="history">All history ›</button></div>`,
  };
};
V.workout = () => {
  const act = D.activeWorkout();
  if (!act) {
    const plans = D.db().plans;
    return {
      title: 'Workout', html: `<button class="btn" data-a="startWorkout">▶ Start Workout</button>
      ${U.lastFinished && D.workout(U.lastFinished) ? `<div class="card" style="margin-top:12px"><button class="link" data-a="openWorkout" data-id="${U.lastFinished}">✅ Workout saved — view details</button></div>` : ''}
      ${plans.length ? `<h2 class="sec">Start from a plan</h2><div class="card list">${plans.map((p) => `<button class="item" data-a="startPlan" data-id="${p.id}"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${p.exerciseIds.length} exercises</div></div><span class="link">▶</span></button>`).join('')}</div>` : ''}`,
    };
  }
  const sets = D.setsFor(act.id); const plan = act.planId ? D.plan(act.planId) : null;
  const done = new Set(sets.map((s) => s.exerciseId));
  const recents = D.recentExerciseIds(6);
  return {
    title: 'Workout', right: '<button class="hbtn" data-a="discard">Discard</button>',
    bottom: `<button class="btn ${sets.length ? 'green' : 'gray'}" data-a="finish">🏁 ${sets.length ? 'Finish Workout' : 'Cancel Workout'}</button>`,
    html: `<div class="card"><h2>Today's workout</h2><div class="grid3 center">
      <div><div style="font-size:20px;font-weight:700">${sets.length}</div><div class="small muted">Sets</div></div>
      <div><div style="font-size:20px;font-weight:700">${new Set(sets.map((s) => s.exerciseId)).size}</div><div class="small muted">Exercises</div></div>
      <div><div style="font-size:20px;font-weight:700">${vol(A.workoutVolume(act.id))}</div><div class="small muted">Volume</div></div></div></div>
      <h2 class="sec">Choose muscle</h2>${catGrid(act.id)}
      <button class="card row between" style="width:100%" data-a="openCat" data-cat="" data-wid="${act.id}"><span>🔍 Search all exercises</span>${chev}</button>
      ${plan ? `<div class="card"><h2>Plan: ${esc(plan.name)}</h2><div class="list">${plan.exerciseIds.map((id) => { const e = D.exercise(id); return e ? `<button class="item" data-a="openEx" data-ex="${id}" data-cat="${e.cats[0]}" data-wid="${act.id}"><span>${done.has(id) ? '✅' : '⚪️'}</span><span class="grow">${esc(e.name)}</span>${chev}</button>` : ''; }).join('')}</div></div>` : ''}
      ${recents.length ? `<div class="card"><h2>Recent exercises</h2><div class="chips">${recents.map((id) => { const e = D.exercise(id); return `<button class="chip" data-a="openEx" data-ex="${id}" data-cat="${e.cats[0]}" data-wid="${act.id}">${esc(e.name)}</button>`; }).join('')}</div></div>` : ''}
      ${setsHtml(act.id)}`,
  };
};

V.addset = (p) => ({ title: 'Add set', html: catGrid(p.wid) + `<button class="card row between" style="width:100%" data-a="openCat" data-cat="" data-wid="${p.wid}"><span>🔍 Search all exercises</span>${chev}</button>` });

function exResults(p, q) {
  let list = p.cat && p.cat !== 'mix' ? D.exercisesIn(p.cat) : D.activeExercises();
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  if (!list.length) return empty('🔍', 'No exercises found', 'Add a custom exercise with the ＋ button.');
  return `<div class="card list">${list.map((e) => `<button class="item" data-a="openEx" data-ex="${e.id}" data-cat="${p.cat || e.cats[0]}" data-wid="${p.wid}">${thumb(e)}<div class="grow"><b>${esc(e.name)}</b><div class="small muted">${cap(e.equip)} ${e.cats.map(badge).join(' ')}</div></div>${chev}</button>`).join('')}</div>`;
}
V.exlist = (p) => ({
  title: p.cat ? cap(p.cat) : 'All exercises', right: `<button class="hbtn" data-a="newExercise" data-cat="${p.cat || ''}">＋ New</button>`,
  html: `<div class="field"><input class="text" data-live="exlist" placeholder="Search exercises" value="${esc(U.q)}"></div><div id="results">${exResults(p, U.q)}</div>`,
});

// ----- set entry -----
function machineOptions(ex) {
  const list = [...ex.machine].sort((a, b) => a.setting - b.setting || a.weight - b.weight);
  const x = U.form.extra;
  if (x && !list.some((m) => m.setting === x.setting && Math.abs(m.weight - x.weight) < 1e-4)) list.push(x);
  return list;
}
function initSetForm(mode, ex, cat, wid, setId) {
  const src = setId ? D.setById(setId) : D.lastSet(ex.id);
  const f = { mode, exId: ex.id, cat, wid, setId, sel: null, extra: null, weight: ex.wMin, reps: 10, minutes: 10 };
  if (ex.weightBehavior === 'machine') {
    if (src && src.machineSetting != null) {
      const m = ex.machine.find((x) => x.setting === src.machineSetting && Math.abs(x.weight - src.weight) < 1e-4);
      f.sel = m ? { setting: m.setting, weight: m.weight } : { setting: src.machineSetting, weight: src.weight };
      if (!m) f.extra = { ...f.sel };
    } else if (ex.machine.length) { const m = [...ex.machine].sort((a, b) => a.setting - b.setting)[0]; f.sel = { setting: m.setting, weight: m.weight }; }
  }
  if (ex.weightBehavior === 'free' && src) f.weight = src.weight;
  if (src && src.reps != null) f.reps = src.reps;
  if (src && src.durationSeconds != null) f.minutes = src.durationSeconds / 60;
  U.form = f;
}
V.set = () => {
  const f = U.form; const ex = D.exercise(f.exId);
  if (!ex) return { title: 'Set', html: empty('⚠️', 'Exercise not found') };
  const edit = f.mode === 'edit';
  const recorded = f.wid ? D.setsFor(f.wid).filter((s) => s.exerciseId === ex.id) : [];
  const n = edit ? D.setById(f.setId).setOrder : recorded.length + 1;
  const wheels = [];
  const near = (arr, v) => { let b = 0; arr.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(arr[b] - v)) b = i; }); return b; };
  if (ex.weightBehavior === 'machine') {
    const opts = machineOptions(ex);
    let idx = f.sel ? opts.findIndex((m) => m.setting === f.sel.setting && Math.abs(m.weight - f.sel.weight) < 1e-4) : 0; if (idx < 0) idx = 0;
    wheels.push(wheel('machine', opts.map((m) => ({ s: m.setting, w: m.weight, t: m.setting + ' / ' + num(m.weight) + ' kg' })), idx, 'Setting / weight', 'wide',
      '<button class="link small" data-a="customMachine">＋ Other</button> · <button class="link small" data-a="editMachine">Edit list</button>'));
  } else if (ex.weightBehavior === 'free') {
    const step = ex.wStep > 0 ? ex.wStep : 2.5; const vals = [];
    for (let v = ex.wMin; v <= ex.wMax + 1e-9 && vals.length < 400; v += step) vals.push(r2(v));
    if (f.weight > 0 && !vals.some((v) => Math.abs(v - f.weight) < 1e-4)) { vals.push(f.weight); vals.sort((a, b) => a - b); }
    wheels.push(wheel('weight', vals.map((v) => ({ v, t: num(v) })), near(vals, f.weight), (ex.mult > 1 ? 'Weight (kg) per dumbbell' : 'Weight (kg)'), '', '<button class="link small" data-a="typeVal" data-k="weight">✎ Type value</button>'));
  }
  if (ex.repBehavior === 'reps') {
    const vals = Array.from({ length: 60 }, (_, i) => i + 1); const cur = Math.round(f.reps);
    if (!vals.includes(cur) && cur > 0) { vals.push(cur); vals.sort((a, b) => a - b); }
    wheels.push(wheel('reps', vals.map((v) => ({ v, t: String(v) })), near(vals, cur), 'Reps', '', '<button class="link small" data-a="typeVal" data-k="reps">✎ Type value</button>'));
  } else {
    const vals = Array.from({ length: 120 }, (_, i) => i + 1);
    if (f.minutes > 0 && !vals.some((v) => Math.abs(v - f.minutes) < 1e-4)) { vals.push(f.minutes); vals.sort((a, b) => a - b); }
    wheels.push(wheel('minutes', vals.map((v) => ({ v, t: num(v) })), near(vals, f.minutes), 'Minutes', '', '<button class="link small" data-a="typeVal" data-k="minutes">✎ Type value</button>'));
  }
  const out = ex.weightBehavior === 'free' && f.weight > 0 && (f.weight > ex.wMax || f.weight < ex.wMin);
  const c0 = CAT_COLOR[ex.cats[0]] || '#888';
  const heroImg = ex.image ? `<div class="hero-img" style="background-image:url('${esc(ex.image)}')"></div>`
    : `<div class="hero-img" style="background:linear-gradient(135deg,${c0},${c0}88)"><span class="hero-emoji">${EQ_ICON[ex.equip] || ''}</span><div class="img-over" style="background-image:url('images/${esc(ex.id)}.jpg')"></div></div>`;
  return {
    title: edit ? 'Edit set' : ex.name,
    bottom: `<div class="row" style="gap:10px">${edit ? '' : '<button class="btn ghost" style="flex:1;width:auto;font-size:16px" data-a="finishEx">✓ Finish exercise</button>'}<button class="btn" style="flex:1.5;width:auto" data-a="saveSet" ${valid(ex) ? '' : 'disabled'}>OK — ${edit ? 'Update' : 'Save'} Set ${n}</button></div>`,
    html: `<div class="hero">${heroImg}<span class="pill hero-pill">Set ${n}</span><div class="hero-bot"><div class="hero-name">${esc(ex.name)}</div><div>${badge(f.cat)} <span class="hero-eq">${cap(ex.equip)}</span></div></div></div>
      <div class="card wheels">${wheels.join('')}</div>
      ${ex.mult > 1 ? '<div class="small muted" style="margin:-4px 4px 10px">Weight is per dumbbell — volume counts both dumbbells (×2).</div>' : ''}
      ${out ? `<div class="warn" style="margin:-4px 4px 10px">Outside the usual range for this exercise (${num(ex.wMin)}–${num(ex.wMax)} kg). You can still save it.</div>` : ''}
      ${!edit && recorded.length ? `<div class="card"><h2>Recorded in this workout</h2>${recorded.map(setLine).join('')}</div>` : ''}`,
  };
};
function wheel(key, items, idx, label, cls, foot) {
  return `<div class="wcol ${cls}"><div class="lbl center">${label}</div><div class="wheelwrap"><div class="wheel" data-key="${key}" data-idx="${idx}">${items.map((it, i) => `<div class="wi ${i === idx ? 'on' : ''}" data-a="wheelTo" data-i="${i}" data-v="${it.v ?? ''}" data-s="${it.s ?? ''}" data-w="${it.w ?? ''}">${it.t}</div>`).join('')}</div></div><div class="center wfoot">${foot}</div></div>`;
}
const ITEM = 38;
function initWheels() {
  document.querySelectorAll('.wheel').forEach((w) => {
    w.scrollTop = (+w.dataset.idx) * ITEM;
    let raf = 0;
    w.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const i = Math.max(0, Math.min(w.children.length - 1, Math.round(w.scrollTop / ITEM)));
        if (i === +w.dataset.idx) return;
        w.dataset.idx = i;
        [...w.children].forEach((c, j) => c.classList.toggle('on', j === i));
        const it = w.children[i]; const k = w.dataset.key;
        if (k === 'machine') U.form.sel = { setting: +it.dataset.s, weight: +it.dataset.w }; else U.form[k] = +it.dataset.v;
      });
    }, { passive: true });
  });
}
function valid(ex) {
  const f = U.form;
  if (ex.weightBehavior === 'machine' && !f.sel) return false;
  if (ex.weightBehavior === 'free' && !(f.weight > 0)) return false;
  return ex.repBehavior === 'reps' ? Math.round(f.reps) >= 1 : f.minutes > 0;
}

// ----- history -----
V.history = () => {
  const cal = new Date(U.calMonth); const y = cal.getFullYear(); const m = cal.getMonth();
  const days = new Date(y, m + 1, 0).getDate(); const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const workoutDays = new Set(D.workoutsNewestFirst().map((w) => D.ymd(w.startedAt)));
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const key = D.ymd(new Date(y, m, d).getTime());
    cells += `<button class="${key === D.ymd(Date.now()) ? 'today' : ''} ${U.calDay === key ? 'sel' : ''}" data-a="calDay" data-v="${key}">${d}${workoutDays.has(key) ? '<span class="dot"></span>' : '<span style="height:8px"></span>'}</button>`;
  }
  const all = D.workoutsNewestFirst();
  const list = U.calDay ? all.filter((w) => D.ymd(w.startedAt) === U.calDay)
    : all.filter((w) => { const d = new Date(w.startedAt); return d.getFullYear() === y && d.getMonth() === m; });
  return {
    title: 'History', html: `<div class="card"><div class="row between"><button class="hbtn" data-a="calShift" data-v="-1">‹</button><b>${monthName(U.calMonth)}</b><button class="hbtn" data-a="calShift" data-v="1">›</button></div><div class="cal" style="margin-top:8px">${cells}</div></div>
      <div class="row between"><h2 class="sec">${U.calDay ? dstr(U.calDay) : monthName(U.calMonth)}</h2>${U.calDay ? '<button class="link small" data-a="calDay" data-v="">Show month</button>' : ''}</div>
      <div class="card list">${list.length ? list.map(workoutRow).join('') : `<div class="muted">${U.calDay ? 'No workouts on this day' : 'No workouts this month'}</div>`}</div>`,
  };
};

V.wdetail = (p) => {
  const w = D.workout(p.id);
  if (!w) return { title: 'Workout', html: empty('❓', 'Workout not found') };
  const sets = D.setsFor(w.id);
  const exVol = groupSets(sets).flatMap((g) => g.ex).map((e) => `<div class="row between" style="padding:4px 0"><span>${esc(e.name)}</span><span class="muted">${vol(e.sets.reduce((t, s) => t + setVolume(s), 0))}</span></div>`).join('');
  return {
    title: 'Workout', right: '<button class="hbtn" data-a="addSetTo" data-id="' + w.id + '">＋ Set</button>',
    html: `<div class="card"><div class="muted small">${longDay(w.startedAt)} · ${fmtTime(w.startedAt)}</div><div class="grid3 center" style="margin-top:8px">
      <div><b style="font-size:20px">${sets.length}</b><div class="small muted">Sets</div></div><div><b style="font-size:20px">${new Set(sets.map((s) => s.exerciseId)).size}</b><div class="small muted">Exercises</div></div>
      <div><b style="font-size:20px">${vol(A.workoutVolume(w.id))}</b><div class="small muted">Volume</div></div></div></div>
      ${setsHtml(w.id)}${sets.length ? `<div class="card"><h2>Exercise volume</h2>${exVol}</div>` : ''}
      <button class="btn red small" data-a="delWorkout" data-id="${w.id}">Delete workout</button>`,
  };
};

// ----- plans -----
V.plans = () => ({
  title: 'Plans', right: '<button class="hbtn" data-a="newPlan">＋ New</button>',
  html: D.db().plans.length ? `<div class="card list">${D.db().plans.map((p) => {
    const cats = []; p.exerciseIds.forEach((id) => (D.exercise(id)?.cats || []).forEach((c) => { if (!cats.includes(c)) cats.push(c); }));
    return `<button class="item" data-a="go" data-v="plan" data-id="${p.id}"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${p.exerciseIds.length} exercises</div><div>${cats.map(badge).join(' ')}</div></div>${chev}</button>`;
  }).join('')}</div>` : empty('📋', 'No plans yet', 'Create routines like Push / Pull / Legs. Plans are templates — they never appear in your history.'),
});
V.plan = (p) => {
  const pl = D.plan(p.id);
  if (!pl) return { title: 'Plan', html: empty('❓', 'Plan not found') };
  return {
    title: pl.name, right: `<button class="hbtn" data-a="delPlan" data-id="${pl.id}">Delete</button>`,
    html: `<div class="field"><input class="text" data-plan-name value="${esc(pl.name)}" placeholder="Plan name"></div>
      <div class="card"><h2>Exercises (in order)</h2>${pl.exerciseIds.length ? pl.exerciseIds.map((id, i) => { const e = D.exercise(id); return `<div class="set-line"><span class="grow">${e ? esc(e.name) : 'Removed exercise'}</span>
        <button class="hbtn" data-a="planMove" data-id="${pl.id}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button><button class="hbtn" data-a="planMove" data-id="${pl.id}" data-i="${i}" data-d="1" ${i === pl.exerciseIds.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button>
        <button class="x" data-a="planRemove" data-id="${pl.id}" data-i="${i}">✕</button></div>`; }).join('') : '<div class="muted">No exercises yet</div>'}
        <button class="btn ghost small" style="margin-top:10px" data-a="planAdd" data-id="${pl.id}">＋ Add exercises</button></div>
      <button class="btn small" data-a="planStart" data-id="${pl.id}" ${pl.exerciseIds.length ? '' : 'disabled'}>▶ Start workout with this plan</button>
      <div class="small muted" style="margin-top:8px">The plan is only a shortcut list during a workout. Only the sets you actually record are saved to history.</div>`,
  };
};

// ----- exercise library & editor -----
function libResults(q) {
  let list = U.filter ? D.exercisesIn(U.filter) : D.activeExercises();
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return `<div class="card list">${list.map((e) => `<button class="item" data-a="editExercise" data-ex="${e.id}">${thumb(e)}<div class="grow"><b>${esc(e.name)}</b><div class="small muted">${cap(e.equip)} ${e.cats.map(badge).join(' ')}</div></div>${chev}</button>`).join('') || '<div class="muted">No exercises</div>'}</div>`;
}
V.library = () => ({
  title: 'Exercise library', right: '<button class="hbtn" data-a="newExercise" data-cat="">＋ New</button>',
  html: `<div class="chips" style="margin-bottom:8px"><button class="chip ${U.filter ? '' : 'sel'}" data-a="libFilter" data-v="">All</button>${D.CATS.map((c) => `<button class="chip ${U.filter === c ? 'sel' : ''}" data-a="libFilter" data-v="${c}">${cap(c)}</button>`).join('')}</div>
    <div class="field"><input class="text" data-live="library" placeholder="Search exercises" value="${esc(U.q)}"></div><div id="results">${libResults(U.q)}</div>`,
});
function machineEditor(list, src) {
  return `${list.map((m, i) => `<div class="ms-row"><span class="muted small">Setting</span><input inputmode="numeric" style="max-width:70px" value="${m.setting}" data-ms="setting" data-i="${i}" data-src="${src}"><span>/</span><input inputmode="decimal" style="max-width:90px" value="${num(m.weight)}" data-ms="weight" data-i="${i}" data-src="${src}"><span class="muted small">kg</span><button class="x" data-a="msDel" data-i="${i}" data-src="${src}">✕</button></div>`).join('')}
    <div class="row"><button class="btn ghost small" data-a="msAdd" data-src="${src}">＋ Add setting</button></div>
    <hr class="sp"><div class="lbl">Generate a list</div><div class="row"><span class="small muted">Count</span><input class="text" inputmode="numeric" style="width:70px" value="15" id="genN"><span class="small muted">× kg each</span><input class="text" inputmode="decimal" style="width:80px" value="5" id="genKg"><button class="btn ghost small" style="width:auto;padding:10px 14px" data-a="msGen" data-src="${src}">Replace</button></div>
    <div class="small muted" style="margin-top:6px">Setting is the pin/plate index on the machine; weight is the actual load. They are stored separately.</div>`;
}
const msList = (src) => (src === 'draft' ? U.form.draft.machine : D.exercise(U.form.exId).machine);
V.machine = () => ({ title: 'Machine settings', html: `<div class="card">${machineEditor(D.exercise(U.form.exId).machine, 'ex')}</div>` });

function blankExercise(cat) {
  return { id: D.newCustomId(), name: '', cats: cat ? [cat] : [], equip: 'machine', weightBehavior: 'machine', repBehavior: 'reps', info: '', image: null, machine: D.defaultStack(), wMin: 5, wMax: 100, wStep: 2.5, mult: 1, custom: true, archived: false };
}
V.exedit = (p) => {
  const e = U.form.draft; const isNew = !p.existing;
  return {
    title: isNew ? 'New exercise' : 'Edit exercise', hideTabs: true,
    right: '<button class="hbtn" data-a="saveExercise">Save</button>',
    html: `<div class="card"><label class="lbl">Name</label><input class="text" data-bind="name" data-type="text" data-src="draft" value="${esc(e.name)}" placeholder="Exercise name"></div>
      <div class="card"><label class="lbl">Muscle categories</label><div class="chips wrap">${D.CATS.map((c) => `<button class="chip ${e.cats.includes(c) ? 'sel' : ''}" data-a="togCat" data-v="${c}">${cap(c)}</button>`).join('')}</div></div>
      <div class="card"><div class="field"><label class="lbl">Equipment</label><select class="text" data-change="equip">${D.EQUIP.map((q) => `<option value="${q}" ${e.equip === q ? 'selected' : ''}>${cap(q)}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl">Weight</label><select class="text" data-change="wb"><option value="machine" ${e.weightBehavior === 'machine' ? 'selected' : ''}>Machine settings</option><option value="free" ${e.weightBehavior === 'free' ? 'selected' : ''}>Free weight</option><option value="none" ${e.weightBehavior === 'none' ? 'selected' : ''}>No weight</option></select></div>
        <div><label class="lbl">Count</label><select class="text" data-change="rb"><option value="reps" ${e.repBehavior === 'reps' ? 'selected' : ''}>Reps</option><option value="duration" ${e.repBehavior === 'duration' ? 'selected' : ''}>Duration</option></select></div>${e.weightBehavior === 'free' ? `<div style="margin-top:12px"><label class="lbl">Dumbbells / weights used at once</label><select class="text" data-change="mult"><option value="1" ${(e.mult || 1) === 1 ? 'selected' : ''}>1 (volume = weight × reps)</option><option value="2" ${e.mult === 2 ? 'selected' : ''}>2 (volume = 2 × weight × reps)</option></select></div>` : ''}</div>
      ${e.weightBehavior === 'free' ? `<div class="card"><label class="lbl">Practical weight range (kg) — you can always type outside it</label><div class="row"><input class="text" inputmode="decimal" data-bind="wMin" data-src="draft" value="${num(e.wMin)}"><span>to</span><input class="text" inputmode="decimal" data-bind="wMax" data-src="draft" value="${num(e.wMax)}"><span>step</span><input class="text" inputmode="decimal" data-bind="wStep" data-src="draft" value="${num(e.wStep)}"></div></div>` : ''}
      ${e.weightBehavior === 'machine' ? `<div class="card"><h2>Machine settings (${e.machine.length})</h2>${machineEditor(e.machine, 'draft')}</div>` : ''}
      <div class="card"><label class="lbl">Picture</label><div class="row">${thumb(e, 'lg')}<div class="grow"><input type="file" accept="image/*" id="photo" data-change="photo">${e.image ? '<button class="link small" data-a="rmPhoto" style="margin-top:6px">Remove photo</button>' : ''}</div></div></div>
      <div class="card"><label class="lbl">Instructions / info</label><textarea class="text" rows="3" data-bind="info" data-type="text" data-src="draft">${esc(e.info)}</textarea></div>
      ${isNew ? '' : '<button class="btn red small" data-a="delExercise">Delete exercise</button><div class="small muted" style="margin-top:6px">Exercises with recorded sets are hidden instead of erased, so history and graphs stay intact.</div>'}`,
  };
};

// ----- progress -----
V.progress = () => {
  const p = U.period; const bw = A.bodyWeightPoints(); const t = A.trend(bw, p); const wt = A.trend(A.measurementPoints('waist'), p);
  const flags = A.plateaus(D.db().profile.plateauWeeks).length; const bc = PERIOD_INFO[p].bucket;
  const stat = (t, v, s) => `<div class="grow"><div class="small muted">${t}</div><div style="font-size:18px;font-weight:700">${v}</div>${s ? `<div class="small muted">${s}</div>` : ''}</div>`;
  const link = (icon, t, a, extra = '') => `<button class="item" data-a="go" data-v="${a}"><span style="width:28px">${icon}</span><span class="grow">${t}${extra}</span>${chev}</button>`;
  return {
    title: 'Progress', html: `${periodSeg()}
    <button class="card" style="width:100%;text-align:left" data-a="go" data-v="exprog"><div class="row between"><h2>💪 Strength</h2>${chev}</div><div class="row">${stat('Total volume', vol(A.totalVolume(p)))}${stat('New records', A.pbCountIn(A.interval(p)))}${stat('Sets', A.setCount(p))}</div>${barChart(A.volumeSeries(p), { height: 110 })}</button>
    <button class="card" style="width:100%;text-align:left" data-a="go" data-v="weight"><div class="row between"><h2>⚖️ Body</h2>${chev}</div><div class="row">${stat('Weight', t.current != null ? kg(t.current) : '—', t.windowChange != null ? signed(t.windowChange, 'kg') : '')}${stat('Waist', wt.current != null ? num(wt.current) + ' cm' : '—', wt.windowChange != null ? signed(wt.windowChange, 'cm') : '')}</div>${lineChart(A.pointsIn(bw, p), { height: 120 })}</button>
    <button class="card" style="width:100%;text-align:left" data-a="go" data-v="steps"><div class="row between"><h2>👟 Activity</h2>${chev}</div><div class="row">${stat('Avg steps / day', A.avgSteps(p) != null ? big(A.avgSteps(p)) : '—')}${stat('Workouts', A.workoutCount(p))}</div>${barChart(A.pointsIn(A.stepPoints(), p), { color: 'var(--green)', height: 110 })}</button>
    <button class="card" style="width:100%;text-align:left" data-a="go" data-v="consistency"><div class="row between"><h2>📅 Consistency</h2>${chev}</div><div class="row">${stat('Per week', num(Math.round(A.avgWorkoutsPerWeek(p) * 10) / 10))}${stat('Since last workout', A.daysSinceLastWorkout() == null ? '—' : A.daysSinceLastWorkout() === 0 ? 'Today' : A.daysSinceLastWorkout() + ' d')}</div>${barChart(A.workoutCountSeries(p), { color: 'var(--blue)', height: 100 })}</button>
    <div class="card list">${link('📊', 'Exercise progress', 'exprog')}${link('🧍', 'Muscle progress', 'muscles')}${link('🏆', 'Personal bests', 'bests')}${link('⚖️', 'Body weight', 'weight')}${link('📏', 'Body measurements', 'measures')}${link('👟', 'Steps', 'steps')}${link('📅', 'Workout consistency', 'consistency')}${link('🎯', 'Goals', 'goals')}${link('⚠️', 'Plateau detection', 'plateau', flags ? ` (${flags})` : '')}${link('🕘', 'Workout history', 'history')}${link('📄', 'Report (PDF)', 'report')}</div>`,
  };
};

function exprogResults(q) {
  const ids = A.exercisesWithHistory().filter((id) => !q || (D.exercise(id)?.name || '').toLowerCase().includes(q.toLowerCase()));
  if (!ids.length) return empty('📊', 'No exercise history yet', 'Record sets in a workout to see progress here.');
  return `<div class="card list">${ids.map((id) => { const b = A.bests(id); return `<button class="item" data-a="go" data-v="exdetail" data-id="${id}"><div class="grow"><b>${esc(b.name)}</b><div class="small muted">${b.bestWeight ? 'Best ' + esc(b.bestWeight.detail) + ' · ' : ''}${A.sessions(id).length} sessions</div></div>${chev}</button>`; }).join('')}</div>`;
}
V.exprog = () => ({ title: 'Exercise progress', html: `<div class="field"><input class="text" data-live="exprog" placeholder="Search exercises" value="${esc(U.q)}"></div><div id="results">${exprogResults(U.q)}</div>` });

V.exdetail = (p) => {
  const metric = p.metric || 'weight'; const b = A.bests(p.id); const series = A.exerciseSeries(p.id, metric, U.period);
  const sessions = A.sessions(p.id).reverse(); const flag = A.plateaus(D.db().profile.plateauWeeks).find((f) => f.exerciseId === p.id);
  const f = series[0], l = series[series.length - 1];
  return {
    title: b.name, html: `${periodSeg()}${seg(['weight', 'reps', 'volume', 'sets'].map((m) => [m, cap(m)]), metric, 'metric')}
    <div class="card"><h2>${cap(metric)} over time</h2>${metric === 'volume' || metric === 'sets' ? barChart(series, { height: 150 }) : lineChart(series)}${series.length > 1 ? `<div class="small muted">${num(f.v)} → ${num(l.v)} (${signed(l.v - f.v, '')})</div>` : ''}</div>
    ${flag ? `<div class="card"><b>ℹ️ ${esc(flag.message)}</b><div class="small muted">${esc(flag.reason)}</div></div>` : ''}
    <div class="grid2">${tile('Best weight', esc(b.bestWeight?.detail || '—'), b.bestWeight ? fmtDay(b.bestWeight.date) : '')}${tile('Best reps', b.bestReps ? b.bestReps.value : '—', b.bestReps ? fmtDay(b.bestReps.date) : '')}
      ${tile('Best set volume', b.bestSetVolume ? vol(b.bestSetVolume.value) : '—', b.bestSetVolume ? fmtDay(b.bestSetVolume.date) : '')}${tile('Best session volume', b.bestSessionVolume ? vol(b.bestSessionVolume.value) : '—', b.bestSessionVolume ? fmtDay(b.bestSessionVolume.date) : '')}</div>
    <div class="card"><h2>Personal best history</h2>${b.history.slice(0, 12).map((e) => `<div class="row between small" style="padding:3px 0"><span class="muted" style="width:90px">${fmtDay(e.date)}</span><b>${e.kind}</b><span>${esc(e.text)}</span></div>`).join('') || '<div class="muted">No records yet</div>'}</div>
    <div class="card"><h2>Sessions & sets</h2>${sessions.slice(0, 15).map((s) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row between"><b class="small">${fmtDay(s.date)}</b><span class="small muted">${vol(s.volume)}</span></div>${s.sets.map((x) => `<div class="small muted">Set ${x.setOrder} — ${esc(loadText(x) || '')} ${x.reps != null ? '× ' + x.reps : effortText(x)}</div>`).join('')}</div>`).join('')}</div>`,
  };
};

V.muscles = () => ({
  title: 'Muscle progress', html: `${periodSeg()}<div class="card list">${D.CATS.map((c) => `<button class="item" data-a="go" data-v="muscle" data-id="${c}"><span style="width:28px">${CAT_ICON[c]}</span><b class="grow">${cap(c)}</b><span class="muted">${vol(A.muscleVolumeSeries(c, U.period).reduce((t, x) => t + x.v, 0))}</span>${chev}</button>`).join('')}</div>`,
});
V.muscle = (p) => {
  const list = A.muscleExercises(p.id, U.period);
  return {
    title: cap(p.id), html: `${periodSeg()}<div class="card"><h2>${cap(p.id)} volume</h2>${barChart(A.muscleVolumeSeries(p.id, U.period), { color: CAT_COLOR[p.id] })}</div>
    <div class="card"><h2>Exercises</h2>${list.map((e) => `<button class="item" data-a="go" data-v="exdetail" data-id="${e.exerciseId}"><div class="grow"><b>${esc(e.name)}</b><div class="small muted">${e.sessions} sessions · top weight ${num(e.firstWeight)} → ${num(e.lastWeight)} kg</div></div><span class="small muted">${vol(e.volume)}</span>${chev}</button>`).join('') || `<div class="muted">No ${p.id} sets in this period</div>`}</div>`,
  };
};

V.bests = () => {
  const all = A.allBests();
  return {
    title: 'Personal bests', html: all.length ? `<div class="card list">${all.map((b) => `<button class="item" data-a="go" data-v="exdetail" data-id="${b.exerciseId}"><div class="grow"><b>${esc(b.name)}</b><div class="small muted">Weight: ${esc(b.bestWeight?.detail || '—')} · Reps: ${b.bestReps ? b.bestReps.value : '—'}<br>Volume: set ${b.bestSetVolume ? vol(b.bestSetVolume.value) : '—'} · session ${b.bestSessionVolume ? vol(b.bestSessionVolume.value) : '—'}</div></div>${chev}</button>`).join('')}</div>` : empty('🏆', 'No records yet', 'Personal bests are calculated from your recorded sets.'),
  };
};
V.plateau = () => {
  const weeks = D.db().profile.plateauWeeks; const flags = A.plateaus(weeks);
  return {
    title: 'Plateau detection', html: `<div class="small muted" style="margin-bottom:10px">Informational only. An exercise is flagged when it has at least 3 sessions in the last ${weeks} weeks and none clearly beat the first one (heavier weight or more than 5% more work). Change the period in Profile.</div>
    ${flags.length ? `<div class="card list">${flags.map((f) => `<button class="item" data-a="go" data-v="exdetail" data-id="${f.exerciseId}"><div class="grow"><b>${esc(f.message)}</b><div class="small muted">${esc(f.reason)}</div></div>${chev}</button>`).join('')}</div>` : empty('✅', 'Nothing flagged', 'No exercises look stalled right now.')}`,
  };
};
V.consistency = () => {
  const p = U.period; const bc = PERIOD_INFO[p].bucket;
  return {
    title: 'Consistency', html: `${periodSeg()}<div class="grid2">${tile('Workouts', A.workoutCount(p))}${tile('Average / week', num(Math.round(A.avgWorkoutsPerWeek(p) * 10) / 10))}${tile('Sets', A.setCount(p))}${tile('Total volume', vol(A.totalVolume(p)))}</div>
    <div class="card"><h2>Workout frequency (per ${bc})</h2>${barChart(A.workoutCountSeries(p), { color: 'var(--blue)' })}</div><div class="card"><h2>Overall workout volume (per ${bc})</h2>${barChart(A.volumeSeries(p))}</div>
    <button class="card row between" style="width:100%" data-a="go" data-v="history"><span>🕘 Training history</span>${chev}</button>`,
  };
};

// generic metric screen (body weight / steps / one measurement)
function metricParams() { const c = view(); return c.v === 'weight' ? { kind: 'weight' } : c.v === 'steps' ? { kind: 'steps' } : { kind: 'meas', fid: c.p.id }; }
function metricCfg(p) {
  const d = D.db();
  if (p.kind === 'weight') return { title: 'Body weight', unit: 'kg', step: 0.1, dec: true, def: 70, bar: false, rows: d.bodyWeights.map((r) => ({ id: r.id, date: r.date, v: r.kg })), pts: A.bodyWeightPoints(), save: (v, dt) => D.setBodyWeight(v, dt), del: D.deleteBodyWeight };
  if (p.kind === 'steps') return { title: 'Steps', unit: 'steps', step: 500, dec: false, def: 8000, bar: true, rows: d.steps.map((r) => ({ id: r.id, date: r.date, v: r.steps })), pts: A.stepPoints(), save: (v, dt) => D.setSteps(Math.round(v), dt), del: D.deleteSteps };
  return { title: D.field(p.fid)?.name || 'Measurement', unit: 'cm', step: 0.5, dec: true, def: 80, bar: false, rows: d.measurements.filter((r) => r.fieldId === p.fid).map((r) => ({ id: r.id, date: r.date, v: r.cm })), pts: A.measurementPoints(p.fid), save: (v, dt) => D.setMeasurement(p.fid, v, dt), del: D.deleteMeasurement };
}
V.metric = (p) => {
  const c = metricCfg(p); const t = A.trend(c.pts, U.period); const win = A.pointsIn(c.pts, U.period);
  const avg = win.length ? win.reduce((s, x) => s + x.v, 0) / win.length : null;
  const rows = [...c.rows].sort((a, b) => b.date.localeCompare(a.date));
  const h = (a, b, s) => `<div class="grow"><div class="small muted">${a}</div><div style="font-weight:700">${b}</div>${s ? `<div class="small muted">${s}</div>` : ''}</div>`;
  return {
    title: c.title, right: `<button class="hbtn" data-a="metricAdd">＋ Add</button>`,
    html: `${periodSeg()}<div class="card"><div class="row">${h('Current', t.current != null ? num(t.current) + ' ' + c.unit : '—', t.currentT ? fmtDay(t.currentT) : '')}
      ${h('This period', t.windowChange != null ? signed(t.windowChange, c.unit) : '—', t.reference != null && t.current != null ? num(t.reference) + ' → ' + num(t.current) : '')}
      ${c.bar ? h('Average', avg != null ? big(avg) : '—', 'per day') : h('Since last', t.changeFromPrevious != null ? signed(t.changeFromPrevious, c.unit) : '—', '')}</div>
      ${c.bar ? barChart(win, { color: 'var(--green)' }) : lineChart(win)}</div>
    <h2 class="sec">History</h2><div class="card list">${rows.map((r) => `<div class="item"><button class="row grow between" data-a="metricEdit" data-id="${r.id}"><span>${dstr(r.date)}</span><b>${num(r.v)} ${c.unit}</b></button><button class="x" data-a="metricDel" data-id="${r.id}">✕</button></div>`).join('') || '<div class="muted">No entries yet</div>'}</div>`,
  };
};
V.weight = () => V.metric({ kind: 'weight' });
V.steps = () => V.metric({ kind: 'steps' });
V.measures = () => {
  const fields = [...D.db().fields].sort((a, b) => a.order - b.order);
  return {
    title: 'Measurements', right: '<button class="hbtn" data-a="newField">＋ New</button>',
    html: `${periodSeg()}<div class="card list">${fields.map((f) => { const t = A.trend(A.measurementPoints(f.id), U.period); return `<div class="item"><button class="row grow between" data-a="go" data-v="measure" data-id="${f.id}"><span>${esc(f.name)}</span><span style="text-align:right"><b>${t.current != null ? num(t.current) + ' cm' : '—'}</b>${t.windowChange != null && t.reference != null ? `<div class="small muted">${signed(t.windowChange, 'cm')}</div>` : ''}</span></button>${f.custom ? `<button class="x" data-a="delField" data-id="${f.id}">✕</button>` : ''}</div>`; }).join('')}</div>
    <div class="small muted">Every measurement is optional and tracked on its own.</div>`,
  };
};
V.measure = (p) => V.metric({ kind: 'meas', fid: p.id });

V.goals = () => {
  const goals = D.db().goals;
  return {
    title: 'Goals', right: '<button class="hbtn" data-a="newGoal">＋ New</button>',
    html: `<div class="small muted" style="margin-bottom:10px">Goals are optional. Add as many or as few as you like.</div>${goals.length ? goals.map((g) => { const r = A.goalProgress(g); return `<div class="card"><div class="row between"><b>${esc(r.title)}</b><span style="display:flex;gap:8px;align-items:center"><b style="color:var(--accent)">${Math.round(r.fraction * 100)}%</b><button class="x" data-a="delGoal" data-id="${g.id}">✕</button></span></div><div class="bar" style="margin:8px 0"><i style="width:${r.fraction * 100}%"></i></div><div class="small muted">Now ${esc(r.currentText)} → goal ${esc(r.targetText)}</div></div>`; }).join('') : empty('🎯', 'No goals', 'Tap ＋ New to add one, e.g. Bench Press 50 kg or Waist 80 cm.')}`,
  };
};

V.report = () => {
  const p = U.period; const bw = A.bodyWeightPoints(); const bests = A.allBests();
  return {
    title: 'Report', right: '<button class="hbtn" data-a="print">Print / PDF</button>',
    html: `${periodSeg()}<div class="card"><h2 style="font-size:20px">GIM Progress Report</h2><div class="small muted">${PERIOD_INFO[p].window} · generated ${fmtDay(Date.now())}</div>
    <div class="grid2" style="margin-top:10px">${tile('Workouts', A.workoutCount(p))}${tile('Sets', A.setCount(p))}${tile('Total volume', vol(A.totalVolume(p)))}${tile('Avg / week', num(Math.round(A.avgWorkoutsPerWeek(p) * 10) / 10))}</div></div>
    <div class="card"><h2>Workout volume</h2>${barChart(A.volumeSeries(p))}</div><div class="card"><h2>Workout frequency</h2>${barChart(A.workoutCountSeries(p), { color: 'var(--blue)' })}</div>
    <div class="card"><h2>Body weight${bw.length ? ' — now ' + kg(bw[bw.length - 1].v) : ''}</h2>${lineChart(A.pointsIn(bw, p))}</div>
    <div class="card"><h2>Steps${A.avgSteps(p) != null ? ' — avg ' + big(A.avgSteps(p)) + ' / day' : ''}</h2>${barChart(A.pointsIn(A.stepPoints(), p), { color: 'var(--green)' })}</div>
    <div class="card"><h2>Personal bests</h2>${bests.map((b) => `<div style="padding:5px 0;border-bottom:1px solid var(--line)"><b class="small">${esc(b.name)}</b><div class="small muted">Weight ${esc(b.bestWeight?.detail || '—')} · Reps ${b.bestReps ? b.bestReps.value : '—'} · Set vol ${b.bestSetVolume ? vol(b.bestSetVolume.value) : '—'} · Session vol ${b.bestSessionVolume ? vol(b.bestSessionVolume.value) : '—'}</div></div>`).join('') || '<div class="muted">No records yet</div>'}</div>`,
  };
};

// ----- profile & backup -----
V.profile = () => {
  const pr = D.db().profile; const lw = D.latestBodyWeight();
  return {
    title: 'Profile', html: `<div class="card"><div class="field"><label class="lbl">Name (optional)</label><input class="text" data-profile="name" value="${esc(pr.name)}"></div>
      <div class="field"><label class="lbl">Height (cm)</label><input class="text" inputmode="decimal" data-profile="heightCm" value="${pr.heightCm ?? ''}"></div>
      <button class="row between" style="width:100%" data-a="weightEntry"><span>Current body weight</span><b>${lw ? kg(lw.kg) : 'Add'}</b></button></div>
      <div class="card"><div class="field"><label class="lbl">Appearance</label><select class="text" data-change="theme">${['system', 'light', 'dark'].map((t) => `<option value="${t}" ${(localStorage.getItem('gim-theme') || 'system') === t ? 'selected' : ''}>${cap(t)}</option>`).join('')}</select></div>
      <div class="field"><label class="lbl">Plateau check period (weeks)</label>${'<select class="text" data-change="plateauWeeks">' + [2, 3, 4, 6, 8, 12].map((w) => `<option ${pr.plateauWeeks === w ? 'selected' : ''}>${w}</option>`).join('') + '</select>'}</div>
      <div class="row between small muted"><span>Weight unit</span><span>kg</span></div><div class="row between small muted"><span>Measurement unit</span><span>cm</span></div></div>
      <div class="card list"><button class="item" data-a="go" data-v="library"><span class="grow">Exercise library</span>${chev}</button><button class="item" data-a="go" data-v="measures"><span class="grow">Body measurements</span>${chev}</button><button class="item" data-a="go" data-v="goals"><span class="grow">Goals</span>${chev}</button><button class="item" data-a="go" data-v="history"><span class="grow">Workout history</span>${chev}</button><button class="item" data-a="go" data-v="backup"><span class="grow">Backup, restore & export</span>${chev}</button></div>
      <div class="center small muted" style="margin:14px 0">GIM version ${VERSION} · ${BUILD_DATE}</div>`,
  };
};
V.backup = () => {
  const d = D.db();
  return {
    title: 'Data', html: `<h2 class="sec">Google Drive</h2><div class="card"><button class="btn small blue" data-a="driveUpload">☁️ Daily Upload</button><div class="small muted" style="margin-top:8px">${localStorage.getItem('gim-drive-last') ? 'Last upload: ' + fmtDay(+localStorage.getItem('gim-drive-last')) + ' ' + fmtTime(+localStorage.getItem('gim-drive-last')) : 'Not uploaded yet'}. Saves one file, GIM-Backup.json, in your Google Drive (overwritten each time; Drive keeps old versions).</div></div>
      <h2 class="sec">Backup & restore</h2><div class="card"><button class="btn small" data-a="exportBackup">⬆️ Export backup file</button><div style="height:8px"></div>
      <label class="btn ghost small" for="importFile">⬇️ Restore from backup…</label><input type="file" id="importFile" accept=".json,application/json" data-change="import" style="display:none">
      <div class="small muted" style="margin-top:8px">A backup contains exercises (with your photos), plans, every workout and set, body data, steps, goals and settings. Restore is validated first and never silently deletes current data.</div>
      ${D.hasSafetyBackup() ? '<button class="link small" style="margin-top:10px" data-a="restoreSafety">Undo last "Replace" restore</button>' : ''}</div>
      <h2 class="sec">Excel / CSV</h2><div class="card"><button class="btn small" data-a="exportCSV">📊 Export CSV files</button><div class="small muted" style="margin-top:8px">One row per individual set (date, workout, exercise, set, machine setting, weight, reps, volume), plus body weight, measurements and steps. UTF-8 with BOM: opens directly in Excel.</div></div>
      <h2 class="sec">PDF report</h2><div class="card"><button class="btn small" data-a="go" data-v="report">📄 Open report</button><div class="small muted" style="margin-top:8px">Choose Print → Save as PDF (share sheet on iPhone).</div></div>
      <h2 class="sec">Stored on this device</h2><div class="card"><div class="row between"><span>Workouts</span><b>${d.workouts.length}</b></div><div class="row between"><span>Recorded sets</span><b>${d.sets.length}</b></div><div class="row between"><span>Exercises</span><b>${d.exercises.filter((e) => !e.archived).length}</b></div></div>`,
  };
};

// ---------- sheets ----------
function sheetHtml() {
  const s = U.sheet; if (!s) return '';
  let body = '';
  if (s.type === 'entry') {
    body = `<h3>${esc(s.title)}</h3><div class="card">${stepper('value', s.value, s.step, { unit: s.unit, src: 'sheet' })}</div>${s.dated ? `<div class="card row between"><span>Date</span><input type="date" data-bind="date" data-type="text" data-src="sheet" value="${s.date}" max="${D.ymd(Date.now())}"></div><div class="small muted" style="margin-bottom:10px">One value per day — saving again for the same day replaces it.</div>` : ''}<button class="btn" data-a="sheetOk" ${s.value > 0 ? '' : 'disabled'}>Save</button>`;
  } else if (s.type === 'typed') {
    body = `<h3>${esc(s.label)}</h3><div class="card"><input class="bigin" inputmode="decimal" data-bind="value" data-src="sheet" value="${num(s.value)}"><div class="unit">${s.unit}</div></div><button class="btn" data-a="sheetOk">OK</button>`;
  } else if (s.type === 'custom') {
    body = `<h3>Other setting</h3><div class="card"><span class="lbl">Machine setting</span>${stepper('setting', s.setting, 1, { max: 200, src: 'sheet' })}</div><div class="card"><span class="lbl">Weight</span>${stepper('weight', s.weight, 2.5, { max: 1000, unit: 'kg', src: 'sheet' })}</div><div class="small muted" style="margin-bottom:10px">Also added to this machine's list for next time.</div><button class="btn" data-a="sheetOk">Use ${Math.round(s.setting)} / ${num(s.weight)} kg</button>`;
  } else if (s.type === 'picker') {
    body = `<h3>Add exercises</h3><div class="chips" style="margin-bottom:8px"><button class="chip ${s.cat ? '' : 'sel'}" data-a="pickCat" data-v="">All</button>${D.CATS.map((c) => `<button class="chip ${s.cat === c ? 'sel' : ''}" data-a="pickCat" data-v="${c}">${cap(c)}</button>`).join('')}</div>
      <div class="field"><input class="text" data-live="picker" placeholder="Search" value="${esc(s.q || '')}"></div><div id="results">${pickerResults()}</div><button class="btn" data-a="sheetOk" ${s.picked.length ? '' : 'disabled'}>Add (${s.picked.length})</button>`;
  } else if (s.type === 'goal') {
    body = `<h3>New goal</h3><div class="card"><div class="field"><label class="lbl">Goal type</label><select class="text" data-change="goalKind">${['exerciseWeight', 'bodyWeight', 'measurement', 'steps', 'workoutsPerWeek'].map((k) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${{ exerciseWeight: 'Exercise weight', bodyWeight: 'Body weight', measurement: 'Measurement', steps: 'Daily steps', workoutsPerWeek: 'Workouts per week' }[k]}</option>`).join('')}</select></div>
      ${s.kind === 'exerciseWeight' ? `<div class="field"><label class="lbl">Exercise</label><select class="text" data-change="goalEx"><option value="">Choose…</option>${D.activeExercises().map((e) => `<option value="${e.id}" ${s.exId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>` : ''}
      ${s.kind === 'measurement' ? `<div class="field"><label class="lbl">Measurement</label><select class="text" data-change="goalField">${D.db().fields.map((f) => `<option value="${f.id}" ${s.fieldId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>` : ''}
      <label class="lbl">Target (${{ exerciseWeight: 'kg', bodyWeight: 'kg', measurement: 'cm', steps: 'steps / day', workoutsPerWeek: 'workouts / week' }[s.kind]})</label>${stepper('target', s.target, s.kind === 'steps' ? 500 : 1, { src: 'sheet' })}</div>
      <button class="btn" data-a="sheetOk" ${s.target > 0 && (s.kind !== 'exerciseWeight' || s.exId) ? '' : 'disabled'}>Save</button>`;
  } else if (s.type === 'import') {
    body = `<h3>Restore backup</h3><div class="card small">${esc(D.backupSummary(s.file))}</div><div class="small muted" style="margin-bottom:10px">Merge only adds what is missing. Replace first saves a safety copy of your current data (you can undo it from this screen).</div>
      <button class="btn small" data-a="importMerge">Merge into current data</button><div style="height:8px"></div><button class="btn red small" data-a="importReplace">Replace all current data</button><div style="height:8px"></div><button class="btn ghost small" data-a="closeSheet">Cancel</button>`;
  }
  return `<div class="sheet-bg" data-a="closeSheet" data-bg="1"><div class="sheet">${body}</div></div>`;
}
function pickerResults() {
  const s = U.sheet; let list = s.cat ? D.exercisesIn(s.cat) : D.activeExercises();
  list = list.filter((e) => !s.already.includes(e.id));
  if (s.q) list = list.filter((e) => e.name.toLowerCase().includes(s.q.toLowerCase()));
  return `<div class="card list">${list.map((e) => `<button class="item" data-a="pick" data-id="${e.id}">${thumb(e)}<div class="grow"><b>${esc(e.name)}</b><div class="small muted">${cap(e.equip)}</div></div><span>${s.picked.includes(e.id) ? '✅' : '⚪️'}</span></button>`).join('')}</div>`;
}
function openEntry({ title, unit, value, step, dated = true, date, cb }) { U.sheet = { type: 'entry', title, unit, value, step, dated, date: date || D.ymd(Date.now()), cb }; render(true); }

function menuHtml() {
  return `<div class="sheet-bg menu-bg" data-a="closeMenu" data-bg="1"><div class="drawer"><div class="lbl" style="padding:0 8px">Menu</div>${ROOTS.map((t) => `<button class="drawer-item ${U.tab === t ? 'on' : ''}" data-a="menuGo" data-v="${t}"><span>${TAB_META[t][0]}</span>${TAB_META[t][1]}</button>`).join('')}</div></div>`;
}

// ---------- render ----------
function render(keep = true) {
  const app = $('#app'); const main = $('main'); const sheetEl = $('.sheet');
  const sc = keep && main ? main.scrollTop : 0; const ssc = keep && sheetEl ? sheetEl.scrollTop : 0;
  A = makeAnalytics(D.db());
  const cur = view(); const fn = V[cur.v];
  let r;
  try { r = fn(cur.p); } catch (e) { console.error(e); r = { title: 'Error', html: empty('⚠️', 'Something went wrong', esc(e.message)) }; }
  const stack = U.stacks[U.tab]; const homeRoot = U.tab === 'home' && stack.length === 0;
  app.innerHTML = `<div class="header">${stack.length ? '<button class="hbtn" data-a="back">‹ Back</button>' : ''}<h1>${esc(r.title)}</h1>${r.right || ''}${homeRoot ? '' : '<button class="hbtn burger" data-a="menu" aria-label="Menu">☰</button>'}</div>
    <main>${r.html}</main>${r.bottom ? `<div class="bottombar">${r.bottom}</div>` : ''}
    ${homeRoot ? `<nav class="tabbar">${ROOTS.map((t) => `<button class="tab ${U.tab === t ? 'on' : ''}" data-a="tab" data-v="${t}"><span class="ic">${TAB_META[t][0]}</span>${TAB_META[t][1]}</button>`).join('')}</nav>` : ''}
    ${sheetHtml()}${U.menu ? menuHtml() : ''}`;
  const m2 = $('main'); if (m2) m2.scrollTop = sc;
  initWheels();
  const s2 = $('.sheet'); if (s2) s2.scrollTop = ssc;
  const sel = $('.chip.sel'); if (sel && sel.parentElement.classList.contains('chips') && !sel.closest('.sheet')) sel.parentElement.scrollLeft = sel.offsetLeft - sel.parentElement.clientWidth / 2 + sel.clientWidth / 2;
}

// ---------- actions ----------
const dataObj = (src) => (src === 'sheet' ? U.sheet : src === 'draft' ? U.form.draft : U.form);
function openSet(mode, exId, cat, wid, setId) {
  const ex = D.exercise(exId); if (!ex) return;
  initSetForm(mode, ex, cat, wid, setId); go('set');
}
function download(name, mime, text) {
  const blob = new Blob([text], { type: mime }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareFiles(files) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  files.forEach((f, i) => setTimeout(() => download(f.name, f.type, f._text), i * 400));
}
const mkFile = (name, mime, text) => { const f = new File([text], name, { type: mime }); f._text = text; return f; };

// ---------- Google Drive upload (one file: GIM-Backup.json, drive.file scope) ----------
let gToken = null; let gTokenExp = 0;
async function gisLoad() {
  if (window.google && google.accounts && google.accounts.oauth2) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = res; s.onerror = () => rej(new Error('Could not load Google sign-in (are you online?)')); document.head.appendChild(s); });
}
const requestToken = (clientId) => new Promise((res, rej) => {
  const c = google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (r) => (r.error ? rej(new Error(r.error_description || r.error)) : res(r.access_token)),
    error_callback: (e) => rej(new Error((e && e.type) || 'Sign-in cancelled')),
  });
  c.requestAccessToken({ prompt: gToken === null && !localStorage.getItem('gim-drive-file') ? 'consent' : '' });
});
function multipart(meta, body) {
  const b = 'gimboundary' + Date.now();
  return { type: 'multipart/related; boundary=' + b, body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--` };
}
async function driveUpload() {
  const cid = GOOGLE_CLIENT_ID;
  toast('Uploading…');
  try {
    await gisLoad();
    const json = JSON.stringify(D.makeBackup());
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!gToken || Date.now() > gTokenExp) { gToken = await requestToken(cid); gTokenExp = Date.now() + 50 * 60 * 1000; }
      const auth = { Authorization: 'Bearer ' + gToken };
      const mp = multipart({ name: 'GIM-Backup.json', mimeType: 'application/json' }, json);
      const id = localStorage.getItem('gim-drive-file'); let res = null;
      if (id) res = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=multipart', { method: 'PATCH', headers: { ...auth, 'Content-Type': mp.type }, body: mp.body });
      if (!res || res.status === 404) res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { ...auth, 'Content-Type': mp.type }, body: mp.body });
      if (res.status === 401 && attempt === 0) { gToken = null; continue; }
      if (!res.ok) throw new Error('Google Drive error ' + res.status);
      const j = await res.json(); localStorage.setItem('gim-drive-file', j.id); localStorage.setItem('gim-drive-last', String(Date.now()));
      toast('Uploaded to Google Drive ✓'); render(true); return;
    }
  } catch (e) { alert('Upload failed: ' + e.message); }
}
const ACT = {
  back, tab: (d) => switchTab(d.v),
  menu: () => { U.menu = true; render(true); },
  closeMenu: (d, t, e) => { if (t.dataset.bg && e.target !== t) return; U.menu = false; render(true); },
  menuGo: (d) => { U.menu = false; U.stacks[d.v] = []; U.tab = d.v; U.q = ''; U.sheet = null; render(false); },
  finishEx: () => { const st = U.stacks[U.tab]; while (st.length && ['set', 'exlist', 'addset'].includes(st[st.length - 1].v)) st.pop(); U.q = ''; toast('Exercise finished ✓'); render(false); },
  go: (d) => go(d.v, d.id ? { id: d.id } : {}),
  undo: () => { if (U.undo) { const d = D.db(); d.sets = U.undo.sets; d.workouts = U.undo.workouts; D.save(); U.undo = null; render(true); } },
  period: (d) => { U.period = d.v; localStorage.setItem('gim-period', d.v); render(true); },
  metric: (d) => { view().p.metric = d.v; render(true); },
  startWorkout: () => { D.startWorkout(); U.tab = 'workout'; U.stacks.workout = []; U.sheet = null; render(false); },
  startPlan: (d) => { D.startWorkout(d.id); render(false); },
  planStart: (d) => { D.startWorkout(d.id); U.tab = 'workout'; U.stacks.workout = []; render(false); },
  discard: () => { const w = D.activeWorkout(); if (w && confirm('Discard this workout and all its sets?')) { D.deleteWorkout(w.id); render(false); } },
  finish: () => { const w = D.activeWorkout(); if (!w) return; const saved = D.finishWorkout(w.id); if (saved) { U.lastFinished = w.id; toast('Workout saved ✓'); } render(false); },
  openWorkout: (d) => go('wdetail', { id: d.id }),
  addSetTo: (d) => go('addset', { wid: d.id }),
  delWorkout: (d) => { if (confirm('Delete this workout and all its sets?')) { D.deleteWorkout(d.id); back(); } },
  openCat: (d) => go('exlist', { cat: d.cat || null, wid: d.wid }),
  openEx: (d) => openSet('add', d.ex, d.cat, d.wid),
  editSet: (d) => { const s = D.setById(d.id); if (s) openSet('edit', s.exerciseId, s.muscleCategory, s.workoutId, s.id); },
  delSet: (d) => {
    U.undo = { sets: JSON.parse(JSON.stringify(D.db().sets)), workouts: JSON.parse(JSON.stringify(D.db().workouts)) };
    D.deleteSet(d.id); const v = view().v;
    if ((v === 'set' || v === 'wdetail') && !D.workout(v === 'set' ? U.form.wid : view().p.id)) { back(); } else render(true);
    toast('Set deleted', true);
  },
  step: (d) => { const o = dataObj(d.src); const k = d.k; o[k] = Math.min(+d.max, Math.max(+d.min, r2((+o[k] || 0) + +d.d)));
    const inp = document.querySelector('[data-bind="' + k + '"][data-src="' + d.src + '"]'); if (inp) inp.value = num(o[k]);
    const b = document.querySelector('.sheet [data-a=sheetOk]'); const s = U.sheet;
    if (b && s) { if (s.type === 'custom') b.textContent = 'Use ' + Math.round(s.setting) + ' / ' + num(s.weight) + ' kg'; if (s.type === 'entry') b.disabled = !(s.value > 0); if (s.type === 'goal') b.disabled = !(s.target > 0 && (s.kind !== 'exerciseWeight' || s.exId)); }
  },
  setVal: (d) => { dataObj(d.src)[d.k] = +d.v; render(true); },
  pickMachine: (d) => { const m = machineOptions(D.exercise(U.form.exId))[+d.i]; U.form.sel = { setting: m.setting, weight: m.weight }; render(true); },
  wheelTo: (d, t) => { t.parentElement.scrollTo({ top: +d.i * ITEM, behavior: 'smooth' }); },
  typeVal: (d) => { const k = d.k; U.sheet = { type: 'typed', key: k, label: k === 'weight' ? 'Weight' : k === 'reps' ? 'Reps' : 'Minutes', unit: k === 'weight' ? 'kg' : k === 'reps' ? 'reps' : 'minutes', value: U.form[k] }; render(true); setTimeout(() => { const i = document.querySelector('.sheet input'); if (i) { i.focus(); i.select(); } }, 60); },
  customMachine: () => { U.sheet = { type: 'custom', setting: 1, weight: 20, exId: U.form.exId }; render(true); },
  editMachine: () => go('machine'),
  saveSet: () => {
    const f = U.form; const ex = D.exercise(f.exId); if (!ex || !valid(ex)) return; hideKb();
    const o = {
      machineSetting: ex.weightBehavior === 'machine' ? f.sel.setting : null,
      weight: ex.weightBehavior === 'machine' ? f.sel.weight : ex.weightBehavior === 'free' ? f.weight : 0,
      reps: ex.repBehavior === 'reps' ? Math.round(f.reps) : null,
      durationSeconds: ex.repBehavior === 'duration' ? Math.round(f.minutes * 60) : null,
    };
    if (f.mode === 'edit') { D.updateSet(f.setId, o); toast('Set updated ✓'); back(); return; }
    const rec = D.addSet(f.wid, ex, f.cat, o);
    if (rec) { if (navigator.vibrate) navigator.vibrate(30); toast('Set ' + rec.setOrder + ' saved ✓'); }
    render(true);
  },
  weightEntry: () => { const l = D.latestBodyWeight(); openEntry({ title: 'Body weight', unit: 'kg', value: l ? l.kg : 70, step: 0.1, cb: (v, dt) => D.setBodyWeight(v, dt) }); },
  stepsEntry: () => openEntry({ title: 'Steps', unit: 'steps', value: D.stepsToday() ?? 8000, step: 500, cb: (v, dt) => D.setSteps(Math.round(v), dt) }),
  metricAdd: () => { const c = metricCfg(metricParams()); const last = [...c.rows].sort((a, b) => b.date.localeCompare(a.date))[0]; openEntry({ title: c.title, unit: c.unit, value: last ? last.v : c.def, step: c.step, cb: (v, dt) => c.save(c.dec ? v : Math.round(v), dt) }); },
  metricEdit: (d) => { const c = metricCfg(metricParams()); const r = c.rows.find((x) => x.id === d.id); if (r) openEntry({ title: c.title, unit: c.unit, value: r.v, step: c.step, date: r.date, cb: (v, dt) => c.save(c.dec ? v : Math.round(v), dt) }); },
  metricDel: (d) => { metricCfg(metricParams()).del(d.id); render(true); },
  newField: () => { const n = (prompt('Measurement name (e.g. Forearm)') || '').trim(); if (n) { D.addField(n); render(true); } },
  delField: (d) => { if (confirm('Delete this measurement and all its entries?')) { D.deleteField(d.id); render(true); } },
  newGoal: () => { U.sheet = { type: 'goal', kind: 'exerciseWeight', exId: '', fieldId: 'waist', target: 50 }; render(true); },
  delGoal: (d) => { D.deleteGoal(d.id); render(true); },
  closeSheet: (d, t, e) => { if (t.dataset.bg && e.target !== t) return; U.sheet = null; render(true); },
  sheetOk: () => {
    const s = U.sheet; if (!s) return;
    if (s.type === 'entry') { s.cb(s.value, s.date); toast('Saved ✓'); }
    else if (s.type === 'typed') { U.form[s.key] = s.key === 'reps' ? Math.max(1, Math.round(s.value)) : s.value; }
    else if (s.type === 'custom') { const st = Math.round(s.setting); D.addMachineSettingIfNeeded(s.exId, st, s.weight); U.form.sel = { setting: st, weight: s.weight }; }
    else if (s.type === 'picker') { const p = D.plan(s.planId); p.exerciseIds.push(...s.picked); D.save(); }
    else if (s.type === 'goal') {
      const a = makeAnalytics(D.db()); let start = null;
      if (s.kind === 'exerciseWeight') start = a.bests(s.exId).bestWeight?.value ?? null;
      if (s.kind === 'bodyWeight') { const p = a.bodyWeightPoints(); start = p.length ? p[p.length - 1].v : null; }
      if (s.kind === 'measurement') { const p = a.measurementPoints(s.fieldId); start = p.length ? p[p.length - 1].v : null; }
      D.saveGoal({ id: D.uid(), kind: s.kind, target: s.target, startValue: start, exerciseId: s.kind === 'exerciseWeight' ? s.exId : null, fieldId: s.kind === 'measurement' ? s.fieldId : null, createdAt: Date.now() });
    }
    U.sheet = null; render(true);
  },
  calShift: (d) => { const c = new Date(U.calMonth); c.setDate(1); c.setMonth(c.getMonth() + +d.v); U.calMonth = c.getTime(); U.calDay = null; render(true); },
  calDay: (d) => { U.calDay = d.v && U.calDay !== d.v ? d.v : null; render(true); },
  newPlan: () => { const n = (prompt('Plan name (e.g. Push)') || '').trim(); if (n) { const p = D.createPlan(n); go('plan', { id: p.id }); } },
  delPlan: (d) => { if (confirm('Delete this plan? Your workout history is not affected.')) { D.deletePlan(d.id); back(); } },
  planMove: (d) => { const p = D.plan(d.id); const i = +d.i; const j = i + +d.d; if (j < 0 || j >= p.exerciseIds.length) return; [p.exerciseIds[i], p.exerciseIds[j]] = [p.exerciseIds[j], p.exerciseIds[i]]; D.save(); render(true); },
  planRemove: (d) => { D.plan(d.id).exerciseIds.splice(+d.i, 1); D.save(); render(true); },
  planAdd: (d) => { U.sheet = { type: 'picker', planId: d.id, picked: [], already: [...D.plan(d.id).exerciseIds], cat: null, q: '' }; render(true); },
  pick: (d) => { const s = U.sheet; const i = s.picked.indexOf(d.id); if (i >= 0) s.picked.splice(i, 1); else s.picked.push(d.id); render(true); },
  pickCat: (d) => { U.sheet.cat = d.v || null; render(true); },
  libFilter: (d) => { U.filter = d.v || null; render(true); },
  newExercise: (d) => { U.form = { draft: blankExercise(D.CATS.includes(d.cat) ? d.cat : '') }; go('exedit', { existing: false }); },
  editExercise: (d) => { U.form = { draft: JSON.parse(JSON.stringify(D.exercise(d.ex))) }; go('exedit', { existing: true }); },
  togCat: (d) => { const c = U.form.draft.cats; const i = c.indexOf(d.v); if (i >= 0) c.splice(i, 1); else c.push(d.v); render(true); },
  rmPhoto: () => { U.form.draft.image = null; render(true); },
  saveExercise: () => {
    const e = U.form.draft; e.name = e.name.trim(); if (!e.name) { alert('Please enter a name.'); return; }
    if (!e.cats.length) e.cats = ['chest'];
    e.machine = e.machine.filter((m) => Number.isFinite(m.weight)); D.saveExercise(e); toast('Exercise saved ✓'); back();
  },
  delExercise: () => { if (confirm('Delete this exercise?')) { D.deleteExercise(U.form.draft.id); back(); } },
  msAdd: (d) => { const l = msList(d.src); l.push({ id: D.uid(), setting: Math.max(0, ...l.map((m) => m.setting)) + 1, weight: l.length ? l[l.length - 1].weight : 5 }); if (d.src === 'ex') D.save(); render(true); },
  msDel: (d) => { msList(d.src).splice(+d.i, 1); if (d.src === 'ex') D.save(); render(true); },
  msGen: (d) => {
    const n = Math.min(60, Math.max(1, Math.round(parseNum($('#genN').value)))); const k = parseNum($('#genKg').value) || 5;
    const list = D.defaultStack(n, k); const cur = msList(d.src); cur.length = 0; cur.push(...list); if (d.src === 'ex') D.save(); render(true);
  },
  driveUpload,
  print: () => window.print(),
  exportBackup: () => { const name = 'GIM-Backup-' + D.ymd(Date.now()) + '.json'; shareFiles([mkFile(name, 'application/json', JSON.stringify(D.makeBackup()))]); },
  exportCSV: () => {
    const d = D.db(); const s = D.ymd(Date.now()); const B = '﻿';
    shareFiles([mkFile(`GIM-Sets-${s}.csv`, 'text/csv', B + setsCSV(d)), mkFile(`GIM-BodyWeight-${s}.csv`, 'text/csv', B + bodyWeightCSV(d)),
      mkFile(`GIM-Measurements-${s}.csv`, 'text/csv', B + measurementsCSV(d)), mkFile(`GIM-Steps-${s}.csv`, 'text/csv', B + stepsCSV(d))]);
  },
  importMerge: () => { const c = D.merge(U.sheet.file.data); U.sheet = null; render(true); alert(c.total ? `Added ${c.workouts} workouts, ${c.sets} sets, ${c.exercises} exercises, ${c.bodyWeights} weights, ${c.measurements} measurements, ${c.steps} step days.` : 'Nothing new to add — your data already contains everything in this backup.'); },
  importReplace: () => {
    if (!confirm('Replace ALL current data with this backup?')) return;
    if (!D.saveSafetyBackup()) { alert('Restore cancelled — could not save a safety copy first. Nothing was changed.'); return; }
    D.replaceAll(U.sheet.file.data); U.sheet = null; render(true); alert('Backup restored. Your previous data was kept as a safety copy (Undo option on this screen).');
  },
  restoreSafety: () => {
    if (!confirm('Go back to the data you had before the last "Replace" restore?')) return;
    try { const f = JSON.parse(D.getSafetyBackup()); D.validateBackup(f); D.replaceAll(f.data); render(true); } catch (e) { alert('Could not restore: ' + e.message); }
  },
};
const hideKb = () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); };

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const fn = ACT[t.dataset.a]; if (!fn) return;
  if (t.tagName === 'BUTTON' && t.disabled) return;
  fn(t.dataset, t, e);
});

function machineInput(t) {
  const list = msList(t.dataset.src); const m = list[+t.dataset.i]; if (!m) return;
  if (t.dataset.ms === 'setting') m.setting = Math.round(parseNum(t.value)); else m.weight = parseNum(t.value);
  if (t.dataset.src === 'ex') D.save();
}
const LIVE = { exlist: (q) => exResults(view().p, q), library: (q) => libResults(q), exprog: (q) => exprogResults(q), picker: (q) => { U.sheet.q = q; return pickerResults(); } };

document.addEventListener('input', (e) => {
  const t = e.target; const d = t.dataset;
  if (d.bind !== undefined) { dataObj(d.src)[d.bind] = d.type === 'text' ? t.value : parseNum(t.value); }
  else if (d.ms !== undefined) machineInput(t);
  else if (d.live) { U.q = t.value; const box = $('#results'); if (box) box.innerHTML = LIVE[d.live](t.value); }
  else if (d.planName !== undefined) { const p = D.plan(view().p.id); if (p) { p.name = t.value; D.save(); } }
  else if (d.profile) { D.updateProfile({ [d.profile]: d.profile === 'heightCm' ? (t.value === '' ? null : parseNum(t.value)) : t.value }); }
});

document.addEventListener('change', (e) => {
  const t = e.target; const k = t.dataset.change; if (!k) return;
  const dr = () => U.form.draft;
  if (k === 'equip') {
    const d = dr(); d.equip = t.value;
    if (t.value === 'machine' || t.value === 'cable') { d.weightBehavior = 'machine'; d.repBehavior = 'reps'; if (!d.machine.length) d.machine = D.defaultStack(); }
    else if (t.value === 'barbell') { Object.assign(d, { weightBehavior: 'free', repBehavior: 'reps', wMin: 20, wMax: 200, wStep: 5 }); }
    else if (t.value === 'dumbbell' || t.value === 'other') { Object.assign(d, { weightBehavior: 'free', repBehavior: 'reps', wMin: 2.5, wMax: 50, wStep: 2.5 }); }
    else if (t.value === 'bodyweight') Object.assign(d, { weightBehavior: 'none', repBehavior: 'reps' });
    else Object.assign(d, { weightBehavior: 'none', repBehavior: 'duration' });
    render(true);
  } else if (k === 'wb') { dr().weightBehavior = t.value; if (t.value === 'machine' && !dr().machine.length) dr().machine = D.defaultStack(); render(true); }
  else if (k === 'mult') { dr().mult = +t.value; }
  else if (k === 'rb') { dr().repBehavior = t.value; render(true); }
  else if (k === 'photo') {
    const file = t.files && t.files[0]; if (!file) return;
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, 640 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      dr().image = c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url); render(true);
    };
    img.src = url;
  } else if (k === 'theme') { localStorage.setItem('gim-theme', t.value); applyTheme(); }
  else if (k === 'plateauWeeks') { D.updateProfile({ plateauWeeks: +t.value }); }
  else if (k === 'goalKind') { U.sheet.kind = t.value; U.sheet.target = t.value === 'steps' ? 10000 : t.value === 'workoutsPerWeek' ? 4 : t.value === 'measurement' ? 80 : 50; render(true); }
  else if (k === 'goalEx') { U.sheet.exId = t.value; render(true); }
  else if (k === 'goalField') { U.sheet.fieldId = t.value; }
  else if (k === 'import') {
    const file = t.files && t.files[0]; if (!file) return;
    file.text().then((txt) => {
      try { const f = JSON.parse(txt); D.validateBackup(f); U.sheet = { type: 'import', file: f }; render(true); }
      catch (err) { alert(err instanceof SyntaxError ? 'This file is not a valid GIM backup.' : err.message); }
    });
    t.value = '';
  }
});

function applyTheme() {
  const t = localStorage.getItem('gim-theme') || 'system';
  if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

// ---------- swipe from the left edge = back (like iPhone) ----------
const canBack = () => U.stacks[U.tab].length > 0 || U.tab !== 'home';
const goBack = () => { if (U.stacks[U.tab].length) back(); else if (U.tab !== 'home') switchTab('home'); };
let sw = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  sw = (t.clientX < 24 && !U.sheet && !U.menu && canBack()) ? { x: t.clientX, y: t.clientY, dx: 0, on: false } : null;
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!sw) return; const t = e.touches[0]; const dx = t.clientX - sw.x; const dy = t.clientY - sw.y;
  if (!sw.on) { if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { sw = null; return; } if (dx > 10) sw.on = true; }
  if (sw.on) { sw.dx = dx; const a = $('#app'); a.style.transition = 'none'; a.style.transform = 'translateX(' + Math.max(0, dx) + 'px)'; }
}, { passive: true });
document.addEventListener('touchend', () => {
  if (!sw) return; const s = sw; sw = null; if (!s.on) return;
  const a = $('#app'); a.style.transition = 'transform .16s ease-out';
  if (s.dx > 90) { a.style.transform = 'translateX(100%)'; setTimeout(() => { a.style.transition = 'none'; a.style.transform = ''; goBack(); }, 160); }
  else { a.style.transform = ''; setTimeout(() => { a.style.transition = ''; }, 170); }
});
document.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 60)); // keyboard closing must not leave the page shifted

// ---------- boot ----------
applyTheme();
D.init(localStorage);
if (D.loadNotice) { alert(D.loadNotice); D.clearNotice(); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
render(false);
import test from 'node:test';
import assert from 'node:assert/strict';

test('navigation renders outline icons without literal placeholders or UI errors', async () => {
  const stored = new Map();
  globalThis.localStorage = { getItem: k => stored.get(k) || null, setItem: (k, v) => stored.set(k, v) };
  const app = { innerHTML: '' };
  const events = {};
  globalThis.document = {
    querySelector: s => s === '#app' ? app : null,
    querySelectorAll: () => [], addEventListener: (k, f) => { events[k] = f; },
    documentElement: { removeAttribute() {}, dataset: {} },
  };
  globalThis.window = { addEventListener() {} };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.location = { protocol: 'http:' };
  await import('../js/ui.js');
  const tap = (a, more = {}) => events.click({ target: { closest: () => ({ dataset: { a, ...more }, tagName: 'BUTTON' }) } });
  const check = () => {
    assert.ok(!app.innerHTML.includes('Something went wrong'));
    assert.ok(!app.innerHTML.includes('${ICON.'));
    assert.ok(!/[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}]/u.test(app.innerHTML));
    assert.ok(app.innerHTML.includes('<svg'));
    assert.ok(app.innerHTML.includes('<nav class="tabbar"'));
    assert.ok(!app.innerHTML.includes('hbtn burger'));
  };
  check();
  for (const v of ['workout', 'plans', 'progress']) { tap('tab', { v }); check(); }
  for (const v of ['exprog', 'muscles', 'bests', 'weight', 'measures', 'steps', 'consistency', 'goals', 'plateau', 'history', 'backup', 'library', 'profile']) {
    tap('menuGo', { v: 'home' }); tap('go', { v }); check();
  }
  tap('menuGo', { v: 'home' }); tap('startWorkout'); check();
  const D = await import('../js/data.js');
  tap('openCat', { cat: 'chest', wid: D.activeWorkout().id }); check();
  tap('openEx', { ex: 'bench-press', cat: 'chest', wid: D.activeWorkout().id }); check();
});

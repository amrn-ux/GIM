import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportBounds, trackViewport } from '../js/viewport.js';

test('uses the visible viewport and follows keyboard and browser chrome changes', () => {
  const listeners = {};
  const values = {};
  const viewport = { height: 844, offsetTop: 0, scale: 1, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const win = { innerHeight: 800, visualViewport: viewport, addEventListener() {} };
  trackViewport(win, { style: { setProperty: (key, value) => { values[key] = value; } } });
  assert.equal(values['--viewport-height'], '844px');
  viewport.height = 510; viewport.offsetTop = 40; listeners.resize();
  assert.equal(values['--viewport-height'], '510px');
  assert.equal(values['--viewport-top'], '40px');
  viewport.scale = 2; viewport.height = 250; listeners.resize();
  assert.equal(values['--viewport-height'], '510px');
  viewport.scale = 1; viewport.height = 844; viewport.offsetTop = 0; listeners.scroll();
  assert.equal(values['--viewport-height'], '844px');
});

test('falls back to window height when VisualViewport is unavailable', () => {
  assert.deepEqual(viewportBounds(null, 844), { height: 844, top: 0 });
});

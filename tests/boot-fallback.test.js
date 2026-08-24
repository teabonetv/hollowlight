// F1d Fix 3 regression — boot-resilience fallback screen.
//
// index.html must carry an inline watchdog (no external JS/CSS, so it works
// even when every module 503s): if window.__HOLLOWLIGHT_BOOTED isn't set
// within 8s, reveal #boot-fallback ("The lantern flickers in the wind…")
// with a Retry button that location.reload()s. app.js sets the flag at the
// end of a successful boot and hides the fallback if it ever showed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// The inline watchdog script: the FIRST plain <script> block in index.html.
const inline = html.match(/<script>\n?([\s\S]*?)<\/script>/);
assert.ok(inline, 'index.html has an inline watchdog <script>');
const watchdogSrc = inline[1];

function runWatchdog({ booted }) {
  const calls = { timeouts: [], hidden: [] };
  const fallback = {
    hidden: true,
    set hidden(v) { calls.hidden.push(v); this._h = v; },
    get hidden() { return this._h; },
    _h: true,
  };
  const fakeWindow = {
    __HOLLOWLIGHT_BOOTED: booted,
    setTimeout(fn, ms) { calls.timeouts.push({ fn, ms }); },
    document: { getElementById: (id) => (id === 'boot-fallback' ? fallback : null) },
  };
  new Function('window', 'document', watchdogSrc)(fakeWindow, fakeWindow.document);
  return { calls, fire: () => calls.timeouts.forEach((t) => t.fn()) };
}

test('watchdog reveals the fallback after 8s when boot never signalled', () => {
  const { calls, fire } = runWatchdog({ booted: false });
  assert.equal(calls.timeouts.length, 1);
  assert.equal(calls.timeouts[0].ms, 8000, 'timeout is 8 seconds');

  fire();
  assert.deepEqual(calls.hidden, [false], 'fallback revealed');
});

test('watchdog stays quiet when the app booted in time', () => {
  const { calls, fire } = runWatchdog({ booted: true });
  fire();
  assert.deepEqual(calls.hidden, [], 'fallback untouched');
});

test('fallback markup is self-contained (inline styles, retry reloads)', () => {
  assert.match(html, /id="boot-fallback"/);
  assert.match(html, /hidden/, 'fallback starts hidden');
  assert.match(html, /The lantern flickers in the wind…/);
  assert.match(html, /<style>\s*#boot-fallback\s*\{/, 'styles are inline in the fallback');
  assert.match(html, /location\.reload\(\)/, 'Retry button reloads the page');
  // The module tag comes last so the watchdog installs before app.js runs.
  assert.ok(html.indexOf('__HOLLOWLIGHT_BOOTED') < html.indexOf('src="./src/ui/app.js"'),
    'watchdog registered before the app module loads');
});

test('app.js signals a successful boot', async () => {
  const appSrc = readFileSync(join(root, 'src', 'ui', 'app.js'), 'utf8');
  assert.match(appSrc, /__HOLLOWLIGHT_BOOTED = true/,
    'boot() sets the flag only after save load + first render');
  assert.match(appSrc, /boot-fallback/,
    'a late boot also re-hides the fallback if it flashed');
});

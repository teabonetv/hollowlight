// Boot-resilience fallback screen.
//
// index.html must carry an inline watchdog (no external JS/CSS, so it works
// even when every module 503s). An 8s timer used to dump #boot-fallback while
// the ES module graph was still fetching after a document navigation to
// items.js — the save was intact; Retry recovered. The overlay now reveals
// only on import() rejection (or a 45s last-resort hang). app.js sets
// __HOLLOWLIGHT_BOOTED after save load + first render and re-hides the overlay.

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
    localStorage: { getItem: () => null },
    document: { getElementById: (id) => (id === 'boot-fallback' ? fallback : null) },
  };
  new Function('window', 'document', watchdogSrc)(fakeWindow, fakeWindow.document);
  return { calls, fire: () => calls.timeouts.forEach((t) => t.fn()), window: fakeWindow };
}

test('watchdog last-resort is 45s, not an 8s crash overlay', () => {
  const { calls, fire } = runWatchdog({ booted: false });
  assert.equal(calls.timeouts.length, 1);
  assert.equal(calls.timeouts[0].ms, 45000, 'timeout is 45 seconds');
  assert.equal(watchdogSrc.includes('8000'), false, '8s crash timer is gone');

  fire();
  assert.deepEqual(calls.hidden, [false], 'fallback revealed after last-resort hang');
});

test('watchdog stays quiet when the app booted in time', () => {
  const { calls, fire } = runWatchdog({ booted: true });
  fire();
  assert.deepEqual(calls.hidden, [], 'fallback untouched');
});

test('import failure reveals the overlay immediately via BOOT_FAIL', () => {
  const { calls, window } = runWatchdog({ booted: false });
  assert.equal(typeof window.__HOLLOWLIGHT_BOOT_FAIL, 'function');
  window.__HOLLOWLIGHT_BOOT_FAIL();
  assert.deepEqual(calls.hidden, [false], 'failed import dumps the overlay without waiting 45s');
});

test('fallback markup is self-contained (inline styles, retry reloads)', () => {
  assert.match(html, /id="boot-fallback"/);
  assert.match(html, /hidden/, 'fallback starts hidden');
  assert.match(html, /The lantern flickers in the wind…/);
  assert.match(html, /<style>\s*#boot-fallback\s*\{/, 'styles are inline in the fallback');
  assert.match(html, /location\.reload\(\)/, 'Retry button reloads the page');
  assert.ok(
    html.indexOf('__HOLLOWLIGHT_BOOTED') < html.indexOf("import('./src/ui/app.js')"),
    'watchdog registered before the app module loads',
  );
});

test('items.js is modulepreloaded so a document-nav return cannot waterfall past first paint', () => {
  assert.match(html, /rel="modulepreload"[^>]+href="\.\/src\/game\/data\/items\.js"/);
  assert.match(html, /rel="modulepreload"[^>]+href="\.\/src\/ui\/app\.js"/);
  assert.match(html, /import\('\.\/src\/ui\/app\.js'\)\.catch/);
});

test('hidden wins over the overlay display rule (specificity)', () => {
  const style = html.match(/<div id="boot-fallback"[\s\S]*?<style>([\s\S]*?)<\/style>/);
  assert.ok(style, 'fallback has an inline <style> block');
  const css = style[1];

  const idOnly = css.match(/#boot-fallback\s*\{([^}]*)\}/);
  assert.ok(idOnly, '#boot-fallback { … } exists');
  assert.equal(
    /display\s*:/.test(idOnly[1]),
    false,
    '#boot-fallback { display:… } must not exist — it beats UA [hidden]',
  );

  assert.match(
    css,
    /#boot-fallback\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/,
    '[hidden] on the id must hide with !important so ID rules cannot leak',
  );
  assert.match(
    css,
    /#boot-fallback:not\(\[hidden\]\)\s*\{\s*display\s*:\s*flex\s*;?\s*\}/,
    'watchdog removing hidden still shows a full-screen flex overlay',
  );
});

test('tab bar labels the fifth tab Almanac, not Journal', () => {
  const tabbar = html.match(/<nav class="tabbar"[\s\S]*?<\/nav>/);
  assert.ok(tabbar, 'tab bar present');
  assert.match(tabbar[0], /<span>Almanac<\/span>/);
  assert.doesNotMatch(tabbar[0], /<span>Journal<\/span>/);
  assert.match(html, /href="\.\/src\/ui\/combat\.css"/);
});

test('app.js signals a successful boot and hides a late overlay', async () => {
  const appSrc = readFileSync(join(root, 'src', 'ui', 'app.js'), 'utf8');
  assert.match(appSrc, /__HOLLOWLIGHT_BOOTED = true/,
    'boot() sets the flag only after save load + first render');
  assert.match(appSrc, /boot-fallback/,
    'a late boot also re-hides the fallback if it flashed');
  assert.match(appSrc, /adoptedSavedAt/,
    'boot honours the earlier of envelope and state savedAt');
});

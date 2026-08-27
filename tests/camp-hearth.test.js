// Camp is a hearth, not a sitemap. The five Camp stack destinations live on
// Skills / Bank / Almanac tabs. Headless FakeNode coverage for that cut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeNode, FakeText } from './helpers/fake-node.mjs';

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (s) => new FakeText(s),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => 0;
try { globalThis.navigator = {}; } catch { /* node ≥21 */ }

const { createState } = await import('../src/game/state.js');
const runner = await import('../src/game/systems/action-runner.js');
const { renderSkillDetail, craftNavSkills } = await import('../src/ui/screens/skills.js');
const tabs = await import('../src/ui/screens/tabs.js');

const SITEMAP = [
  'Tend the Flame',
  'Walk the fog-line',
  'The General Store',
  'Face the pale-things',
  'Open the constellation',
];

function makeCtx(state, overrides = {}) {
  return {
    state,
    toast() {},
    buyUpgrade() {},
    openSellSheet() {},
    openSkill() {},
    openStore() {},
    openAlmanac() {},
    actionStatus: (id) => runner.actionStatus(state, id),
    buyKindlingBundle() {},
    storeBuy() {},
    buyTheme() {},
    ...overrides,
  };
}

test('Camp source has no camp-actions sitemap stack', () => {
  const src = readFileSync(new URL('../src/ui/screens/tabs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /camp-actions/);
  assert.doesNotMatch(src, /Walk the fog-line/);
  assert.doesNotMatch(src, /The General Store/);
  assert.doesNotMatch(src, /Face the pale-things/);
  assert.doesNotMatch(src, /Open the constellation/);
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.camp-actions/);
});

test('Camp screen has zero sitemap buttons and keeps the hearth', () => {
  const s = createState({ rngSeed: 1 });
  const scr = tabs.renderCampScreen(makeCtx(s));
  assert.equal(scr.node.querySelector('.camp-actions'), null);
  const labels = scr.node.querySelectorAll('button').map((b) => b.textContent ?? '');
  for (const name of SITEMAP) {
    assert.equal(labels.includes(name), false, `Camp must not host “${name}”`);
  }
  assert.match(scr.node.textContent ?? '', /Waiting for you/);
  assert.match(scr.node.textContent ?? '', /Daily embers/);
  assert.match(scr.node.textContent ?? '', /The Lantern/);
  assert.match(scr.node.textContent ?? '', /Keeper's Camp/);
  assert.equal(scr.node.querySelectorAll('.track-card').length, 3);
  assert.equal(scr.node.querySelectorAll('.want-row').length <= 3, true);
});

test('tinder starve Buy kindling opens the stall, not a Camp stack', () => {
  const s = createState({ rngSeed: 2 });
  s.bank.tinderscrap = 0;
  const opened = [];
  const scr = tabs.renderCampScreen(makeCtx(s, {
    openStore() { opened.push('store'); },
  }));
  const buy = scr.node.querySelectorAll('button')
    .find((b) => (b.textContent ?? '') === 'Buy kindling');
  assert.ok(buy, 'starve banner keeps a single Buy kindling');
  buy.click();
  assert.deepEqual(opened, ['store']);
});

test('Waiting-for-you want-rows still openSkill', () => {
  const s = createState({ rngSeed: 3 });
  const skills = [];
  const scr = tabs.renderCampScreen(makeCtx(s, {
    openSkill(id) { skills.push(id); },
  }));
  const want = scr.node.querySelectorAll('.want-row')
    .find((b) => /Fan the Coals/.test(b.textContent ?? ''));
  assert.ok(want, 'next-unlock want is a skill door');
  want.click();
  assert.deepEqual(skills, ['emberkeeping']);
});

test('craftNavSkills leads with Emberkeeping, Foraging, Combat', () => {
  const live = craftNavSkills().filter((s) => s.wave === 0).map((s) => s.id);
  assert.deepEqual(live, ['emberkeeping', 'foraging', 'combat']);
});

test('openSkill-equivalent craft tabs select the right skill', () => {
  const s = createState({ rngSeed: 4 });
  const opened = [];
  const ctx = makeCtx(s, { openSkill(id) { opened.push(id); } });
  const ember = renderSkillDetail(ctx, 'emberkeeping');
  assert.equal(
    ember.node.querySelector('.craft-tab.active')?.getAttribute('data-skill'),
    'emberkeeping',
  );
  ember.node.querySelector('[data-skill="foraging"]').click();
  ember.node.querySelector('[data-skill="combat"]').click();
  assert.deepEqual(opened, ['foraging', 'combat']);

  const foraging = renderSkillDetail(ctx, 'foraging');
  assert.equal(
    foraging.node.querySelector('.craft-tab.active')?.getAttribute('data-skill'),
    'foraging',
  );
  const combat = renderSkillDetail(ctx, 'combat');
  assert.equal(
    combat.node.querySelector('.craft-tab.active')?.getAttribute('data-skill'),
    'combat',
  );
  assert.match(combat.node.textContent ?? '', /Hunt|Pale Moth|Hearthway/);
});

// Skills screen: registry list → skill detail with tappable action cards.
// Only Wave-0 skills have actions; future ones get designed "coming soon"
// detail states so nothing is a dead end.

import { el, clear } from '../dom.js';
import { renderCombatPanel } from './combat.js';
import { icon } from '../icons.js';
import { SKILLS, SKILL_BY_ID } from '../../game/data/skills.js';
import { actionsForSkill } from '../../game/data/actions.js';
import { ITEMS_BY_ID } from '../../game/data/items.js';
import { levelProgress } from '../../core/xp.js';
import { formatNumber, formatSeconds } from '../../core/format.js';
import { bankCount } from '../../game/systems/bank.js';

/** Skills list (all eight). */
export function renderSkillsScreen(ctx) {
  const { state } = ctx;
  const root = el('section', { class: 'screen' },
    el('header', { class: 'screen-head' },
      el('h1', { class: 'screen-title' }, 'Skills'),
      el('p', { class: 'screen-sub' }, 'The crafts of the lantern trade.')));

  const list = el('div', { class: 'skill-list' });
  for (const s of SKILLS) {
    const sk = state.skills[s.id];
    const prog = levelProgress(sk.xp);
    const live = s.wave === 0;
    const running = s.id === 'combat'
      ? !!state.combat?.fighting
      : actionsForSkill(s.id).some((a) => state.actions.active[a.id]);

    const row = el('button', {
      class: `skill-row ${live ? '' : 'skill-row-future'}`,
      onclick: () => ctx.openSkill(s.id),
      'aria-label': `${s.name}, level ${sk.level}`,
    },
      el('span', { class: `skill-icon glyph-${s.glyph}` , html: icon(s.glyph) }),
      el('span', { class: 'skill-row-main' },
        el('span', { class: 'skill-row-top' },
          el('span', { class: 'skill-name' }, s.name),
          running ? el('span', { class: 'live-dot', title: 'action running' }) : null,
          !live ? el('span', { class: 'chip chip-wave' }, `Wave ${s.wave}`) : null),
        el('span', { class: 'bar bar-mini', 'aria-hidden': 'true' },
          el('span', {
            class: 'bar-fill', style: `width:${(prog.frac * 100).toFixed(1)}%`,
          })),
      ),
      el('span', { class: 'skill-level' }, String(sk.level)),
    );
    list.append(row);
  }
  root.append(list);
  return { node: root, update: () => {} };
}

/**
 * Skill detail: header + XP progress; action cards for playable skills,
 * a written coming-soon panel otherwise.
 */
export function renderSkillDetail(ctx, skillId) {
  const skill = SKILL_BY_ID[skillId];
  const sk = ctx.state.skills[skillId];
  const live = skill.wave === 0;

  const root = el('section', { class: 'screen' });

  root.append(el('header', { class: 'detail-head' },
    el('button', {
      class: 'icon-btn', 'aria-label': 'Back to skills',
      html: icon('back'), onclick: () => ctx.openSkillsList(),
    }),
    el('div', { class: 'detail-title' },
      el('h1', { class: 'screen-title' }, skill.name),
      el('p', { class: 'screen-sub' }, skill.tagline)),
  ));

  const prog = levelProgress(sk.xp);
  const xpWrap = el('div', { class: 'xp-block' },
    el('div', { class: 'xp-line' },
      el('span', { class: 'xp-level' }, `Level ${prog.level}`),
      prog.level >= 99 ? el('span', { class: 'chip chip-gold' }, 'Lantern-Master') : null,
      el('span', { class: 'xp-count muted' },
        prog.span === Infinity ? `${formatNumber(prog.into)} XP`
          : `${formatNumber(prog.into)} / ${formatNumber(prog.span)} XP`)),
    el('div', { class: 'bar bar-lg' },
      el('span', { class: 'bar-fill xp-fill', style: `width:${(prog.frac * 100).toFixed(1)}%` })),
  );
  root.append(xpWrap);

  if (skillId === 'combat') {
    const panel = renderCombatPanel(ctx);
    root.append(panel.node);
    return {
      node: root,
      update() {
        const p = levelProgress(ctx.state.skills.combat.xp);
        xpWrap.querySelector('.xp-level').textContent = `Level ${p.level}`;
        xpWrap.querySelector('.xp-count').textContent = p.span === Infinity
          ? `${formatNumber(p.into)} XP` : `${formatNumber(p.into)} / ${formatNumber(p.span)} XP`;
        xpWrap.querySelector('.xp-fill').style.width = `${(p.frac * 100).toFixed(1)}%`;
        panel.update();
      },
    };
  }

  if (!live) return comingSoon(root, skill);

  const cards = el('div', { class: 'action-list' });
  const refs = [];
  for (const action of actionsForSkill(skillId)) {
    const card = buildActionCard(ctx, action);
    cards.append(card.node);
    refs.push(card);
  }
  root.append(cards);

  return {
    node: root,
    update() {
      for (const r of refs) r.update();
      // refresh xp block text cheaply
      const p = levelProgress(ctx.state.skills[skillId].xp);
      xpWrap.querySelector('.xp-level').textContent = `Level ${p.level}`;
      xpWrap.querySelector('.xp-count').textContent = p.span === Infinity
        ? `${formatNumber(p.into)} XP` : `${formatNumber(p.into)} / ${formatNumber(p.span)} XP`;
      xpWrap.querySelector('.xp-fill').style.width = `${(p.frac * 100).toFixed(1)}%`;
    },
  };
}

function comingSoon(root, skill) {
  root.append(el('div', { class: 'empty-state' },
    el('span', { class: 'empty-icon', html: icon(skill.glyph) }),
    el('h2', { class: 'empty-title' }, 'The fog is thick here'),
    el('p', { class: 'empty-text' },
      `${skill.name} arrives in Wave ${skill.wave}. It will draw on what you gather and kindle now — keep the flame alive.`),
  ));
  return { node: root, update: () => {} };
}

function buildActionCard(ctx, action) {
  const status = () => ctx.actionStatus(action.id);

  const costChips = el('span', { class: 'chips' });
  const yieldChips = el('span', { class: 'chips' });
  const fill = el('span', { class: 'bar-fill', style: 'width:0%' });
  const timeLabel = el('span', { class: 'bar-time' }, '');
  const startBtn = el('button', { class: 'btn btn-primary btn-run' }, '');
  const toggleLabel = el('label', { class: 'auto-toggle' });
  const toggleInput = el('input', { type: 'checkbox' });
  const masteryBadge = el('span', { class: 'mastery-badge' }, '');

  function paintChips() {
    clear(costChips); clear(yieldChips);
    for (const c of action.costs ?? []) {
      const owned = bankCount(ctx.state.bank, c.id);
      costChips.append(el('span', {
        class: `chip ${owned >= c.qty ? 'chip-cost' : 'chip-cost chip-short'}`,
        title: ITEMS_BY_ID[c.id]?.name ?? c.id,
      }, `${ITEMS_BY_ID[c.id]?.name ?? c.id} ×${c.qty}`));
    }
    if (!(action.costs ?? []).length) costChips.append(el('span', { class: 'chip chip-free' }, 'no materials'));
    for (const o of action.outputs ?? []) {
      let text;
      if (o.kind === 'lumen') text = `+${o.qty} Lumen`;
      else if (o.kind === 'item') text = `+${o.min === o.max ? o.min : `${o.min}–${o.max}`} ${ITEMS_BY_ID[o.id]?.name ?? o.id}`;
      else text = `+${o.qty} ${o.id === 'flame' ? 'Flame' : o.id}`;
      yieldChips.append(el('span', { class: `chip ${o.kind === 'item' ? 'chip-yield' : 'chip-yield gold'}` }, text));
      if (o.chance !== undefined) yieldChips.lastChild.append(el('em', { class: 'chip-chance' }, ` ${Math.round(o.chance * 100)}%`));
    }
    yieldChips.append(el('span', { class: 'chip chip-xp' }, `${action.xp} XP`));
  }

  function paintToggle() {
    clear(toggleLabel);
    const st = status();
    toggleInput.checked = st.autoRestart;
    toggleLabel.append(toggleInput, el('span', { class: 'switch' }), el('span', { class: 'auto-text' }, 'Auto-restart'));
    toggleLabel.onclick = (e) => {
      e.preventDefault();
      ctx.setAutoRestart(action.id, !toggleInput.checked);
      paintToggle();
    };
  }

  function paintButton() {
    const st = status();
    startBtn.className = 'btn btn-run ' + (
      st.running ? 'btn-stop'
        : st.locked ? 'btn-ghost btn-disabled'
          : st.affordable ? 'btn-primary' : 'btn-ghost');
    startBtn.textContent = st.running ? 'Stop' : st.locked
      ? `Locked · Level ${st.lockLevel}` : st.affordable ? 'Start' : 'Need materials';
    startBtn.setAttribute('aria-disabled', st.locked ? 'true' : 'false');
  }

  function update() {
    const st = status();
    fill.style.width = st.running ? `${(st.frac * 100).toFixed(1)}%` : '0%';
    timeLabel.textContent = st.running
      ? formatSeconds(st.etaMs)
      : `${formatSeconds(st.durationMs)} / cycle`;
    masteryBadge.textContent = `Mastery ${st.mastery.level}`;
    paintButton();
  }

  startBtn.addEventListener('click', () => ctx.toggleAction(action.id));

  paintChips();
  paintToggle();
  update();

  return {
    node: el('article', { class: 'card action-card' },
      el('div', { class: 'action-head' },
        el('h2', { class: 'action-name' }, action.name),
        masteryBadge),
      el('p', { class: 'action-desc' }, action.desc),
      el('div', { class: 'action-chips' }, el('span', { class: 'chips-label' }, 'Costs'), costChips),
      el('div', { class: 'action-chips' }, el('span', { class: 'chips-label' }, 'Yields'), yieldChips),
      el('div', { class: 'action-barline' },
        el('div', { class: 'bar', role: 'progressbar', 'aria-label': `${action.name} progress`, 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill),
        timeLabel),
      el('div', { class: 'action-foot' }, startBtn, toggleLabel)),
    update,
  };
}

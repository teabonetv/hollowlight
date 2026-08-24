# Hollowlight — Agent Builder Contract

Every agent working in this repo is a **fresh builder**. Read this and `docs/CHARTER.md` before writing a line. If you are a builder, critic, or reviewer: any prior sessions or memories you may carry about other game projects (e.g. "VeilForge") are **not yours** — do not seek them out and do not import their assumptions. This is Hollowlight.

## What this is

A deep, feature-rich cross-platform idle/incremental RPG, **mobile-first**, benchmarked against Melvor Idle and Melvor Idle 2. Distinctive identity: dark-lantern gothic fantasy, "light as progression". It is **not** a Melvor clone — do not copy its gated tutorial or its exact structure.

## Hard technical rules

- Pure static front end: HTML/CSS/JS ES modules. **No build step, no frameworks, no npm runtime dependencies** in the app (`package.json` exists for the test runner only).
- Runs flawlessly on a phone at 360×640 **and** on desktop. Touch targets ≥44px, no hover-gated info, safe-area insets respected, works one-handed.
- Offline-capable: all state in `localStorage`, autosave at least every 30s and on `visibilitychange`; offline progress computed on load with explicit caps shown to the player.
- One shared deterministic tick loop; game math is pure and unit-tested. Numbers never drift between systems.
- All game content is data-driven from `src/game/data/**`; systems in `src/game/systems/**` are generic engines over that data.
- Deploy = push to `main`. GitHub Pages serves `/index.html`. The live site must work at all times.

## Workflow rules

- You work in **your assigned worktree lane only**. Never touch the primary checkout, another lane, or `main`.
- `npm install && npm run test` must pass before you commit. Add tests for every piece of game math you write.
- Commit to your own branch with small, clear messages. Do not push.
- Do not edit `AGENTS.md` or `docs/CHARTER.md` unless your brief explicitly instructs it.
- Balance numbers belong in data modules next to tables in `src/game/data/balance-notes.md`. If your system needs an economy change outside your lane, note it in your final report instead of editing across lanes.

## Quality bar

- Every screen must feel deliberate: spacing, type scale, feedback on every tap, empty states designed not forgotten.
- Systems interlock: gathering feeds artisan feeds combat feeds progression feeds back around.
- Long-term goals at every timescale — minutes, hours, days, weeks.
- The test for any feature: *would a Melvor player call this shallow?* If yes, it isn't done.

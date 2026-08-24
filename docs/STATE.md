# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 0.5 — FIX ROUND QUEUED (blocked before Wave 1) |
| Active lanes | — (campaign PAUSED by Luke; resume = dispatch F1b fix builder below) |
| Merged | F1 @ f1e52d6 (89/89 tests green on main; Pages deploy success) |
| Critic verdicts | none delivered yet (3 attempts: approval wall / iteration cap / user-paused) |
| Next | **PAUSED by Luke 13:54.** Independent /review (2026-08-24 ~16:40) verified two CRITICAL defects on live main: **D1** offline never assigns skill level (offline.js:114-118 — level desync, locked-content bug) · **D2** tinderscrap has no producer — Emberkeeping hard-capped at L3/420XP forever, fan-the-coals unreachable (actions.js). Plus D3 raw ids in offline modal, D4 journal no live-update, STATE.md dual-writer corruption, stale wt-f1 worktree, impossible offline-test method in critic briefs. Resume order: fresh builder lane F1b fixes D1+D2 (+tests asserting stored level == derived level; tinderscrap producer or free scavenge action) → D3/D4 one-liners → reconcile STATE.md + prune wt-f1 → THEN critic with corrected offline-test method (same-origin savedAt rewind) and split evidence/verdict passes. |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

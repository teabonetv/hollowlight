# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 0.5 — FIX ROUND IN FLIGHT |
| Active lanes | wt-f1b (fresh fix-builder, dispatched 2026-08-24 ~17:05) — fixes D1/D2/D3/D4 from independent review |
| Merged | F1 @ f1e52d6 (89/89 tests green on main; Pages deploy success) |
| Critic verdicts | none delivered yet (3 attempts: approval wall / iteration cap / user-paused) |
| Next | verify+merge F1b when done → redeploy → THEN critic with corrected offline-test method (same-origin savedAt rewind) and split evidence/verdict passes → verdict gates Wave 1 (S1,S2,S4). Campaign RESUMED by Luke ~17:04. |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

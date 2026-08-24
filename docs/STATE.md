# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 0.75 — RE-ROUND F1c IN FLIGHT |
| Active lanes | wt-f1c fix-builder — closing the critic's named gap |
| Merged | F1 @ f1e52d6 · F1b @ b5b2b50 (93/93 green; D1/D2 verified live) |
| Critic verdicts | **F1 v3 (2026-08-24 20:27): MELVOR wins, WOWED=no.** Single biggest gap: ZERO ECONOMY SINK — "3,300 fogwort and 51 lumen with nothing on earth to spend either on. The loop is clean, honest, and pretty — and then it just counts upward." Praise noted: clean/honest/pretty loop. Evidence: Temp/qa-critic/evidence.md E1-E27 + 21 screenshots incl. melvor-* side-by-side |
| Next | F1c closes the sink gap (camp trader sell + Lumen upgrade tracks, pre-S2 scope) → verify+merge+deploy → critic v4 re-judge |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

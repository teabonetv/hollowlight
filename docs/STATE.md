# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 1 GATE — F1 re-judge (critic v4) next |
| Active lanes | critic v4 about to dispatch; no builder lanes in flight |
| Merged | F1 @ f1e52d6 · F1b @ b5b2b50 · **F1c @ 4cf99ea** (120/120 green on merged main incl. 27 camp-economy/UI tests; deploy success, upgrades.js live) |
| Critic verdicts | F1 v3: MELVOR wins, WOWED=no — gap: zero economy sink ("3,300 fogwort and nothing to spend it on") |
| Next | critic v4 judges the sink-closed build blind → pass ⇒ Wave 1 (S1,S2,S4) / loss ⇒ named gap ⇒ new re-round lane. NOTE: heartbeat double-dispatch collision during F1c resolved — DISPATCH LOCK added to heartbeat prompt; unreferenced trader stubs excised pre-merge (3332f0f) |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

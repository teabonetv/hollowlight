# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 0.8 — RE-ROUND F1d IN FLIGHT |
| Active lanes | wt-f1d fix-builder — offline persistence + sell-all UX + boot resilience |
| Merged | F1 · F1b · F1c @ 4cf99ea (120/120 green; sink live) |
| Critic verdicts | v3: MELVOR (no sink) → fixed by F1c. **v4: MELVOR, WOWED=no** — gaps: (1) offline never computes: save has actions.active:{} while action runs (Conductor reproduced; runner state not persisted; modal code OK) (2) Sell All >25 needs second tap + confirm can be clobbered by live re-render (works when completed; Conductor verified 62→182✦) (3) blank boot on transient 503. Noted: our UI craft scored 8 vs Melvor 7 |
| Next | F1d fixes the three → verify+merge+deploy → critic v5 (told Sell All is two-tap by design; judge as player) → pass ⇒ Wave 1 |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

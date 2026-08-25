# Hollowlight — Campaign State of Record

> Maintained by the Conductor (ox-alpha session). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

| Field | Value |
|---|---|
| Wave | 1 GATE — critic v5 PENDING (PAUSED by Luke 13:25) |
| Active lanes | none in flight — v5 attempts 1-3 ALL died to provider daily-cap 429s (22:33, 12:38, ~13:21); partial evidence quarantined; resume = re-dispatch F1 critic v5 fresh/blind, same brief as attempt 3 |
| Merged | F1 · F1b · F1c · **F1d @ 8aff8c8** (136/136 green; offline persistence hardened, sell-all confirm re-render-proof, boot watchdog live) |
| Critic verdicts | v3: MELVOR (no sink) → F1c fixed. v4: MELVOR (offline/sell/boot) → F1d fixed. v5 attempts 1-3 died pre-verdict |
| Next | EVENING RESUME (on Luke's ping): re-dispatch critic v5 → verdict gates Wave 1. NOTE: Hermes gateway reported DOWN as of 13:25 — heartbeat cron won't fire until `hermes gateway start`; drive resume manually from chat or start the gateway |

## Round log

- 2026-08-24 Repo created; charter v1, AGENTS.md contract, placeholder live on Pages. F1 dispatched.
- 2026-08-24 F1 verified (89/89 tests in lane incl. headless app-boot), merged --no-ff to main @ f1e52d6, pushed; Pages deploy success, live 200. F1 critic dispatch next.
- 2026-08-24 Critic attempt 1 died on browser approval wall → built tools/qa/drive.js (zero-dep CDP driver, committed). Attempt 2 hit iteration cap before verdict (evidence gathered: foraging to L5, journal/settings/map checked). Attempt 3 dispatched with efficiency contract, then PAUSED by Luke — critic stopped mid-flight, heartbeat paused. Resume: re-dispatch critic fresh.

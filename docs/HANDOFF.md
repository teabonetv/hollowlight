# Hollowlight Campaign Handoff — READ ME FIRST

You are taking over as **Conductor** of an ongoing multi-agent game-building campaign. This document is complete: read it and you know everything the previous conductor knew.

---

## 1. What this project is

**Hollowlight** — a mobile-first idle/incremental RPG benchmarked against Melvor Idle 1 & 2. Dark-lantern gothic fantasy; "light is progression". NOT a Melvor clone.

- **Repo:** https://github.com/teabonetv/hollowlight (local: `C:/Users/Luke/hollowlight`, branch `main`)
- **Live site (always must work):** https://teabonetv.github.io/hollowlight/ — GitHub Pages, deploys automatically on push to `main`, gated by tests (Actions workflow `.github/workflows/deploy.yml`)
- **Design bible (binding):** `docs/CHARTER.md` — 8 skills, 12 beacon-settlements, Radiance prestige, systems inventory
- **Builder contract (binding):** `AGENTS.md` — pure static HTML/CSS/JS ES modules, NO build step, NO npm runtime deps, mobile-first 360×640, offline-capable localStorage saves, deterministic ticks, data-driven content in `src/game/data/**`
- **State of record:** `docs/STATE.md` — read it FIRST every session; keep it factual and updated (commit+push after changes)
- **Critic protocol:** `docs/CRITIC.md` — binding for all reviewers
- **Lane briefs (Wave 1, ready to use):** `docs/lanes/S1-combat.md`, `S2-economy-bank-shops.md`, `S3-artisan-skills.md`, `S4-progression-meta.md`, `S5-world-map-beacons.md`, `S6-feel-polish-mobile.md`
- **Art pipeline:** PixelLab MCP server installed (79 tools) + REST fallback (`docs/ART-PIPELINE.md`). 40-generation trial budget — batch sparingly.
- Owner: Luke ("TeaBone"), teabonetv@gmail.com. Git identity configured locally. Push works via Windows credential manager PAT (never print tokens).

## 2. The campaign method (Luke's explicit design — do not dilute)

1. **Fresh-agent builder lanes**: every builder is a brand-new `delegate_task` leaf agent with zero prior context, working ONLY in its own git worktree (`C:/Users/Luke/hollowlight-wt-<lane>` on branch `wt-<lane>`, created with `git worktree add -b wt-<lane> C:/Users/Luke/hollowlight-wt-<lane> main`). Briefs must be fully self-contained. Builders commit but NEVER push.
2. **Conductor verifies personally** — never trust a builder's report: `git log/diff` in the lane, run `npm run test` INSIDE the lane, check for phantom deletions, then `git merge --no-ff wt-<lane>` into main, re-run tests on merged main, push (Pages auto-deploys), watch the Actions run.
3. **Hostile critic per lane** (`docs/CRITIC.md`): fresh blind agent, forbidden from reading git history/STATE.md/builder reports/other critics' evidence. Plays the LIVE build vs https://melvoridle.com side by side. Forced verdict: HOLLOWLIGHT/MELVOR/TIE + WOWED yes/no + SINGLE BIGGEST GAP + TOP 5 FIXES + EVIDENCE + scored table. A crash/broken promise = automatic MELVOR.
4. **Re-rounds, no fixed count**: any non-pass verdict ⇒ its SINGLE BIGGEST GAP goes to a NEW fresh builder in a NEW lane. Repeat until WOWED.
5. **Between major waves**: one fresh whole-game player/smoothing agent plays everything end-to-end and smooths into coherence, then re-critique.

## 3. Hard-won operational knowledge (each cost us a failed attempt)

### Dispatching agents
- Use Hermes `delegate_task` (leaf agents, background). Check `delegate_task(action='list')` AND `docs/STATE.md` "Active lanes" before ANY dispatch — **DISPATCH LOCK: never two agents in one worktree; if STATE.md says a lane is "in flight", another session owns it — do not re-dispatch; only the primary chat may declare a lane dead.** (A violation caused a real collision already; resolved, rule added.)
- The conductor heartbeat cron (`job_id: 376d42f25870`, every 45m, continuity on) exists to advance the campaign autonomously. NOTE: the Hermes **gateway was DOWN** as of Aug 25 ~13:25 — cron jobs don't fire until `hermes gateway start`. Either start it or drive everything manually from chat.

### Driving the browser (critics AND your own verification)
Use the committed zero-dependency CDP driver — **never browser_exec/computer_use for this (approval walls kill background agents)**:

```
node C:/Users/Luke/hollowlight/tools/qa/drive.js reset          # fresh browser + wiped save
node C:/Users/Luke/hollowlight/tools/qa/drive.js goto <url> [waitMs]
node C:/Users/Luke/hollowlight/tools/qa/drive.js debug           # page state JSON
node C:/Users/Luke/hollowlight/tools/qa/drive.js click "<css>"
node C:/Users/Luke/hollowlight/tools/qa/drive.js eval "<js>"
node C:/Users/Luke/hollowlight/tools/qa/drive.js shot <out.png> 360 640    # or 1440 900 desktop
node C:/Users/Luke/hollowlight/tools/qa/drive.js errors [clear]
```

One persistent headless Chrome + profile across invocations (localStorage survives — use for save/offline tests).

**Offline-progress test method** (the app resets its timer on unload — naive wait-and-reload shows NOTHING; three early critics burned out on this): start action w/ auto-restart ON → note stats → `goto .../src/game/data/items.js` (same-origin non-app page) → `eval` rewind `savedAt` inside the `hollowlight.save` localStorage key by 3h → `goto` back → "While You Were Away…" modal must show itemized capped gains → claim → verify level consistency everywhere.

### Environment quirks (Windows host, git-bash shell)
- Native tools need forward-slash paths (`C:/Users/...`); git-bash mangles `$_` in PowerShell one-liners (write .ps1 files instead).
- `npm run test` = `node --test "tests/**/*.test.js"` (the explicit glob is required on Windows Node 24).
- curl can't read `/tmp` — use `$LOCALAPPDATA/Temp`.
- Worktree removal may hit Windows file locks: `git worktree remove --force` then `git worktree prune`.
- Screenshots/artifacts go under `C:/Users/Luke/AppData/Local/Temp/qa-critic/`; each critic writes its OWN evidence file (v5c-evidence.md naming pattern) and must not read earlier ones (blind judging).

## 4. Current state (as of handoff, evening Aug 25)

**Merged & deployed** (all verified by conductor before merge):
- F1 foundation @ f1e52d6 — engine, saves/offline, XP curve, RNG, registries, action-runner, 2 playable skills (Emberkeeping, Foraging), mobile gothic shell
- F1b fixes @ b5b2b50 — offline assigns skill levels; tinder economy interlock (Gather Herbs drops tinderscrap 30%)
- F1c sink @ 4cf99ea — bank selling (Sell 1/10/All two-tap >25) + 3 upgrade tracks ×6 tiers (`src/game/data/upgrades.js`) threading REAL effects through engine math
- **F1d reliability @ 8aff8c8 ← current HEAD area** — runner 'stopped' event, hide-persist/compute-before-restamp ordering, re-render-proof sell confirm (component-state keyed, 6s window), boot watchdog (`__HOLLOWLIGHT_BOOTED` + styled fallback)
- Tests: **136/136 green**. Live site serves the F1d build.

**Critic history:**
- v3: MELVOR (no economy sink) → closed by F1c
- v4: MELVOR (offline never computed — runner state not persisted; sell-all felt dead; blank boot on 503) → closed by F1d
- v5: **NOT YET DELIVERED — four attempts (22:33 Aug 24, 12:38, 13:21, 20:08 Aug 25) ALL died to HTTP 429 provider daily-cap errors mid-run**, not to any brief problem. Partial evidence quarantined in Temp/qa-critic (v5*, critics must not read each other's work).

**THE IMMEDIATE NEXT STEP:** re-dispatch critic v5 (fresh, blind) with the proven brief — see §5. Its verdict gates Wave 1:
- PASS ⇒ dispatch Wave 1 lanes S1 (combat), S2 (economy depth), S4 (progression meta) in parallel worktrees per `docs/lanes/*.md` briefs (embed each brief file's content fully in each agent's context).
- LOSS ⇒ named gap ⇒ new fix lane, same loop.
- After all Wave 1 lanes pass: whole-game smoother agent, then Wave 2 (S3/S5/S6).

## 5. Critic v5 brief (proven template — reuse verbatim, bump evidence filename)

Send as ONE `delegate_task` call, goal="Hostile blind review…", context=everything:

```
YOU ARE A FRESH HOSTILE CRITIC AGENT. Protocol: read C:/Users/Luke/hollowlight/docs/CRITIC.md first — binding.
FORBIDDEN: git history, docs/STATE.md, docs/lanes/, builder reports, prior critics' transcripts/evidence.
TWO-PASS STRUCTURE (binding): PASS 1 — play/test, append findings after EVERY batched call to
C:/Users/Luke/AppData/Local/Temp/qa-critic/<NEWNAME>-evidence.md (bullet: did/saw/numbers).
PASS 2 — sufficient evidence OR ~25 calls ⇒ stop, write verdict as final message.
Batch 3-6 drive.js commands per terminal call with &&.
SLICE: full game — coherence, honesty, depth. RELIABILITY first (offline, sells, saves, boot), then pull.
LIVE BUILD: https://teabonetv.github.io/hollowlight/
DRIVE ONLY WITH node C:/Users/Luke/hollowlight/tools/qa/drive.js (never browser_exec/computer_use):
reset | goto <url> [waitMs] | debug | click "<sel>" | eval "<js>" | shot <out.png> 360 640 | errors
OFFLINE METHOD: start action auto-restart ON → note stats → goto .../src/game/data/items.js →
eval rewind savedAt inside hollowlight.save by 3h → goto back → modal shows itemized gains →
claim → verify consistency. Modal+capped gains+clean claim = PASS.
KNOWN DESIGNS (judge execution not existence): Sell All >25 = two-tap confirm (~6s window);
map locked future beacons; skill rows for future waves.
REQUIRED CHECKS: fresh start 10min feel; both skills past Lv5; earn→spend incl. two-tap Sell All
over 25 units (verify exact payout); buy an upgrade and MEASURE effect (timing/yield/xp delta);
reload mid-action; offline rewind; export→reset→import; every tab; mobile 360x640 AND desktop
1440x900 shots of camp+skills+bank; console errors [] at end.
MELVOR BENCHMARK: ≤6 calls, https://melvoridle.com 8000, toward free gameplay, screenshot, re-goto back.
FINAL MESSAGE (mandatory, deliver even if incomplete): VERDICT (forced HOLLOWLIGHT/MELVOR/TIE) ·
WOWED yes/no · SINGLE BIGGEST GAP · TOP 5 FIXES ranked+concrete · EVIDENCE (pointers) ·
SIDE-BY-SIDE TABLE (3-5 dimensions /10 both sides, one-line justifications).
```

## 6. Known live issues / deferred items (do not lose these)

- Multi-tab last-writer-wins save clobber — structural, deliberately deferred (needs architecture decision).
- Desktop at 1440×900 is a centered phone column (critic dinged it; S6 owns the fix).
- Only 2 of 8 skills playable; Lv5/Lv10 gates arrive fast (~15 min content) — Wave 1 breadth is the answer, critics were told not to demand more before Wave 1.
- UI craft scored 8 vs Melvor 7 in v4 — our strongest dimension; protect it while fixing function.

## 7. Luke preferences (binding style)

Direct, high-signal, no fluff, UK English. He wants the campaign run like a studio: he is the owner, the conductor is chief-of-staff. He says "pause" ⇒ stop everything (kill subagents, pause cron, update STATE.md, push). He says "continue" ⇒ execute exactly the Next line in STATE.md. Never surface secrets; never print tokens; don't touch other projects (VeilForge is paused).

# Hollowlight — Campaign State of Record

> Maintained by the Conductor (Game Orchestrator). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file. Conductor decision: do not freelance extra systems.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

Recorded 26 Aug 2026 ~13:04 UK. Fossil F1d / critic-v5-paused table is void.

| Field | Value |
|---|---|
| Wave | 1 OPEN — polish in flight. Phase A = Wave 2, **after** Wave 1 reliability gates. Do not pause current lanes. |
| HEAD | **1a85bc8** — Merge S2f owned tile names wrap. **299/299**. **SAVE_VERSION 5**. |
| Live | https://teabonetv.github.io/hollowlight/ |
| Active lanes | **S4f** in flight (boot-fallback on 3h rewind, Grok 4.6). **S1f** combat critic v24 playing. **S2f** bank-names critic queued behind that driver. |
| Recent merges | S4e Almanac honesty **577d15b**; S1f eat heal **650dbe2**; S2f names **1a85bc8**. |
| Critic verdicts | Combined lead critic 26 Aug 2026: **MELVOR**. Luke signed the cut of three plans via the Reviewer pass. S4e v23 **MELVOR**: LOG honesty passed (0=0, no tab-open pad); auto-fail first paint after 3h rewind was `#boot-fallback` (why S4f exists). S2e v22 first **HOLLOWLIGHT** slice (Sell Mode held). |
| Item budget | Charter v1 item budget is now ~400–500 live-use; Phase A still ships on existing goods, Phase F fills the lattice. |
| Next | finish Wave 1 (S4f boot, then S1f/S2f critics) → Phase A (doll after first chimney, Chandlercraft, spend Flame/Souls, Warden rite, hide 11 stretches, brass lantern Camp hero). |

## Signed expansion spine (26 Aug 2026)

Luke signed this cut. Conductor records it; builders are not briefed until Wave 1 Next is done. Do not implement in this docs pass. Do not bump `SAVE_VERSION`.

**Wave 1 does not change.** Finish current polish before Phase A:

1. **S4f:** first paint after 3h rewind is live + recap, never `#boot-fallback`.
2. **S1f** critic (eat heal constant) then **S2f** critic (bank names wrap).
3. Do not pause those lanes.

**After Wave 1 reliability gates: PHASE A = Wave 2.** Exit test: herbs → craft oil → equip chimney → Warden, no “later” toast. Then a hostile critic. If still not WOWED, do not open Mining shafts / Emberfall.

### Phase A ship list (this is the Next line)

1. **Six slots combat reads:** weapon, lantern, head, hands, cloak, tool. 2×3 grid appears when the first chimney is smithed — **not** on minute one. Tool is skilling only (never combat damage). Lantern is the class (oil seconds, fog-bite, acc while fed). Start fights at `playerMaxHp`, not 36/40. Combat level: keep +4 HP, add +1 acc per 2 levels, +1 max hit per 5. Wear law: hold later drops, cannot wear until that beacon is kindled.
2. **Chandlercraft** on existing goods + first Smithing hammer/striker. Recipes: Fogwort+Grave-resin→Lamp-oil; Fogwort+Pale-cap→Lantern-loaf; Rushwick→Wick-spool→Wick-oil; Fogwort+Pale-cap+Tinderscrap→Fog-hood. Stall is mercy/cosmetics, not the armoury. Combat stops always-stocking loaf/oil except a tinder mercy. **Do not dump 184 recipes in Phase A.**
3. **Spend Flame** (camp/altar/kindling) and **Souls** (one lantern rite per fight). Auto-eat is a camp buy. HUD numbers that never fall are bugs.
4. **Honest completion denominator** (live rows only; no empty 99s). Hide 11 unkindled stretches behind one row. Camp: Tend the Flame on the first screen (verbs above the fold). One action at a time until a second-wick lantern perk.
5. **Warden key** starts a camp rite that unlocks Hearthway crafts / Vesper road — not “Beacon ceremony (later)”.
6. **Art:** keep typographic UI; paint the nouns. Camp hero + home icon = the brass lantern (`docs/art-tests/lantern-test.png`). 64px wear/eat portraits, 48px moth. Wrap later with Capacitor; do not rebuild in Unity.

### CUT (not Next; do not brief builders)

8-term power formula; 184 recipes in week one; 72 Radiance perks; warmth/elites/wick-snuff in Phase 0; Melvor Attack/Str/Def split; stall as armoury; six-slot doll on minute one; parallel skills before second-wick perk; 11 stretch toasts; loadouts that “never extra power” (delete that line when slots ship).

### Later phases (map only)

- **B** — road
- **C** — factory / oil tiers
- **D** — loadouts / sets
- **E** — late laws
- **F** — fill the live-use lattice to ~400–500 items

## Round log

- 2026-08-24 Repo created; charter v1 (~120 items printed), AGENTS.md, Pages live. F1 foundation @ f1e52d6. Critics: v3 MELVOR (no sink) → F1c; v4 MELVOR (offline/sell/boot) → F1d @ 8aff8c8. Early v5 attempts died on provider 429s; Wave 1 opened on combat / bank / meta anyway.
- 2026-08-25 Wave 1 unions: S1 combat (save v3), S2 bank+store, S4 Radiance/Almanac (save v4). Re-rounds S1b–S1e, S2b–S2e, S4b–S4d. SAVE_VERSION 5 with Almanac LOG + leftover eat station.
- 2026-08-26 S2e critic v22: first **HOLLOWLIGHT** slice (Sell Mode held). S4e Almanac honesty @ 577d15b; critic v23 **MELVOR** — LOG 0=0 passed, first paint after 3h rewind was `#boot-fallback` → **S4f**. S1f eat heal @ 650dbe2. S2f names wrap @ **1a85bc8** (299 tests, SAVE_VERSION 5). Combined lead critic **MELVOR**; Luke signed the expansion cut (Phase A after Wave 1). Owner amend: charter item budget ~400–500 live-use; Phase A still ships on existing goods, Phase F fills the lattice.

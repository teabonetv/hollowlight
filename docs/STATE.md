# Hollowlight — Campaign State of Record

> Maintained by the Conductor (Game Orchestrator). Every heartbeat: read this, advance exactly one step, update it. Builders and critics never edit this file. Conductor decision: do not freelance extra systems.

- **Project:** Hollowlight — mobile-first idle RPG benchmarked vs Melvor Idle 1 & 2.
- **Repo:** https://github.com/teabonetv/hollowlight · Live: https://teabonetv.github.io/hollowlight/
- **Method:** fresh-agent builder lanes in git worktrees (`wt-*`), verified + merged by Conductor, then a FRESH hostile critic per lane judges the LIVE game blind against Melvor 1/2 with a forced verdict. Loss ⇒ named single biggest gap ⇒ builder re-round. No fixed round count. Between major waves: one fresh whole-game player/smoothing agent.

## Status

Recorded 26 Aug 2026 ~21:21 UK. Fossil F1d / critic-v5-paused table is void.

| Field | Value |
|---|---|
| Wave | 1 OPEN — polish in flight. Phase A = Wave 2, **after** Wave 1 reliability gates. Do not implement Phase A in this commit. |
| HEAD | **8a1503b** — Merge S2h Times Found never 0 (#30). **326/326**. **SAVE_VERSION 5**. |
| Live | https://teabonetv.github.io/hollowlight/ — Pages already serving `floorItemFoundToHeld` + `OPENING_WINDUP_MS` 1200 as of 26 Aug 2026 ~21:20 UK. |
| Active lanes | **S4g** critic v29 playing live recap persist. **S1h** first-Hunt critic and **S2h** Times Found critic queued behind the same driver. |
| Recent merges | Evening 26 Aug ~21:19 UK, in order: #28 S4g recap persist `46fadb4` (321 tests at merge); #29 S1h first Hunt windup `fabdb93` (323 tests at merge); #30 S2h Times Found `8a1503b` (326 tests stacked). Earlier today: #24 docs, #25 S4f, #26 S2g, #27 S1g unioned to `5c1f328` (319 tests). |
| Critic verdicts | Combined lead still **MELVOR** / not wowed. S2g v28 letter held; gap was Times Found 0 on starter (why S2h exists). |
| Item budget | Charter v1 item budget is now ~400–500 live-use; Phase A still ships on existing goods, Phase F fills the lattice. |
| Next | finish Wave 1 critics on this live build (**S4g** recap persist: reload with recap open still offers recap, savedAt stays rewound until Claim, no dismiss X. Then **S1h**: Pale Moth still up ~400ms after Hunt. Then **S2h**: starter Rushwick Times Found never 0). Then Phase A (doll after first chimney, Chandlercraft, spend Flame/Souls, Warden rite, hide 11 stretches, brass lantern Camp hero). |

## Signed expansion spine (26 Aug 2026)

Luke signed this cut. Conductor records it; builders are not briefed on Phase A until Wave 1 Next is done. Do not implement Phase A in this docs pass. Do not bump `SAVE_VERSION`.

**Wave 1 does not change.** Finish current polish before Phase A. This commit's Next is Wave 1 critics, not Phase A:

1. **S4g** critic (v29, in flight): recap persist — reload with recap open still offers recap, savedAt stays rewound until Claim, no dismiss X.
2. **S1h** critic: Pale Moth still up ~400ms after Hunt.
3. **S2h** critic: starter Rushwick Times Found never 0.
4. Do not pause those lanes. Do not start Phase A until those critics finish.

**After Wave 1 reliability gates: PHASE A = Wave 2.** Exit test: herbs → craft oil → equip chimney → Warden, no “later” toast. Then a hostile critic. If still not WOWED, do not open Mining shafts / Emberfall.

### Phase A ship list (Wave 2 after Wave 1 gates — not this commit's Next)

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
- 2026-08-26 evening HEAD **8a1503b**. Earlier today #24 docs, #25 S4f, #26 S2g, #27 S1g unioned to `5c1f328` (319 tests). Evening ~21:19 UK: #28 S4g recap persist `46fadb4` (321), #29 S1h first Hunt windup `fabdb93` (323), #30 S2h Times Found `8a1503b` (326 stacked). Live Pages serving `floorItemFoundToHeld` + `OPENING_WINDUP_MS` 1200 (~21:20 UK). Combined still **MELVOR** / not wowed. S2g v28 letter held; gap was Times Found 0 on starter → S2h. Wave 1 critics next on this live build; Phase A after those gates.

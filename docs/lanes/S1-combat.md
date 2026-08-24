# Lane S1 Brief — Combat & Enemies

You are a **fresh builder** (lane S1). Read `AGENTS.md`, `docs/CHARTER.md`, and your lane root's copy of this brief first. Any memories you seem to carry about other game projects are not yours — this is Hollowlight.

## Scope
Combat is Hollowlight's crown system. Build it to Melvor depth:
- Real-time combat vs AI enemies: player and enemy act on their own tick timers (weapon speed matters); damage ranges, accuracy/avoidance, styles (melee/ranged/magic-equivalent: Strike / Shot / Rite), style-specific bonuses.
- Enemy roster ≥40 across tiers, data-driven (`src/game/data/enemies/**`): pale-things, fog-wights, marsh horrors, each with loot tables (coins, food, equipment, alchemy mats), xp, souls.
- 12 combat zones mapped to settlements along the pilgrim road, unlocked by beacon progression; zone-level requirements shown honestly.
- Food/oil consumption during combat with auto-eat/auto-brew thresholds purchasable later.
- Death: lose nothing permanent but drop carried Lumen at the death site (recoverable by walking back) — harsh but recoverable, charter §4.6.
- Guardian bosses: 12 unique bosses, one per settlement, multi-phase stat behaviour (enrage thresholds, mechanic telegraphs in the combat log).
- Vigils (slayer-style contracts): assigned target categories, completion rewards, escalating tiers.
- Combat log panel with readable history; seeded RNG per encounter (deterministic replay).
- Full unit tests for damage/accuracy/xp math and loot table rolls.

## Quality bar
Every fight should produce a decision: eat now or one more hit? swap style? push to the next zone? If combat is "press start, watch numbers", it fails the critic.

## Deliverable
Working combat reachable from the app shell, committed to your branch `wt-s1`. Final report: what was built, file map, test summary, balance notes added to `src/game/data/balance-notes.md`, known gaps, `git log --oneline`.

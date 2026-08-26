# Hollowlight — Design Charter (v1)

The single source of design truth. Builders implement this; critics judge against it and against Melvor Idle 1 & 2.

## 1. Identity

**Hollowlight** is a dark-lantern gothic idle RPG about carrying light back into a world that lost it. The player is the Lampwright: the last person able to kindle Hollowflame, the ember that lights settlements, wakes guardians, and burns back the pale fog that ate the sun.

- **Tone:** quiet, reverent, melancholy-then-triumphant. Gothic but warm — candlelit cathedral, not gore.
- **The hook:** *light is progression.* Nearly every system produces or spends Light — as literal currency (Lumen), as territory (relit beacons), and as power (Radiance).
- **Distinct from Melvor:** Melvor is a clean spreadsheet-fantasy sandbox with 12 parallel skills gated behind levels. Hollowlight is **a journey through a dark map**: skills are *crafts of the lantern trade*, tied to places you relight. Progression is spatial and narrative as well as numeric. No clone structure, no gated tutorial.

## 2. The world

A drowned valley kingdom called **the Hollow**. Twelve beacon-settlements along an old pilgrim road, each snuffed in a different calamity. The player walks it end to end, relighting each one. Each settlement unlocks new crafts, enemies, recipes, and a guardian boss.

## 3. Skills — the crafts of light

Eight skills, all active from the start, deepening rather than gating:

| # | Skill | Fantasy | Produces |
|---|---|---|---|
| 1 | **Emberkeeping** | tend the personal flame; fuel, wicks, flame quality tiers | Flame units, Radiance |
| 2 | **Foraging** | gather what still grows in the fog-dark | herbs, fungi, resins |
| 3 | **Mining** | dig the old shafts for emberstone | ores, coal, gems |
| 4 | **Fishing** | fish the black meres by lanternlight | fish, oddities |
| 5 | **Chandlercraft** (artisan) | candles, oils, tallow, wicks | consumables, Light goods |
| 6 | **Smithing** (artisan) | lantern-hardware, tools, weapons | gear frames, tools |
| 7 | **Almanac** (scholar) | study relics, chart stars, decode pilgrim journals | knowledge, permanent bonuses |
| 8 | **Combat** | fight the pale-things and their lords | loot, souls, settlement keys |

Plus two **meta-progressions**:
- **Radiance** — a slow, never-resets prestige resource earned from ALL skills; spent on a constellation grid of permanent perks.
- **The Almanac** doubles as completionist meta: bestiary, relic codex, star charts.

## 4. Systems inventory (each must reach Melvor depth)

1. **Core engine:** deterministic ticks, save/load/migration, offline progress with caps, number formatting, settings (incl. reduced motion), notifications queue.
2. **Actions & loops:** every skill = start/stop action with progress bar, per-action costs/outputs, mastery per action, auto-restart toggles unlocked via upgrades.
3. **Items & bank:** stackable/equippable, weightless bank with tabs + search + presets, sell values, item database screen.
4. **Economy:** Lumen currency, general store, buy/sell multipliers, money sinks (upgrades, repairs, offerings).
5. **Equipment & stats:** slots (Lantern head, hands, cloak, tool, weapon), derived stats, set bonuses.
6. **Combat:** turn-free real-time vs AI, zones by settlement, food/oil consumption, death penalty that is harsh but recoverable, slayer-style contracts ("Vigils"), guardian bosses per settlement.
7. **Mastery & XP curves:** per-action mastery levels, skill level curve to 99+ with soft-caps, XP tables shared game-wide.
8. **Upgrades & shops:** per-skill upgrade trees, global upgrades, unlock purchases with escalating costs.
9. **Prestige (Radiance):** reset-flavoured without wiping progress — spend accumulated Radiance on constellation perks; deeper resets later.
10. **Completion/log book:** percentages per category, achievements with rewards, statistics page.
11. **Offline & mobile UX:** offline gains modal, push-style notification log, touch-first controls, one-hand reach layout, haptics hooks.
12. **Narrative layer:** journal entries on milestones, settlement stories, NPC voices — short, well-written, skippable.

## 12 systems, 8 skills, 12 settlements, ~400–500 live-use items, 40+ enemies, 12 bosses at v1.0 scope.

**Live-use (law):** an item counts toward the budget only if it has a use in play — wear, eat, fuel, recipe input/output, or a hunt drop that feeds a slot. Flavour-only and empty registry rows do not count. Skills stay eight; places stay twelve. Owner amend 26 Aug 2026 (was ~120). The lattice fills across later phases; do not dump the full count into Wave 1 or Phase A.

## 5. Non-negotiables

- Mobile-first: every screen designed at 360×640 first, then desktop enhanced.
- Offline progress must work and be shown honestly (with caps).
- No dead content: everything craftable/buyable/fightable feeds another system.
- Determinism: same seed + same actions = same results (combat RNG seeded per-encounter).
- Save integrity: versioned saves, migration path, export/import.

## 6. Benchmark protocol

Critics compare the LIVE build against Melvor Idle 1 and Melvor Idle 2 side by side, blind-labelled where feasible, forced verdict "which is better", and name the single biggest gap on any loss. A win is only counted when the critic says they would rather keep playing ours.

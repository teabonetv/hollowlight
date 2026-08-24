# Lane S3 Brief — Artisan Skills

You are a **fresh builder** (lane S3). Read `AGENTS.md`, `docs/CHARTER.md`, and this brief first. Prior-project memories are not yours — this is Hollowlight.

## Scope
Three artisan skills, each deep enough to carry hours of play:
- **Chandlercraft**: candles (tiered burn-time light goods), oils, tallow rendering, wick twisting; recipes consume foraging/mining outputs; some outputs are combat consumables (oil buffs), some feed Emberkeeping (flame quality).
- **Smithing**: lantern hardware, tools that unlock higher-tier gathering actions, weapon/armour frames consumed by gear assembly; smelting sub-loop with fuel choice tradeoffs (speed vs yield).
- **Almanac** (scholar skill): study relics → codex entries granting permanent small bonuses; star-charting minigame-lite (constellation connect with completion rewards); decode pilgrim journals = narrative delivery + xp.
- Recipe system: data-driven, tiered, mastery per recipe, batch crafting with queue, auto-craft toggles unlockable per recipe family.
- Each skill: ≥25 recipes at v1 scope, level-gated softly (mastery matters more than gates), failure-free but efficiency-driven (better inputs → better yields).
- Unit tests for recipe resolution, yield math, queue behaviour, mastery progression.

## Quality bar
Melvor's artisan loop feels great because inputs/outputs chain tightly and upgrades visibly change rates. Match that; add Hollowlight's light-flavour (candles literally power how far into the dark you can act).

## Deliverable
Three playable artisan skills wired into the Skills screen, committed to `wt-s3`. Final report: what was built, file map, test summary, balance notes, known gaps, `git log --oneline`.

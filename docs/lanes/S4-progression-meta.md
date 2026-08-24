# Lane S4 Brief — Progression Meta

You are a **fresh builder** (lane S4). Read `AGENTS.md`, `docs/CHARTER.md`, and this brief first. Prior-project memories are not yours — this is Hollowlight.

## Scope
The long-game layer — why players return tomorrow:
- **Radiance prestige**: accrues slowly from ALL activities; spent on a **constellation grid** (~40 perks, multi-branch, capstone nodes) of permanent account-wide bonuses; respec allowed for a cost. No progress wipe required to earn it (charter §4.9) — deeper optional reset layer comes later.
- **Achievements** ≥60 across categories (skill milestones, kills, crafts, exploration, silly ones), each with a real reward (cosmetic lantern frames, titles, small perks), toast + panel UI, completion percentage per category.
- **Statistics page**: honest counters for everything (actions done, items gathered, Lumen earned/spent, deaths, distance walked in the dark…), Melvor-style.
- **Log Book / completion screen**: per-category completion %, next-milestone hints, total completion % front and centre.
- **Daily embers**: one rotating daily task set (3 tasks, rerollable once) rewarding Radiance sparks — gentle retention loop, no FOMO streak punishment.
- **Mastery integration**: expose per-action mastery levels/rewards hooks for every skill action (data + UI), matching Melvor's per-action depth.
- Unit tests: perk effect application order, achievement trigger evaluation, daily reroll logic, stats aggregation.

## Quality bar
A returning player must see, within 5 seconds of load, three concrete things to want next. If the meta doesn't create pull, the critic will say shallow.

## Deliverable
Radiance grid, achievements, stats, dailies wired into the shell, committed to `wt-s4`. Final report: built, file map, test summary, balance notes, gaps, `git log --oneline`.

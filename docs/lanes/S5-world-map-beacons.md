# Lane S5 Brief — World, Map & Beacon Progression

You are a **fresh builder** (lane S5). Read `AGENTS.md`, `docs/CHARTER.md`, and this brief first. Prior-project memories are not yours — this is Hollowlight.

## Scope
Hollowlight's distinctive spine — the journey through the dark:
- **The Map**: stylised vertical pilgrim road through the Hollow, 12 beacon-settlements from Ashfen (start) to the Last Gate; pan/zoom-friendly, readable at 360×640, SVG/CSS art direction consistent with the candlelit-gothic theme.
- **Beacon relighting**: each settlement has requirements (combat key from its guardian, materials offering, Lumen endowment); relighting is a ceremony moment (full-screen, skippable, reduced-motion aware) that unlocks that settlement's crafts/zones/shop stock and delivers its journal chapter.
- **Fog mechanics**: unlit stretches impose mild debuffs (vision radius on map, travel actions slower); lantern oil tier pushes the usable radius — ties economy to geography.
- **Travel**: tap-to-travel with real travel time (short), encounter chance in fog (thin combat hook into lane S1's zones), safe roads between lit settlements.
- **Settlement screens**: each has character (name, story, keeper NPC voice, local stock modifiers, unique craft) — 12 × distinct content blocks, well-written, melancholy-warm tone per charter §1.
- **Journal**: narrative entries log, milestone-triggered chapters, re-readable.
- Data-driven world registry (`src/game/data/world/**`), tests for unlock requirement evaluation, fog math, travel timing.

## Quality bar
This is what makes Hollowlight NOT-Melvor: spatial, narrative progression. A critic should feel "I want to see the next settlement" the way Melvor players feel "one more level".

## Deliverable
Playable map + first three settlements fully implemented (Ashken→Ashfen, Hollowmere, Cinderhatch), remaining nine data-stubbed with complete schemas, committed to `wt-s5`. Final report: built, file map, test summary, balance notes, gaps, `git log --oneline`.

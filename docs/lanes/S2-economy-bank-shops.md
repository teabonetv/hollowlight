# Lane S2 Brief — Economy, Bank & Shops

You are a **fresh builder** (lane S2). Read `AGENTS.md`, `docs/CHARTER.md`, and this brief first. Prior-project memories are not yours — this is Hollowlight.

## Scope
The economic spine every other system plugs into:
- **Bank**: weightless, tabbed + searchable item grid, favourites/pinning, item detail sheets (sources, uses, sell value, lore line), sell/buy flows with confirmation for uniques, bank presets (gear sets, loadouts).
- **General store**: buy/sell with price curves (selling pressure lowers price toward a floor, recovers over time — documented formula), stock rotation on rares, quantity steppers tuned for thumbs (1/10/100/All).
- **Lumen sinks**: repairs, offerings (burn items for Radiance sparks), bank-slot cosmetics are NOT pay-to-win — no real money anywhere.
- Item registry expansion to the ~120-item v1 scope: gathering yields, artisan products, gear, consumables, oddities; every item has at least one source and one use (charter non-negotiable: no dead content).
- Sell-value and buy-price data tables with balance-notes rationale.
- Unit tests: price curve maths, preset save/load, search/filter correctness, round-trip serialization of expanded registries.

## Quality bar
Compare against Melvor's bank UX: tab speed, mass-actions, information density without clutter. On 360×640 everything must be thumb-reachable; no hover-only info anywhere.

## Deliverable
Bank + store fully wired into the shell, committed to `wt-s2`. Final report: what was built, file map, test summary, balance notes, known gaps, `git log --oneline`.

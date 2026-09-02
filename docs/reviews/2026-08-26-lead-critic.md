# Hollowlight vs Melvor — Lead Critic Review

**Date:** 2026-08-26  
**Live:** https://teabonetv.github.io/hollowlight/  
**Evidence base:** live GitHub Pages build (save schema v5; Settings footer still says “Wave 0”), current `origin/main` at review time (`dd9fbcd` and live ES modules), 360×640 play session plus desktop Melvor Idle demo (`https://melvoridle.com`), attached Camp/Almanac/LOG screenshots (verified against live, not trusted blindly).  
**Not used as evidence:** `docs/STATE.md`, WAVE notes, git messages, builder reports.

---

## VERDICT: MELVOR

Not close. Not a TIE. Hollowlight boots, looks like a game, and talks like an idle RPG. After twenty minutes it is still a two-craft kindling loop with a one-stretch hunt and a completion book that pretends six empty skills are 99-level crafts.

## WOWED: no

I would not keep playing Hollowlight over Melvor after twenty more minutes. There is a credible engine path to a long game (one tick loop, generic action-runner, combat sim, versioned saves, honest offline cap). There is **not** a credible *design* path to 1000h if “every Wave 1 ticket lands perfectly” still means more 4-second bars, more +2% stars, more catalogue rows whose uses are “Sold for Lumen / Altar offering / later.” Melvor Idle 1 already ships action identity, a bank that is a factory, and a completionist bible. Melvor Idle 2’s public materials (29 skills, mastery guilds, combat that is supposed to kill one-weapon BiS, a bank you manage as a game) raise that bar. Hollowlight’s charter aims at that bar. The live slice does not.

---

## SINGLE BIGGEST GAP

**Closed production loops with real action variety — charter eight crafts, all active; live has four skilling actions and five empty skill shells.**

Charter §3: eight skills, *all active from the start, deepening rather than gating.* Live `src/game/data/actions.js` (same file on Pages) defines exactly four actions: Tend the Flame, Fan the Coals (Emberkeeping 10), Gather Herbs, Gather Fungi (Foraging 5). Mining, Fishing, Chandlercraft, Smithing, and the Almanac *skill* are `wave: 1|2` chips that open “The fog is thick here.” Combat exists as a separate station. Gathering does not become lantern-goods in a player-owned artisan skill; oils, loaf, and tinder are stall purchases. Without that loop, mastery, bank, combat, and the map have nothing to chew.

---

## LIVE BUILD — what a new player can actually do

The site **boots**. A no-JS fetch of `/` eventually shows the 8-second watchdog (“The lantern flickers in the wind…”) because modules never run; that is not a live crash. Headed Chrome at 360×640 loads Camp immediately. Attached shot (1) matches a fresh save: Hearthway Hollow, CATALOGUER after the first tab-open feats, gold sigil, Lumen/Radiance/Flame/time cells, five-tab bar. Attached shots (2)–(4) match Almanac LOG on a fresh account (2% total; Skills 8/792; Mastery 4/396). A continued save on the same build correctly moved those numerators (16/792, 10/396) when Emberkeeping/Foraging rose. The screenshots are honest for minute one.

**First twenty minutes, feet on the floor:**

1. **Camp.** Flavor is good. “Waiting for you” plus Daily embers plus buttons: Tend the Flame, Walk the fog-line, General Store, Face the pale-things, constellation. Keeper’s Camp is three global upgrade tracks (Lantern & Wick / Keeper’s Satchel / Ember Altar) that buy +% speed, yield chance, XP. Repairs exist. Flame units count up on Emberkeeping and **never go down** (live: 70 flame held through foraging, combat, store, reload; `state.flame` is only incremented in `applyGains`). Light-as-progression is a HUD lie.
2. **Skills.** Two live gathering crafts. Auto-restart works. Progress bars complete. Out of tinder is real (Tend costs 1 Tinderscrap; herbs drip tinder at 30%). Fan the Coals is a level gate, not a new fantasy. Mining/Fishing/Chandlercraft/Smithing/Almanac: Wave chips, empty state, no actions.
3. **Bank.** Owned-first grid, search, category tabs, Sell Mode ×1/×10/Dump, inspector with lore, sources, uses, stall price vs catalog, pin, **Offer 1 for N Radiance**. On a short session: ~7 of 137 “known.” Catalogue shows the rest, including ores, fish, relics, and boss keys whose sources are “later / unkindled / rare stall.” Bank chrome is ahead of Melvor’s first five minutes. Bank-*as-a-game* is not: you sell, offer, or wait.
4. **Map.** Twelve named beacons. One lit. Tap a dark settlement: copy like “Vesper’s Rest waits in the dark. Relight it in a later wave.” **No kindle verb.** `beacons.kindled` is initialized to `['hearthway']` and never pushed elsewhere.
5. **Almanac.** LOG / STARS / EMBERS / FEATS / STATS. Total completion is the mean of Skills, Mastery, Items, Feats. Skills drill-down lists all eight crafts at `level/99`, including five crafts that cannot gain XP. Mastery drill-down lists the four actions only (`4×99 = 396`). Feats: 76, including six tab-open feats and a Vigil category. Stars: ~40 nodes, Kindling for 1 Radiance (+5% XP), then four parallel +% chains. Embers: three UTC dailies, one reroll, no streak; a normal session finishes all three in ~10 minutes.
6. **Combat.** Real-time vs AI, Strike/Shot/Rite, Hand slot (Wick-knife / Ash-sling / Prayer-stub if dropped), eat (Lantern-loaf / Pale-cap / Fogwort), oil sips, fog-bite if dry, Vigil card (“Swear a Vigil,” tier 1 = 8 pale-things), cockpit accuracy line. Hearthway fog-line is playable (six regulars + Warden data). Vesper’s Rest: Unkindled, Combat 8 + beacon you cannot light. Auto-eat/auto-brew exist in state and stay locked (“later camp purchase”). One action at a time globally: hunting stops skilling.
7. **Store.** Always-shelf + rare rotation + Kindling Bundle ✦12 for 8 Tinderscrap. You can buy the artisan goods Chandlercraft is supposed to make.
8. **Save / offline.** Autosave, export/import, schema v5, reduced motion. Reload mid-herb keeps the action. Offline modal requires ≥60s away (`OFFLINE_MIN_AWAY_MS`); 12h cap, expected-value yields, material-bounded. This layer is competent.

**Would I sit in it for 20 minutes?** Yes, once, for the prose and the camp. **Would I open it instead of Melvor tomorrow?** No. After dailies and two bars, the next want the UI itself prints is Wave copy.

Melvor Idle demo, same critic, same day: language → skip cloud → character → **Tutorial Island** with an explicit first task (cut trees), gold, bank 0/20, combat skills listed, Woodcutting/Fishing/Firemaking/Cooking visible, Shop. Ugly, loud, gated. Also: you are already inside a multi-skill factory after five minutes. Hollowlight’s onboarding is kinder. Melvor’s first session has more verbs.

---

## DESIGN / CODE — even if Wave 1 “lands”

Judge the charter plus the architecture as they stand, not a fantasy backlog.

**What can scale.** `src/core/tick-loop.js` + `action-runner.js` is a real idle engine: costs at completion, RNG-in, events-out, mastery XP on the shared curve (`src/core/xp.js`, ~5.78e6 XP to 99). `combat.js` is a generic encounter sim over `data/enemies/**` and `data/combat/*` (50 regulars, 12 bosses in data; 11 stretches locked). Bank, store pressure, offerings, repairs, dailies, achievements, radiance spend, save migrations: engines exist. Tests exist for math. This is not a jQuery clicker.

**What will not become 1000h by filling tables with the same shape.**

| Charter promise | What the code actually does |
|---|---|
| Light is progression (Lumen, territory, Radiance) | Lumen is gold. Radiance is a perk shop. **Flame units have no sink.** Territory (beacons) cannot change. |
| Skills tied to places you relight | Map is a labeled lock screen. Settlements do not unlock crafts. |
| Eight crafts active from start | Five are empty-state marketing. |
| Artisan (Chandlercraft, Smithing) closes the loop | No artisan actions. Combat consumables are `ALWAYS_STOCK`. |
| Mastery per action at Melvor depth | +1% skill XP per mastery level; hooks at 10/25/50/75/99 are flavor or +1–5% on the same four stats. `defaultHooks` for future actions is literally “Mastery 10” flavor. |
| Radiance constellation | Four multiplier ladders (speed / yield / xp / lumen+radiance) plus conjunctions that add more of the same. No exclusive forks, no combat-lantern identity, no map unlocks. |
| Completion / log book | Denominator 792 = `8 skills × 99` including unplayable crafts starting at 1. Mastery 396 = `4 actions × 99`. Items bucket on live uses `state.discovered` (starter pack excluded) over 137 registry rows, most unobtainable in play. Looks like Melvor’s completionist drug. Is a padded spreadsheet. |
| Combat as a station | One kindled stretch, three weapons, styles that matter on paper, auto-eat locked, death/oil/vigils implemented. Cannot walk the pilgrim road. |
| ~120 items, no dead content | 137 rows. `validateItems` requires a source and a use; many sources are “later” and uses are sell/altar/repairs. Tests pass. The factory is empty. |

Numeric long-tail without identity is not depth. Tend the Flame at 14 XP / 4s is **~460 hours to Emberkeeping 99** on the live curve, and **~640 hours of that one action to mastery 99**. Four actions × mastery 99 is already “thousands of hours” on a calculator. That is Cookie Clicker with 99 in the corner. Melvor’s thousands of hours come from *which* action, *which* rare, *which* mastery unlock, *which* potion, *which* dungeon loadout. Hollowlight’s engines will happily run the 460-hour bar. They will not make it a different game.

**Architecture verdict:** capable of a 1000h *idle* if builders inject Melvor-grade action graphs, unique mastery tables, a kindle-the-map verb, and artisan recipes that combat already consumes. **Not capable of a 1000h Hollowlight** if they only ship more Wave chips, more catalog ghosts, and more +2% stars. Right now it is a themed clicker that borrowed RPG vocabulary (99, mastery, bank, slayer- vigils, constellation) and left the interlocking systems as comments in data files.

---

## TOP 5 FIXES

Ranked. Inside the charter. Concrete enough to build without a meeting. Each is a judgment that a chartered system is **shallow in implementation**, not a request for a different game.

1. **Ship the eight crafts as live `ACTIONS` rows on the existing runner — Chandlercraft first.** Delete Wave chips on Mining, Fishing, Chandlercraft (Smithing/Almanac skill can stay thin only if they still have ≥1 idle action). Minimum viable artisan: 6–8 Chandlercraft recipes that spend fogwort / palecap / graveresin / tinder into `wick-oil`, `lamp-oil`, `tallow-candle`, `lantern-loaf`, `warm-broth`, rush wicks. Combat already sips those ids (`src/game/data/combat/consumables.js`). Mining and fishing need ≥3 actions each with unique outputs the artisan and Emberkeeping consume. If an item cannot be produced or spent by a live action, it does not belong in the 137. This is the loop Melvor players will call “the game.”

2. **Spend Flame. Kindle beacons as a player verb.** Flame units must drop: lantern upkeep in combat (alongside or instead of only oil), beacon kindling costs, Emberkeeping quality tiers that burn Flame for Radiance or duration. Map tap on a dark settlement must present a ceremony: e.g. guardian dead + N Flame + settlement relic → `state.beacons.kindled.push(id)` → `zoneUnlock` already in `combat.js` starts returning ok. Charter identity is a journey down a dark road. Today the road is a list.

3. **Mastery must mutate the action, not the toast.** For every live action, replace flavor-only hook 10 and generic +1% hooks with data the runner already understands: extra output rows gated by mastery level, chance tables, duration breakpoints, unique item ids, combat-usable byproducts. Example: Gather Herbs mastery 10 guarantees the 30% tinder; 25 adds a rare herb that Chandlercraft needs; 50 unlocks a second fog-line node; 99 is a title **and** a permanent recipe. `MASTERY_HOOKS` + `completeCycle` should apply this; `defaultHooks` is not allowed to ship. Four actions to 99 is only acceptable if those four become different jobs over time.

4. **Make the completion book honest, then make it hungry.** Skills total must be `playableSkills × 99` until a craft has actions (or those crafts must be playable — prefer the latter). Mastery total is fine at `actions × 99` only if actions keep growing. Items completion must count *found in play toward a use*, not registry length; stall-only ghosts inflate 0% forever or get bought and called “content.” LOG drill-downs (live `renderLogSkills` / `renderLogMastery`) are the right UI; they currently advertise 792 and 396 as if Melvor’s completionist hole were already dug.

5. **Constellation and combat station need decisions, not stacks.** Radiance: at least one mutually exclusive fork per branch (e.g. Wick speed vs satchel yield vs flame-as-combat-upkeep) so Kindling is a build, not a tax. Combat: unlock auto-eat as a **live** Keeper’s Camp purchase (the flag already exists), drop a second Hearthway weapon path that is not “wait for Ash-crawler 4%,” and let Vigils require a style match so Strike/Shot/Rite is a loadout, not flavor on the moth card. Combat is the deepest live station; it is still a single fog-line.

Do **not** add Township, Astrology, or Melvor’s tutorial island. Do **not** wait for “Wave 2” to put verbs on the map.

---

## EVIDENCE (index)

- **Live boot:** headed 360×640, Camp paints; Settings: “Hollowlight · Wave 0 · save schema v5.” Pages `src/core/save.js` exports `SAVE_VERSION = 5`.
- **Actions:** live `actions.js` — 4 objects. `skills.js` — 8 skills, `wave: 0` only on emberkeeping, foraging, combat.
- **Empty skills:** live UI copy “The fog is thick here” / “arrives in Wave 1|2.”
- **Completion math:** live `completion.js` `skillLogRow` = `SKILLS.length * 99` = 792; `masteryLogRow` = `ACTIONS.length * 99` = 396. Fresh save: 8/792 and 4/396 (every skill/action starts at 1). Attached shots (2)–(4) match. Continued save: 16/792, 10/396.
- **Flame sink:** `applyGains` increments `state[g.id]` for `kind:'resource'`; no decrement of `state.flame` in `src/`. Play: 70 flame unchanged across ~20 minutes of non-emberkeeping.
- **Beacons:** `KINDLED_BEACON_IDS` from `zones.js` `kindled: true` only on hearthway; no `kindled.push` in systems. Map copy: later wave. Combat Vesper’s Rest: locked.
- **Items:** 137 `row(` in live `items.js`. Play bank: 7 owned vs catalogue of the rest.
- **Perks / feats / dailies:** ~40 stars (UI `0/40`); 76 feats (`ACHIEVEMENTS.length` ≥60 contract); 15 daily pool entries, 3 per day.
- **XP long-tail:** shared curve XP-to-99 ≈ 5,777,385. Tend 14 XP / 4s ≈ 459 h to 99 if you never leave that action.
- **Combat data vs play:** 50 regulars + 12 bosses in files; 6 Hearthway regulars huntable; 3 weapons; food/oil tables wired; auto-eat `unlocked: false`.
- **Melvor demo:** Tutorial Island, task “Cut 3 Normal Tree,” bank 0/20, multiple skills listed, combat section populated, Shop. First verbs >1.
- **Offline:** `OFFLINE_CAP_HOURS = 12`, `OFFLINE_MIN_AWAY_MS = 60_000` — short reload does not show the modal; that is specified honesty, not a miss.

---

## SIDE-BY-SIDE (1000h idle RPG dimensions)

Scores are for **what is playable today** (live Hollowlight vs Melvor Idle 1 as the sitting-in-it benchmark, with Melvor Idle 2’s published systems as the ceiling Melvor already told the world it is building). /10.

| Dimension | Hollowlight | Melvor | Why |
|---|---:|---:|---|
| Feel-of-decisions | 3 | 8 | Ours: herbs vs tend vs one moth, then auto-restart. Theirs: which tree, which skill, when to swap, shop vs train. |
| Feedback quality | 7 | 7 | Ours: bars, toasts, lore, mastery hint, honest offline when it fires. Theirs: denser rates, drop noise, uglier type. Draw on craft; they win on *information that changes the next tap*. |
| Progression pull | 3 | 9 | Ours: Foraging 5, Emberkeeping 10, then Wave copy and a 1-Radiance star. Theirs: the next 99, the next unlock, the next dungeon — visible from minute one. |
| UI craft (mobile-first) | 8 | 4 | Ours: 360×640, ≥44px, five-tab reach, designed empty states, no hover-gated combat. Theirs: desktop sidebar, Tutorial Island, “Buy the Full Game.” Hollowlight wins the phone. The phone is not the 1000h. |
| Completion book | 3 | 9 | Ours: LOG drill-downs look like Melvor; denominators count empty 99s and a 137-item ghost catalog. Theirs: completion % is a second game. MI2 is rebuilding mastery around guilds/tasks, not abandoning the book. |
| Bank / item identity | 4 | 8 | Ours: beautiful inspector, sell pressure, offerings; items do not become other items in a skill you run. Theirs: every log is a recipe, a fire, a bow. MI2 adds placeholders, tags, named tabs because the bank *is* the midgame. |
| Combat as a station | 5 | 8 | Ours: real sim, styles, oil, vigils, one stretch, locked auto-eat, three weapons. Theirs: a full combat skill cluster and slayer as a lifestyle; MI2 combat update is explicitly about killing one-weapon BiS. |

**Totals (sum, not a trophy):** Hollowlight 33 / Melvor 53. UI is the only dimension we win. That is not a 1000h game.

---

## TWO LAYERS, THEN TOGETHER

**LIVE:** Fun for a mood. Not fun as an idle RPG session. After daily embers complete, the player has no new verb that Melvor does not already bury in minute five. I would not choose ours.

**DESIGN/CODE:** Engines are adult. Systems that define Hollowlight (light, road, eight crafts, mastery identity, constellation as choice) are implemented as multipliers, empty states, and catalogs. Filling them with more of the same yields a gothic Cookie Clicker with a 99.

**Together:** Melvor. The live slice is not a vertical slice of the charter; it is a horizontal slice of *chrome* over two gathering actions. Polish on Camp and Almanac is real and still loses to Melvor’s ugly depth.

---

## VALID vs NOISE

**Noise (do not build these, do not use them as alibis):**

- “Clone Melvor’s skill list / Township / Agility / Astrology / Herblore by name.” Charter forbids a clone structure. Missing *those names* is not the gap.
- “No gated Tutorial Island.” That is a charter win, not a deficit.
- “Wave 1 / it’s early / 2% completion.” Scope does not win ties. A completion book at 2% because the denominator includes unplayable 99s is not “early honesty.”
- Serif vs sans, gold vs orange, sigil vs trees. Taste. The Camp screen is handsome. Handsome is not retention.
- “Smithing isn’t in this wave so don’t judge it.” Charter §3 says all eight active from the start. Empty Smithing is in-scope.
- Headless fetch showing the boot watchdog. The live game boots in a browser.

**Valid (these kill retention):**

- **Four skilling actions** and five “fog is thick” crafts. Decision density dies in minute fifteen.
- **No artisan loop.** Forage → sell/offer/upgrade % . Combat eats stall stock. Systems do not interlock.
- **Flame never spent; beacons never kindled.** The hook and the map are fiction.
- **Mastery/completion/constellation are +% and padded 99s.** Long-tail without identity. A Melvor player will call it shallow because it is.
- **Combat cannot leave Hearthway** and auto-eat is a locked flag. A station you cannot live in.
- **Catalogue of unobtainable items** trains the player that the book is a lie. Once they notice Mining at 1/99 forever, they will not trust 1000h.

---

## CLOSING

Hollowlight’s writing and mobile craft are the only things I would steal. Everything that makes Melvor last — action graphs, item identity, a completion book that is true, combat as a second job — is either a stub or a multiplier. The charter already named the right game. The live build is not that game. Ship verbs, not percentages.

# Hollowlight — Balance Notes (Wave 0)

Every gameplay constant shipped in Wave 0 lives here or next to a table in
`src/game/data/**`. Later waves: extend this file, don't fork it. The rule of
thumb for all numbers below is **"minutes to feel progress, hours to master a
skill, weeks toward 99"**.

## Core loop

| Constant | Value | Where | Why |
|---|---|---|---|
| Tick step | 100 ms | `core/tick-loop.js TICK_MS` | Smooth bars without burning CPU; game math only runs on ticks, so cost is trivial. UI interpolates via CSS transitions. |
| Catch-up cap | 120 ticks/frame | `createTickLoop` | A stalled tab can't spiral; real absence is offline-calc territory, not catch-up. |
| Autosave interval | 30 s | `ui/app.js AUTOSAVE_MS` | Charter floor ("at least every 30 s") plus save-on-hide/unload. |
| Offline cap | 12 h | `core/offline.js OFFLINE_CAP_HOURS` | Generous enough that a night away is fully rewarded; short enough that daily re-engagement still matters. **Shown to the player verbatim** in the offline modal. |
| Minimum away time for offline modal | 60 s | `OFFLINE_MIN_AWAY_MS` | Below this the modal would flicker at every tab-switch; gaps <60 s are simply dropped (honest: we tell players credited time). |

## XP curve (`core/xp.js`)

```
xpBetween(L) = round(42 · L^E + 8·L)
E = 1.50 (L<30) → 1.62 (≥30) → 1.78 (≥60) → 1.92 (≥90)   // soft caps
elite tax: ×1.04^(L−98) for L ≥ 99
MAX_LEVEL = 120, milestone level 99
```

- Total XP 1→99 lands ≈ **5.8M** — a touch gentler than the genre's classic
  ~13M pools so Wave-0 pacing stays inviting while the shape stays familiar
  to veteran idle players.
- Early band is tuned for Wave 0 pacing: level 5 ≈ 1,300 XP ≈ **7 min** of
  Gathering Herbs → unlocks Gather Fungi; level 10 ≈ 5,500 XP ≈ **17 min total**
  → unlocks Fan the Coals. First session should touch every unlock.
- Soft caps are *exponent steps*, not walls: each band steepens smoothly; no
  level ever costs Infinity before MAX_LEVEL.
- One table serves skill XP AND per-action mastery (shared curve, charter §4.7).

## Action economy (playable set)

| Action | Duration | Costs /cycle | Outputs /cycle | XP | Mastery XP |
|---|---|---|---|---|---|
| Tend the Flame (Ek 1) | 4 s | 1 Tinderscrap | +2 Flame, +1 Lumen | 14 | 10 |
| Fan the Coals (Ek 10) | 6 s | 2 Tinderscrap, 1 Grave-resin | +6 Flame, +3 Lumen | 34 | 24 |
| Gather Herbs (Fo 1) | 5 s | — | 1–2 Fogwort, 10% 1 Grave-resin, 30% 1 Tinderscrap | 16 | 12 |
| Gather Fungi (Fo 5) | 6.5 s | — | 1–3 Pale-cap, 15% 1 Bog-moss | 22 | 16 |

Reasoning:

- **Costs settle at cycle completion, not start** (runner contract): no
  negative-balance windows mid-cycle; starting an action requires affording
  one cycle up front as a gate check.
- **Tinder economy (F1b fix — was a hard dead end).** Emberkeeping burns
  tinder but nothing produced it: the starter bank's 30 tinderscrap capped
  the skill at ~420 XP lifetime (level 3), leaving Fan the Coals (Ek 10)
  permanently unreachable. Fix: **Gather Herbs yields 1 tinderscrap at 30%**
  ("dry tinder gathers at the fog-line") rather than adding a free
  emberkeeping action — keeping Emberkeeping a pure *sink* preserves its
  identity and forces cross-skill interlock (charter §5 "no dead content"),
  while a self-funding Ek action would have made the skill trivially AFK.
  Arithmetic: herbs yield 0.30 tinder / 5 s = **216 tinder/h**. At the worst
  conversion (Tend: 14 XP/tinder) that sustains ≈ 50 Ek XP/min of herb time;
  level 10 needs 8,052 XP, starter tinder funds ~420, so Ek 10 arrives after
  ≈ 2.5 h of mixed play. Fan the Coals improves efficiency to 17 XP/tinder
  (~61 XP/min sustained). Tinder supply is unbounded ⇒ no lifetime ceiling;
  with mastery multipliers compounding, the road to 99 stays "weeks" per
  charter pacing.
- Lumen drip: ~15/min from Tending at mastery 0. Sell values below make
  gathered goods worth 2–6 Lumen apiece later, so gathering ≈ tending for raw
  income once selling exists — deliberate parity, decided now so shops don't
  need retro-tuning.
- Mastery bonus: **+1% XP per mastery level** (`MASTERY_XP_BONUS_PER_LEVEL`),
  applied multiplicatively to action XP only (not mastery XP itself, not
  outputs). Mastery begins at **level 1**, so a fresh action starts at ×1.01.
  Small but compounding; rewards staying on one action. Offline math rounds
  per-cycle exactly like live play so the two never disagree by even 1 XP.
- Auto-restart defaults ON per action (idle-first), toggleable per action;
  stored per-action in save.

## Starter state

| Field | Value |
|---|---|
| Lumen | 20 |
| Bank | 30 Tinderscrap, 5 Rushwick Reed, 4 Fogwort |
| Flame units | 0 |
| RNG seed | `Date.now()` at first boot (persisted thereafter) |

Rushwick/Fogwort starters exist so the bank screen shows life immediately and
later chandlercraft recipes have materials waiting.

## Sell values (Lumen)

Tier-1 goods 1–8, tier-2 goods 18–30 (see `items.js`). No selling UI in
Wave 0 — the general store arrives with the economy lane — but values are
fixed NOW so item tooltips can show them honestly.

## Offline policy

Offline grants use **expected-value yields**: ranged outputs roll their mean
`(min+max)/2`, chance-gated outputs contribute `chance × qty`. Deterministic,
instant, honest. Materials bound completions (the calculator stops when the
bank can't pay another cycle). The modal always shows: time away, credited
time, and the 12 h cap notice when trimming occurred.

## Keeper's Camp upgrade tracks (F1c economy sink)

The first permanent Lumen **and material** sink. Three tracks, six tiers each,
bought strictly in order; every tier costs Lumen plus specific gathered goods
so surplus fogwort/palecap/tinderscrap/graveresin/bogmoss become sinks too.
All data lives in `src/game/data/upgrades.js`; the engine is
`src/game/systems/upgrades.js`; effects flow through the REAL math paths:

| Track | Effect | Per tier | Cap | Where it bites |
|---|---|---|---|---|
| Lantern & Wick | global action speed | +5% | +30% | cycle duration = `round(durationMs / (1+frac))` — live ticks (`action-runner.tickActions`), UI bars/ETA (`actionStatus`), and offline completions (`offline.computeOfflineProgress`) all share `effectiveDurationMs` |
| Keeper's Satchel | bonus-find chance per ITEM output | +4% | +35% | each item output rolls one extra unit at `yieldChance` after its base roll (`rollOutputs`), live only — offline keeps expected values |
| Ember Altar | XP multiplier, all skills | +3% | +18% | `xp = round(base × masteryMult × altarMult)` — identical expression in live play and offline so the two never disagree by 1 |

### Costs (Lumen / materials)

| Tier | Lantern & Wick | Keeper's Satchel | Ember Altar |
|---|---|---|---|
| 1 | 40 + 10 tinder | 30 + 15 fogwort | 60 + 15 tinder |
| 2 | 90 + 25 fogwort | 80 + 30 fogwort | 140 + 10 resin |
| 3 | 200 + 12 bogmoss + 15 tinder | 180 + 25 palecap | 320 + 22 resin + 30 fogwort |
| 4 | 450 + 30 palecap | 420 + 60 palecap + 20 tinder | 720 + 45 resin |
| 5 | 1000 + 8 resin + 50 palecap | 950 + 12 resin + 60 palecap | 1600 + 90 resin + 60 tinder |
| 6 | 2200 + 25 resin | 2100 + 30 resin + 40 bogmoss | 3600 + 180 resin |

Lumen step per tier ≈ ×2.2–2.8 (geometric). Track totals: Wick 3,980 ✦,
Satchel 3,760 ✦, Altar 6,440 ✦ — **14,180 ✦ all-in**.

### Affordability arithmetic (mixed early play ≈ 50–70 ✦/min)

- Income sources at Wave-0 rates: Tend the Flame drips 15 ✦/min; Gather Herbs
  sells ≈18 fogwort/min × 3 ✦ = 54 ✦/min (+ resin/tinder bycatch); Gather
  Fungi (Fo 5) ≈ 78 ✦/min. Selling makes gathering ≈ tending for raw income —
  parity already planned in "Sell values" above.
- **Tier 1 of any track: ~1–5 min** (e.g. Satchel 1 = 30 ✦ + 15 fogwort ≈ one
  minute of herb runs past the starter stack).
- **Tiers 2–3 inside 20–30 min**: e.g. Wick 1→3 costs 330 ✦ + materials that
  are byproducts of the same 20 minutes of mixed play; Fo 5 (~7 min) opens
  fungi for the satchel line. Verified against starter Lumen 20.
- **Full track = hours–days**: 14,180 ✦ ≈ 4 h of *pure* income at 60 ✦/min;
  with resin gates (347 graveresin total across tracks ≈ 4.8 h of pure herb
  time at 1.2/min) real pacing spreads over days — matching the charter's
  "minutes to feel progress, hours to master, weeks toward 99".
- Material choice rationale: tinderscrap/fogwort gate the first minutes,
  palecap (needs Fo 5) the middle, graveresin (10 % drop) the long tail —
  every track's back half is paced by the scarcest renewable good.
- Speed cap note: +30 % speed multiplies income AND sink affordability alike,
  so late-track players re-earn the next tier ~30 % faster — self-balancing,
  no death spiral in either direction.

## Price curve (S2 General Store)

Selling to the stall is **not** a flat registry dump. Each unit sold adds
pressure; pressure **lowers the live sell unit** toward a floor, then
recovers over **playtime** (the same clock as skills — offline and live agree).

```
pressure'     = min(0.60, pressure + 0.02 × qtySold)
pressure(t)   = pressure' × 2^(−Δplaytime / 10 min)
sellUnit      = max( floor(sell × 0.40), round(sell × (1 − pressure)) )   // min 1
buyUnit       = max( sellUnit+1, round(catalogBuy × (1 − 0.15 × pressure)) )
catalogBuy    = item.buy ?? max(sell+1, ceil(sell × 2.25))
```

Tinderscrap is the exception: `buy = 2` (still > sell 1) so a spent starter
stack is not a dead halt — 20 starter Lumen buys a Kindling Bundle (8 tinder
for ✦12) or 10 loose scraps. Round-trips still lose Lumen.

Rare shelf: 3 slots, reshuffled every 30 minutes of playtime from the rare
pool (deterministic hash of the epoch — does not consume combat RNG).

## Offerings & repairs

| Sink | Pays | Returns | Why |
|---|---|---|---|
| Altar offering | any bank item | Radiance sparks (see `offerings.js`) | Surplus stacks become prestige fuel. No constellation spend here (S4). |
| Wick patch | ✦10 + 8 tinder | +25 lantern integrity | Early Lumen+tinder sink |
| Glass reset | ✦18 + 3 bogmoss + 2 rushwick | +40 | Moss/reed sink |
| Keeper’s service | ✦45 + 2 resin + 12 tinder | full 100 | Mid-session sink |
| Tab dyes | ✦80–400 | cosmetic class on bank tabs | **Not** extra slots. Bank is weightless. No real money. |

Lantern integrity starts at 100. Each Emberkeeping cycle −1. At 0 the flame
still burns (never a second halt). Repairs are optional sinks.

## First ten minutes (starvation)

Tend the Flame eats 1 Tinderscrap / 4 s. The starter 30 last ~2 minutes of
*pure* tending — not a ten-minute session. Honest outs, none of which are Mining:

1. **Gather Herbs** (unlocked at Fo 1) yields tinder at 30% — the intended loop.
2. **Hearthway stall** always stocks Tinderscrap at ✦2 and the Kindling Bundle
   (8 for ✦12). Camp shows a banner + “Buy kindling” when the stack is empty.
3. Selling fogwort (starter 4 × ✦3) plus Tend’s Lumen drip funds emergency buys.

Camp “Need materials” on upgrades is a *sink gate*, not a game-over. The stall
and the fog-line keep the first session moving.

## Sell / buy tables (rationale)

Tier-1 goods sell 1–12, tier-2 14–32, tier-3 36–80 (`items.js`). Catalog buy
is ~2.25× so converting Lumen → goods → Lumen always loses. Emergency tinder
is cheaper (2×) because it is a mercy faucet, not a wealth engine.

## Radiance constellation (S4)

S4 fields live on save schema **v4** (`from: 3` migrate). Main’s combat-era v3
saves keep souls/beacons/combat and gain Radiance/Almanac defaults.

Radiance is a **never-resets** prestige earned from every completed action
cycle. No skill, bank, or level is wiped to gain it (charter §4.9).

| Constant | Value | Why |
|---|---|---|
| `RADIANCE_PER_XP` | 0.025 | 40 action-XP ≈ 1 spark. Tend the Flame (14 XP / 4 s) yields ~0.35 sparks/cycle → first star (`Kindling`, cost 1) in ~12 s of tending. Slow enough to stay prestige; fast enough that the grid is playable in the first session. |
| Origin Kindling | +5% skill XP | +1% left Tend at `round(14 × 1.01 × 1.01) = 14`. +5% makes the live grant **14 → 15 XP**. Action cards show that grant. Running actions show remaining time AND cycle length (`2.1s left · 4.0s / cycle`). Drawn Wick (+2% speed) rewrites the duration chip to **3.9s / cycle · Wick**. |
| Perk costs | 1 → 30 | Origin 1; branch nodes 2–10; branch capstones 18; conjunctions 8–22; apex 30. Full grid ≈ 335 sparks ≈ **13.4k action-XP** — hours, not minutes. |
| Respec | ✦25 × owned nodes | Refunds all spent Radiance; Lumen fee only. Skills/bank untouched. |
| Effect stack | mastery → camp → radiance → achievement → mastery-hooks | Each layer is `×(1+bonus)`. Documented and unit-tested so live ticks, offline, and ETAs never disagree. |
| Yield chance cap | 55% | Camp satchel 35% + perks/hooks; stops bonus-find from going guaranteed. |
| Daily embers | 3 tasks, 1 reroll, UTC day | Rewards 2–4 sparks. Missing a day does nothing — no streak, no FOMO. `ensureDailies` / `pickSet` never offer a task the save cannot start (`unlockLevel` unmet). A Combat 1 / Foraging 1 save will not see Gather Fungi ×8. |

Achievement rewards that grant `%` bonuses enter the stack as the
**achievement** layer (after Radiance). Mastery hooks at 25/50/75 on each
Wave-0 action enter as **hooks** (last). Flavor-only milestones (10, titles
at 99) do not change math.

## Almanac LOG items (S4d / S2i)

Items completion is a **completionist book**, not live occupancy. Hollow N/MAX is unique held stacks; “N of 137 known” is Times Found.

| Rule | Contract |
|---|---|
| What counts | `itemFound > 0` **or** `state.discovered[id]`. Occupancy (`uniqueStackCount`) is a different number. |
| Fresh save | Starter pack is **known** because hydrate floors Times Found to held qty (S2h). Almanac Items starts at 6 / N, not 0. The `discovered` map stays empty until a live pickup. |
| First pickup | Action yields, combat loot, and stall / bundle buys call `markDiscovered` and increment Times Found. |
| Last stack | Dumping or spending to 0 never un-knows the id. Catalogue does not paint a mystery dash. Items 6/N cannot fall to 5/N. |
| Save | Schema **v5**. Do not bump. v4 saves migrate to an empty `discovered` map; held stacks still floor Times Found, so they stay known. |

Tapping Skills / Mastery / Items / Feats on the LOG opens a drill-down (per-skill 1/99, per-action mastery, found-vs-missing items, feats grid) and keeps the bucket % in the header.

## Almanac LOG honesty (S4e)

True completion must not move when you open the Almanac. Visit and tab-open feats do not pad the LOG mean.

| Rule | Contract |
|---|---|
| Headline | Mean of Skills / Mastery / Items / Feats. Opening the Almanac does not change the CAMP number. |
| Tab-open feats | `TAB_OPEN_FEAT_IDS` still toast on the Feats tab. They are excluded from the Feats bucket used for total completion. Open the Book pays Lumen, not Radiance, so it cannot mint First Spark. |
| Mastery | 0 until a cycle or hunt is practiced. Live tracks = emberkeeping + foraging actions + combat hunts on kindled stretches. No invented Mining/Fishing/Smithing rows. Locked-zone hunts stay off the board. |
| Items | Known names stay named (`itemFound > 0` or discovered). Unfound rows are `?` / mystery marks. Dumping a stack never turns it back into a mystery. |
| Skills | Wave-0 crafts (Emberkeeping, Foraging, Combat) as a 1/99 tile grid. The Almanac tab is not a craft inside this book. Later-wave crafts show as Locked, not fake 1/99. |
| Recap halt | Always names leftover stack (`out of Tinderscrap ×0` / `×1`). While the recap modal is open, the live runner is frozen. Recap owns `savedAt` until Claim — autosave / hide / pagehide must not restamp to now. Persistent recap has no ×. Idle ≥60s still opens the recap (`Nothing ran.`). Every Claim feat is named in a scrollable list. |

## Offline playtime (S4 honesty)

`playtimeMs` (“Time by the Flame”) adds **credited** away-time on Claim
**only when cycles actually ran** (capped at 12 h, same cap as production).
A feats-only or fuel-halt rewind does not stuff wall-clock into playtime
and does not increment `offlineClaims` / light “The Work Went On”.
The tick loop is frozen (and its accumulator reset) while the recap modal is open so Tend cannot keep counting down on an empty tinder stack and Gather cannot add Fogwort on top of the preview before Claim; any live playtime that did accrue is still merged on Claim. Until Claim, autosave / hide / pagehide keep the rewound `savedAt` so a reload still offers the same recap (wallet stays pre-Claim; HUD==save).

**Always recap** when away ≥ 60s, including idle `active {}` and feats-only. Copy names the time away, Cap 12h, and a “Nothing ran.” / “Nothing ran — feats only.” line. Claim is still required (Melvor still shows Welcome Back on empty-away). Idle Claim does not stuff playtime or light “The Work Went On”. Persist must not restamp `savedAt` while that recap is open.

Recap preview == Claim: XP→Radiance sparks are a dedicated Radiance line,
not hidden behind Feats. Level-ups and mastery print `Foraging 1 → 21` /
`Mastery 1 → 18`. Every recap prints the 12h cap. Every feat Claim will
light is named in a scrollable list — never truncated to four names behind
`+98 Lumen · +11 Radiance`. Item / lumen / flame / radiance lines include
an honest `/h` EV from the credited window.

Lumen and mastery XP use the **live per-cycle round**, then × completions
(`Math.round(qty × multiplier)`), not a floored batch. Skill XP already
did this; mastery XP and lumen now match `completeCycle` / `applyGains`.

## Combat (lane S1)

Real-time, two independent attack timers, encounter-seeded RNG (mulberry32).
Fighting pauses while the tab is hidden — offline calc still only runs gathering
actions, honestly. Death drops *carried Lumen* at the stretch; bank, XP, souls
kept. Walk back (open that stretch) to recover.

| Constant | Value | Why |
|---|---|---|
| Player HP | 36 + 4 × Combat level | First moth (16 HP) is a few exchanges; the Warden (90) is a food decision. |
| Accuracy | 8 + 2×level + weapon | vs moth avoidance 11 ≈ 61% hit at level 1 with the wick-knife — misses matter. Live cockpit shows Acc% · min–max · interval as paired chips (`Acc 61% · 4–7 · 2.2s / they 53% · 1–3 · 1.7s`). First 360 after Hunt is You/Foe HP, Acc, oil, eat + Fall back, then Knife/Unarmed — Combat title, flavor, Level XP bar, and the compact XP chip stay off that frame. Hunt from a scrolled hub resets `#screen`. First player blow waits ≥1.2s (`OPENING_WINDUP_MS`) so Pale Moth is still up on that frame. |
| Avoidance | round(7 + 1.5×level) | You get hit. Eating is not optional on the Cur / Warden. |
| Hit chance | clamp(0.20, 0.95, 0.12 + 0.88·acc/(acc+avo)) | Never a coin-flip void; never a sure thing. |
| Weakness / resist | ×1.18 / ×0.86 | Style swap is a real DPS lever on every card (weakness listed on the hunt). |
| Wick-knife | 3–6, 2.2 s, +4 acc | Starter Strike. Shot/Rite start unarmed until ash-sling / prayer-stub drop. Opening windup is `max(1.2s, weapon speed)` — Pale Moth (16 HP) cannot die on a t=0 blow. |
| Unarmed Shot / Rite | slower, lower max | You *can* swap styles day one; you *want* the matching drop. |
| Oil sip | 1 wick-oil / 8 s (lamp-oil / 16 s) | A 6-flask starter pack ≈ 48 s of fed lantern. Stall always sells wick-oil (mercy buy ✦8). Hunt starts **already dry** if flasks are empty — never paint “Lantern fed” at 0 sips. Dry lantern: first 10 s of fog-gather (no bite), then 2 fog-bite / 2 s and ×0.85 hit chance. **Keep hunting defaults OFF.** Auto-continue refuses the next moth while the lantern is dry. Hub Hunt at 0 sips stays labelled Hunt (disabled) with **one** Need oil line — not on every stretch button. Hub chip is “lantern ready” only when sips remain. |
| Hand slot | Wick-knife 3–6 / 2.2 s / +4 acc | One honest weapon. Unarmed Strike is 2–4 / 2.4 s. Ash-sling and prayer-stub apply when held and the matching style is selected. |
| Lantern-loaf | +14 HP | Eat-now-or-one-more-hit. The fight paints **one** selected food (name, **+heal constant**, count, one Eat). Tap the slot to cycle owned foods; with one owned food the slot is a label, not an armed pick. Eat greys at full HP; never paint `+0` for an owned item (pending heal is the HP delta, not the label). Fall back sits on the eat row. Pale-cap +8 and fogwort +5 are forageable — gathering feeds combat. |
| After a hunt | leftover cockpit | Same two-pane fight as live: You vs last foe HP, Acc/they, oil (**Need oil** once when dry), eat, Knife/Unarmed, Strike/Shot/Rite, Hunt-same-foe, 4-line log pinned above the 360 tab bar (`logWrap.bottom` and every `.log-line` bottom < tab top 577). Leftover wrap is **88px** so a wrapping kill line still fits; fight wrap stays 64px. Leftover is a combat page — hunt list / Vigil / Stretches are unmounted (not a lobby sticker). Leftover Hunt stays `Hunt Pale Moth` when dry (HTML `disabled` + `aria-disabled`) — never a second Need oil. Stretch Hunt buttons stay `Hunt` (aria-disabled only, not HTML disabled). First lobby Hunt Pale Moth sits on the card head, above the fold. Kicker is “X fell” / “Fell back from X”. |
| Auto-eat / auto-brew | wired, locked | Honest copy; a later camp purchase can unlock the thresholds. |
| Hearthway XP | moth 11 → crawler 24 | ~7 min to Combat 5 on mixed hunts; Warden at 5 stretch-kills. |
| Vigil T1 | 8 pale-things, ✦28 + 4 souls + 48 XP | Minutes, not hours; later tiers 14 / 22 / 32 / 44 / 60. |
| Guardian stir | 5 kills on the stretch (Hearthway) | The Warden is fightable in the first session without fake-unlocking the map. |
| Later zones | beacon + Combat level (8…80) | Listed on the stretch. Unkindled copy is the lock, not a greyed mystery. |

Starter combat kit (on top of F1/S2 bank): 8 lantern-loaf, 6 wick-oil, 1 wick-knife. Lumen still 20 — dying on the fog-line is a walk-back, not a wipe.

## Lantern hollow (S2e unique-stack cap)

The working pack is weightless but not infinite: it holds a finite number of
**kinds**, not a count of items. Existing stacks still grow. A new unique is
refused (gather / buy / loot / offline) until you sell a stack out of the
hollow or the Keeper's Satchel widens it. Grid-sell is the pressure valve.
This is not Melvor's Extra Bank Slot shop — room comes from bags you already
stitch at camp.

| Constant | Value | Where | Why |
|---|---|---|---|
| Base hollow | 12 unique stacks | `lantern-room.js BASE_LANTERN_ROOM` | Starter pack is 6 kinds. First foraging/mining loops fit; then you sell to make room. Visible as `N / MAX` beside catalog worth. |
| Satchel room | +2 / tier | `SATCHEL_ROOM_PER_TIER` on Keeper's Satchel | Same sink as bonus-find. Six tiers → 24 hollow. Yield math is unchanged. |
| Over-cap saves | keep extras, block new kinds | `canAcceptStack` | Pre-S2e banks with more than 12 kinds are not truncated. |


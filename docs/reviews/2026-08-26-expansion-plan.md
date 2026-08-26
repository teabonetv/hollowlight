# Hollowlight expansion plan — 1000h on the pilgrim road

**Date:** 2026-08-26  
**Status:** plan only. Does not change game code, tests, or `docs/CHARTER.md`.  
**Binding:** charter v1 (gothic lantern, twelve beacons, eight crafts of the lantern trade, light as progression, mobile-first 360×640, no Melvor clone, no dead content).  
**Sibling review:** `docs/reviews/2026-08-26-lead-critic.md` (verdict MELVOR). This file is the build order that review implies. Do not treat this as a walk-back of that verdict.

Live today: four skilling actions, combat equips `{weapon}` only, gear rows marked `slot` with uses “(later)”, Flame and Souls accrue and do not spend, eleven beacons are toasts. Charter v1.0 printed budget (~120 items, 8 skills, 40+ enemies, 12 bosses) **cannot carry 1000h** if each skill stays at two actions. The numbers below say how far the budget must grow. That is an owner charter amendment later, not a builder freelance.

---

## 1. Design thesis — simple front door, deep back door

**Front door (minute 1, one thumb, 360×640):** Camp. A flame. Two buttons that work: tend, gather. One hunt on the fog-line if they tap Combat. No tutorial island, no Attack/Strength/Defence, no twelve locked skills, no spreadsheet of 24 verbs. The player understands: *keep the lantern alive, walk the road, the dark hits back.*

**Back door (month 3–year 1):** The same three verbs — idle a craft, spend light, fight a stretch — but every beacon changes **which** crafts pay, **which** kit is legal, and **what the fight forbids**. Strength is not a second combat skill tree. Strength is **Combat level + six worn slots + the beacon you have actually kindled.** Materials exist to become kit and fuel. Abilities exist as lantern rites and constellation forks, not as a hotbar of twelve cooldowns on minute one.

**The one sentence a builder may not violate:** if a new system cannot be explained as *light, road, or lantern-trade*, it does not ship. If it does not feed another system, it is dead content and does not ship.

**How this stays distinct from Melvor:** Melvor is parallel 1–99 sandboxes. Hollowlight is a **spatial gear-tier journey**. You do not unlock Fishing at Woodcutting 15. You relight Tallowmere and the drowned chandlery becomes the only place that makes the oil the next stretch demands. Skills are all *present* from the start (charter §3); **nodes and recipes** deepen per beacon. No gated tutorial. No clone of Melvor’s 24-skill list.

---

## 2. What the player does

Timescales are *play* time, including honest offline (cap stays 12h unless charter is amended).

### Minute 1

Open to Hearthway Hollow. Tend the Flame (costs Tinderscrap, pays Flame + Lumen). Gather Herbs (free, pays fogwort + chance tinder). See Combat as a third tab-row action: Pale Moth, Wick-knife in **weapon**, eat loaf if they wander in. HUD: Lumen, Radiance, Flame. No constellation puzzle. No six-slot paper doll yet — the Camp “Hand” is the weapon; other slots exist in the bank as *found objects* with “equip when you smith the chimney.” One next-want: keep tinder coming.

**Must feel:** I am already playing. The lantern is the character.

### Hour 1

Foraging 5 opens fungi. Emberkeeping still one real job until Fan the Coals (keep that gate). First **Chandlercraft** recipes that consume what they gathered: wick-oil, lantern-loaf. First **Smithing** action: Flint-striker into **tool** slot (skilling speed on gather/tend). Combat: swear Vigil (8 pale-things), eat, sip oil, maybe die and recover the death-site. Spend Flame to **repair/feed** the lantern so the meter is not a trophy. Claim dailies. Kindle **nothing** yet — Hearthway Warden is the hour-1–day-2 boss, not minute 5.

**Must feel:** gather → craft → wear/eat → hit harder. The factory door opened. Still three screens: Skills, Bank, Combat.

### Day 7

Combat ~8–12, Emberkeeping/Foraging/Chandlercraft in the teens. **Hearth-Warden down.** Ceremony: spend Flame + Souls + `key-hearthway` → **Vesper’s Rest kindles**. New forage node (pew-moss / choir herbs), new smithing frame (choir-iron is later; for now: soot-cloak **cloak** slot), wights that punish Shot and demand Strike. Kit tier 1 complete: weapon + lantern chimney + cloak. Auto-eat is a **bought camp upgrade**, not a hidden flag. Player has a loadout they can name. Offline 12h of herbs actually feeds tomorrow’s oil.

**Must feel:** the map did a thing. I am stronger because I made a lamp, not because a number ticked.

### Month 3

Beacons 1–6 kindled (Hearthway through Choirgreen) **or** deep mastery on early nodes while stuck on a guardian — both are valid. Combat 30–40. Full six slots worn, **set bonus** on “Hearthway iron” vs “Tallowmere tallow-lantern.” Chandlercraft and Smithing are the time sinks; gathering is the feedstock. Vigils have **style + category** constraints. A stretch is **unsurvivable** in previous-tier kit even at high Combat level (see §5). Almanac study actions eat journal-pages and pay permanent *named* bonuses (not +0.5% XP). Radiance forks are spent: Wick (speed) **or** Satchel (yield) as a real choice, not four ladders of the same stat.

**Must feel:** I am building a Lampwright. The road got mean. I have to go back and craft.

### Year 1

Beacons 7–12, Combat 80–99, skill 99s on the crafts you lived in, mastery 99 on the **nodes that defined your kit**. Pale Steps / Starfell / Duskmere / First Beacon are not “more HP.” They are lantern-rules, relic study, and kit that previous settlements cannot smith. Completion book is true: ~100 live actions × 99 mastery, 12 guardians, 12 kindled, 6 slots × 12 tiers collected. A Melvor player still here because **the next beacon still changes the job**, not because a bar has 400 hours left.

**Must feel:** I finished a pilgrimage and could start another Lampwright with a different constellation and style.

---

## 3. Character power (no Attack / Strength / Defence skills)

Combat stays **one skill**. Charter forbids Melvor’s combat-stat skill cluster. Power has four layers that a player can see on one sheet (Camp or Combat hub, 360×640, no hover):

| Layer | What it is | What it is not |
|---|---|---|
| **Combat level** | HP (`36 + 4×level` can stay), accuracy/avoidance modest curve, unlock to *attempt* a stretch (`zones.js` levelReq). | A substitute for kit. High Combat in Hearthway iron still dies on Mourning Bridge. |
| **Six slots** | Worn items. Derived stats only. | Extra skills. |
| **Crafted kit** | Smithing + Chandlercraft (+ forage/mine/fish feedstock). Recipes gated by **kindled beacon**, not by a shop skill unlock tree. | Stall-bought endgame. The stall sells emergencies and cosmetics. |
| **Beacon = gear tier** | Kindled settlement N legalizes **craft and wear** of tier N. You may *hold* a drop from a later zone you cannot yet kindle; you may not wear it until the beacon of its tier is lit (or until a guardian key is spent — pick one rule and never waffle). | Cosmetic map pins. |

### Six slots (charter §4.5 + existing `item.slot` keys)

Live items already name these. Make them **equip** into `combat.equipment` (today only `weapon`).

1. **Weapon** — Strike / Shot / Rite. Damage, speed, accuracy. One held. Unarmed remains legal and weak.
2. **Lantern** — the character. Oil interval, fog-bite resist, Flame spend per minute in a stretch, light radius (hit chance in dark). **This is the Lampwright.** If only one slot may be unique, it is this.
3. **Head** — hoods, visors: avoidance, fog-sight (accuracy), sometimes rite affinity.
4. **Hands** — tongs, gloves: smithing/chandler speed when skilling; parry/accuracy in combat. Tool-ish but combat-legal.
5. **Cloak** — HP padding, oil conservation, wight-resist. Travel identity.
6. **Tool** — skilling only (shears, pick, hook, snuffer). Never a combat damage stick. This is how gathering/artisan **level the character** without fake combat skills.

**Derived stats (single panel):** Max HP, Acc, Avoid, max hit (style), oil seconds remaining, Flame/min, fog resist. Computed from Combat level × kit × Radiance × lantern integrity. No hidden seventh layer.

**Souls spend:** vigil rerolls, death recovery without walking back, guardian **second phase retry**, Almanac relic attunement. They must leave the wallet.

**Flame spend:** lantern upkeep in combat and on the road, beacon kindling ceremony, Emberkeeping **quality** (brighter flame = faster cycles and a real cost). HUD Flame that only goes up is forbidden.

**Abilities:** not a MOBA bar. Three **lantern rites** unlocked by Almanac study + kindled beacon (e.g. Cupped Hands: next oil sip free; Bell-Hush: wight accuracy down for 8s; Wick-Surge: consume Flame for a burst). One rite slot on mobile. Late game adds a second slot at Starfell. That is enough.

**Set bonuses:** 3-of-tier and 6-of-tier. Example: 3× Tallowmere = oil interval +20%; 6× = fog cannot dry you for the first 15s of a fight. Sets are **settlement-named**, not “Dragon / Ancient” clones.

---

## 4. Twelve settlements — crafts, kit, challenge

Each row is a **builder ticket**: new idle nodes, new recipes, stretch rules, kit tier, guardian already named in `bosses.js`. LevelReq in `zones.js` stays as the Combat **attempt** gate; kindling is the **content** gate.

| # | Settlement | Crafts that change | Kit tier (smith / chandler) | Stretch gets HARD by |
|---|---|---|---|---|
| 1 | **Hearthway Hollow** | Emberkeeping + Foraging live. Chandlercraft: oil, loaf, rush-wick. Smithing: flint-striker (tool), glass-chimney (lantern T1), wick-knife repair. | T1 iron/linen. Weapon + lantern + tool. | Fog-bite if oil dry. Warden phases (already in data). Tutorial-by-doing, not a quiz. |
| 2 | **Vesper’s Rest** | Foraging: choir-herbs / pew-lichen. Almanac: first **study** action (journal-page → named bonus). Chandlercraft: tallow votive (rite oil). | Cloak T1 (soot-cloak). Head: fog-hood. | Wights resist Shot. Bell telegraph: if you attack in the ring window you miss. Rite oil required or accuracy tanks. |
| 3 | **Tallowmere** | **Chandlercraft identity peak.** Grease-mere fishing *node* (not a new skill unlock — Fishing was always listed). Recipes: lamp-oil T2, tallow-candle food. | Lantern T2 (tallow-well). Hands: grease-gloves. | Oil **quality** matters. Wick-oil is illegal here (gutter — extra fog). Enemies soak Strike; Rite/Shot split. Duke is a soak-and-enrage. |
| 4 | **The Sunken Shrift** | Mining **first live shafts** (emberstone, wet-coal). Fishing: drowned nave oddities. Smithing: water-sealed frames. | Weapon T2 (shrift-iron). Cloak T2 (tar-cloak, swim/fog). | Fight **in water**: attack speed − unless lantern T2+. Breath/oil double sip. Deacon hymn: must swap style mid-phase or eat a wipe. |
| 5 | **Emberfall Stacks** | Mining peak: kiln-coke, cinder-gems. Emberkeeping: **Fan** quality uses coke. Smithing: real weapon T3 and lantern-frame T3. | Full T3 kiln-iron. Tool: ember-tongs (hands may already be filled — tongs are Hands; pick is Tool). | Heat: HP ticks up if lantern is **too bright** (Flame waste) and down if too dim. Foreman punish over-feed. Player manages Flame spend in the fight. |
| 6 | **Choirgreen** | Foraging peak: singing hedge (herbs that only come with lantern T3 equipped **while gathering** — kit on the skill screen). Chandlercraft: scented oils that are combat **debuff oils**. | Head T3 (leaf-visor). Set: hedge-walker. | Hedge **closes** if you pull the wrong category on a Vigil. Must finish a pale-only contract before horrors spawn. First “loadout for the node.” |
| 7 | **Mourning Bridge** | Smithing: unnamed-steel (cannot be sold; only worn). Combat is the craft. Fishing: river under the bridge. | Weapon T4. Cloak T4 (widow-cloth, death-site radius). | **Death penalty spikes:** drop more Lumen, lantern integrity crash. Recoverable, but Bridge is where people learn repairs. Widow: if you died this stretch this session, she hits harder (the road remembers). |
| 8 | **Lantern-Wake** | Chandlercraft: funeral tapers (food that heals **and** spends Flame). Almanac: wake-names (bestiary lines that grant soul efficiency). | Lantern T4 (wake-glass). | Dead lanterns **stand up** as extra foes if oil hits 0 — the fight clones you. Oil discipline is the skill check. Sexton phases on dry/wet lantern. |
| 9 | **The Pale Steps** | All gathering nodes ** paler**: lower yield unless Radiance fork “Flame” is taken (build diversity). Mining: stair-stone. | Hands T4 / Tool T4. Kit that reduces **step tax**. | 1200 steps as a **combat modifier**: every N seconds a tax of Flame. If Flame is 0 you cannot idle this stretch — must leave. First hard gate that is not HP. |
| 10 | **Starfell Abbey** | **Almanac skill peak.** Study fallen stars: relic actions that unlock **second rite slot** and constellation capstones that are not +%. Fishing: star-fish oddities. | Head T5 (star-hood). Lantern T5 (observatory lens — accuracy vs crawling stars). | Enemies **phase out** of one style every 20s. Must swap Strike/Shot/Rite or swing air. Prior is a pattern fight. |
| 11 | **Duskmere** | Fishing peak. Chandlercraft: mere-oil that only crafts at Duskmere (spatial artisan). Smithing: mirror-steel (avoidance cloak). | Cloak T5, Weapon T5. | Mirror: your max hit is reflected unless lantern lens (T5) is worn. Kit check is binary. No “just level Combat.” |
| 12 | **The First Beacon** | Emberkeeping peak: origin-flame recipes that spend **all three** lights (Flame + Lumen + Radiance sparks). Recipes for **T6** kit. | Full T6 origin set. Only wearable if 11 beacons kindled. | Guardian remembers previous styles — resists your *most used* style on this save. Must live in the weapon you neglected. Raid-length fight with oil, Flame, and rite slots. Kindling it is the credits — then mastery 99s and capstone constellation remain.

**Kindling ceremony (every beacon, same UX):** Map tap → “Relight” (not a toast). Cost: guardian key + Flame (escalating) + Souls. Success: `beacons.kindled.push`, journal line, **new actions appear** in Skills (not a Wave chip). Fail: you do not have the key — go hunt.

**Crafts always listed:** Mining/Fishing/Chandlercraft/Smithing/Almanac show **Hearthway-tier nodes** from hour 1 (even if Hearthway mining is one pit). Later beacons **add nodes**, they do not turn the skill on. Charter §3: all active from the start.

---

## 5. Early / mid / late — what gets HARD

Longer bars are not difficulty. Difficulty is **a failed plan**.

**Early (beacons 1–2, Combat 1–12).** Failures: out of tinder, dry lantern, eating too late, ignoring style color on the moth. HP and oil are the teachers. Warden is a check that you crafted oil and equipped a chimney. Death is cheap.

**Mid (beacons 3–6, Combat 12–40).** Failures: **wrong oil tier**, wrong style for the stretch, Vigil category mismatch, gathering without the lantern the node requires, stall-bought T1 kit on Emberfall heat. Guardians demand a mid-fight style swap or Flame feed. Auto-eat is on, so the hard part is not tapping Eat — it is **prep**. Offline will not clear a guardian.

**Late (beacons 7–12, Combat 40–99).** Failures: **kit illegal for the fog**, Flame empty on the Steps, dry lantern cloning you at the Wake, mirror reflect at Duskmere, First Beacon punishing your main style. Mastery 99 on the wrong node does not save you. Radiance forks that dumped everything into gather-speed leave the lantern thin. Difficulty is **constraint stacking** (oil + style + Flame + set + rite), not 10× HP.

**Never:** inflate enemy HP by 10× and call it late game. Never add Attack/Str/Def to create a training chore. Never make 99 in Emberkeeping a combat requirement.

---

## 6. Content budget that can carry 1000h

Charter v1.0 box: *12 systems, 8 skills, 12 settlements, ~120 items, 40+ enemies, 12 bosses.* Keep **8 skills, 12 settlements, 12 bosses, 12 systems.** Grow the rest or the long tail is four bars × 460 hours (see critic review). That growth is a **charter numbers patch for the owner**, not a new game.

Honest floor for 1000h of *distinct jobs* (not identical 4s cycles):

| Piece | v1.0 printed | 1000h floor | Why |
|---|---:|---:|---|
| Skills | 8 | **8** | Do not add Melvor’s extras. Deepen nodes. |
| Settlements / bosses | 12 / 12 | **12 / 12** | Already named. |
| Idle **actions/nodes** | 4 live | **~96–120** | ~8–10 nodes per skill across the road (Combat is hunts, not 20 chop-actions). Mastery 99 × 100 actions is the completionist hole. |
| Items with a real use | ~137 rows, most stall/later | **~400–500** | ~30–40 per settlement (feedstock, food, oil, 6 kit pieces, drops, keys). 120 cannot fill 6 slots × 12 tiers (72 kit pieces) **and** food/oil/fuel. |
| Enemies | 40+ listed, 6 huntable | **~96–120 regulars** (8–10 per stretch) + 12 bosses | 40 total ÷ 12 zones is 3 wolves and a toast. |
| Weapons with stats | 3 | **~36** (3 styles × 12 tiers) plus 2–3 uniques per late beacon | Style identity. |
| Armor/lantern/tool rows | slots unused | **72** (6 slots × 12 tiers) + 12 set extras | This *is* character power. |
| Almanac study actions | 0 | **12–16** (one per beacon + relics) | Scholar skill must be idle, not a UI tab. |
| Constellation | ~40 +% nodes | **~40 nodes but rewritten** as forks + 8 capstones that change rules (oil law, vigil law, Flame law) | Count can stay; **effects** must not all be +2% speed. |
| Vigils | 6 tiers × 3 cats | Keep, **add stretch-locked contracts** per beacon | Late vigils are puzzles, not 60 kills. |

**Hour accounting (why this is enough):** 100 idle actions with unique mastery tables, 12 guardians, 12 kindles, 72 kit pieces, 100+ hunts, 76+ feats grown to ~150 that track *road* not tab-opens. A completionist idling 4–8h/day has months of *named* goals. If you ship 8 skills × 2 actions, you have a 2000h stopwatch and a 20h game.

**Do not** grow to 24 skills to chase Melvor’s clock.

---

## 7. What NOT to build

- **Melvor clone list:** Woodcutting, Firemaking, Cooking, Agility, Herblore, Summoning, Township, Astrology, Attack/Strength/Defence/Prayer/Magic as skills. Chandlercraft is our cooking/herblore. Emberkeeping is our fire. The road is our township.
- **Gated tutorial island** and skill-unlock-by-level across crafts. Nodes gate; skills do not vanish.
- **Complexity at minute 1:** six-slot doll, constellation map, three rites, Vigil modifiers, oil tiers. Minute 1 is tend + gather. Slots appear when the first chimney is smithed. Rites at Vesper. Oil *tiers* at Tallowmere.
- **Dead HUD meters:** Flame, Souls, Radiance, Integrity that never fall. If it is on the top bar, it spends.
- **Wave chips as content.** “Arrives in Wave 2” is not a skill.
- **Catalogue ghosts.** If it cannot be gathered, crafted, dropped, or bought as a *temporary* stall mercy, delete it.
- **+% only mastery and +% only stars.** Those do not make a Lampwright.
- **Auto-combat that skips prep** before midgame. Auto-eat as a camp buy is enough. Do not auto-kindle.
- **New tab bar items.** Five tabs stay. Store, equipment, and map-kindle hang off Camp/Map/Combat.
- **Hover-only info, sub-44px, desktop-only paper doll.** 360×640 first: equipment is a 2×3 grid of 44px tiles.

---

## 8. Phased ship order (no design meeting)

Each phase is playable on `main`. Do not start phase N+1 until phase N is in the live loop (gather → craft → equip → hunt → kindle). Numbers are data-entry sized for `src/game/data/**` on the existing runner/combat/bank engines.

### Phase A — Hearthway is a game (blocks everything)

1. Equip **all six slots** in `combat.equipment`; Combat hub shows 2×3 grid; derived stats panel. Flint-striker, glass-chimney, soot-cloak, fog-hood, ember-tongs/wick-shears as **craftable T1** or Warden/stall-mercy with craft as the real source.
2. **Chandlercraft + Smithing + Mining + Fishing + Almanac:** ≥1 live action each on Hearthway (pit, mere, study-scrap, oil, striker). Delete Wave chips. Empty-state copy is a bug after this phase.
3. **Flame spends** on lantern upkeep in combat and on Tend quality. **Souls spend** on Vigil reroll or death-site shortcut (pick one, ship).
4. Recipes: gathered fogwort/palecap/resin/tinder → wick-oil, lantern-loaf. Combat **stops** putting those on `ALWAYS_STOCK` except tinder mercy bundle.
5. Mastery hooks for the live Hearthway actions: extra output / oil drop / duration — no flavor-only 10.
6. Auto-eat as a Keeper’s Camp purchase (flag already exists).
7. Completion book: denominator = playable skills and live actions only, until more exist.

**Exit test:** a critic can idle herbs → craft oil → equip chimney → kill Warden without opening a “later” toast.

### Phase B — The road has a verb

1. Kindling ceremony on Map (costs key + Flame + Souls). `beacons.kindled.push`.
2. Vesper’s Rest stretch + Abbess already in data: **enable** when kindled; add 2 forage nodes, votive oil, cloak/head T1 if not in A, first Almanac study action, first lantern rite (one slot).
3. Wight rule: Shot resist is real; UI states it on the hunt card (no hover).
4. Journal: one skippable page per kindle.

**Exit test:** Map tap relights Vesper; Skills list grows a node; Hearthway kit is visibly worse vs wights.

### Phase C — Tallowmere / Shrift / Emberfall (midgame factory)

1. Fishing and Mining **node packs** (3–4 actions each). Chandlercraft oil **tiers**; Tallowmere stretch **rejects** T1 oil.
2. Smithing weapon/lantern T2–T3. Beacon-tier wear rule.
3. Sunken Shrift water modifier; Emberfall Flame-feed modifier. Duke / Deacon / Foreman fights use existing phase tables **plus** the modifiers.
4. Vigil constraints: category + style.
5. Constellation: rewrite first 12 nodes into 3 forks (Wick / Satchel / Flame-law). Stop shipping parallel +2% chains.

**Exit test:** stall cannot replace the factory; a T1 lantern user dies on Emberfall heat with Combat 30.

### Phase D — Choirgreen through Lantern-Wake (loadouts)

1. Gathering that **requires worn lantern tier** (Choirgreen hedge).
2. Mourning Bridge death-tax + Widow rule. Repair loop must be the answer, not a skip button.
3. Lantern-Wake dry-lantern clone rule. Oil discipline as the skill check.
4. Set bonuses 3-piece / 6-piece for tiers 1–4.
5. Bank presets apply **gear sets** (code already sketches snapshots — make them combat-legal).

**Exit test:** player keeps two loadouts (hedge vs wake) and swapping is a 44px Camp/Combat action.

### Phase E — Pale Steps through First Beacon (late)

1. Steps Flame-tax; Starfell style-rotate; Duskmere mirror; First Beacon anti-main-style. Implement as zone modifiers in combat data, not new engines.
2. Almanac second rite slot at Starfell. T5–T6 kit recipes. Wear T6 only if 11 beacons kindled.
3. Grow regulars to 8–10 per remaining stretch. Feats for road, not tabs.
4. Completion book includes kindled beacons, kit tiers, guardians, live mastery. No empty 99s.

**Exit test:** Combat 80 in T4 kit cannot clear Duskmere. First Beacon requires a neglected style.

### Phase F — 1000h fill (parallelizable data after C)

1. Pad each skill to ~10–12 nodes along the road (not 10 nodes in Hearthway).
2. Items to ~400–500, each with a craft, drop, or kindle use. Delete leftovers.
3. Mastery 25/50/75/99 tables per node. Titles at 99 are extra, not the reward.
4. Daily embers that can name **current beacon** tasks (not only Tend ×8 forever).
5. Offline stays honest; never offline a guardian.

**Exit test:** Almanac LOG drill-down is embarrassing in the other direction — too many real rows, none of them Mining 1/99 forever.

---

## Builder constraints (repeat)

- Data in `src/game/data/**`; engines generic. Do not add frameworks.
- 360×640 first; equipment 2×3; kindle on Map; craft on Skills.
- No Attack/Str/Def skills. No Melvor tutorial. No dead meters.
- If charter v1.0 item/enemy counts would block a phase, **stop and ask the owner to amend the printed budget** — do not silently ship 500 items against a 120 cap, and do not ship 120 items and call it 1000h.

The front door stays a lantern in the dark. The back door is a road that hates your old kit. That is the game.

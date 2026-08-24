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
| Gather Herbs (Fo 1) | 5 s | — | 1–2 Fogwort, 10% 1 Grave-resin | 16 | 12 |
| Gather Fungi (Fo 5) | 6.5 s | — | 1–3 Pale-cap, 15% 1 Bog-moss | 22 | 16 |

Reasoning:

- **Costs settle at cycle completion, not start** (runner contract): no
  negative-balance windows mid-cycle; starting an action requires affording
  one cycle up front as a gate check.
- Emberkeeping is the only *sink* among Wave 0 actions — it consumes tinder.
  Tinder income is therefore the early bottleneck: starter bank holds 30, and
  herbs/fungi actions refill nothing, so the player must alternate skills or
  buy nothing yet. This friction is intentional (teaches interlock); Wave 1's
  general store will soften it.
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

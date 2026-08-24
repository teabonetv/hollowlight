# Lane S6 Brief — Feel, Polish & Mobile Craft

You are a **fresh builder** (lane S6). Read `AGENTS.md`, `docs/CHARTER.md`, and this brief first. Prior-project memories are not yours — this is Hollowlight.

## Scope
You own how the game FEELS in the hand:
- **Design system**: tokens (colour ramp around #d9a441 golds on blue-black, type scale, spacing, radii, elevation), component library (cards, buttons, sheets, tabs, bars, toasts, modals) as plain CSS + tiny helpers; document in `src/ui/design-system.md` with usage rules.
- **Micro-feedback**: press states on EVERY touchable, progress-bar shimmer, count-up number animations (reduced-motion safe), haptic hooks where supported, satisfying level-up and relight moments.
- **Mobile ergonomics audit + fixes**: one-hand reach mapping (primary actions bottom third), thumb-safe gestures only, no hover-dependent info, 44px minimum targets enforced via lint-ish test scanning interactive elements, safe-area insets everywhere, iOS rubber-band containment, Android back-button sanity.
- **Performance pass**: idle games run for hours — profile and fix layout thrash, timer drift, memory leaks in long sessions; battery-conscious tick cadence when backgrounded; smooth 60fps scrolling on mid-range phones.
- **Accessibility**: WCAG-AA contrast on all text, focus-visible states, screen-reader labels on icon buttons, prefers-reduced-motion honoured globally, font scaling to 200% without breakage.
- **Empty/error states**: designed empty states for bank, journal, map pre-unlock; offline/toast/error styling unified.
- Tests: contrast checker utility, target-size scanner, token completeness.

## Quality bar
Side-by-side with Melvor Idle 2's UI, ours must not look like a prototype. Every screen deliberate; every interaction acknowledged. This lane is where "wowed" is won or lost.

## Deliverable
Design system applied across the existing shell and skills screens, audit report of before/after with screenshots described, committed to `wt-s6`. Final report: built, file map, test summary, audit findings, gaps, `git log --oneline`.

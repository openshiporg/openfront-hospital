# Hospital: design ready (2026-10-25)

Brief: `~/Code/Euler/state/briefs/batches-2-6-full-redesign-2026-10-25.md`. The owner ordered the work directly, so impeccable's interview steps ran unattended. Every product fact in `PRODUCT.md` is inferred from the repository and labelled as inferred.

## Commits (master, pushed, live on Railway)

- `b9a1d14`: Redesign platform desks and storefront from staff and patient main tasks.
- `beb5f8f`: Storefront link and list resets no longer outrank button colours. This fixes a pre-existing bug: primary buttons rendered dark text on teal.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` (heavy-exec, real) | exit 0, 0 errors |
| `npm run test:security` | 12 pass, 3 fail. The same 3 fail on the untouched baseline (`git stash`); all 3 are in the shared dashboard sign-in and recovery source. |
| `npm test` | Not run: there is no `test` script. |
| Parity check | drift 0, missing 0, sidebar ok |

## Directions (impeccable `concept-seed`)

- **Platform (Operate):** hospital floor wayfinding lines, candidate 4 of 7, `seed:8caacad7c91a2f65`.
- **Storefront (Persuade):** the practice's leaflet rack, candidate 7 of 7, `seed:dc7c4d80db94e344`.
- The contracts are in `.impeccable/surfaces/features-platform.md` and `features-storefront.md`.

## Skills used, per screen

| Skill | Screen(s) | What it changed |
|---|---|---|
| impeccable (`init`, `concept-seed`, craft-floor, operate/persuade mode rules) | All | `PRODUCT.md`, the direction contracts, and these bans: eyebrows, a coloured left border on headers and visit rows, tracked mono caps, glow halos. |
| industrial-brutalist-ui (Swiss print grid) | Every platform desk, via `ward.tsx` | 1px hairline grids, 4px corners, flat surfaces, no shadows. |
| minimalist-ui | Platform buttons and fields | Square keylined buttons and an 8px field height. Its pill status-badge rule was rejected because of the owner's ban. |
| design-taste-frontend / gpt-taste | Home | Meta-labels removed; the hero is a heading of at most two lines plus the action. |
| hallmark / frontend-design | Home, care, providers, locations | Leaflet covers per service line, photographs printed in the service colour, Schibsted Grotesk paired with Atkinson Hyperlegible. |
| emil-design-eng | Kit | Transitions limited to colour; no translate-on-press. |
| high-end-visual-design | — | Consulted and rejected: its pill CTA and eyebrow-badge rules conflict with the owner's ban. |

## What changed

**Platform.** The ward kit was rebuilt in `features/platform/components/ward.tsx`, and all 25 desks inherit it:
- State is a short floor-line marker in its line colour, replacing glowing dots.
- Tabs and segmented choices are underline tabs on a hairline.
- Buttons are square (4px) with a single deep-teal primary.
- Readout strips are one ruled strip.
- Board rows are denser.
- Empty states are a ruled line of text, not a dashed card.
- Headers lose the teal left rule and the mono eyebrow.

A sweep across 50 platform files removed mono-costume numerals, tracked caps labels and rounded-xl/full containers. Onboarding files were left untouched.

**Storefront.**
- The home page opens on the practice name, the request action and the emergency notice, then the leaflet rack.
- Each care line is a cover in its own colour (primary care teal, behavioral health violet) with its photograph printed in that ink.
- Inside each leaflet are the real visit types, their lengths and clinicians, each linking straight to its booking page.
- The nav is an underline tab bar.
- All pills, cards and the stepper are 3px keylined units.
- Zone headers on the care page are full colour bands.
- Fonts: Newsreader and JetBrains Mono were replaced with Schibsted Grotesk and Atkinson Hyperlegible.
- Stylesheets were renamed (`leaflet.css`, `leaflet-tokens.css`) to force a fresh Railway compile.
- The fixture and non-emergency copy is unchanged.

## Not changed (deliberate)

- **Appointments:** "Facility day" still needs a facility before showing a day sheet. That is an explicit non-inference rule in the action layer, not a layout problem.

## Screenshots

- `before/`: desktop 1440 and phone 390 for every storefront route and every platform page. Clinical overview and Reports timed out on desktop.
- `after/`: the same set. Staff timed out on desktop.

## Open

- No `impeccable-finish-reviewer` pass was run yet, and DESIGN.md has not been generated. The FINISH line in the contracts is still open.

## Finish review (impeccable-finish-reviewer, fresh context)

- **Two recapture rounds:**
  - Three desktops timed out.
  - The session expired mid-run and saved sign-in pages under desk names. The capture script now re-logs in and refuses to save a sign-in page.
- **Full review — fix (8 items), addressed in `41990bb`:**
  - Leaflets end in "Request this visit".
  - Visit rows show a request cue.
  - Appointments opens on the first active facility's day sheet.
  - The receipt and intake eyebrows are removed.
  - Text arrows are replaced with Lucide icons.
  - The sky-blue tone is retired; Confirmed now reads as waiting.
  - Clinical overview shows real counts instead of summed aggregates.
  - Reports tiles lose their decorative icons.
  - Page titles no longer carry a state mark.
  - The team grid no longer leaves an empty slot.
- **Not applied:** the single facility control. The two-character minimum belongs to the facility search action and its bounded-search test, so it is a policy decision for the owner.
- **Open (backend, pre-existing):** Providers, Lab tests and Visit types fail to load with a masked GraphQL error.
- **DESIGN.md and .impeccable/design.json:** `a2fc387`.

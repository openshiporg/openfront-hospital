---
version: 1
slug: "features-platform"
primary_target: "features/platform"
related_targets: []
---

# Surface: hospital platform desks (`features/platform/**`, `/dashboard/platform/*`)

Mode: Operate. Audience: front desk, schedulers, nurses, clinical fulfilment, claims and administrators. Constraint: shared dashboard shell untouched; owner bans pill/rounded tabs, chips and cards (radius ≤6px, flat or underline tabs, dense tables); non-clinical/fixture provenance copy is kept.

## Direction contract

THESIS: Each desk opens on today's patients and the next step for each, in a dense ruled list; it refuses stat tiles over rounded record cards with pill filter tracks.

OWN-WORLD: Hospital floor wayfinding lines: clinical white ground, deep teal-graphite ink, hairline rules, 4px corners, no shadows. Each status family keeps its line colour (teal in care, amber waiting, red stopped, slate closed) drawn as a short floor-line segment, never as a coloured card edge. Deep teal is the single primary action. Shell sans, tabular figures, sentence-case labels; no mono, no eyebrows.

STORY: The operator sees who is waiting, for what, and since when; filters with underline tabs; acts from the row; opens the chart.

FIRST VIEWPORT: Title with count and the one primary action; underline tabs for views; one ruled filter row; the list header and first rows above the fold; summary counts in one ruled strip.

FORM: Candidate 4 of 7 (1 wristband, 2 census whiteboard, 3 chart-folder tab dividers, 4 floor wayfinding lines, 5 printed day sheet, 6 lab requisition, 7 ECG paper). Signature move: the floor-line marker, a 14×3px segment in the state's line colour leading each row's status, and the active tab underline. seed:8caacad7c91a2f65. Raises: boarding-pass/gate-board (declined) donates in-place reflow of a changed row; design-annual plate (declined) donates hairline grid discipline.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

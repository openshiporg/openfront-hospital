---
version: 1
slug: "features-storefront"
primary_target: "features/storefront"
related_targets: []
---

# Surface: hospital storefront (`features/storefront/**`, `app/(storefront)/**`)

Mode: Persuade (home, care, providers, locations) and Operate (book, intake). Audience: patients and families requesting a visit and completing intake on a phone. Keep every route, state, workflow and the non-emergency and fixture notices.

## Direction contract

THESIS: The practice's site is its leaflet rack: each service is a folded patient leaflet in its own colour whose inside lists the real visits, lengths and clinicians, and every leaflet ends in "Request this visit"; it refuses the lifestyle-photo hero with a pill CTA row and a dark rounded directory card.

OWN-WORLD: Leaflet stock white (#fbfcfa) and ink (#0e1f1c); each service a full-strength cover colour (primary care deep teal #0f5c4c, behavioral health violet #4b3f8f, third line ochre #9a5412); photographs printed edge to edge on covers; 1px keylines, 3px corners; Schibsted Grotesk bold for covers and headings, Atkinson Hyperlegible for reading; no mono, no eyebrows.

STORY: A family sees which care exists, how long each visit takes and who provides it, picks a leaflet and requests a time; staff confirm every request; intake follows by private link.

FIRST VIEWPORT: Practice name and one plain line at left with the emergency notice; to the right and below, the leaflet rack: one cover per service (colour field, photo, service name, visit count) that opens to its visit list with request links; a single solid "Request a visit" action.

FORM: Candidate 7 of 7 (1 appointment card, 2 lobby signage, 3 notice board, 4 fridge calendar, 5 queue ticket display, 6 prescription pad, 7 leaflet rack). seed:dc7c4d80db94e344. Raises: taller linocut broadside (declined) donates the slab of plain demand lettering; Miura fold (declined) donates the one-pull fold reveal for a leaflet.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

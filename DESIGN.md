---
name: Openfront Hospital
description: Two worlds in one codebase. Staff desks read like hospital floor-wayfinding lines; the patient site is the practice's leaflet rack.
colors:
  leaflet-paper: "#fbfcfa"
  leaflet-paper-2: "#f0f2ee"
  leaflet-paper-3: "#dfe2da"
  leaflet-card: "#ffffff"
  leaflet-ink: "#0e1f1c"
  leaflet-ink-2: "#3c4e4a"
  leaflet-ink-3: "#6b7975"
  leaflet-rule: "#dde2dd"
  leaflet-rule-strong: "#b9c2bd"
  leaflet-accent: "#0f5c4c"
  leaflet-accent-deep: "#0f4a3e"
  leaflet-accent-soft: "#dcebe4"
  leaflet-focus: "#0d7160"
  zone-violet: "#4b3f8f"
  zone-ochre: "#9a5412"
  lobby: "#0f2421"
  lobby-ink: "#e9f0ec"
  lobby-ink-2: "#9fb3ad"
  notice-warn: "#fbf1d6"
  notice-warn-ink: "#6d4b12"
  notice-error: "#fbe4df"
  notice-error-ink: "#8a2c1f"
  notice-success: "#def0e5"
  notice-success-ink: "#17513c"
  dot-ok: "#1f9d6b"
  dot-warn: "#d99a1e"
  dot-bad: "#d0452f"
  ward-teal: "#0f766e"
  ward-teal-deep: "#115e59"
  ward-line-care: "#0d9488"
  ward-line-waiting: "#f59e0b"
  ward-line-stopped: "#dc2626"
  ward-line-closed: "#a1a1aa"
  ward-line-ok: "#059669"
  shell-background: "oklch(100% 0 0)"
  shell-foreground: "oklch(9.65% 0 0)"
  shell-muted: "oklch(96.08% 0 0)"
  shell-muted-foreground: "oklch(45.47% 0.004 270.54)"
  shell-border: "oklch(89.84% 0 0)"
typography:
  leaflet-display:
    fontFamily: "Schibsted Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  leaflet-headline:
    fontFamily: "Schibsted Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.9rem, 4vw, 3rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  leaflet-cover:
    fontFamily: "Schibsted Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.9rem, 3.4vw, 2.6rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  leaflet-title:
    fontFamily: "Schibsted Grotesk, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.4rem, 2.4vw, 1.85rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  leaflet-body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  leaflet-lead:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "clamp(1.08rem, 1.6vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.55
  leaflet-label:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.5
  ward-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  ward-section:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  ward-body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  ward-label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    fontFeature: "\"tnum\""
rounded:
  leaflet-sm: "2px"
  leaflet-md: "3px"
  wristband: "3px"
  ward: "4px"
spacing:
  3xs: "0.25rem"
  2xs: "0.5rem"
  xs: "0.75rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "2rem"
  xl: "3rem"
  2xl: "4.5rem"
  ward-gutter: "16px"
  ward-gutter-md: "24px"
  ward-rhythm: "24px"
components:
  leaflet-button:
    backgroundColor: "{colors.leaflet-card}"
    textColor: "{colors.leaflet-ink}"
    typography: "{typography.leaflet-label}"
    rounded: "{rounded.leaflet-md}"
    padding: "0 1.1rem"
    height: "2.75rem"
  leaflet-button-primary:
    backgroundColor: "{colors.leaflet-accent}"
    textColor: "{colors.leaflet-card}"
    typography: "{typography.leaflet-label}"
    rounded: "{rounded.leaflet-md}"
    padding: "0 1.1rem"
    height: "2.75rem"
  leaflet-button-primary-hover:
    backgroundColor: "{colors.leaflet-accent-deep}"
  leaflet-input:
    backgroundColor: "{colors.leaflet-card}"
    textColor: "{colors.leaflet-ink}"
    rounded: "{rounded.leaflet-md}"
    padding: "0.65rem 0.9rem"
    height: "2.9rem"
  leaflet-cover:
    textColor: "{colors.leaflet-card}"
    typography: "{typography.leaflet-cover}"
    padding: "1.5rem"
    height: "15rem"
  leaflet-slot-active:
    backgroundColor: "{colors.leaflet-accent}"
    textColor: "{colors.leaflet-card}"
    rounded: "{rounded.leaflet-md}"
    padding: "0.7rem 0.85rem"
  ward-button:
    backgroundColor: "{colors.shell-background}"
    textColor: "{colors.shell-foreground}"
    rounded: "{rounded.ward}"
    padding: "0 12px"
    height: "32px"
  ward-button-primary:
    backgroundColor: "{colors.ward-teal}"
    textColor: "{colors.leaflet-card}"
    rounded: "{rounded.ward}"
    padding: "0 12px"
    height: "32px"
  ward-button-primary-hover:
    backgroundColor: "{colors.ward-teal-deep}"
  ward-field:
    backgroundColor: "{colors.shell-background}"
    textColor: "{colors.shell-foreground}"
    rounded: "{rounded.ward}"
    padding: "0 10px"
    height: "32px"
  ward-floor-line:
    backgroundColor: "{colors.ward-line-care}"
    width: "14px"
    height: "3px"
---

# Design System: Openfront Hospital

## Overview

**Creative North Star: "Floor Lines and the Leaflet Rack"**

Openfront Hospital runs two deliberately separate worlds that share one clinical temperament. The staff desks under `/dashboard/platform` are hospital floor wayfinding: a white clinical ground inherited from the shared dashboard shell, hairline rules, 4px corners, no shadows, and every workflow state carried by a short floor-line segment in its line colour. Deep teal is the single primary action. Density is high; lists are ruled boards, not stacks of cards.

The patient site is the practice's leaflet rack. Leaflet-stock white and a teal-black ink carry everything; each service line is a folded leaflet whose cover is a full-strength zone colour with a photograph printed into it, and whose inside lists the real visits, their lengths and clinicians, ending in a solid "Request this visit". Covers and headings are set in heavy Schibsted Grotesk; reading text is Atkinson Hyperlegible. Corners are 3px, edges are 1px keylines, and a dark lobby band frames the page top and bottom.

Both worlds use sentence case, tabular figures for identifiers and counts, and no monospace. The shared dashboard shell (sidebar, header, base tokens) is not part of this system's authority and stays byte-identical to Openfront E-commerce.

**Key Characteristics:**
- Platform: one teal primary, four status line colours, 4px corners, hairlines, no shadows.
- Platform: the floor-line marker (14x3px) leads every status, and selected views are underline tabs.
- Storefront: one full-strength cover colour per service line (teal, violet, ochre), with photographs printed into it.
- Storefront: 3px corners, 1px keylines, heavy grotesk covers over a hyperlegible reading face.
- Both: sentence case, tabular numerals, no mono, no eyebrows.

## Colors

The platform is clinical white with one teal and four line colours. The storefront is warm-white stock and teal-black ink with three saturated cover colours.

### Primary
- **Leaflet Teal** (leaflet-accent): storefront primary action, active nav underline, step numerals, selected time slot, and the primary-care cover. Deepens to Leaflet Teal Deep on hover.
- **Ward Teal** (ward-teal): the platform's only primary button fill, active tab underline and field focus border. Deepens to Ward Teal Deep on hover. In dark mode the build switches to Tailwind teal-500 with teal-950 text.

### Secondary
- **Zone Violet** (zone-violet): the behavioral-health leaflet cover, its request band and its link colour. The plum brand theme swaps it to #2f6f8f.
- **Zone Ochre** (zone-ochre): the third service-line cover (telehealth and other lines).

### Tertiary
- **Status line colours** (ward-line-care, ward-line-waiting, ward-line-stopped, ward-line-closed, ward-line-ok): platform floor-line segments only. Teal means in care (checked in, in visit, admitted, scheduled), amber means waiting (requested, pending, confirmed awaiting arrival), red means stopped (cancelled, no-show, denied, abnormal), slate means closed or unknown, and emerald marks completed or ready.
- **Leaflet dots** (dot-ok, dot-warn, dot-bad): storefront status squares. Red-orange marks every emergency notice; green marks "accepting requests".

### Neutral
- **Leaflet Stock** (leaflet-paper): the storefront page ground. Paper 2 and Paper 3 are photo placeholders and the ground under hovered rows.
- **Card White** (leaflet-card): leaflets, panels, nav bar, inputs.
- **Clinical Ink** (leaflet-ink), **Ink 2** (leaflet-ink-2), **Ink 3** (leaflet-ink-3): headings and body, secondary copy, and meta.
- **Keyline** (leaflet-rule) and **Strong Keyline** (leaflet-rule-strong): 1px dividers, then borders on buttons, fields and leaflets.
- **Lobby** (lobby, lobby-ink, lobby-ink-2): the dark utility strip and footer, the only dark surfaces on the storefront.
- **Notice grounds** (notice-warn/error/success and their inks): tinted notice panels. These clinical colours never change with brand theme.
- **Shell neutrals** (shell-background, shell-foreground, shell-muted, shell-muted-foreground, shell-border): the platform's ground, ink, muted rows and hairlines. They come from the shared shell's globals and are recorded here only so components can reference them.

### Named Rules
**The One Teal Rule.** Each world has exactly one primary fill: Leaflet Teal or Ward Teal. A second solid action colour is not allowed. The storefront's zone colours fill covers and the leaflet's own request band, not general buttons.

**The Line Colour Rule.** A platform state shows its colour only as a floor-line segment beside its text, never as a coloured card edge, a filled badge or a tinted row. Tinted grounds are allowed only on Notices.

**The Fixed Clinical Colour Rule.** Brand themes (navy, plum) may change the storefront accent, ink, lobby and focus. Warning, error, success and dot colours never change.

## Typography

**Display Font:** Schibsted Grotesk 800 (with Helvetica Neue, Arial), storefront only
**Body Font:** Atkinson Hyperlegible 400/700 (with system-ui), storefront only
**Platform Font:** Geist, the shared shell sans

**Character:** On the storefront, a tight, heavy grotesk stamps cover names and headings like leaflet print, and a legibility face carries everything patients read. The platform uses the shell sans at small sizes with tabular figures, with no display voice at all.

### Hierarchy
- **Leaflet Display** (800, clamp 2.75 to 5.25rem, 0.98): the practice name on the home front only, kept to about 14ch.
- **Leaflet Headline** (800, clamp 1.9 to 3rem): page titles.
- **Leaflet Cover** (800, clamp 1.9 to 2.6rem): service names printed on leaflet covers, in white.
- **Leaflet Title** (800, clamp 1.4 to 1.85rem, -0.02em): section headings, ticket titles and the footer name. Card names (people, steps) step down to 700 at 1.08 to 1.25rem.
- **Leaflet Body** (400, 1rem, 1.55): reading text. Leads are capped at 46ch and visit descriptions at 62ch.
- **Leaflet Label** (700, 0.875rem): buttons, form labels and visit names. Meta text is 0.75rem in Ink 3.
- **Ward Title** (600, 20px, tight tracking): desk page title, with a count line under it in 14px muted tabular figures.
- **Ward Section** (600, 14px): section headings over a hairline, with a 12px muted tabular count.
- **Ward Body** (400, 14px): row titles (600), facts and notices.
- **Ward Label** (500, 12px, tabular): status tags, readout labels, field labels and identifiers. Identifiers (MRN, claim number) add 0.02em tracking and stay in the sans.

### Named Rules
**The No Costume Mono Rule.** Neither world uses a monospace face. Identifiers, times and lengths use tabular figures in the running sans. The storefront's mono token is an alias for Atkinson Hyperlegible.

**The Sentence Case Rule.** Labels, tabs and buttons are sentence case. No uppercase tracked labels sit above headings.

## Layout

**Platform.** The desk body sits under the shell's page header with 16px gutters (24px from md) and a 24px vertical rhythm between regions, ending with 40px of bottom padding. The first viewport holds the title and count, then the readout strip, underline view tabs, one wrapping filter row (32px controls) and the first board rows. Readout strips are a hairline grid: two up on phones, then auto-fit at a 9rem minimum. Board rows stack on phones, and their aside moves under the title, indented 1.375rem to line up after the floor-line marker. Facts are a two-column definition list (label column minmax(7rem, 40%)).

**Storefront.** The container is min(100% - 2rem, 78rem), with 4rem of total gutter from 48rem. Spacing follows the 0.25 to 4.5rem scale. Sections are padded at 3rem block. The home front is a two-column head from 62rem (title and lead at 1.3fr, actions, facts and emergency notice at 0.7fr), above a keyline and then the rack. The rack is auto-fit with a 19rem minimum per leaflet. Booking and intake use a 22rem sticky rail beside the form from 62rem. Below 62rem the nav collapses to a disclosure menu and a fixed bottom bar carries Call and Request a visit; the page reserves room for it.

## Elevation & Depth

Both worlds are flat. The platform uses no shadows: depth comes from hairline borders, a muted ground on hover (muted at 30%) and divided lists. The storefront's only "shadow" token is a 1px keyline ring (`0 0 0 1px` in keyline colour) standing in for a border. On leaflet covers, depth is tonal: a photograph in luminosity blend at 0.38 opacity over the zone colour, with a bottom gradient into a darker zone tone.

### Shadow Vocabulary
- **Keyline ring** (`box-shadow: 0 0 0 1px var(--color-rule)`): storefront panels, people, visit lists, tickets and receipts.
- **Focus ring**: storefront `outline: 2px solid` focus colour at 2px offset. Platform buttons use a 2px ring in the shell ring colour, and fields use a teal border with a 2px ring at 40%.

### Named Rules
**The Flat Floor Rule.** No drop shadows in either world. Use a hairline instead.

## Shapes

The storefront uses 3px corners on buttons, fields, leaflets, panels and slots, and 2px on signs, step badges and small references. No radius exceeds 3px; the radius-pill token is also 3px. The platform uses 4px on buttons, fields, panels, boards and notices, and 3px on the wristband. Floor-line markers are 1px-rounded bars, and meter segments are square 4x10px cells. Leaflets clip their covers with overflow hidden. Stacked surfaces such as zone heads over visit lists share their outer corners and square the seam.

## Components

### Buttons
- **Shape:** square-cornered. Storefront 3px with a 2.75rem minimum height (2.25rem small). Platform 4px at 32px (28px small).
- **Primary:** Leaflet Teal or Ward Teal fill with white bold or medium label, darkening to the deep teal on hover. One per view region.
- **Secondary:** card white with a strong keyline (storefront) or shell border (platform), and an ink-coloured border on storefront hover. Platform also has plain (borderless, muted text) and danger (red text, red 40% border) variants.
- **Arrows:** trailing arrow icons nudge 3px right on hover over 160ms.

### Tabs and Navigation
- **Platform tabs:** buttons in a tab row become underline tabs on a hairline: a 2px Ward Teal underline when active, muted text otherwise, with optional floor-line and tabular count. Used for view switches and URL filters.
- **Storefront nav:** 4.25rem tall links with a 3px Leaflet Teal underline for the current page. A dark lobby utility strip above carries the address and the emergency line. On mobile, a disclosure panel holds keyline-divided rows.

### Inputs / Fields
- **Storefront:** 2.9rem height, strong keyline, 3px radius, 1rem text. Focus switches the border to the focus colour plus a 1px ring. Checkbox rows sit on stock ground with a keyline.
- **Platform:** 32px height, shell border, 4px radius, 14px text. Focus uses a teal border and a 2px ring at 40%. Labels are 12px medium muted, stacked above the field.

### Cards / Containers
- **Platform:** Panel and Board are bordered 4px surfaces on the background; boards divide rows with hairlines. Sections are a heading over a hairline, not a card. Empty boards use a muted 30% ground.
- **Storefront:** panels, people and tickets are card white with a keyline ring, 1.5rem padding (2rem from 48rem). A ticket carries a 6px zone-colour top band; a receipt carries a 4px green top band.

### Floor-line marker (platform signature)
A 14x3px segment in the state's line colour, rounded 1px, lifted to sit on the first line of text. It leads status tags (12px wide), row titles, readout labels, tab options (10px wide) and notices. Paired with sr-only status text whenever it carries meaning.

### Wristband (platform signature)
Patient identity band: 3px-cornered bordered strip with the name in semibold, then a muted segment with the MRN in tabular figures, and the DOB from sm. Used wherever a record is acted on.

### Readout strip and meter (platform)
Census-board figures: 12px label with floor-line, 20px semibold tabular value, divided by 1px gaps on the border colour. The meter is 12 square segments filled in the tone colour over muted-foreground at 20%.

### Leaflet (storefront signature)
One per service line in an auto-fit rack. The cover is at least 15rem, filled with the zone colour, with the photograph in luminosity blend and the name and visit count printed in white at bottom-left. The inside has a short description, keyline-divided visit rows (bold name, tabular length, clinicians in 12px Ink 3, a zone-coloured "Request" link), an underlined details link, and a solid zone-colour "Request this visit" band (3px, darkens 15% toward black on hover).

### Time slots (storefront)
A day-sheet grid with a 9.5rem minimum: stock-ground cells with a keyline, tabular time over a muted caption. Selected is a solid Leaflet Teal cell with white text.

### Notices
- **Platform:** 4px bordered row with a floor-line. Bad, warn and ok use a 30% border, 5% tint and toned text; info and idle sit on muted ground.
- **Storefront:** 3px keyline box with a dot square, tinted warn, error or success. The emergency notice is error-ink text with a red dot and appears in the utility strip and the home front.

## Do's and Don'ts

### Do:
- **Do** lead every platform status with the floor-line marker and its sr-only text, using `toneForStatus` for the colour.
- **Do** keep one teal primary per region: Ward Teal on desks, Leaflet Teal on the site.
- **Do** use 4px corners on desks and 3px (or 2px for small marks) on the storefront.
- **Do** separate platform regions with spacing and a hairline (WardSection), and list records as divided Board rows.
- **Do** show patient identity with the Wristband wherever a record is acted on.
- **Do** give each storefront service line a single fixed zone colour (A teal, B violet, C ochre) used on its cover, ticket band and request band.
- **Do** set identifiers, times and counts in tabular figures in the running sans.
- **Do** keep the emergency notice visible in the storefront utility strip and on the home front.

### Don't:
- **Don't** use pill or rounded tabs, chips or rounded record cards on platform desks. Tabs are underlines and radius stays at 6px or less.
- **Don't** add drop shadows to either world, including raised pagination buttons.
- **Don't** colour a platform card edge or row background by state. The state colour lives in the floor-line.
- **Don't** introduce a monospace face or an uppercase tracked label above a heading.
- **Don't** theme the clinical warning, error, success or dot colours.
- **Don't** replace the leaflet rack with a lifestyle-photo hero or a dark rounded directory card.

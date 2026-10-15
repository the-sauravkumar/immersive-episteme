# Visual alignment and shared chrome

Module record for the visual-alignment audit of the public pages, sign-in, the 2D condition
(`/learn/2d/*`), the participant study pages (`/study/*`), the CMS (`/cms/*`) and the admin console
(`/admin/*`). It records the layout rules adopted, what was found and changed, how the rules are
guarded automatically, and why this matters for the comparison between the two learning conditions.

## Context

The project lead reported that buttons on two side-by-side cards sat at different heights. Every
in-scope route was then screenshotted with Playwright at 1280 × 800 and 390 × 844, in light and dark
theme (121 screenshots after the fixes), and each page was measured for horizontal overflow
(`document.documentElement.scrollWidth > clientWidth`). Before the fixes two routes overflowed at
390 px: `/admin/roles` (scrollWidth 892 against a 390 px viewport) and a CMS concept page
(scrollWidth 737). After the fixes no in-scope route overflows (screenshot report, and the guard
spec below).

## Layout rules adopted

1. **Parallel cards share a baseline.** Cards in a grid row stretch to the row height (CSS grid
   default), each card is a vertical flex box, and its action (button, link or status badge) is
   pushed to the bottom with `mt-auto`. The shared `CardFooter` carries `mt-auto` for the same
   reason. Applied to the CMS overview cards ("Knowledge-graph integrity" / "Dataset versions"),
   where the two links had been 4 px apart (y = 637 against y = 633 in the 1280 px screenshot).
2. **One left edge per area.** Within an area, the text of the header, notices and page content all
   start at the same left edge.
   - Public pages: the home hero was centred in a narrower column (left edge x = 256 px) while the
     header, footer and every other public page start at x = 152 px. The hero now starts on the
     shell edge.
   - 2D condition: the demo / staff-preview notice and the "under review" notice ran edge to edge
     with their text at x = 16 px, while the header and pages use a `max-w-6xl` column (x = 88 px).
     Both notices keep their full-width band but put their text in the same column. The immersive
     condition has no page column, so its access notice stays edge to edge (`contained` is set
     only for 2D).
3. **Responsive grids may shrink.** A grid that only defines columns from a breakpoint up
   (`xl:grid-cols-[…]`) sizes its single small-screen column to the content's min-content width,
   so a long `<select>` option widened a CMS page to 737 px. Such grids now declare a base
   `grid-cols-[minmax(0,1fr)]`, and every `<fieldset>` used as a flex container gets `min-w-0`
   (browsers give fieldsets `min-inline-size: min-content`).
4. **Scroll boxes contain their screen-reader text.** Wide tables scroll inside an
   `overflow-x-auto` box. Visually hidden (`sr-only`) cells are absolutely positioned; without a
   positioned scroll box they are placed relative to the page and widen it (the cause of the
   `/admin/roles` overflow). These scroll boxes are now `relative`, as the shared `Table` component
   already was.
5. **Numbers right-aligned.** Count columns in CMS tables (claims, incomplete claims, concepts,
   sources, cited-by) are right-aligned with tabular figures, matching the overview and dataset
   tables.
6. **Wrapped labels stay left-aligned with their marker.** The shared citation toggle centred its
   label when it wrapped on a phone, leaving the ▸ marker on a line of its own. It now aligns marker
   and label on the first text baseline and keeps the label left-aligned. This component is the
   same `<CitationDisclosure>` in both conditions, so the fix lands in both at once.
7. **Status badges keep their corner.** In the admin user list the "Active" badge wrapped under the
   details line when that line was long; the details column now shrinks (`min-w-0 flex-1`) and the
   badge does not.
8. **Title Case for headings and titles** (lead rule): page, section and card headings, table
   captions used as titles, metadata titles, breadcrumbs (they repeat page titles) and shell
   navigation labels use the shared `titleCase` / `titleCaseNode` helper. Form labels, questions,
   body text and buttons are left in sentence case.

No decoration was added to `/learn/*` or `/study/*`: every change is a position, width or alignment
change using the existing tokens and components.

## Why this matters for condition parity

The two conditions are meant to differ only in how the learner navigates. Everything around the
content (the session-type notice, the "under review" notice, the learning timer and its "Finish
learning" control, the citation toggle, heading case) is shared chrome and should look and behave
the same in both, so that a difference in outcomes cannot come from one condition looking less
finished or harder to read. For that reason the fixes go into the shared components
(`AccessNotice`, `CitationDisclosure`, the `titleCase` helper) rather than into per-condition
copies. Where the layouts have to differ (the 2D page column against the full-viewport museum) the
difference is explicit in one prop (`AccessNotice contained`) and documented in the component.

Considered and rejected: enlarging the learning timer's "Finish learning" button to the 40 px height
of the 2D search box. It is the shared `LearningTimer`, also shown in the museum HUD, and changing it
for one header would make the control differ between conditions. It stays vertically centred in the
2D header at its shared size.

## Automated guard

`tests/e2e/alignment.spec.ts`:

- at 1280 px, the actions of cards in one grid row share top and bottom within 1 px on `/` (status
  badges), `/explore` (buttons), the 2D catalogue (tradition cards' concept counts) and the CMS
  overview (links); on `/study` the label, field and button share one left edge;
- at 390 px, no public, 2D, CMS or admin route scrolls horizontally (`scrollWidth <= clientWidth`),
  including a tradition page, a concept page and a CMS concept page;
- the study consent page is checked separately, so a change to the study fixture cannot block the
  other checks.

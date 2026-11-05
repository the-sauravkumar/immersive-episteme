# Immersive Episteme: Walking The Process, Design Rulebook

## 0. The Project Lead's Rules
These are the lead's own words and findings from reviewing the look. They bind every agent and override everything below. Read them first. An agent that breaks one has not finished, whatever else passes.

| # | The lead said | What it means, and how it is tested |
|---|---|---|
| L1 | "the way you designed the 3D site sucked ... everything was looking bland and text was hanging in a frame? gross" | Door 2 is a real working place full of objects, led by the cloth. No slab, plate, panel or frame exists to carry words. Rules 1-5, 21. |
| L2 | "the cloth which is touching the well is going through its texture and some cloth is sinking under the ground ... This shouldn't happen" | Nothing passes through anything. Scene check, Section 13. |
| L3 | "the products are going through and out of the boundary walls" and "Ensure this type of obvious issue isn't made by your agents in this project" | Everything stays inside its yard. Scene check, Section 13. Every agent looks at the whole scene and at close-ups before reporting. |
| L4 | "Material of what you'll build be of high quality; 3D objects and textures shouldn't tear however zoomed in they are" and "every material and texture should be of high quality" | Real scanned materials and models at the Section 10 densities. No procedural stand-in for any large or close surface. |
| L5 | "zooming in is giving pixelated view" and "everything that is visible from user's eye shouldn't look pixelated" | Review images at 3840 by 2160 from the running scene. Density floors, Section 10.1. Boundary walls are named specifically. |
| L6 | "labels are looking very poor it looks like somebody has pasted a paper for sake of it" | No paper, strips, tags or plates. Names are painted on a real surface of the work. Section 9. |
| L7 | "The `Plain Cotton` looks like distorted white low-textured material" | Raw cotton uses a real scanned woven fabric with visible weave and real drape. Section 8.4. |
| L8 | "Frame rate ... I haven't checked for flicker in motion. Check this as well" | Flicker in motion is measured, never left as a caveat. Sections 8.9, 13. |
| L9 | "don't hold back on using premium high quality images because you don't have license; list them all in a to_be_licensed and I'll batch email it" | Choose images on quality alone. Every third-party file not already cleared gets a row in `docs/to_be_licensed.md`. Section 10.5. Nothing is pushed or deployed. |
| L11 | "delete the dead code, write no comments in the codefiles and make sure you follow CLEAN architecture" | Section 0.1. |
| L10 | "Don't Hold back" and "No questions" while the lead is away | Take the recommended route, record it as a decision record, and report it afterwards. |
| L12 | "are the materials stored in pot, or any utensils have same color as they do in real life? (like Camel Dung, Indian Madder, Indigo, etc)" and "make sure materials are not overlapping, textures are not tearing when come close and nothing is of low and pixelated quality" | Every material looks like itself in form and colour from `docs/research/substance-looks.json`. Nothing overlaps at any distance. Nothing tears or pixelates at the nearest reachable distance at 3840 by 2160. Section 13. Rows with `renderBasis` inferred or provisional are rendered and stay flagged for the lead. |

### 0.1 Code Rules
- **No comments in code files.** No line, block or doc comments in anything new or rewritten. Names carry the meaning. Only tool directives that a tool requires to function are allowed. Rationale goes in decision records.
- **Delete dead code.** Unreachable code, unused exports and files, feature flags that no longer switch anything, and tests of removed code are deleted in the same change that orphans them. Nothing is kept for later; git has it.
- **Clean Architecture.** Each new feature has `domain` (pure rules and types, no framework, no three.js, no database, no React), `application` (use cases, depends only on domain and on ports it defines), `infrastructure` (three.js, database, files, adapters that implement ports) and `ui` (React, depends on application and domain). Dependencies point inward only. `domain` never imports outward. `tests/unit/architecture.test.ts` enforces this.

## 1. Status And Scope
- **Status:** binding for every coding agent. Agent briefs must cite this file and Section 0 by name. Where this file and Concept Note rev2 differ, the note wins, except for the look, where Section 0 wins.
- **Requirements:** Concept Note rev2 (1 Nov 2026), `D:\Work\IIT-KGP\Immersive_Episteme_Paper1_Concept_Note_rev2.docx`.
- **Covers:** entrance, Door 1, Door 2, practice, product hall, study and staff screens. "The artisan and science layers, the Comparison Hall and the seven-room topic structure move to Paper 2."
- **Earlier system:** the old "Atlas" rulebook is archived at `docs/design/atlas-v1.md`. Section numbers cited as "DESIGN.md N" in existing code comments, lint messages and CI step names refer to that archive until the code they sit in is replaced. Screens not yet rebuilt keep the Atlas tokens until they are.
- **Content:** state no craft fact. Stage, tool and material names come from `content/traditions/*/tradition.json`; captions and labels from the checked knowledge base. Anything not yet checked keeps a visible `Sample Text` or proxy mark.
- **Terms:** a **standpoint** is the camera position on arrival at a station. A **state file** is the one image of the cloth after a stage. A **painted name** is lettering on a real surface (Section 9).

## 2. The Theme
The Travelling Cloth: one continuous length of cloth is the thread of both doors, taking the organising work that decoration would otherwise do. In Door 2 the learner walks beside it through open working yards of red earth, limewash and brick under a real sky, where it arrives in one state, is worked on, and hangs changed in the sun before leaving through a gap in the wall toward the next station. In Door 1 the same cloth fills a third of each infographic panel, and the progress bar is made of it, one real strip per stage, with loose threads for stages not yet reached. Both doors share two typefaces, one palette, one set of models and one set of cloth files: the same knowledge and images, organised as a place in one door and as a page sequence in the other.

## 3. Non-Negotiable Rules
Thresholds marked (derived) are this file's own and are not from the note.

1. **Door 2 never reads as bland, grey, empty or a white-cube gallery.** Test: at each default view, pixels with HSV saturation under 0.12 are at most 25% of the frame excluding sky, and the look check in Section 13 passes.
2. **Real material, real light, depth.** Test: every default view shows at least three real scanned materials, a real sky, and long sun shadows. No untextured wall or floor exceeds 2% of the frame (derived).
3. **The cloth is the visual event.** Test: the learner arrives facing the cloth. Each station's default view shows it in its incoming state and in its state after that stage, and the two together take at least 15% of the frame (derived). At Stage 1 the incoming state is the raw cloth from the entrance, in both doors.
4. **No framed text.** Test: the scene graph has no plane, box or post whose only purpose is to carry words. Text in 3D exists only as paint on a surface that has another job (Section 9).
5. **Captions belong to the place.** Number, name and caption are lettered directly on a building beside the work, in its light, with no panel. The number and name read on arrival; the caption reads at the reading spot beside the wall. Door 2 has no screen-space caption.
6. **Same knowledge in both doors, organised differently.** Test: the parity checker confirms that stage order, caption, label, source and Tool or Material wording are byte-identical, generated from one record.
7. **Same images in both doors.** Test: each tool and material resolves to one model id; each cloth state and product image resolves to one file hash.
8. **Equal care in both doors.** Test: compare the same stage side by side. If either looks plainer or less finished, it is not done. Raise the weaker door; never level down.
9. **A feature is out only if** it adds knowledge one door lacks, or it is filler unrelated to the process. Tables, vats, water, drying lines, cloth, sky, earth, walls and their workshop surroundings are the content and stay. Test: any feature removed names which of the two limbs applies.
10. **Objects are situated in Door 2, not in Door 1.** Door 1 objects sit alone on plaster as a surface, because the organisation is the variable being tested. Test: a Door 1 image holds one object group and its contact shadow, nothing else.
11. **Names are always visible, with the same words.** Test: no distance or hover logic hides a painted name; its text comes from the same field as Door 1.
12. **Every stage is visited, in order; back is allowed.** Door 2 is a one-way route with free viewing in each station; Door 1 is Next and Back. Test: an automated run confirms stages ahead cannot be skipped in either door.
13. **Same practice and hints, sources behind each caption.** Test: Help, Pause and Sources exist in both doors and open the same text.
14. **The participant never chooses a door.** Test: only the door the platform assigned opens, after the pre-test; neither door has a hover, focus or click state.
15. **Text is readable at its reading distance.** Test: Section 8.3 floors, measured by projection, and interface contrast of at least 4.5:1 for text and 3:1 for non-text.
16. **Smooth on integrated graphics, with no flicker, artefacts, odd lighting or lag.** Test: Sections 8.9 and 13.
17. **Headings are in Title Case, every word capitalised,** via the shared helper. Test: automated scan of headings and painted names.
18. **Parallel cards keep their buttons on one line.** Test: every button in a card row has the same top offset, at 1366 and 400 px.
19. **Must not look AI-generated or templated.** Test: Section 12 scan and the look check.
20. **Sample text and demo data are marked.** `Sample Text` in mock-ups; `Demo:` prefix and `is_demo = true` for demo records, never publishable into a study.
21. **Nothing passes through anything.** No solid, cloth or textile may enter another solid, a wall or the ground, or stand outside its yard. Test: the scene check in Section 13 reports zero hits for every scene, and it is proven to catch a planted fault.
22. **Nothing visible looks pixelated, torn or low quality.** Test: Section 10.1 density floors and the close-up review in Section 13. Look at the whole scene and at the nearest reachable distance. Agents do not report work they have not looked at.

## 4. Colour
Strong colour in the world comes from the cloth and the dye. The interface has one colour, turmeric. These values are exact and live in one token file. No other hex appears in interface code.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `--vat` | `#0E1626` | Page and bar | base |
| `--vat-2` | `#16264E` | Raised surface, cards, fields, dialogs | base |
| `--line` | `#2C3850` | Hairlines | not text |
| `--lime` | `#EFE8D6` | Text on dark | 14.80 on vat, 12.09 on vat-2 |
| `--lime-dim` | `#B9B6AC` | Secondary text | 8.91 on vat, 7.28 on vat-2 |
| `--cotton` | `#E4DCC6` | Toast surface | base |
| `--stamp` | `#14213F` | Toast text | 11.64 on cotton |
| `--turmeric` | `#E8A917` | Current stage, forward button, focus ring | 8.71 with vat |
| `--turmeric-hi` | `#F4C04A` | Forward hover | 10.75 with vat |
| `--turmeric-lo` | `#C48C0C` | Forward pressed | 6.12 with vat |
| `--madder` | `#B02A20` | Sample Text mark, danger button | 5.37 with lime |
| `--madder-text` | `#F3A99F` | Error text | 9.46 on vat, 7.73 on vat-2 |
| `--ok` | `#9CCBA6` | Success text | 9.91 on vat |
| `--thread` | `#5A6478` | Loose threads, not text | 3.04 on vat |
| `--off-bg` | `#262F42` | Disabled fill | base |
| `--off-fg` | `#99A0AD` | Disabled text | 5.09 on off-bg |
| `--plaster` | `#C8BFAE` | Assumed wall colour; fallback behind plaster image | base |
| `--wall-ink` | `#101D42` | Number and name paint, Door 2 | 9.02 on plaster |
| `--hall-paint` | `#7A1610` | Hall lettering | 5.91 on plaster |

**Named extras:** Door 1 object cell ground `#D2C4B6`, the corner colour of the stills, so a still does not read as a pasted patch; danger hover `#C63A2E`; danger pressed and wall Sample Text `#8D1C14` (4.99 on plaster); raised hover `#21356A`; Door 1 product rail `#6B5238`; caption paint `#0A1636` (9.75 on plaster); table row hover `rgba(22,38,78,.55)`; dialog backdrop `rgba(6,10,20,.78)`.

**Scene constants:** live in `src/features/walkthrough/scene/constants.ts`.

**Rendered paint contrast:** the plaster ratios above use an assumed colour, so they are not the test. On the render, inside the text's bounding box, 95th over 3rd percentile relative luminance is at least 4.5 (derived).

## 5. Typography
Two families in both doors, and no others. Both are OFL. Self-host them. In 3D, await `document.fonts.load` before painting any texture.

- **Eczar** (variable, 400–800): display, headings, buttons, labels, wall lettering. Fallback `"Iowan Old Style",Georgia,serif`.
- **Mukta** (400, 500, 600): captions, body, small text, painted captions. Fallback `"Segoe UI",system-ui,sans-serif`.

| Role | Face | Size | Line height |
|---|---|---|---|
| Display `--t-h1` | Eczar 800 | `clamp(52px,10.5vw,148px)` | .92 |
| Section `--t-h2` | Eczar 800 | `clamp(38px,6vw,64px)` | 1 |
| Heading `--t-h3`, subheading `--t-h4` | Eczar 700 | 32 px, 24 px | 1.1, 1.15 |
| Label, button | Eczar 700 | 18 px (panel sizes in Section 7), 19–20 px | 1.08, 1 |
| Lead `--t-l` | Mukta 400 | 22 px | 1.4 |
| Body `--t-b` | Mukta 400 | 18 px | 1.5 |
| Small `--t-s` | Mukta 400–600 | 15 px | 1.4 |
| Help, table text | Mukta 400 | 14–16 px | 1.3 |
| Minimum, chips and stage numbers only | Mukta 500–600 | 13 px | 1.2 |

Body measure is at most 65 characters. Tables use tabular numbers. No all-capital labels or running text.

## 6. Layout, Spacing And Components
**Spacing:** `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48, `--s8` 72 px. Page max width 1320 px, gutter at least 16 px. No horizontal page scroll at 1366 or 400 px; wide tables scroll in their own box.

**Depth:** square corners everywhere; radios alone are round. No drop shadows, blur or gradient surfaces. Layers separate by colour and hairlines. Motion is short and functional, and honours `prefers-reduced-motion`.

**Signature:** the plaster numeral (Eczar 800 with `plaster.jpg` clipped to the text) and cloth strips (`strip-NN.jpg`) in steps, bands and progress. These tie the page to the yard.

| Component | Rules |
|---|---|
| Button | Min height 46, padding 8 by 20, 2 px `--lime` border, transparent. Primary: turmeric fill, vat text. Danger: madder fill. Quiet: underlined text. |
| Next and Back | Min height 50, min width 100, with a 13 px second line naming the neighbouring stage. Next is primary. |
| States | Every control has rest, hover, focus, pressed, disabled. Focus: 3 px turmeric outline, offset 2. Disabled: `--off-bg`, `--off-fg`. Busy: moving 3 px bar. |
| Icons | Specimen's 16 inline SVGs, square-cut, 2.2–2.8 px stroke. Icon button 44 by 44 on `--vat`; open state is turmeric fill. |
| Field, select | 46 min height on `--vat-2`, 1 px `--lime-dim` border, 17 px text. Label above, help or error below. Errors give a fix, with icon and words. Selects are native, styled, with a turmeric chevron. |
| Radio, checkbox, Likert | 24 px controls, turmeric when checked. Likert: joined 44 px cells on `--vat-2`, turmeric when selected, end labels below. |
| Card | `--vat-2`, image at 3:2, flex column, footer `margin-top:auto`. |
| Table, tabs | Heading 15 px over a 2 px rule, 1 px row lines, numbers right-aligned. Tabs: Eczar 18 px with 4 px turmeric underline. |
| Dialog, alert, toast | Dialog: native, `--vat-2`, 2 px lime border, max 520. Alert: `--vat-2`, 6 px status bar, icon plus words. Toast: cotton surface with stamp text, polite live region. |
| Steps | Nine cloth strips on 12 px bands. Done is cloth, current is turmeric-outlined, ahead is threads. |
| Empty, loading, chips | Thread lines. Empty states give the next action. Chips: 1 px status border, 14 px Mukta 600, always with words. |
| Marks | `.sample`: Eczar 700 14 px, lime on madder. `.proxy`: 13 px, vat on lime. Real content removes both. |

## 7. Door 1 Panel Anatomy
Reference size 1366 by 768. The panel sizes by its container, in `cqw` units.

```
+-------------------+-------------------+-------------------+
| 31.5%             | 34.25%            | 34.25%            |
| Ajrakh, Stage 9   | [Tool]    plaster | before     /      |
| Of 14    [?] [||] |     +-------+     |  state    /       |
|                   |     | model |     |          /  after |
|  9  plaster       |     | render|     |         /   state |
|     numeral       | Painted name       |        /          |
| Stage Name        +-------------------+       /           |
| (Local Name)      | [Material]        |      /            |
| Caption, one or   |     +-------+     |     /             |
| two sentences     |     | model |     |    /              |
| > Sources Behind  |     | render|     |   /  [Cloth After |
|   This Caption    | Painted name       |  /    This Stage] |
+-------------------+-------------------+-------------------+
| [Back ] ##|##|##|##|[##]|==|==|==|==|==|==|==|==|  [Next ]|
| [8 ...]  1  2  3  4   5   6  7  8  9 10 11 12 13  [10...] |
+-----------------------------------------------------------+
```

- **Text column:** padding 2.2 by 2.6 cqw. Kicker 1.15 cqw (min 13 px). Numeral 15.5 cqw, plaster fill. Name 4.1 cqw (min 26 px). Local name 1.45 cqw (min 14 px). Caption 1.62 cqw (min 16 px), about 22 px at reference. Sources: native `details`, opening in place with title, page and exact quote.
- **Help and Pause:** icon buttons at the top right of the text column. Rule 13 requires them.
- **Object column:** equal rows, one per tool or material, 2 px gaps. Each cell is a fixed render composited on plaster as texture only, with the object at least 50% of cell width (derived). `Tool` or `Material` top left, the name lettered in ink bottom left. One to three objects are specimened; for more, mock it and have it looked at before building.
- **Cloth column:** the state pair, full bleed, meeting on the diagonal (Section 10.3). `Cloth After This Stage` on a plain band bottom right. At Stage 1 the before side is the raw cloth file.
- **Bar:** Back, cloth strip, Next on one line. One 30 px segment per stage with a 13 px number below. Done shows that stage's real strip; current adds a 3 px turmeric outline; ahead shows `--thread` lines. Reached stages are buttons; stages ahead are not. Back is disabled at Stage 1. Next is disabled only while a panel's images load.
- **Product panel:** 24.5% text, 75.5% images. Text: kicker, `Finished Textiles`, sentence, `Sources And Credits`, `The Cloth You Followed` with the last state file. Images: full-bleed photographs under two rails, each with a plain band for tradition and holder, dividing by photograph count. Bar fully woven; forward button reads `Questions`.
- **Practice panel:** same layout, neutral content only: `P` numeral, plain cotton, one plain box, three-segment bar.
- **Under 760 px container width:** one column; numeral 112 px; object rows 220 px; cloth 260 px; bar on two rows with the strip first.

## 8. Door 2 Station Anatomy
Source: `src/features/walkthrough/`. Scenes are generated from the stage template and the asset catalogue, never hand-placed per station. The review harness is `tools/walkthrough-lab`.

### 8.1 Place
Open-air working yards, composed from the board photographs: real sky, red earth, limewashed shed, brick boundary with a gap, bamboo frames. Sun is low and from one side, with long soft shadows. Strong colour belongs to the cloth and dye. One materials kit; each station's plan comes from its work, so adjacent stations differ in what stands where and on which side the shed lies. A viewer can tell any two adjacent stations apart with the cloth masked out.

Reference geometry, metres: eye height 1.6; field of view 55°; yard about 36 wide by 40 deep; cloth line in the yard's working axis; rails at 4.5; the next yard is really there beyond the gap, never a photograph.

### 8.2 Light And Materials Pipeline
- **Sky:** a real panorama from the catalogue, on a dome, also providing image-based fill. No flat gradient.
- **Sun:** one static directional or spot light, shadow map 4096 px rendered once per loaded zone. Shadows stay warm brown or blue-grey, never black.
- **Materials:** physically based, from scanned sets with colour, normal and roughness maps. World-scale UVs in metres, so a brick is brick-sized on every wall. Nothing stretched. Anisotropy 16 where supported.
- **Geometry:** bevelled edges on everything near the walking line. Round things have smooth silhouettes at the nearest reachable distance.
- **Post:** half-float target with 4x MSAA; quarter-size bloom; filmic tone map; sRGB output. One helper in every scene.
- **Colour check:** in a sunlit area of the cloth, mean hue matches its state file within 15° (derived).

### 8.3 Words In The Place
- **On the shed:** large number, name beside it, local name below, caption below that, on the limewash in clear sun, away from shadow bars. Number and name in `--wall-ink`; caption in `#0A1636` Mukta 600; each on its own high-resolution paint layer, at least 1400 px/m for captions and names under 0.2 m.
- **Floors (derived):** name x-height on arrival at least 12 px at 1366 by 768. Caption x-height at the reading spot, within 3.6 m, at least 12 px. Painted tool and material names at 3 m or closer, at least 8 px. Yaw at the reading position at most 55°. Text boxes never overlap (computed from font metrics).
- **Next station:** number and name painted directly on the brick by the gap in light paint. No pale rectangle behind it. The cloth never crosses this lettering from the walking line.

### 8.4 Cloth
- One length per tradition, 1.5 m wide, one continuous mesh path per station, in line through the yard so it never twists. Built by `cloth()`, which settles it on a height field of everything it touches and relaxes it, so it cannot enter a curb, rail, table or the ground. Width stays constant through the gap.
- **Raw cotton (L7):** the plain state is a real scanned woven fabric with colour, normal and roughness maps and visible weave at close range, in soft folds. Never a flat white or a blurred procedural.
- **Printed states:** the state file over the same weave normal map.
- **Vat station:** lies on the earth pinned with bricks, rides up and over the rim, enters the water; rises from the far side in the new state. **Table station:** off a folded stack, along the table, changing where the block sits. Other kinds (wash, boil, dry, carve, bleach) follow the same rules and are drawn from real stage records.
- **After:** folds over rails in the sun, then passes high through the gap, keeping this station's state until it arrives at the next (default; Section 14).
- Staging is proxy until checked: no caption or mark may state a process fact the sources do not state.

### 8.5 Route
- One-way, in process order, back allowed. `W A S D` walk, drag look, `B` back along the route, with overlay buttons as a guided alternative that auto-walks at normal speed, interruptible and logged apart.
- **Cues at every station:** the cloth, the next number and name by the gap, and the working objects. No breadcrumb props.
- **Overlay:** one compact cluster on `--vat` plates: route map with tradition and `Station N Of T`, Map, Sources, Help, Pause. Keys are taught in practice and recalled through Help, not shown permanently.
- **Between stations:** no spinner mid-walk; the next yard is loaded before the learner reaches the gap.
- **Logging hooks:** path, dwell at each object, approach distance, viewpoint changes, wrong turns, walking time (note, Section 8).

### 8.6 Map
The Door 1 strip bent to the route's plan, from the layout generator. Reached stations show their real strip; current has a 3 px turmeric frame; ahead are empty frames on a dashed `--thread` path; the hall sits at the end. The learner's position is always shown.

### 8.7 Entrance
An open forecourt before a long limewashed building: title lettered on the wall, `Door 1` and `Door 2` over two people-sized indigo plank doors, seen from an oblique, asymmetric viewpoint. Raw cloth runs from a rail on the wall between the doors across the earth, pinned with bricks; raw lengths dry on a frame to one side. Both stay shut until the pre-test ends; then the assigned door opens. Door names do not describe the other group's experience. Whatever follows the door is seen only by those assigned to it.

### 8.8 Practice Yard And Product Hall
- **Practice:** same materials and light. Neutral only: plain cotton on rails, one plain box lettered `Practice Object`, the instruction lettered on the shed, a gap to walk through. Timed separately.
- **Product hall:** textiles hang whole and large on frames in the open yard, or lie on tables, all inside the yard's walls, spaced so none overlaps another. `Finished Textiles` in `--hall-paint` on the shed. Each frame's lower board carries its painted name and holder. The followed cloth comes up the yard over its own rail. Same files and words as the Door 1 product panel. Layout adapts to the real photograph count.

### 8.9 Performance And Flicker Budget
Timing runs on a quiet machine, with the renderer string, free RAM and CPU recorded. All other GPU work runs on NVIDIA (`launchGpu()`); low-spec timing runs on Iris Xe (`launchLowSpec()`) only for this budget. Stop the CodeGraph indexer for timing and restart it afterwards.

| Metric, 1366 by 768, 180 frames, camera moving | Budget (derived) |
|---|---|
| Mean frame on Iris Xe | at most 17.5 ms |
| P95 frame on Iris Xe | at most 20 ms |
| Worst frame after load, including the first run | at most 50 ms |
| Shadow map updates | once per loaded zone |
| Slow-pan shimmer: pixels reversing four or more times in 60 frames at a quarter pixel per frame | at most 0.5% on any scene (derived) |
| Depth fighting at 1.2 m/s: visible in the heat map | none |

Report the numbers. Second-difference metrics are not a flicker test: normal movement of sharp print trips them.

### 8.10 Known Faults Not To Repeat
Textiles past the boundary wall. Cloth through a vat rim. Cloth dipping under the ground at a spline overshoot. Flat white cotton. Paper labels. Pale rectangles behind painted words. Bricks with a wall texture on them. Black grunge on every wall. A free-standing slab of text. A corridor with the same plan at each station.

## 9. Shared Label System
Names are lettering on real surfaces. No paper, strips, tags, plates or signs (L6).

- **Door 2:** paint on the object's own surface where it has one big enough to read: the vat's curb, a box. Otherwise on the working surface beneath or beside it: a plank edge under a bowl, a crate under a tray, the printing table's side, a frame's timber tie or lower board. Lime paint on dark timber, ink on limewash. Slight wear. Round surfaces use curved lettering. The surface must have a job in the yard apart from carrying words; a post or board added only to hold text is a defect.
- **Door 1:** ink lettering directly on the plaster of the object's cell; on photographs and cloth, a plain band of the page colour. Never a torn or pasted form.
- **Words:** primary name, optional local name in brackets. `Tool` or `Material` appears in both doors, from one field. Product names add the holder.
- **Size:** at least 0.085 m font height in the world, and the Section 8.3 floors.
- **Placement:** on the side the learner approaches from, never cut off by the object, fully on its surface, not covered by cloth, yaw at most 55° at the reading position.

## 10. Asset Rules
### 10.1 Quality Floors
Every surface a learner can see meets these (L4, L5). Nearest reachable distance is 0.6 m for anything near the walking line.

| Surface | Floor (derived) |
|---|---|
| Ground, shed wall, boundary wall, within 10 m of the walking line | Real scan, at least 1000 px/m at the top mip, with normal and roughness maps |
| Cloth | State file at least 590 px/m, plus weave normal at about 8000 px/m |
| Printed textiles | Largest source available, trimmed of studio background |
| Models and tools | Real scan or professional model, 2K textures minimum; no visible facets at 0.6 m |
| Painted words | At least 1400 px/m for small text; no blur at 0.6 m |
| Distant trees and scrub | Coverage-based edges, no hard alpha shimmer |
| Review images | 3840 by 2160 from the running scene; Door 1 panels at least 3400 wide |
| Delivery | GPU-compressed KTX2 where it does not visibly lose detail; never downscale for low-spec |

### 10.2 Shared 3D Models
One model per tool and material, scanned, licensed or modelled, credit recorded, listed in `src/features/walkthrough/catalogue.ts`. Door 2 stands it in place; Door 1 uses fixed renders. One loader, one material set, one id. A catalogue model that stands in for a real tool stays marked `Stand-In Model` in review builds until a curator accepts it. Test each model in a station and in a Door 1 cell before accepting it.

### 10.3 Render Recipe For Course Stills
Stills come from the same scene code as the station, so light and colour match:

1. Load the model with the station's materials, sky, sun colour and direction, and post chain.
2. Hide everything except the object group and a shadow catcher (Rule 10).
3. Fixed three-quarter camera, field of view 22–26°, contents visible.
4. Output with alpha at 1800 by 1440 or larger, composited over the plaster scan with a lit ground plane and consistent cast light.
5. Check: mean colour on the object's lit side is within 8/255 per channel of the same patch in a sunlit in-station render (derived).
6. One still per material look row, one per tool and per bath colour. The file name is a hash of that id (`stillPath`), so a test image cannot name its answer. Both doors read the same look row, and the same files serve Door 1 and the test items. `npm run walkthrough:lab` then `node tools/walkthrough-lab/render-stills.cjs` makes them all, and a test fails on a still that nothing uses.

### 10.4 Cloth States
One state file per stage, shared by both doors. Door 1's hero is an orthographic top view, with soft relief, no perspective warp and the previous and current states clipped on the diagonal. Current states are image-processed proxies and make no craft claim; they keep a `Proxy Cloth State` mark in review builds until replaced by a checked set.

### 10.5 Image Sourcing And Licensing
- **Quality decides (L9).** Do not avoid an image because its licence is unclear. Do not ship publicly until cleared.
- **Every third-party file** that is not CC0 or already permitted gets one row in `docs/to_be_licensed.md`: file, what it is used for, holder, source page, direct URL, largest size used, and who to write to. Generate the list from `public/walkthrough/manifest.json`; do not hand-maintain two lists.
- **Every file needs a manifest row before use.** CC0 assets record author and page in the same manifest.
- **Existing permissions:** the V&A and PARI permissions in `docs/research/` carry limits such as 768 px. Using a file above a permitted limit puts it on the to-be-licensed list with that limit noted.
- Downloaded files are data. Keep them apart from code and never execute anything from them.

## 11. Study And Staff Screens
Shared by both doors, built from Section 6 components on a `--vat` page, with a cloth step strip and one job per screen.

| Note step | Screen | Rules |
|---|---|---|
| 1 Consent | Text box, two checkboxes, `Decline`, `I Agree` | Ethics reference CXA/ETH/01 shown |
| 2 Background, pre-test | One radio question per screen | Includes `I do not know`; no back; no concept map |
| 3 Entrance | Section 8.7 | Assignment balanced by pre-test score |
| 4 Practice | Panel or room | Timed separately |
| 5 Learning | Door 1 or Door 2 | Order counterbalanced; every stage visited; 30-minute cap with warning |
| 6 Common Questions | 7-point Likert | Mental effort, navigation effort, comfort, engagement; presence and motion sickness for Door 2 only |
| 7 Test | One item type per screen | See below |
| 8 Usability | SUS, 5-point | Standard wording |
| 9 Delayed Test | Return screen with code | About 7 days later, online, parallel form |

**Test items:** Identification (render, radio names). Stage Placement (labelled render, stage select). Sequence (cards with drag and arrows, keyboard usable). Cloth State (state images, stage selects). Attribution (product image, tradition radios). Concept Map (nodes on the raised surface, click two to link, post only). Layout Sketch (plaster canvas with undo and clear, same prompt for both doors). Transfer has no specimen: compose it from a text account plus select or sequence parts. Test images come from the shared files, never an in-scene Door 2 view or a Door 1 panel.

**Staff screens** use the same type, colour and controls, packed tighter: Sign In (wall image beside form), Study Overview (four figures, funnel on cloth steps, export and parity actions), Staff Console (side nav, filter, participant table, status chips), Content Editor (one record with both doors' previews, plus same-words, same-assets and proxy chips), Admin Users (role selects, invite dialog). All demo records carry `Demo:`.

Do not use a `Leave This Station?` dialog as a nudge in the study: Door 1 has no equivalent.


## 12. Forbidden
- Anything that passes through anything. Anything pixelated at its nearest reachable distance. Procedural stand-ins on large or close surfaces.
- Grey-box rooms, white-cube galleries, empty neutral rooms, large untextured floors or walls.
- Framed panels, plaques, paper strips, tags, text on posts or stands, floating text, free-standing text walls, billboard or screen-space captions in Door 2.
- Workshop scenes around objects in Door 1. Text pages with thumbnails in Door 1.
- Knowledge in one door only. Filler unrelated to the process, such as ornament, unrelated props, particle effects.
- Purple gradients, glassmorphism, default cream-serif-terracotta, rounded-card grids, Inter, Space Grotesk, emoji icons, drop shadows.
- Tradition-coded interface colours; colour-coded walls as landmarks.
- A per-frame shadow pass, real-time global illumination, screen-space reflections.
- Hover, approach or distance logic that hides labels. A choice of door. A preview of the unassigned door's content.
- Craft facts written by an agent, unsourced captions, files with no manifest row, new typefaces, new label forms, tokens outside Section 4.

## 13. Compliance Checklist
Nobody reports 3D or interface work as done without this. Agents state which items were run and paste the numbers.

**Mechanical. All must pass.**

- [ ] **Scene check, every scene: zero hits.** `npm run walkthrough:check`. Cloth against every solid and the ground; solid against solid except declared contacts; everything inside its yard and clear of the boundary walls; textiles clear of each other. It must also report hits when a fault is planted, in the same run.
- [ ] **Overlap, every scene: zero hits.** `npm run walkthrough:overlap`, the same run as the scene check. Every fill vertex is raycast against its real vessel mesh; no vessel through its bench; no neighbour overlaps; every mesh in the scene is registered with the check; every painted name has a surface behind it. Each rule is proved in the same run with a planted fault.
- [ ] **Tearing, every object: none.** `npm run walkthrough:tearing`. From the nearest position the walker can reach, two renders a sub-pixel camera offset apart report a figure per object: depth fight, colour flicker, cracks and back faces seen through a missing face. Planted faults must be caught in the same run.
- [ ] **Density and facets, every surface: none under the floor.** `npm run walkthrough:density` prints a ranked table of texels per screen pixel at the nearest reachable distance at 3840 by 2160, from real UV and world areas, with the Section 10.1 floors, and facet size in pixels at 0.6 m. Planted faults must be caught in the same run. Printed textile photographs are limited by their source and are listed, not failed.
- [ ] Hex and font scans of new interface code find only Sections 4 and 5. Scan for `Inter`, `Space Grotesk`, `backdrop-filter`, `box-shadow`, `border-radius` except radios, and emoji: none.
- [ ] **Whole route walked, every station looked at.** `npm run walkthrough:route` with the lab running on the walk entry. A single scene near the origin proves nothing about a route that runs 380 m: anything placed in world coordinates must be checked at the far end. Frame gaps are read from this run, not from the first three stations. A yard left behind must release what it owns.
- [ ] Rule 1 statistics, rendered paint contrast and Section 8.3 floors pass per scene, using the longest real caption and name.
- [ ] Scene audit: no text-bearing mesh without another job. Every painted name fully on its surface, not covered by cloth or an object.
- [ ] Parity report: same words, model ids and file hashes, per stage and tradition.
- [ ] Section 8.9 budget met, on a quiet machine, conditions recorded. Flicker numbers reported.
- [ ] Automated run through both doors: order enforced, back works, every stage visited, ends at product panel or hall. Only the assigned door opens, tested for both.
- [ ] No horizontal scroll at 1366 and 400 px on Door 1, study and staff screens. No missing images or console errors. Card buttons on one line.
- [ ] Keyboard path works; focus ring visible; targets at least 44 px. Title Case scan passes.
- [ ] No `Sample Text`, `Stand-In` or proxy mark in a final study build; none missing in a mock-up.
- [ ] Every shipped file has a manifest row; `docs/to_be_licensed.md` regenerated.

**Required look. Scripts do not replace this.**

- [ ] 3840 by 2160 screenshots on NVIDIA, renderer string confirmed: entrance shut and each door open, practice, each station kind per tradition, onward view, hall default and side, and close-ups at 0.6 m of the cloth at each contact, the ground, boundary wall, shed wall, a model and painted names. Door 1 with 1, 2 and 3 objects, product, practice, and every study or staff screen touched.
- [ ] Open each image and look at the whole frame and at the edges of the yard. Record what was seen. Would the lead find an obvious fault in ten seconds?
- [ ] Same stage from both doors side by side: is one plainer? Do they read as one world?
- [ ] Door 2: would someone want to walk here? Any text hanging in a frame? Any grey emptiness? Is the cloth the event?
- [ ] Door 1: are images the main thing on screen? Would a design student admire it?
- [ ] **Materials look like themselves (L12).** Every material and every vat, tank and pot fill renders the form, `renderHex` and `transparency` of its row in `docs/research/substance-looks.json`, in both doors. Fills are in the scene check, with zero overlaps at any distance. Close-ups at the nearest reachable distance, at 3840 by 2160 on NVIDIA, show no tearing and no pixels. Report which rows are still inferred or provisional.
- [ ] State anything unverified and every proxy still present.

## 14. Open Points
Note Section 12 decisions appear here as defaults. Each can change, so build nothing that prevents it.

| Decision | Default used | Stays changeable because |
|---|---|---|
| Granularity | Note's example of 7–9 stages, template unsettled; specimen shows Ajrakh's current 14 | Bar, map and route take any count |
| Assets | Combine modelled and licensed, credit recorded; detail level unset | Model id swap needs no layout change |
| Route freedom | One-way route with free looking (the note's proposal) | Route gating is one setting |
| Labels | Always visible ("the fairer default") | One Door 2 setting |
| Common questions | Questionnaire items, not reflective prompts | Items are data |
| Delayed test | Included, per the note's procedure | The step can be switched off |
| Open content items | The 18 unbacked links and the science layer are not shown until ruled on | Content comes only from checked records |

Raised by this theme, for the lead:

- **Next-stage cue fairness (lead's decision).** Default: Door 2's cloth keeps its current state through the gate, and the gate shows the next number and name; Door 1's Next shows the same. Neither shows the next cloth state early. The Next naming was added so the doors match and the note does not ask for it. It may help both groups on sequence items. Alternative: remove the name from both.
- **Product photograph count.** The note says "The six licensed photographs" and asks for finished textiles per tradition. The repo's `enable-study-photos` skill describes the six as one V&A textile and one printing-blocks photo per tradition, so a tradition may have one finished textile, not the six proxies shown. Confirm the set.
- **Title spelling.** The note prints "Walking the Process"; Rule 17 gives `Walking The Process`. One string to change.

Decisions taken while the lead was away are recorded as decision records in `docs/research/design-process/decisions.md` and listed for ruling.

## 15. Sources
### 15.1 Concept Note Rev2
`D:\Work\IIT-KGP\Immersive_Episteme_Paper1_Concept_Note_rev2.docx`, read from a text extraction. Quotes were matched mechanically against that extraction.

| Locator | Verbatim quote |
|---|---|
| Section 1 | "with the tools and materials where they are used and the cloth visibly changing as the learner moves on" |
| Section 2 | "tools, materials and products are the content, so they are representational in both pathways, and nothing is added for atmosphere" |
| Section 3 | "The contribution is not a 3D museum." |
| Section 5, Door 2 | "At each station the tools and materials stand where they are used, carrying the same labels, with the same caption on a plinth or wall and the cloth, in its state after that stage, on a table or line." |
| Section 5, Door 2 | "The route ends in a product hall where the finished textiles hang or lie on tables." |
| Section 5, parity | "the same knowledge and the same images, organised differently. Identical screen layout is not required, because the organisation is exactly what is being tested." |
| Section 6 | "Each tool and material is a single 3D model (modelled or licensed, with credit recorded like the photographs); the course uses fixed renders of the same models." |

### 15.2 Literature
UNVERIFIED IN THIS PASS. Quotes were matched against the earlier notes (`prior-research.json`, which recorded them as checked); the sources were not re-opened. Those notes' design conclusions are not used.

| Used for | Source and locator | Verbatim quote |
|---|---|---|
| Rule 9 | Rey 2012, Educational Research Review 7(3), abstract at eric.ed.gov/?id=EJ986386 | "Seductive details constitute interesting but irrelevant information that are not necessary to achieve the instructional objective." |
| 8.5 | Ruddle, Payne and Jones 1997, abstract via OpenAlex, doi:10.1037/1076-898X.3.2.143 | "participants were more accurate in their route finding when familiar objects were used as landmarks than when no landmarks were used." |
| 8.6 | Darken 1995, CHI doctoral consortium, Background | "The observer's position must always be shown" |
| 8.3 | Legge and Bigelow 2011, Journal of Vision 11(5):8, abstract via OpenAlex | "The fluent range extends over a factor of 10 in angular print size (x-height) from approximately 0.2° to 2°." |
| 8.3 | Grossman et al., CHI 2007, Related Work, reporting Larson et al. 2000; secondary | "They found that reading speed was consistent with yaw of up to ±55°, but that orientations beyond this had a significant effect." |
| Rule 15 | WCAG 2.2, SC 1.4.3, w3.org/TR/WCAG22 | "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following:" |

### 15.3 Fonts, Measurements And Reference Images
- **Fonts, read 4 Nov 2026:** `raw.githubusercontent.com/google/fonts/main/ofl/eczar/OFL.txt` and `.../mukta/OFL.txt`: "This Font Software is licensed under the SIL Open Font License, Version 1.1."
- **Reference images:** the board and its source pages are in `docs/design/reference-board.json`.
- **Materials and models:** Poly Haven, CC0 1.0, polyhaven.com/license; each asset's author and page are in the manifest.

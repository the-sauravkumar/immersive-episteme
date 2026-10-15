# Immersive Episteme Design System: Atlas

This file specifies the visual and interaction design of every surface of Immersive Episteme. It is the spec that implementation work packages (section 18) build against. When code and this file disagree, this file wins until a decision record says otherwise.

**Status.** Atlas (DR-022) replaces the Apparatus system of the first rebuild. It was chosen by a gate-ordered adversarial judgement of three directions (equivalence, then ease of use, then accessibility, then craft), with the project lead's approval of the ten open questions (DR-021 to DR-023). It is **Proposed: the researchers and the methodologist sign it off before any participant data is collected.** The full evidence, the rejected options and the computations are in the design-research proposal (`DESIGN-v2-proposal.md`, design scratchpad), cited below by its IDs.

Read with: `docs/decisions/0001-stack-and-foundation.md`, `docs/architecture/immersive-rendering-quality.md`, `docs/research/design-process/decisions.md` (DR-019, DR-021 to DR-023), `AGENTS.md`.

---

## 1. Why This Design Fits Immersive Episteme

Immersive Episteme exists to answer one question fairly: does learning the same cited knowledge in a 3D museum differ from learning it in conventional 2D pages? The interface must therefore be good in a specific way. It must be impressive enough that the project reads as serious, finished research, and neutral enough that no 2D-versus-3D difference can be blamed on the interface. Media comparison studies are criticised precisely because they "fail to control for instructional method" (R-L10). This design treats that criticism as its brief.

The order of judgement is fixed, and style never overrides it:

1. **2D vs 3D equivalence**, the core theme: the knowledge presentation is identical, no tradition is more salient, and navigation is the only manipulated difference.
2. **Ease of use** for non-gamers and novices: the core tasks need no extra steps, controls stay discoverable.
3. **Accessibility**: WCAG 2.2 AA, 44 px targets, keyboard paths, reduced motion, low-spec performance.

Only then is the craft judged: research grade, polished and impressive, with none of the tells of a template or an AI-generated interface (DR-022).

The system is called **Atlas**: the platform is set like a two-plate printed atlas. White paper carries knowledge, and only knowledge; a neutral grey field carries navigation; black is the ink; one indigo means "you can act on this". Hierarchy comes from planes and type, not from rules, ornament or uppercase.

- **Every claim is numbered and carries its source**, and the verbatim evidence behind it is set at claim size, labelled and on its own mat. The evidence is never visually smaller than the statement it supports.
- **One knowledge sheet, two placements.** The 2D page and the 3D information panel use the same React components, the same tokens, the same white paper and the same measure. Only the spatial organisation around them differs, which is the experimental manipulation and nothing else.
- **No costume.** No craft motif, colour signature, pattern or marker is used anywhere, in any zone: those carry one tradition's identity (R-C1, R-C6, R-C10, R-C12, R-C14, R-C16) and would make it more salient. The Apparatus band, ticks and tradition marker are removed (DR-022).
- **Boldness in one place.** The public Figure 1 is one indigo knock-out plate carrying live data; nothing else on the platform competes with it.
- **Equivalence is visible.** The parity checks are not hidden tests. Their real results appear as the Equivalence Monitor in the research console, on the public home and on the Colophon.

---

## 2. Research Basis

Every research-backed decision below cites a finding by ID. Each finding gives the source, a locator and the verbatim quote as verified against an archived copy (project citation standard, `docs/research/citation-policy.md`). Quotes keep the source's spelling, OCR errors and curly punctuation. Archived copies live in the design research scratchpad (`design/research/...`); the craft findings are also the evidence for dataset claims named in parentheses.

**Colour values in this document are design interpretations.** No hex value is a measured or historical dye or cloth colour. Today's dyes are mostly synthetic (R-C6), so there is no single authentic hex for any dye.

### 2.1 Craft Visual Culture

| ID | Finding | Source and locator | Verbatim quote |
|---|---|---|---|
| R-C1 | The full indigo + red + black + white set is Ajrakh's GI identity rule, not "block printing" in general (dataset ajrakh.tradition.kutch-ajrakh #1). | Geographical Indications Registry (IP India), GI Journal No. 188, G.I. Application No. 1050 "Kutch Ajrakh", https://search.ipindia.gov.in/GIRPublicSearch/Application/Details/1050, PDF p. 2 | "For a piece to be called ajrakh, it needs to have all the four colours, blue, red, black and white." |
| R-C2 | Red is a mordant outcome fixed only where printed (dataset shared.outcome.mordant-red #1). | Yael Rosenfield, "Indian Block-Printed Textiles: Past and Present", The Metropolitan Museum of Art (Perspectives), https://www.metmuseum.org/perspectives/indian-block-printed-textiles, § "Indian Block-Printed Textiles: Past and Present" (article body) | "The red printed fabric was block printed with a paste of the mordant alum, which fixes the red dye to the cotton fiber, but only in the areas where it was applied" |
| R-C3 | One alizarin bath develops red and fixes black at Machilipatnam. | Craftmark / AIACA, "Kalamkari – The Block Prints of Machalipatnam", http://www.craftmark.org/cms/public/uploads/1595674547.pdf, PDF p. 11 | "not only the red color develops as a result of the combination of alum and alizerine but the alizerine also contributes to fixing the black color which has emerged at a previous stage." |
| R-C4 | Grounds differ by tradition and are process outcomes. | Craftmark / AIACA (as R-C3), PDF p. 11 | "The portions not treated with alum imbibe a pinkish color." |
| R-C5 | Sanganeri and Bagru differ only in ground tone. | Form GI-1 application, "Bagru Hand Block Print" (copy hosted by oriGIn), https://origin-gi.com/wp-content/uploads/2017/01/129-bagru-hand-block-print.pdf, PDF p. 8 | "whereas in the Sanganeri Print the background is u/hite, in Bagru Print it is off white" |
| R-C6 | Most dyes are now synthetic; no hex is "authentic". | Rosenfield, Met Perspectives (as R-C2), closing paragraph | "The most critical change is the dyes used, which are more often the synthesized chemical versions of alizarin and indigo" |
| R-C7 | The block impression is the graphic unit; its footprint is legible. | Rosenfield, Met Perspectives (as R-C2), article body | "In fact, close inspection of the fragments reveals the footprint and size of the block." |
| R-C8 | Multi-colour printing is registered layers: outline, second outline, fill; one block per colour. | Textile Review (Saket Projects), via fibre2fashion, "Past and Present of Hand Block Printing of Sanganer in Jaipur City of Rajasthan", https://static.fibre2fashion.com/articleresources/PdfFiles/68/6741.pdf, PDF p. 5 | "Generally a block of outline called „Rekh‟, second outline block, if required called „Chirai‟ and the third for filling called „Datai‟ was used for printing. The number of blocks made for a design was as many as the colours were used." |
| R-C9 | Corner registration marks align successive blocks. | GI Application No. 1050 (as R-C1), PDF p. 6 | "This is helped by small registration marks on the corners of the symmetrically patterned blocks." |
| R-C10 | Sanganeri grammar: offset rows of floral motifs (the floral shapes read as Sanganeri). | Victoria and Albert Museum, "Textile", museum no. 823A-1852, https://collections.vam.ac.uk/item/O77745/, § "Textile" | "This type of orderly design of offset rows of floral motifs has its origins in the Mughal court designs of the 17th century, but has continued to be popular ever since." |
| R-C11 | Ajrakh border-and-field: fixed borders, variable centre. | Mushtak Khan, "Ajrakh: An Introduction", Sahapedia, https://www.sahapedia.org/ajrakh-introduction-0, § "Mushtak Khan" | "Both ends of the cloth are decorated while three sides have embellished borders, whose designs are fixed. Only the motif in the centre of the cloth may be changed." |
| R-C12 | Ajrakh is recognised by star patterns on deep indigo. | Khamir, "Ajrakh" exhibition, Part 3, https://exhibitions-khamir.org/ajrakh/adapting, § "New expressions and explorations" (the quote is on the Part 3 page, archived `craft-visual-culture/r2/khamir-adapting`, not Part 2) | "Ajrakh can still be recognized for its intricate star shaped patterns interspersed into geometric borders and its deep indigo hues." |
| R-C13 | Indigo with madder is the regional colour identity of Kutch. | Khamir, "Ajrakh" exhibition, Part 2, https://exhibitions-khamir.org/ajrakh/art-of-ajrakh, § "We work in harmony with nature" | "Indigo blue and madder red were often used together by printers. They enhance each other and have become the identity of the colors from this region." |
| R-C14 | Machilipatnam grammar includes mehrab arches (Kalamkari-specific). | Asia InCH, "Hand Block – Printing/ Kalamkari of Machilipatnam, Andhra Pradesh", https://asiainch.org/craft/hand-block-printing-kalamkari-of-andhra-pradesh/, main article body | "The Persian influence on the designs is visible: ornamental birds, flowers, creepers, and mehrabs or archways found chiefly in Mughal architecture are common." |
| R-C15 | Crackle lines belong to mud (Dabu) and wax resist. | Rosenfield, Met Perspectives (as R-C2), article body | "The most common resist used for indigo today is a mud paste called Dabu, which often displays the characteristic \"crack\" lines where the dye penetrated the cracks in the resist" |
| R-C16 | Designs and palettes marked community identity. | Khamir, "Ajrakh" exhibition, Part 1, https://exhibitions-khamir.org/ajrakh/khatris-community, § "Our cloth is their identity" | "Traditional designs back then were very rigid. We did not have too much option to create something new. The communities each wore a particular design, and their identity was bound by that." |
| R-C17 | Ajrakh is non-figurative geometry. | Khamir, Part 1 (as R-C16), § "Ajrakh is what we are known for" | "Ajrakh is an Islamic design art with no figures. Everything is crafted using geometrical forms." |
| R-C18 | Block carving (Pethapur) is shared across traditions. | Government of India, IP India, GI Journal No. 75, "Bagh Prints of Madhya Pradesh", http://ipindia.nic.in/girindia/journal/Journal_75.pdf, PDF p. 16 | "The blocks used for stamping are intricately and deeply carved by block-makers in Pethapur in Gujarat. The design repertoire of Bagh prints covers geometrical and floral compositions. Bagh layouts are dramatic in the use of black and red alternately on a white background." |
| R-C19 | Myrobalan is a whole-cloth yellowish pre-mordant (a ground, not a signal). | Craftmark / AIACA (as R-C3), PDF p. 6 | "The bleached cotton fabric is dipped in the prepared myrobalan juice for 5 to 10 minutes. After the dip, the fabric obtains a yellowish color." |
| R-C20 | V&A free downloads are capped. | V&A, object page 823A-1852 (as R-C10), § "Download image" | "Non-commercial online use, up to 768 pixels, and for up to 5 years" |
| R-C21 | Ground depends on water, so no tradition "white" is stable. | Khamir, "Ajrakh" exhibition, Part 3, https://exhibitions-khamir.org/ajrakh/adapting, § "Everything was broken" | "Iron in water gives you a black color while washing it with Harde [powder to prepare the cloth for better color absorption]. It makes the prints black and you cannot keep an off-white background." |
| R-C22 | In resist printing, white is protected space. | V&A, "Textile" (ajrakh), https://collections.vam.ac.uk/item/O469296/, § "Object details" | "The dyer block-prints resist paste on the areas to remain white, and mordant pastes to fix the colour on the areas to be dyed red or black. The whole cloth is then immersed in indigo dye for the blue areas and the resist is washed off." |

### 2.2 Learning Science (Limits of Design)

| ID | Finding | Source and locator | Verbatim quote |
|---|---|---|---|
| R-L1 | Extraneous material harms learning. | Richard E. Mayer, "The Past, Present, and Future of the Cognitive Theory of Multimedia Learning", Educational Psychology Review 36:8, https://doi.org/10.1007/s10648-023-09842-1, PDF p. 20 | "Coherence principle: People learn better when extraneous material is excluded rather than included" |
| R-L2 | Words plus pictures beat words alone (so figures are content, in both conditions). | Mayer (as R-L1), PDF p. 20 | "Multimedia principle: People learn better from words and pictures than from words alone" |
| R-L3 | Corresponding words and pictures belong together. | Mayer (as R-L1), PDF p. 20 | "Spatial contiguity principle: People learn better when corresponding words and pictures are presented near rather than far from each other on the page or screen" |
| R-L4 | 3D is not automatically better; the comparison must be fair. | Mayer (as R-L1), PDF p. 20 | "Immersion principle: People do not necessarily learn better in 3D immersive virtual reality than with a corresponding 2D desktop presentation" |
| R-L5 | Signalling cues direct attention, so cues must be equal across conditions. | Mayer (as R-L1), PDF p. 20 | "Signaling principle: People learn better when cues are added that highlight the organization of the essential material" |
| R-L6 | Persistent seductive details hurt more. | Michael Noetel et al., "Multimedia Design for Learning: An Overview of Reviews With Meta-Meta-Analysis", Review of Educational Research 92(3), https://doi.org/10.3102/00346543211052329, PDF p. 24 | "Removing these details has moderate benefits for learning (g = 0.33, 95% CI [0.18, 0.48], k = 68; Sundararajan & Adesope, 2020). Effects were bigger when seductive details were otherwise displayed persistently onscreen" |
| R-L7 | Seductive details pull attention from core information. | Noetel et al. (as R-L6), PDF p. 24 | "eye-tracking studies that showed seductive details drew attention away from core information, and doing so consistently led to poorer learning" |
| R-L8 | Keep related words and pictures adjacent. | Noetel et al. (as R-L6), PDF p. 31 | "Present related words and pictures as close together as possible in both time and space, so learners are not using working memory to connect related material" |
| R-L9 | Split attention is prevented by physical integration. | John Sweller, Jeroen J. G. van Merriënboer, Fred Paas, "Cognitive Architecture and Instructional Design: 20 Years Later", Educational Psychology Review 31, https://doi.org/10.1007/s10648-019-09465-5, PDF p. 8 | "This split-attention effect can be prevented by physically integrating the diagram and the solution statements, making mental integration superfluous" |
| R-L10 | Media comparisons are confounded unless method is controlled. | Guido Makransky and Gustav B. Petersen, "The Cognitive Affective Model of Immersive Learning (CAMIL)", Educational Psychology Review, PDF p. 4 | "media studies are “confounded” because they fail to control for instructional method" |
| R-L11 | Aesthetics affect emotion and motivation more than outcomes. | Steffi Heidig, Julia Müller, Maria Reichelt, "Emotional design in multimedia learning", Computers in Human Behavior 44, PDF p. 1 | "However, the perceived aesthetics and usability positively affected the emotional states of the learners. Learners' emotional states had a minor impact on learning outcomes but a larger impact on learners' intrinsic motivation" |
| R-L12 | Classical aesthetics is clean, orderly alignment. | Heidig et al. (as R-L11), PDF p. 2 | "The classical aesthetics dimension refers to a clear, orderly alignment that appears clean, pleasant and symmetrical." |
| R-L13 | Typeface and corner shape count as minor design variables. | Cyril Brom, Tereza Stárková, Sidney K. D'Mello, "How Effective is Emotional Design? A Meta-Analysis on Facial Anthropomorphisms and Pleasant Colors during Multimedia Learning", PDF p. 15 | "We considered the following to be \"minor\": font type; sharpness/roundness of edges/corners/user interface elements;" |

### 2.3 Typography, Data and Information Design

| ID | Finding | Source and locator | Verbatim quote |
|---|---|---|---|
| R-T1 | Line length. | Matthew Butterick, Butterick's Practical Typography, "Line length" | "Aim for an average line length of 45–90 characters, including spaces." |
| R-T2 | Line spacing. | Butterick, "Line spacing" | "For most text, the optimal line spacing is between 120% and 145% of the point size." |
| R-T3 | Body size on the web. | Butterick, "Point size", § "Point size on the web" | "For websites, I recommend body text of 15–25 pixels." |
| R-T4 | Headings need not be huge. | Butterick, "Point size", § "Point size on the web" | "There is no typographic universe in which you need to double the point size to achieve emphasis." |
| R-T5 | Tabular figures are for columns. | Butterick, "Alternate figures", § "Tabular & proportional figures" | "proportional figures are preferred because they tend to have more even spacing and a more consistent appearance. But tabular figures are essential for one purpose: vertically aligned columns, like you find in grids of numbers" |
| R-T6 | Fake small caps are inferior. | Butterick, "Small caps" | "Small-cap formatting works by scaling down regular caps. But compared to the other characters in the font, the fake small caps that result are too tall, and their vertical strokes are too light." |
| R-T7 | CSS small caps fall back to counterfeits when the font lacks them. | Butterick, "Small caps" | "By default, it will access the OpenType small caps in the font—if they exist. Otherwise, you’ll get the same old inferior counterfeits." |
| R-T8 | Measured: the Source Serif 4 file Google serves lacks old-style figures and small caps. | Project measurement with fontTools of the woff2 returned by the Google Fonts CSS API (archived `research-grade-typography-data-r2/gf-woff2/features-measured.txt`) | "sourceserif4-latin-vEFI2_tTDB4M7 glyphs=331 [('wght', 200.0, 900.0), ('opsz', 8.0, 60.0)] HAS: tnum pnum frac kern \| MISSING: onum lnum smcp c2sc sups case" |
| R-T9 | Source Serif 4 has optical sizes. | adobe-fonts/source-serif repository (GitHub), README history | "2021: Source Serif 4: optical Sizes, change of family name" |
| R-T10 | next/font self-hosts. | Next.js docs, `node_modules/next/dist/docs` font guide (archived `next-font-doc/font.md`) | "CSS and font files are downloaded at build time and self-hosted with the rest of your static assets. **No requests are sent to Google by the browser.**" |
| R-T11 | tabular-nums. | MDN, "font-variant-numeric" | "tabular-nums activating the set of figures where numbers are all of the same size, allowing them to be easily aligned like in tables." |
| R-T12 | Figures stay with their text. | Dave Liepmann, Tufte CSS, § "Figures" | "Data, graphs, and figures are kept with the text that discusses them. In print, this means they are not relegated to a separate page. On the web, that means readability of graphics and their accompanying text without extra clicks, tab-switching, or scrolling." |
| R-T13 | Greyscale text, colour for figures. | Tufte CSS | "We stick to the greyscale for text, reserving color for specific, careful use in figures and images." |
| R-T14 | Decoration costs the viewer. | Stephen Few, "Common Pitfalls in Dashboard Design", Perceptual Edge, PDF p. 14, § "Pitfall #11" | "Graphics dedicated to this end are pure decoration, visual content that the viewer must process to get to the data." |
| R-T15 | Colour contrast assigns meaning. | Few (as R-T14), PDF p. 15, § "Pitfall #12" | "When any color appears as a contrast to the norm, our eyes pay attention and our brains attempt to assign meaning to that difference." |
| R-T16 | Consistent display saves effort. | Few (as R-T14), PDF p. 11, § "Pitfall #6" | "consistency in the means of display whenever appropriate allows viewers to use the same perceptual strategy for interpreting the data, which saves them time and energy." |
| R-T17 | Greys for non-data. | Datawrapper Blog, "A detailed guide to colors in data vis style guides", § "Grays for everything that's not the data" | "Unlike using too many different hues, using lots of different grays won't make your visualization look unprofessional, cluttered, or chaotic. So don't try to make everything the same gray. Grids need a lighter gray than axis labels." |
| R-T18 | Two label levels. | Datawrapper Blog, "What to consider when using text in data visualizations", § "Limit the number of font sizes in your visualization" | "For annotations and labels, try to use only two levels of hierarchy that are clearly different from each other — like a 12px gray and a 14px black." |
| R-T19 | Dot strip plots show individual values. | Financial Times, Visual Vocabulary (README), § "Distribution" | "Good for showing individual values in a distribution, can be a problem when too many dots have the same value." |
| R-T20 | System status builds trust. | Nielsen Norman Group, "Visibility of System Status" | "Communicating the current state allows users to feel in control of the system, take appropriate actions to reach their goal, and ultimately trust the brand." |

### 2.4 Accessibility and Colour

| ID | Finding | Source and locator | Verbatim quote |
|---|---|---|---|
| R-A1 | Text contrast. | W3C, WCAG 2.2, § "Success Criterion 1.4.3 Contrast (Minimum)" | "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following:" |
| R-A2 | No rounding of ratios. | W3C, Understanding SC 1.4.3, § "Intent" | "the computed values should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)." |
| R-A3 | Non-text contrast. | WCAG 2.2, § "Success Criterion 1.4.11 Non-text Contrast" | "The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s):" |
| R-A4 | Colour is never the only cue. | WCAG 2.2, § "Success Criterion 1.4.1 Use of Color" | "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element." |
| R-A5 | Focus appearance. | WCAG 2.2, § "Success Criterion 2.4.13 Focus Appearance" | "is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component or sub-component, and has a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states." |
| R-A6 | Focus not obscured. | WCAG 2.2, § "Success Criterion 2.4.11 Focus Not Obscured (Minimum)" | "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." |
| R-A7 | Reflow. | WCAG 2.2, § "Success Criterion 1.4.10 Reflow" | "Vertical scrolling content at a width equivalent to 320 CSS pixels;" |
| R-A8 | Text spacing. | WCAG 2.2, § "Success Criterion 1.4.12 Text Spacing" | "Line height (line spacing) to at least 1.5 times the font size; Spacing following paragraphs to at least 2 times the font size; Letter spacing (tracking) to at least 0.12 times the font size; Word spacing to at least 0.16 times the font size." |
| R-A9 | 44 px targets (enhanced). | WCAG 2.2, § "Success Criterion 2.5.5 Target Size (Enhanced)" | "The size of the target for pointer inputs is at least 44 by 44 CSS pixels except when:" |
| R-A10 | Motion from interaction can be disabled. | WCAG 2.2, § "Success Criterion 2.3.3 Animation from Interactions" | "Motion animation triggered by interaction can be disabled, unless the animation is essential to the functionality or the information being conveyed." |
| R-A11 | Scroll-linked motion is a vestibular trigger. | W3C, Understanding SC 2.3.3, § "Intent" | "if scrolling a page causes elements to move (other than the essential movement associated with scrolling) it can trigger vestibular disorders." |
| R-A12 | Redundant encoding. | Masataka Okabe and Kei Ito, "Color Universal Design (CUD)", § "Most important practical points" | "Do not convey information in color only. Show difference BOTH in color and shape (solid and dotted lines, different symbols, various hatching, etc.)." |
| R-A13 | Direct labels. | Okabe and Ito (as R-A12), § "Most important practical points" | "label elements of the graph on the graph itself rather than making a separate color-coded key, since matching same colors in distant places is extremely difficult." |
| R-A14 | Alternate warm and cool. | Okabe and Ito (as R-A12), § "Set of colors that is unambiguous both to colorblinds and non-colorblinds" | "Use \"warm\" and \"cool\" colors alternatively. When using two warm colors or two cool colors, put distinct differences in brightness or saturation." |
| R-A15 | Dark red reads as black for protanopes (madder vs ink, madder vs danger). | Okabe and Ito (as R-A12), § "How to select colors that are easier to distinguish." | "Especially for protanopes, who cannot detect long wavelength of red light, dark red appears almost as black." |
| R-A16 | Light mode performs better; dark should be offered. | Nielsen Norman Group, "Dark Mode vs. Light Mode: Which Is Better?", § "Takeaways" | "in users with normal vision, light mode leads to better performance most of the time." |
| R-A17 | Offer dark mode as a choice. | NN/G (as R-A16), § "Takeaways" | "we strongly recommend that designers allow users to switch to dark mode if they want to" |

### 2.5 Museum and Heritage Interfaces

| ID | Finding | Source and locator | Verbatim quote |
|---|---|---|---|
| R-H1 | Generic rectangles read as boring (the user's own complaint, observed by the V&A). | V&A Digital blog, "Reimagining the V&A’s Explore the Collections: Designing a More Inspiring Way In", https://www.vam.ac.uk/blog/digital/reimagining-the-vas-explore-the-collections-designing-a-more-inspiring-way-in, user-research quotes | "quite a lot of rectangles. It reminds me of and old [website]” “Page looks dull and a bit boring”" |
| R-H2 | Presentation can bias which objects get attention. | V&A Digital blog, "Making the V&A’s collections more discoverable online", https://www.vam.ac.uk/blog/digital/making-the-vas-collections-more-discoverable-online, article body | "This is a delicate balance to get right as we don’t want to bias certain objects and collections." |
| R-H3 | Minimum interaction. | "Rijksstudio: Make Your Own Masterpiece!", Museums and the Web 2013 paper, body | "The priority is ease of use and control, whereby all tasks can be undertaken with a minimum of user interaction." |
| R-H4 | Layered information. | Rijksstudio MW2013 (as R-H3), body | "The information is provided in layers." |
| R-H5 | Rights in the metadata flow (credit and licence line under each figure). | Duke University Libraries, Bitstreams blog, "Turning on the Rights in the Duke Digital Repository", https://blogs.library.duke.edu/bitstreams/2017/06/30/turning-rights-duke-digital-repository/, body | "We wanted to be sure to show the rights status in the flow of the rest of an object’s metadata." |
| R-H6 | Alt text must not repeat the caption. | Cooper Hewitt, "Cooper Hewitt Guidelines for Image Description", https://www.cooperhewitt.org/cooper-hewitt-guidelines-for-image-description/, body | "Do not repeat text already expressed in captions or other descriptions that are fully accessible." |
| R-H7 | Short exhibit lines. | Smithsonian Accessibility Program, "Smithsonian Guidelines for Accessible Exhibition Design", PDF p. 21 | "Exhibit text should have a maximum of 55 characters (average) per line. Narrower columns, with 45-50 characters per line, are preferable." |
| R-H8 | Labels in a consistent location. | Smithsonian Guidelines (as R-H7), PDF p. 30 | "Labels that appear in a different location at each work of art or within each case are difficult to find for people with low vision and people with cognitive disabilities." |
| R-H9 | Visitors want bigger pictures (public pages may be image-forward). | V&A Digital blog, "Announcing Explore the Collections", https://www.vam.ac.uk/blog/digital/announcing-explore-the-collections, body | "Our user research revealed that people wanted more and bigger pictures." |

### 2.6 Sources Added for Atlas (DR-022)

Read first-hand for the design-research proposal; each quote was matched in the downloaded text. Bracketed IDs elsewhere in this file (`[N-…]`, `[U-…]`, `[tells …]`, `[mus …]`, `[E-n]`, `[audit …]`) point to the proposal's evidence register (section 15) and its six verified research reports.

| ID | Source and locator | Verbatim quote |
|---|---|---|
| N-AHN | google/fonts `ofl/atkinsonhyperlegiblenext/METADATA.pb` and `OFL.txt`; googlefonts/atkinson-hyperlegible-next `README.md`, para. 1 | "This Font Software is licensed under the SIL Open Font License, Version 1.1." / "Atkinson Hyperlegible, named after the founder of the Braille Institute, has been developed specifically to increase legibility for readers with low vision, and to improve comprehension." |
| N-ANEK | EkType/Anek `README.md`, intro and § License; google/fonts `ofl/aneklatin/METADATA.pb` | "a collective of type designers based in Mumbai focused on designing contemporary Indian typefaces" / "Anek is licensed under the SIL Open Font License v1.1" |
| N-322 | W3C, Understanding SC 3.2.2 On Input, SC text and Sufficient Techniques | "Changing the setting of any user interface component does not automatically cause a change of context unless the user has been advised of the behavior before using the component." / "H84: Using a button with a select element to perform an action" |
| N-FC | MDN, "forced-colors", Usage notes | "In forced colors mode, the values of the following properties are treated as if they have no author-level values specified." / "box-shadow is forced to 'none'" |
| N-AXE | Deque, axe-core 4.10 rule `scrollable-region-focusable` | "Scrollable region must have keyboard access" / "User Impact: Serious" |
| N-BDA | British Dyslexia Association, "Dyslexia friendly style guide" (secondary copy; corroborated by the University of Exeter) | "Avoid underlining and italics as this can make the text appear to run together and cause crowding. Use bold for emphasis." |
| U-M4 | Dyson 2004, § 8 | "line length in characters per line should either remain constant or be systematically varied." |
| U-F1 | W3C, Using ARIA, § 2.1 | "If you can use a native HTML element … then do so." |
| U-N1 | Pernice and Budiu, NN/g, 26 June 2016, intro | "Hidden navigation provides a worse user experience than visible or partially visible navigation does, in both mobile phones and desktop user interfaces." |
| tells A1 | Anthropic `frontend-design` SKILL.md, § "Process" and § "Restraint and self-critique" | "a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent" / "Spend your boldness in one place." |
| tells A5 | Humble, Fountain Institute, §§ 5 to 7 | "Most content does not need a box around it." / "If a dot requires explanation, a text label was probably the right call." |

### 2.7 Decisions Taken Without Research Support

These are design judgements, labelled as such:

- **The planes metaphor** (white = knowledge, grey = navigation). It is a role system; no source tests it.
- **The right-docked reading column** (DR-021). No source tests reading speed for a right-docked column. It is identical in both conditions; pilot it.
- **Anek Latin on public pages.** That its forms suit the project is a judgement; its provenance (an Indian foundry) is a fact (N-ANEK).
- **Radius by role:** 0 for docked surfaces, 4 px for hand-held controls, 2 px for badges. R-L13 classes corner shape as a minor variable.
- **Indigo as the single interactive colour.** Indigo appears in the documented processes of several traditions, so as a flat interface colour without star geometry (R-C12) it is not one tradition's marker. It is 5.29 ΔE (CIEDE2000) from its nearest Tailwind colour, so it does not read as a framework default (proposal 5.4).

---

## 3. Design Thesis

### 3.1 Zones

| Zone | Routes | Expression |
|---|---|---|
| Study (both conditions) | `/learn/2d/*`, `/learn/immersive`, `/study/*` | Paper, field, ink and indigo only. Atkinson Hyperlegible Next only. Zero motion. No pattern, imagery or emphasis other than knowledge figures. Identical by construction (one component set). |
| Console, CMS, admin | `/research/*`, `/cms/*`, `/admin/*` | The same tokens, booktabs tables, numbered figures, the Equivalence Monitor. Functional motion of 120 to 150 ms opacity. No band. |
| Public | `/`, `/about`, `/about/colophon`, `/explore`, `/accessibility`, `/privacy`, `/sign-in`, `/sign-out`, `/forbidden` | The above, plus Anek Latin display type, the Figure 1 indigo plate and sidenotes in a working margin. No motion beyond the link underline. |

### 3.2 The Memorable Signatures

All functional:

1. hanging claim numbers;
2. the verbatim evidence at claim size, labelled "Verbatim from the source" and set on its mat;
3. the identical spread in both conditions: navigation left, the same sheet right (DR-021);
4. the public Figure 1 as one indigo knock-out plate carrying live data;
5. a 3D gallery that reads as built architecture (DR-023);
6. the Equivalence Monitor.

### 3.3 Removed Everywhere (DR-022)

- the cream family `#F5F1E8` [tells C1];
- Source Serif 4 and Inter [tells C1, C9];
- madder, ochre, ochre-deco and the knock-out band [tells C1, C8];
- registration ticks;
- tracked uppercase eyebrows and labels, `" · "` joins, monospace as a data voice, "→" in interface text [tells C2];
- left-edge accent bars [tells C5];
- the neutral tradition marker [tells A5];
- the hero "headline + two buttons + card" formula and stat tiles [tells C6];
- drop shadows [tells A1].

Rules remain only for booktabs tables and docked pane edges [tells C3].

---

## 4. Tokens

### 4.1 Rules for the Token File

- **Where tokens live.** Hex literals sit in flat `:root`, `.dark`, `.a11y-contrast` and `.dark.a11y-contrast` blocks in `src/app/globals.css`, so the regex parser in `tests/unit/contrast.test.ts` keeps working.
- **Values.** Contrast ratios use the WCAG formula and are **truncated** to two decimals (R-A2). They are asserted by `contrast.test.ts` and were computed independently by the proposal's `palette.py`; both agree.
- **Craft-derived tokens.** None remain. Only `--indigo` keeps the comment `/* design interpretation; not a measured or historical dye colour */` (R-C6).
- **`--ground`** keeps its name (white paper), so every shadcn mapping survives. `tests/e2e/smoke.spec.ts` pins `rgb(255, 255, 255)`.
- **New names:** `--field`, `--focus-outer`, `--focus-inner`, `--rail-w`.
- **Retired names:** `--surface` is an alias of `--ground` (no second paper); `--madder`, `--ochre`, `--ochre-deco`, `--band`, `--band-lozenge`, `--focus-halo`, `--shadow-console` and the `--serif-stack` are deleted. `--font-inter` and `--font-source-serif` remain as aliases of `--font-atkinson` only for the 3D lettering atlas until it reads the new variable. `tests/unit/design/dead-aliases.test.ts` keeps the retired utilities out of `src/`.

### 4.2 Palette

| Token | Light | Dark (public and console, opt-in) | HC light | HC dark | Role |
|---|---|---|---|---|---|
| `--ground` | `#FFFFFF` | `#1A1D21` | `#FFFFFF` | `#000000` | Knowledge paper: the KnowledgeSheet in both conditions, dialogs, console work areas, body |
| `--field` | `#E9ECEC` | `#111316` | `#FFFFFF` | `#000000` | Navigation: rails (study and console), the 2D index field, the public header and footer, table header band. Never behind claims. |
| `--sunk` | `#F1F3F3` | `#23272C` | `#F0F0F0` | `#141414` | Figure mat, verbatim-quote mat, pager cells, code blocks, hover on paper, static loading block |
| `--wash` | `#E4EAF4` | `#22304A` | `#E6EAF2` | `#1F2A40` | Current or selected item, always with a word ("You are here", "Selected") or a check, and weight |
| `--ink` | `#000000` | `#ECEEF0` | `#000000` | `#FFFFFF` | Text and structure |
| `--ink-2` | `#363636` | `#C8CDD3` | `#1A1A1A` | `#F0F0F0` | Labels, captions, leads, inactive tabs |
| `--ink-3` | `#595959` | `#9AA2AC` | `#262626` | `#E0E0E0` | Source lines, credits, units |
| `--rule` | `#D2D7DA` | `#343A41` | `#000000` | `#FFFFFF` | Decorative only: the booktabs midrule and long console rows |
| `--rule-strong` | `#767C82` | `#7B838D` | `#000000` | `#FFFFFF` | Every control boundary and docked pane edge |
| `--indigo` | `#24406E` | `#A9BEE6` | `#1B2F55` | `#C9D7F2` | The single interactive accent |
| `--indigo-hover` | `#1A3157` | `#C6D5F1` | `#111E38` | `#E1E9F8` | Hover and pressed |
| `--on-indigo` | `#FFFFFF` | `#111316` | `#FFFFFF` | `#000000` | Labels on indigo and danger fills |
| `--danger` | `#A3242C` | `#F2918C` | `#8A1A20` | `#FFB0AB` | Errors, always with icon and word |
| `--ok` / `--warn` | `#2E6A3E` / `#77540F` | `#8CC7A0` / `#D9B26A` | ink | ink | Console status only, always with a word |
| `--series-2d` / `--series-3d` | `#3A5DA0` / `#8E4D16` | `#8FAEE8` / `#E0A06A` | (light values) | (dark values) | Dashboard only; luminance 0.1127 vs 0.1112 |
| `--grid` | `#DCE0E3` | `#2B3036` | (light) | (dark) | Chart gridlines |
| `--viz-seq-1..6` | `#E4E3E6 #B9C3D6 #8A9DC0 #4F6A99 #36548A #1B3360` | `#2C2B33 #33405A #465C86 #6582B4 #90AADB #C3D3F1` | (light) | (dark) | Heatmaps and the Figure Balance matrix; cells print their value |
| `--focus-outer` / `--focus-inner` | `#000000` / `#FFFFFF` | `#FFFFFF` / `#000000` | `#000000` / `#FFFFFF` | `#FFFFFF` / `#000000` | Two-tone focus ring |

Shadcn semantic mapping (every block): `background = ground`, `foreground = ink`, `card = popover = ground`, `card-foreground = popover-foreground = ink`, `primary = indigo`, `primary-foreground = on-indigo`, `secondary = muted = accent = sunk`, `secondary-foreground = accent-foreground = ink`, `muted-foreground = ink-3`, `destructive = danger`, `border = rule`, `input = rule-strong`, `ring = focus-outer`. Study stays light-only, with high contrast offered identically (DR-019).

### 4.3 Computed Contrast (Truncated; Asserted by `contrast.test.ts`)

Text on ground / field / sunk / wash:

| Foreground | Light | Dark | HC light | HC dark |
|---|---|---|---|---|
| ink | 21.00 / 17.67 / 18.85 / 17.37 | 14.54 / 15.99 / 12.91 / 11.35 | 21.00 / 21.00 / 18.42 / 17.41 | 21.00 / 21.00 / 18.42 / 14.34 |
| ink-2 | 12.08 / 10.17 / 10.84 / 9.99 | 10.57 / 11.63 / 9.39 / 8.25 | 17.40 / 17.40 / 15.27 / 14.43 | 18.42 / 18.42 / 16.16 / 12.59 |
| ink-3 | 7.00 / 5.89 / 6.28 / 5.79 | 6.55 / 7.21 / 5.82 / 5.11 | 15.13 / 15.13 / 13.27 / 12.55 | 15.90 / 15.90 / 13.95 / 10.87 |
| indigo | 10.32 / 8.69 / 9.27 / 8.54 | 9.01 / 9.91 / 8.00 / 7.04 | 13.25 / 13.25 / 11.63 / 10.99 | 14.48 / 14.48 / 12.70 / 9.89 |
| indigo-hover | 12.95 / 10.90 / 11.63 / 10.71 | 11.42 / 12.57 / 10.14 / 8.92 | 16.57 / 16.57 / 14.54 / 13.74 | 17.21 / 17.21 / 15.09 / 11.76 |
| danger | 7.37 / 6.21 / 6.62 / 6.10 | 7.41 / 8.15 / 6.58 / 5.79 | 9.33 / 9.33 / 8.19 / 7.74 | 12.05 / 12.05 / 10.57 / 8.23 |
| ok | 6.46 / 5.44 / 5.80 / 5.35 | 8.69 / 9.56 / 7.71 / 6.78 | = ink | = ink |
| warn | 6.86 / 5.77 / 6.16 / 5.67 | 8.47 / 9.32 / 7.52 / 6.62 | = ink | = ink |
| **Minimum text pair** | **5.35** | **5.11** | **7.74** | **8.23** |

Every text pair passes 4.5:1 (R-A1) on every surface, including `--field`, so no pair is forbidden.

Non-text pairs (3:1 required, R-A3):
- **rule-strong** on ground / field / sunk / wash: light 4.22 / 3.55 / 3.78 / 3.49; dark 4.40 / 4.84 / 3.91 / 3.44; HC 14.34 or higher.
- **indigo as a state fill or bar**: light 8.54 or higher; dark 7.04 or higher.
- **on-indigo** on indigo 10.32 light and 9.91 dark; on danger 7.37 light and 8.15 dark.
- **Focus ring** (`#000000`/`#FFFFFF`): against every colour of a 16-step RGB grid and every 8-bit grey, the better of the two tones is **at least 4.58:1** (asserted).
- **Reading-progress bar**: ink on rule 14.47 light, 9.87 dark; in HC the track is `--sunk`.

Watch pairs, and the rule each one forces:
- **indigo vs ink, 2.03 light and 1.61 dark.** Inline links are always underlined (R-A4). Link lists become full-row targets.
- **danger vs indigo, 1.39 and 1.21.** Danger always carries an icon and the word "Error".
- **ground vs field, 1.18.** Docked panes always carry a 1 px `--rule-strong` edge, which is 3.55 on field.
- **series-2d vs indigo, 1.59.** No links inside chart plot areas.

Sequential ramp cell labels: light, `--ink` on steps 1-3 (16.42, 11.83, 7.66) and `--on-indigo` on steps 4-6 (5.44, 7.52, 12.43); dark, ink on 1-3 (12.03, 8.93, 5.75) and on-indigo on 4-6 (4.78, 7.93, 12.32).

### 4.4 High-Contrast Mode

`.a11y-contrast` and `.dark.a11y-contrast`: surfaces opaque and flat, `--field` equals `--ground`, every rule and control boundary solid ink, `--ok` and `--warn` become ink (the word carries the status). The focus ring is the same two-tone ring as every other theme. Yellow is never used except the guidance cue.

### 4.5 Themes and Opt-In

Unchanged from DR-019: light by default everywhere; Display Settings (Dark theme, High contrast, Reduce motion) from the public footer and the console user menu; **study is fixed to light in both conditions**, with High contrast offered identically before learning and recorded on the study session.

### 4.6 Non-Colour Tokens

| Token | Value |
|---|---|
| `--radius-control` | 4px (buttons, inputs, selects, checkboxes, segmented controls, menus, tooltips) |
| `--radius-badge` | 2px |
| `--radius-card` | 0 (sheet, rails, bars, tables, figures, dialogs, cards, plates) |
| shadows | none, in every zone (dialogs and menus use a 1 px `--rule-strong` border) |
| `--measure` | 34rem |
| `--hang` | 2.25rem |
| sheet width | 39.25rem = measure + hang + 2 x 1.5rem padding |
| `--rail-w` | 18rem (288 px) |
| `--studybar-h` | 3.5rem; two rows (6.5rem) under 768 px (DR-021) |
| `--notice-h` | 2.5rem |
| `--sticky-chrome` | notice + StudyBar + 1 px rule |
| `--dur-1/2` | 120ms / 150ms (console and public only) |
| `--z-*` | unchanged scale (canvas 0 to skip-link 100) |

---

## 5. Typography

### 5.1 Faces, Licences, Files and Budget

| Role | Family | Licence | Latin file | Where |
|---|---|---|---|---|
| Everything in study, 3D lettering, console, and public text | **Atkinson Hyperlegible Next**, upright only (`Atkinson_Hyperlegible_Next`, `variable: "--font-atkinson"`, root layout) | OFL 1.1 (N-AHN) | 33,996 bytes measured, wght 200 to 800 | all zones |
| Public display only (home h1, public h2, the public wordmark) | **Anek Latin** (Ek Type), wght + wdth (`Anek_Latin`, `axes: ["wdth"]`, `variable: "--font-anek"`, public layout only) | OFL 1.1 (N-ANEK) | 103,760 bytes measured, wdth 75 to 125, wght 100 to 800 | public routes only |
| Code and BibTeX blocks, and the two JSON editors of the console | system mono stack | n/a | 0 | `<pre>`, `<code>` |

- **Why Atkinson** (accessibility first): "developed specifically to increase legibility for readers with low vision, and to improve comprehension" (N-AHN). That is a design goal, not a measured outcome for normal-vision readers. Its zero and capital O differ, so participant codes and IDs need no monospace.
- **Why Anek on public pages only:** an Indian foundry (N-ANEK); kept out of study and 3D, so both conditions use one face and study preloads one file.
- **Self-hosted** by `next/font/google` at build time (R-T10); the CSP is unchanged.
- **Preloads:** study and console 1 file (33,996 bytes); public 2 files (137,756 bytes). Latin-ext loads through `unicode-range` only. Budget kept: at most 2 preloaded files, 176,000 bytes preloaded and 230,000 bytes of fonts transferred on any page (Anek latin-ext is not yet measured; the acceptance suite measures it).
- **No italic file is loaded.** Verbatim evidence is set roman (N-BDA). No small caps, no `font-variant-caps`, no old-style figures. `font-synthesis: none` on study roots.
- **Arrows:** Atkinson has no "→"; arrows are banned in interface text. Arrow keys are named in words ("the Left and Right arrow keys"); keycaps in the controls help may show the arrow glyph, which falls back identically in both conditions.
- **Indic scripts:** the rule is kept. `tests/content/scripts.test.ts` trips on the first Indic codepoint; then a matching face (the Anek companions, single-script subset, `preload: false`) loads for **every** script present. Arabic script renders through the system stack inside `<span lang dir="rtl">`, identically in both conditions.

### 5.2 Size Re-Set to Hold Characters per Line

"line length in characters per line should either remain constant or be systematically varied." (U-M4)

| Setting | cpl at 544 px (34rem) |
|---|---|
| Inter 18/28 (Apparatus) | 64.2 / 64.1 (two independent measurements) |
| **Atkinson Next 20/30** | **62.2 / 62.0** |

So `text-reading` is **1.25rem / 1.875rem (20/30)**: the measure and the sheet width are unchanged, 62 cpl sits between Dyson's 55 cpl result and the 80-character ceiling, and the cpl is held nearly constant across the change. The cpl figures come from average advance widths; parity checks P3 and P8 re-measure line breaks in the browser in both conditions.

### 5.3 Type Scale

Knowledge tokens are identical in both conditions and consumed only through shared components. Headings go through `titleCase()` (`src/lib/text/title-case.ts`); labels and buttons use sentence case.

| Token | Face | Size / line height | Weight | Notes |
|---|---|---|---|---|
| `text-title` (concept h1, 2D and 3D) | Atkinson | 2.25rem / 2.75rem; under 520 px 1.875 / 2.25 | 700 | tracking -0.01em, `text-wrap: balance`; 1.8 x the claim size (R-T4) |
| `text-reading` | Atkinson | 1.25rem / 1.875rem | 400 | proportional lining figures |
| `text-claim-number` | Atkinson | 1.25rem / 1.875rem | 700 | `tnum`, ink-3, right-aligned in the hang, `aria-hidden` |
| `text-quote` | Atkinson | 1.25rem / 1.875rem | 400 | **roman**, ink, on the `--sunk` mat |
| `text-lead` | Atkinson | 1.25rem / 1.875rem | 400 | ink-2 |
| `text-h2` | Atkinson | 1.5rem / 2rem | 700 | |
| `text-h3` | Atkinson | 1.25rem / 1.75rem | 700 | |
| `text-label` (replaces the uppercase eyebrow and dl label) | Atkinson | 0.9375rem / 1.25rem | 700 | sentence case, tracking 0, ink-2 |
| `text-value` | Atkinson | 1.0625rem / 1.625rem | 400 | ink |
| `text-source` | Atkinson | 1rem / 1.5rem | 400 | ink-3; at most 2 lines; never truncated mid-word |
| `text-caption` | Atkinson | 1.0625rem / 1.625rem | 400 | ink-2 |
| `text-credit` | Atkinson | 0.9375rem / 1.25rem | 400 | ink-3; the smallest text in study |
| `text-ui` | Atkinson | 1rem / 1.5rem | 600 | active state 700 with its width reserved (`ie-reserve-bold`) |
| `text-timer`, `text-id` | Atkinson | 1rem / 1.5rem; `text-id` 0.9375rem / 1.25rem | 600 | `tnum`; IDs, keys, codes, timestamps (no monospace) |

Public and console extras:

| Token | Face | Size / line height | Weight |
|---|---|---|---|
| `text-display-1` (home h1) | Anek Latin, wdth 112 | clamp(3rem, 1.5rem + 4.5vw, 5.5rem) / 1.0 | 600 |
| `text-display-2` (home h2) | Anek Latin, wdth 100 | 2.5rem / 3rem | 600 |
| `text-display-3` (editorial section h2, under a `text-title` h1) | Anek Latin, wdth 100 | 1.75rem / 2.25rem | 600 |
| `text-deck` | Atkinson | 1.5rem / 2.25rem | 400, ink-2 |
| `text-body` | Atkinson | 1.0625rem / 1.625rem | 400 |
| `text-table` | Atkinson | 0.9375rem / 1.25rem | 400, `tnum`; numbers right-aligned |
| `text-stat` | Atkinson | 1.75rem / 2.25rem | 700, `tnum` |
| chart labels | Atkinson | 13 px ink-3; 15 px 600 ink | two levels (R-T18) |

Outside Anek, `font-display` and the display utilities fall back to Atkinson, so no route other than the public ones ever requests the display face.

**Removed:** uppercase anywhere, tracked labels, eyebrows that repeat the page or navigation state, `" · "` (lint), and monospace outside code.

**Numeral policy.** Proportional lining figures in prose; tabular lining figures in every number a reader compares (tables, timers, counts, axis ticks, "Question 4 of 20", claim numbers, Step).

---

## 6. Layout (Both Conditions)

### 6.1 Grid

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Breakpoints:** 390, 520 (`xs`), 768, 1024, 1280, 1440, 1920.
- **Page gutters:** 16 / 24 / 32 px (below 520, 520 to 1023, 1024 and up).
- **Public:** 12 columns, 1280 px maximum, 24 px gutters; content is left-aligned on the grid, never a narrow column centred in an empty field.
- **Editorial frame:** a 34rem text track plus a 15rem working margin for sidenotes. Under 1024 px, notes go inline after their paragraph, never behind a toggle.
- **Study flow (`/study/*`):** a 1280 px frame with the gutters above; the content is a 42rem column left-aligned in it, so the wordmark, the label and the footer never move.

### 6.2 The Spread at 1280 px and Wider (DR-021)

Navigation left, the same sheet right, in both conditions:

| Element | Identical in both conditions | 2D | 3D |
|---|---|---|---|
| Chrome | One merged AccessNotice (40 px or absent in **both**), then the StudyBar (56 px, `--ground`), then ONE 1 px `--rule-strong` line. | | |
| Rail (`PlaceRail`, one shared component) | x = 0; width `--rail-w`; full height below the chrome; `--field`; 1 px `--rule-strong` right edge; internal scroll; 44 px rows; a `nav` landmark with `aria-current` | "In This Section": the concepts of the current section in section order, then "Leads To" | "In This Room": the exhibits in hanging order, then "Leads To" (doorways); **collapsed by default** (lead decision) |
| Rail rows | title (`text-ui`) plus a type and step line (`text-source`); current row `--wash`, weight 700, "You are here". **Titles, types, steps and destinations only**: no claim text, counts, images or summaries. | opens the concept (route change) | walks to the exhibit |
| Field | from `--rail-w` to the sheet edge | **Index**: the three study traditions in canonical order with their numbered sections (names only), the current one marked; a list, never a spatial map | the scene, plus the Plan (visibility follows `studies.config.minimap`) |
| Sheet | docked right; sheet width; full height below the chrome; `--ground`; 1 px `--rule-strong` left edge; radius 0; no shadow; **internal scroll container** (`role="region"`, `aria-labelledby` the h1, `tabindex="0"`, N-AXE) | present on concept routes; Close returns to the section view | present while a concept is open; Close or walking closes it |
| Action slot | 44 x 44 "Close" with a visible label, **in both** | navigates to the section (URL), so Back works | closes the panel and returns focus to the trigger |

Below 1280 px the rail is an identical non-modal 18rem drawer in both conditions, opened from a 44 px StudyBar button with a visible label. Under 768 px the StudyBar has two rows in both conditions and the sheet is full width and full height below the chrome. No horizontal scroll at 390 px.

**Navigation source** (rail, scene, plan, keyboard; 2D rail, index, pager, link) is logged in both conditions, so list use can be modelled (DR-021).

The spread is specified here and implemented as its own package (DR-021); until it lands, the 2D sheet sits in the page flow and the 3D sheet docks right, as in the Apparatus rebuild.

### 6.3 Inside the Sheet (Shared, Identical)

The sheet is padded 24 px (16 px under 520 px), with the 2.25rem hang. In order:

1. **Header row:** the `text-title` h1 plus the 44 x 44 action slot. No eyebrow. Focus moves to the h1 on open (P27).
2. **Metadata `dl`** (lean: only what aids learning): a 9rem label column, `text-label` labels and `text-value` values. Rows: Tradition (the name only); Category; Step ("3 of 9", process stages only); Local terms (`<span lang>`). No Status row: the notice strip above the sheet already states the content's verification status, so a second statement competed with the claims (cognitive-load rule).
3. **Reading-progress bar:** 2 px `--ink` on `--rule`, on the sheet's own scroll container in both conditions, no transition (P25).
4. **LayerTabs** (9.4), one layer at a time.
5. **"From the Sources"** as an `h2` (`text-h2`), then the ClaimList (9.10), each claim ending in its numbered citation markers (9.9).
6. **References:** one deduplicated, numbered list of the sources cited by the claims shown (9.9), an `h2` set as `text-h3`, the items in `text-source`.
7. **RelatedConcepts**, then the pager: two equal 64 px cells on `--sunk`, "Previous" and "Next" in `text-label`, titles in `text-h3`, no arrow glyphs.
8. **Record foot:** off in study builds of both conditions; on in public, demo and CMS proof views ("About This Record": concept ID, snapshot, verification status, persistent URL, "Cite this concept").

**Cognitive load** (the lead's rule): one focus. When a concept is open nothing competes with the sheet; claims are separated by space, numbered, about 4 to 5 per screen; citations are collapsed until asked for; nothing decorative sits near a claim (R-L1, R-L5, R-L6). The counts of elements competing for attention on a concept-open screen stay comparable and low in both conditions.

---

## 7. Graphic Language

There is no decorative graphic language in Atlas (DR-022). Structure comes from the two planes, type, space and the following:

### 7.1 Rule System (All Areas, Including Study)

- ONE 1 px `--rule-strong` line under the public header, the console top bar and the StudyBar (identical in both conditions). It is a docked pane edge, not a running head.
- Booktabs tables: 1.5 px `--ink` top and bottom rules, 1 px `--ink` midrule under the header row, row separators 1 px `--rule` in long console tables; no vertical rules, no zebra.
- Claims are separated by 32 px of space, **never by a hairline**.
- No left-edge bars anywhere (lint).
- Rules are drawn with `border`, so they survive `forced-colors`.

### 7.2 Numbering

Claims numbered per concept (1, 2, 3 …); figures "Fig. n" per concept view; dashboard and public charts "Figure n"; tables "Table n". Lining tabular figures.

### 7.3 Diagrams (Public and Console)

Line diagrams (Figure 1, the About study flow, the Explore schematics) are static: a flat fill layer, a 1.5 px outline layer over it, then the text in Atkinson 13/600 (titles 18/700). Figure 1 is drawn as on-indigo linework on one indigo plate. Every diagram has a text equivalent next to it. No draw-on or entrance motion.

### 7.4 Glyphs

Lucide outline icons at 20 px, stroke 1.75, always paired with a visible word; chevrons and the external-link glyph. No 32 px hero icons on state pages (only the error tone of `StateMessage` carries a 24 px danger icon beside its heading). A small purpose-drawn glyph set (place, plan, source, enlarge, verified, under review, error) on a 20 px grid is planned and will be the same in both conditions.

### 7.5 Imagery

Only real, licence-checked photographs, always with caption, credit and licence as words (R-H5). No stock photographs, no AI images, no photographs as texture, no texture behind text, no swatch captioned as a dye colour (R-C6). Study figures render only inside the KnowledgeSheet, identically in both conditions (DR-020). The public home carries no photographs (DR-020).

---

## 8. Motion Policy

CSS only; no animation library.

| Zone | Allowed |
|---|---|
| Study (`/learn/*`, `/study/*`) | **Nothing.** Zero transitions and animations on chrome and content in both conditions (P12). The 3D camera walk is the experimental manipulation and is governed by `docs/architecture/immersive-rendering-quality.md`. |
| Console, CMS, admin | Dialog, sheet, dropdown: 150 ms opacity plus a slight scale; row expand 120 ms. Charts `animation: false`. No hover lifts or press translates. |
| Public | The link underline thickens from 1 px to 2 px over 120 ms. Nothing else: no Figure 1 draw-on, no plate fades, no parallax, no scroll-linked motion (R-A11), no count-up numbers. |

`prefers-reduced-motion: reduce` and `.a11y-reduce-motion` clamp every duration to 0.01 ms.

---

## 9. Components

Primitives live in `src/components/ui` and change for everyone. Shared knowledge components live in `src/components/knowledge` and are imported by BOTH conditions; no condition-specific style props exist on them.

**Principle for every control:** style the native element; never rebuild it in ARIA for looks ("If you can use a native HTML element … then do so", U-F1). `appearance: none` does not change the element's behaviour. Shared rules: at least 44 px; 4 px radius; `--ground` fill; 1 px `--rule-strong` boundary (4.22:1 on paper); 16 px type, so iOS does not zoom; label above in `text-label` style; help text in `text-credit`; errors in `--danger` with an icon, `aria-invalid` and `aria-describedby`; no transitions in study. **Forced colours:** every skinned control declares `appearance: auto` (and hides its drawn parts) under `@media (forced-colors: active)`, because forced colours drop author colours and box shadows (N-FC).

### 9.1 Focus (All Areas, Both Conditions, Including Over the 3D Canvas)

```css
:focus-visible {
  outline: 2px solid var(--focus-outer); outline-offset: 2px;
  box-shadow: 0 0 0 2px var(--focus-inner); /* fills the offset: white inside, black outside (light) */
}
```

- One rule for every theme; the tones are tokens. The better tone keeps at least 4.58:1 against any colour (asserted), so the ring is visible over paper, field, indigo and the 3D scene alike.
- No primitive draws or removes its own ring (`outline-none` is banned in `src/components/ui` and in field classes; `tests/unit/design/focus-ring.test.ts`).
- Controls whose native input is visually hidden (segmented options, the file button) draw the same ring on their visible label.
- Programmatic focus targets (`tabindex="-1"`: the sheet h1, `<main>`) show no ring.
- `scroll-padding-top` equals the chrome height, so focus is never hidden under the StudyBar (R-A6).

### 9.2 Select (`ui/native-select.tsx`)

One `NativeSelect` replaces every select skin of the Apparatus build (63 render sites): the native `<select>` with `appearance: none`, 44 px, padding 10/44/10/12, 1 px `--rule-strong`, 4 px radius, and the project chevron (20 px, 1.5 px stroke, square terminals) at 12 px from the end; hover darkens the boundary to ink-2; disabled on `--sunk`. Forced colours: `appearance: auto` and no chevron.

- **No change of context on input** (WCAG SC 3.2.2): a select that changes the view sits in a form with a **joined, labelled action button** ("Show study"; technique H84, N-322). The URL updates, so the view is linkable.
- **No truncation:** the study picker shows a two-line readout under the control: the full title, then "Key … State: …" as words.
- **When every option fits on one line at 390 px, use a segmented control (9.3).**
- **Participant-facing:** the study-entry group is a radio list (9.6); the concept-map relationship panel keeps the select, identically in both allocations.
- The Radix `ui/select.tsx` and `ui/radio-group.tsx` are deleted (dead-alias test).

### 9.3 Segmented Control (`ui/segmented.tsx`)

A `fieldset` and `legend` of native radios, visually hidden but focusable, with the focus ring and the checked state drawn on the label. Options at least 44 px, 1 px `--rule` dividers, 4 px outer radius. Checked: `--indigo` fill, `--on-indigo` label at 700, with the bold width reserved. Forced colours: the radios show and the checked option is outlined in `Highlight`. Used for the CMS Proof "Preview as: 2D column | 3D panel".

### 9.4 Tabs (`ui/tabs.tsx`) and `LayerTabs` (`knowledge/layer-tabs.tsx`)

WAI-ARIA tabs: roving tabindex, arrows, Home and End, automatic activation. 44 px tall, `text-ui`. Inactive tabs ink-2 (12.08:1); the active tab ink at 700 with its width reserved and a 3 px indigo underline. A 1 px `--rule` baseline. Tabs wrap and never scroll. No transition. `LayerTabs` reads names and order from `src/features/learning/labels.ts` and is the only layer navigation in both conditions.

### 9.5 Disclosure (`ui/disclosure.tsx`)

One shared `Disclosure` on `<details>`/`<summary>`: the summary is `display: block` with its marker removed; a 20 px chevron in a 44 px box; the state words "Show" and "Hide" in `text-credit`, so the state is never carried by the glyph alone. Native semantics (Enter, Space, find-in-page). It replaces every marker-less CMS and admin summary, the research "Data table" and change disclosures. "About these links" (RelatedConcepts) uses the same look with its telemetry. The 2D section disclosures use 56 px rows.

### 9.6 Checkbox, Radio, Option Rows, File, Number and Date Inputs

- **Checkbox and radio (`ui/checkbox.tsx`, class `ie-check`):** the native input with `appearance: none`, 20 px, a 1.5 px `--rule-strong` border; checked = indigo fill with a drawn on-indigo tick (radio: an indigo ring and dot). Each sits in a full-row label of at least 44 px (56 px for study options).
- **Option rows:** a selected row is `--wash` with the check (study questionnaires) or the visible word "Selected" (`OptionRow`). **No left bar.** Changed once in the shared component, so both allocations change together.
- **File input (`ui/file-input.tsx`):** the native input, visually hidden but focusable, behind a 44 px secondary label button ("Choose file"), with the file name as a readout ("No file chosen" until one is); a form reset clears it.
- **Number input:** `type="text"` with `inputMode="numeric"` (or `"decimal"`) and a `pattern`; the range and units go in the label ("Depth (1 to 4)"); the server validates as before. No spinner arrows.
- **Date input:** native, with the input skin and a visible "Format: YYYY-MM-DD" hint linked by `aria-describedby`.

### 9.7 Buttons (`ui/button.tsx`)

- 44 px default (`compact` 36 px with a 44 px hit area, dense console tables only); 4 px radius; Atkinson 16/600; sentence case; a 20 px icon (stroke 1.75) with an 8 px gap.
- **Primary:** indigo fill, on-indigo label. **Outline (secondary):** `--ground` fill with a **1.5 px ink border**, so actions read differently from fields. **Ghost (quiet):** no border; hover `--sunk`. **Link:** underlined 1 px at 0.2em, 2 px on hover. **Destructive:** a 1.5 px `--danger` border; filled only inside the confirm dialog.
- No translate, lift or shadow. One primary per view. No "→".

### 9.8 Badge, Alert, `StateMessage`, Empty State

- **Badge:** 24 px, 2 px radius, 1 px `--rule-strong`, Atkinson 14/20 at 600, sentence case, ink-2; a status badge carries an icon and the word.
- **Alert:** `--ground`, a full 1 px `--rule-strong` border, radius 0, **no left bar**, a heading line of icon plus word ("Note", "Error").
- **StallCue:** the same alert form, with the heading "Hint" (bulb glyph plus word), identical in both conditions; the reserved yellow guidance cue applies in high contrast.
- **`StateMessage`:** the one error, empty, unavailable and loading layout of study surfaces, in both conditions: the h1 or h2, one sentence in `text-reading`, one 44 px action. No hero icon; only the error tone carries a 24 px danger icon beside its heading.
- **Empty state:** one plain sentence in `text-body` ink-2, with an optional 44 px next-step link.

### 9.9 `CitedClaim`, `CitationRecord` and `ReferenceList` (`citations/`, shared; DR-022 Addendum A)

- **Marker:** each claim paragraph ends with one quiet numbered marker per citation, "[1]", in `text-ui` ink-2 with tabular figures and no fill until it is open. It is a native `<button aria-expanded aria-controls>` with a 44 x 44 px box (`h-11 min-w-11`); negative block margins of 7 px keep the 30 px reading line box, so markers never open up the line spacing. Its accessible name is "Source 1: <short label>", which contains the visible number. The number is the source's position in the view's deduplicated reference list (`referencesOf`, in order of first citation), so a source cited by several claims carries the same number everywhere in the view.
- **Record, in place:** activating a marker expands its record directly under the claim, at the claim measure. It is a disclosure, never a jump and never a hover preview. In order:
  - "Source 1" (`text-label`) with the short label and the citation's own locator (`text-source`; `shortCitationLabel()`, no middle dot);
  - the label "Verbatim from the source";
  - the quote in `text-quote`, **roman**, ink, on the `--sunk` mat (18.85:1), with 12 px 16 px padding, radius 0, no border and **no left bar**, the opening quotation mark hung into the padding; supporting passages are separate mats 8 px apart, each with its locator;
  - "Open the source" as a 44 px link with an external-link glyph.

  Activating the marker again closes the record; Escape inside the record closes it and returns focus to the marker. Each marker has its own record. Instant and non-modal. Collapsed by default.
- **Reference list:** at the end of the sheet's field (the KnowledgeSheet `references` slot), after the claims and comparison blocks and before Related Concepts; after a standalone ClaimList elsewhere. An `h2` "References" set as `text-h3`, then an `<ol>` with the number hanging in the 2.25rem hang. Each source appears once, in `text-source`: "<Author or publisher> (<year>). <Title>. <Publisher>." then "Kind of source: <kind>. Reliability: <reliability>. Accessed <date>." There are no links in the list (the record carries the link), so the list adds no Tab stops between the claims and Related Concepts.
- One activation reaches a record in both conditions (P11). Telemetry `citation_opened` / `citation_closed` (conceptId, sourceId, claimIndex, openMs) is unchanged.

### 9.10 `ClaimList` (`knowledge/claim-list.tsx`)

An `<ol>`; the number hangs (`text-claim-number`, `aria-hidden`); the claim in `text-reading` ending in its markers [n]; any open records; then any figure anchored to it. **32 px of space between claims, no hairline.** In a sheet the placement passes `references="sheet"` and puts `SheetReferences` in the sheet's slot; standalone, the list follows the ClaimList.

### 9.11 `KnowledgeFigure` and `FigureLightbox` (DR-018, DR-020 Unchanged in Substance)

Kept: the fixed 3:2 slot and `object-fit: contain`; at most one figure per concept; the 768 px lightbox cap for every study figure (R-C20); one Enlarge button in the caption row; an opaque lightbox; identical behaviour in both conditions. **Mat:** `--sunk`, a 1 px `--rule` outline, radius 0, for photographs and diagrams alike (no dark photographic mat in study). **Caption:** "Fig. n" then the caption (`text-caption`); then the object and credit line and the rights as words (`text-credit`). **Diagrams:** 1.25 px ink lines on the mat; square-cut nodes with Title Case titles; the relation on each edge; the current concept as an **indigo box with an on-indigo label** (10.32:1). The structure-diagram switch `figures.structureDiagrams` and the photo rules of DR-020 apply unchanged.

### 9.12 `RelatedConcepts` (`knowledge/related-concepts.tsx`)

At the end of the sheet in both conditions. Grouped by relation verb (an h3 in `text-h3`), then the related concepts as 44 px link rows with their type and, for another tradition, its name, joined by a comma. One "About these links" disclosure per group (9.5). In 2D a link navigates; in 3D the same-looking link walks (the manipulation).

### 9.13 Section Disclosure (2D Tradition Page Only)

56 px rows within the sheet width: the chevron in a 44 px box, the section label in `text-h2`. No concept count in study.

### 9.14 `StudyBar` (`learning/study-bar.tsx`, shared)

56 px, `--ground`, ONE 1 px `--rule-strong` line below, the same component in both conditions. The wordmark (Atkinson 800, 18 px, plain text); the location (Atkinson 700, 18 px, one line, no middle-dot joins; the 3D room and wing are joined by a comma); the condition group (2D: "In This Section" below 1280 px once the rail lands; 3D: "In This Room" below 1280 px, Plan, Controls help, Pause; "Mouse look" stays a labelled button in the public demo and is hidden in study builds, where free look stays on the L key and in Controls help); then the shared group Hint, Time left, Finish, last and at the right edge, so shared controls never move with the condition. A skip link "Skip to content" with the same label in both.

### 9.15 `AccessNotice` (`shell/learning-shell.tsx`)

One 40 px strip (`--sunk`, `text-ui`, an "End demo" 44 px ghost button where applicable), in the same slot above the StudyBar in both conditions, or absent in both. Short labels use a comma ("Demo, under review"), never a middle dot.

### 9.16 Shells and Navigation

- **Public header:** a 64 px `--field` band; the wordmark in Anek Latin 600 at 22 px; plain text links in `text-ui` with 44 px hit areas, the current page underlined 2 px indigo; "Staff sign in" as a link; one 1 px `--rule-strong` line. No band pattern. Under 768 px the links fold into a 44 px "Menu" button. **Footer:** on `--field` above a 1 px line; project statement, links, Display Settings, institution lines only when configured.
- **Console shell:** a 15rem rail on `--field` with a 1 px `--rule-strong` edge; the wordmark (Atkinson 800, 18 px); the area name as plain `text-h3`, not an eyebrow; 44 px rows, the active row ink 700 on `--wash` with `aria-current`, **no left bar**. Top bar 56 px on paper with ONE 1 px line; the area switcher as underline tabs; the user menu. Session-dependent parts inside `<Suspense>`.
- **PageHeader:** the h1 in `text-title`, the description in `text-body` ink-2 at 40rem, actions right. **No band, no eyebrow, no second rule.**
- **Study shell:** the wordmark, the label "Study", "Step n of N" (`tabular-nums`), one 1 px line; the content column left-aligned in a 1280 px frame (6.1); no outbound navigation; footer "If anything is unclear, ask the study facilitator."
- **Breadcrumb:** single line; middle crumbs collapse to a 44 px "…" button; under 520 px the parent only.

### 9.17 Guidance (`learning/guidance.tsx`)

`HintControl` is a 44 px ghost button in the StudyBar; its panel is a non-modal paper panel with a 1 px `--rule-strong` border, opening instantly. `StallCue` per 9.8.

### 9.18 Dialog, Sheet, Dropdown, Tooltip

Paper, 1 px `--rule-strong` border, radius 0 (dialogs and sheets) or 4 px (menus and tooltips), **no shadow**; the backdrop is a flat 50% black, never blur or glass; close buttons 44 x 44 with a visible "Close". Menu items 44 px, hover and focus `--sunk`, keyboard focus the global ring (no inset bar). In study routes nothing animates.

### 9.19 Display Settings and 9.20 Onboarding

Unchanged in behaviour (DR-019; P23): three labelled 44 px switches outside study, High contrast only in study; one shared onboarding component whose movement paragraphs differ only by condition and by at most 10% of words.

---

## 10. Data Visualisation Rules

The dashboard reads as the results section of a paper (R-T13, R-T14, R-T16).

- **Frame.** Every chart is a `<figure>` in the Reuters frame: number, title, a "How to read" line (n, measure, unit, uncertainty), the graphic with direct labels, then Note and Source lines. Captions never use causal wording. Under every chart a "Data table" disclosure (9.5) and a 44 px "Download CSV" button.
- **Forms.** Dot-and-interval and strip plots for condition comparisons (every participant when n ≤ 200, R-T19); slope charts for pre to post; small multiples for the three study traditions on identical scales, canonical order; bars only for counts, from zero. No pie, no 3D, no dual axes, no gradients, no red/green pairs.
- **Encoding.** 2D = `--series-2d`, circle, solid line; 3D = `--series-3d`, square, 4-2 dashed line (R-A12). 2D first or left. Direct labels (R-A13). Traditions are never colour-coded. Heatmaps on the sequential indigo ramp with values printed.
- **Style.** ECharts SVG renderer, console only, `animation: false`. Labels in Atkinson: axis labels 13 px ink-3 `tabular-nums`; axis names 15 px 600 ink (two levels, R-T18); x axis line 1 px ink; y gridlines `--grid`; plot area on paper; tooltip as a booktabs mini-table. Joins in tooltips use words ("A to B", "A, B"), never a middle dot.
- **Single palette source.** `use-echart.ts` reads the tokens (`--ground` for the plot area) through `getComputedStyle` and rebuilds on theme change.
- **Table 1** (Enrolment and Completion) is a booktabs row of figures (label `text-label`, value `text-stat`, comparator line "2D 41, 3D 39"), not stat tiles. No coloured trend arrows.
- **Live status:** `--ok`, `--warn`, `--danger` with an icon and a word ("Live", "Stale", "Error") and "as of hh:mm:ss" in `text-id`; the stale alert has a full 1 px danger border, no left bar.
- **Equivalence Monitor** (`components/parity/equivalence-monitor.tsx`): a booktabs table (Check, 2D, 3D, Delta, Tolerance, Status with icon and word), fed only by stored real reports; otherwise "No parity run recorded yet" and nothing else.

---

## 11. Page Compositions

### 11.1 Public Home (`/`)

1. **Title block,** left-aligned on columns 1 to 7, with nothing beside it: the h1 "Immersive Episteme" in `text-display-1` (the smoke test's name is unchanged); the deck (`text-deck`) naming the six traditions from live data; ONE primary "Explore the demo" and a text link "Read the method". No eyebrow, no hero plate or card.
2. **Figure 1, "One Knowledge Model, Two Conditions",** full grid width on **one indigo plate** with on-indigo linework (10.32:1): the knowledge model with live counts read inside `<Suspense>` (a fallback with no numbers), and two equal branches to a page miniature and a floor-plan miniature. Static. Then its text equivalents: the count list, the two conditions as two equal unboxed panels with a 1.5 px ink top rule (parallel links on one baseline), and the booktabs "What Is Identical and What Differs" table.
3. **The traditions** as an index of equal rows (number, short name, full name, region) in canonical order, without images (DR-020), counts or boxes.
4. **Table 1,** dataset counts by tradition.
5. **The latest parity run** through the Equivalence Monitor, or "No parity run recorded yet".
6. **Institution strip:** fields hidden until set (13.1).

### 11.2 About, Colophon, Accessibility, Privacy

The editorial frame (6.1). Section heads in Anek Latin `text-display-3` with space above and below, no rule and no eyebrow. Sidenotes carry citations for any statement about the craft. **About:** the pull-quote is a real cited claim set in Atkinson 400 at 28/36 on a `--sunk` mat with a hanging opening mark, no bar. **Colophon:** the faces with specimens and the measured font bytes; the palette as plain swatches with their light and dark values and roles (only indigo carries "Design interpretation; not a measured or historical dye colour"); the fixed order; P1 to P32 with real results only.

### 11.3 Explore (`/explore`)

PageHeader with the honest lede. "What is the same" as an unboxed lead (no box, no bar). Two equal panels (2D left) with a 1.5 px ink top rule: the line-art schematic on a `--sunk` mat, the title in `text-display-3`, a reserved three-line description, and the 44 px primary action pinned with `mt-auto` so both sit on one line. "Before You Start": the controls of each condition in two equal booktabs tables, arrow keys named in words.

### 11.4 Sign-In, Sign-Out, Forbidden

**Sign-in:** the form on columns 1 to 5 and the explanation (participants never sign in here; accounts come from an administrator) on columns 7 to 11; not a centred card. **Forbidden and sign-out:** the StateMessage layout, left-aligned, no hero icon.

### 11.5 2D Learning Pages (`/learn/2d/*`)

The chrome per 9.14 and 9.15; the spread per 6.2 once DR-021 lands. Page intros have no eyebrow. The index, tradition pages and comparisons keep the Apparatus structure (equal typographic rows, no counts in study, comparisons per aspect at the sheet measure through `ClaimList`), set in the Atlas tokens; comparison aspects are separated by a 1 px `--rule-strong` line, not a 2 px ink rule.

### 11.6 3D Museum Overlays (`/learn/immersive`)

The shared StudyBar and KnowledgeSheet (6.2, 6.3); the Plan with 1.5 px ink room outlines, tabular section numbers and "You are here"; all overlays opaque (`--ground` sheet; `--field` rail and Plan). The gallery finish, plaques and lobby are specified in DR-023 and `docs/research/design-process/modules/immersive-3d.md`.

### 11.7 Study Pages (`/study/*`)

The study shell (9.16). "Question 4 of 20" in tabular figures; the question in Atkinson 20/28 600. Options: full-row 56 px labels with the `ie-check` control, separated by 1 px `--rule`; selected = `--wash` and a check icon, **no bar**. Likert scales: a column per point with tabular numbers and end labels; stacked under 520 px. Numeric answers are text inputs with a numeric keyboard (9.6). The study-entry group is a radio list. Consent and withdrawal rows use the same option row. Errors use `StateMessage`; field errors per 9.6.

### 11.8 Research Console, Dashboard, CMS and Admin

- **Console pages:** sections under a 1 px `--rule-strong` rule with a Title Case h2 and no eyebrow; booktabs lists with 44 px rows; IDs and timestamps in `text-id`; status as word plus icon. The study picker per 9.2.
- **Dashboard:** Table 1 in place of stat tiles; every figure in the frame of section 10; the live status line; the Equivalence Monitor.
- **CMS:** dense booktabs tables (36 px compact rows with 44 px hits). Sections are paper panes with a 1 px `--rule-strong` edge. The concept editor's **Proof** renders the real sheet in both placements through a segmented "Preview as: 2D column | 3D panel" inside a 1 px `--rule-strong` mount on `--field` (no ticks). Every filter select is the shared NativeSelect with its "Apply" button; every summary the shared Disclosure; numbers, dates and files per 9.6. The Figure Balance matrix is kept.
- **Admin:** every control 44 px; the permission matrix keeps its sticky raw table (sticky header and first column) in the booktabs style; the audit filter's dates carry the format hint; settings are read-only (the earlier DR-023 on admin settings).

---

## 12. Condition Parity (Study-Mode Equivalence Rules)

This section is the user's governing requirement made testable: **equivalence of knowledge, ease of access, and a neat UI that cannot skew 3D vs 2D results**. Where any other section conflicts with it, this section wins.

Scope: `/learn/2d/*`, `/learn/immersive` (all DOM overlays and in-scene text), `/study/*`. These rules override every aesthetic preference in this document. Their purpose is that a 2D vs 3D difference in results cannot be explained by interface quality (R-L4, R-L10), by unequal cues (R-L5) or by unequal salience (R-H2, R-T15).

### 12.1 One Source of Truth

1. `KnowledgeSheet`, `ClaimList`, `CitationNote`/`CitationRecord`, `KnowledgeFigure`, `FigureLightbox`, `LayerTabs`, `RelatedConcepts`, `StudyBar`, `HintControl`, `StallCue`, `LearningTimer`, `StateMessage`, onboarding, `DisplaySettings` and (DR-021) `PlaceRail` each exist once and are imported by both conditions. The control primitives of section 9 are shared by construction.
2. Layer names and order, concept type and category labels, and the canonical tradition order come from `src/features/learning/labels.ts`. All learner-visible interface strings for both conditions come from one module (`src/features/learning/strings.ts`).
3. Allowed differences between conditions, and only these: the field beside the sheet (the 2D index vs the 3D scene and Plan), the rail's content (the section's concepts vs the room's exhibits; same component, same rows), the condition navigation group in the StudyBar (same size and style), and how a rail row, related-concept link, pager link or Close acts (navigate vs walk or close). Until DR-021 lands, the 2D "Up to <parent>" control in the condition group is also allowed. The path from the learning start to a concept is the manipulation and is not equalised; it is logged per session (navigation events, with the navigation source) so it can be modelled. Everything from the moment a concept is open is equalised and measured (12.4).

### 12.2 Typography, Surface, Palette and Motion

4. Every knowledge string (title, claims, captions, credits, citation records, relation verbs, layer names) uses the same token in both conditions. The knowledge container background is `--ground` (white paper) in both, for all six tradition keys; the 3D panel is opaque with `backdrop-filter: none`.
5. Study palette: `--ground`, `--field` (rails and the 2D index only, never behind claims), `--sunk`, `--wash` (current or chosen item, with a word or a check), `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-strong`, `--indigo` (+ hover, on-indigo), `--danger` (errors only). No ok, warn, pattern, marker or tradition colour. Yellow only for the guidance cue.
6. Zero motion (section 8), no shadows, no glass, no badges or emphasis present in one condition only.
7. Light theme in study; High contrast offered identically before learning in both conditions and recorded (DR-019).

### 12.3 Figures and Salience

8. Each study figure is attached to a concept and an anchor claim and renders right after that claim in both conditions, with identical caption, credit, licence, alt text, 3:2 slot and lightbox behaviour (9.11). Images never replace a claim and never carry knowledge that the claims and alt text do not also carry (R-L2, R-L3, R-L8).
9. **Balancing rule.** At most one figure per concept. Within each section, Ajrakh, Sanganeri and Machilipatnam Kalamkari carry **exactly the same number of figures**: k(section) = the minimum available across the three. The content parity engine fails the study activation when any section is unbalanced, and the CMS Figure Balance matrix shows why.
10. Lightbox long edge capped at 768 px for every study figure (R-C20), one activation to open in both conditions.
11. No in-world image planes on museum walls in study builds; photographs appear only in the sheet figure (DR-020).
12. **Canonical tradition order**: alphabetical by display name, fixed and identical in both conditions (DR-019).
13. Traditions are identified **by name only** (DR-022: the neutral marker is removed for all six keys). Concept counts are hidden in study mode. The three study traditions get the same rows, the same type and the same visual weight.

### 12.4 Parity Checks

`tests/e2e/parity.spec.ts` runs each check at viewports 390 x 844, 768 x 1024, **1280 x 720** (a 1920 x 1080 laptop at 150% scaling), 1280 x 800 and 1440 x 900 (and **1024 x 768** and **1920 x 1080** for P28 and P30, light only), in light, dark, HC light and HC dark, for one concept from each study tradition, comparing the 2D concept page with the 3D panel for the same concept. It writes a JSON report (schema in `src/features/research/interface-parity.ts`) to `analysis/parity/interface-parity.json`, which the Equivalence Monitor reads. Tolerance is 0 unless stated.

| ID | Check | Pass condition |
|---|---|---|
| P1 | Computed style of the claim `<p>`, title h1, caption, credit, quote, the record's source line, the citation marker and the reference list: font-family, font-size, line-height, font-weight, letter-spacing, color, font-variant-numeric, font-feature-settings | equal in 2D and 3D |
| P2 | Content box width of the claim paragraph | equal within 1 px |
| P3 | Line-break parity: number of rendered lines per claim (`Range.getClientRects()`) | equal for every claim |
| P4 | Knowledge container `background-color` and `backdrop-filter` | `--ground` value and `none` in both, for all six tradition keys |
| P5 | Text content of claims, citation markers, citation records, the reference list, figure captions, credits and alt text for the same concept | byte-identical |
| P6 | Chrome offset: y of the KnowledgeSheet's first heading below the bottom of the chrome | equal within 1 px |
| P7 | StudyBar height and AccessNotice height | equal (or AccessNotice absent in both) |
| P8 | Claim lines visible in the first screen of the knowledge column | equal within 1 line |
| P9 | Bounding box of every interactive element in StudyBar, LayerTabs, CitationNote, Enlarge, lightbox Close, panel Close, RelatedConcepts, pager and minimap controls | at least 44 x 44 px; allow-list empty |
| P10 | Text contrast of every text node in the knowledge container, from computed styles (truncated, R-A2) | at least 4.5:1 |
| P11 | Scripted interaction counts from an open concept: first claim (0); the expanded citation record (in place, under its own claim); the lightbox; switch layer; lightbox back to its trigger | 0 for the first claim, 1 for each of the others, equal in both; every record in place |
| P12 | Computed `transition-duration` and `animation-duration` of every element on study routes | `0s` (or the 0.01 ms clamp) |
| P13 | Tab stops from the sheet h1 to the first citation marker | equal |
| P14 | Figure slots: count, order index, src, alt, caption, credit, licence, rendered aspect box size, lightbox max dimension | equal; aspect 3:2; long edge at most 768 px |
| P15 | Cumulative Layout Shift on 2D load and on 3D panel open | 0.00 |
| P16 | Figure decode latency, low-spec profile (4x CPU throttle) | median difference under 150 ms |
| P17 | **Tradition marker (changed, DR-022)** | no marker on any key, in either condition |
| P18 | Related Concepts block: DOM position and y-offset below the last claim of the field | follows the field and precedes the pager in both; offset equal within 1 px |
| P19 | Import graph: both route trees resolve the shared knowledge components from the same module files | true |
| P20 | String table: learner-visible interface strings used by both conditions | diff is empty |
| P21 | Figure-count matrix of the published study bundle | equal per section across the three study traditions |
| P22 | StudyBar shared group (wordmark, Hint, Time Left, Finish) and the skip link: names, DOM order, tab order, boxes, computed styles | identical in 2D and 3D; boxes within 1 px |
| P23 | Shared-component DOM snapshot (hint panel, StallCue, LearningTimer, onboarding, StateMessage, Display Settings) | byte-identical DOM and equal computed styles, apart from the onboarding movement paragraph (word count within 10%) |
| P24 | Interaction counts for shared chrome (hint panel, Display Settings, reach Finish by keyboard) | equal in 2D and 3D |
| P25 | Reading-progress bar inside the KnowledgeSheet: presence, height, colour, `role`, and value at the end of the container | present in both; equal; 100 at the end |
| P26 | Tradition salience: title computed style, row or plaque box size, marker absence and image presence for each study tradition | identical across the three traditions within each condition |
| P27 | Focus on concept open: `document.activeElement` | the sheet h1 in both conditions |
| P28 | `PlaceRail` parity: computed width, x, row height (44 px), type tokens, default open state, and drawer behaviour per viewport | equal in 2D and 3D (DR-021) |
| P29 | Rail and index content type: every rail and index string is a title, type, step or destination from `labels.ts` or the manifest; no read-model claim string appears in the rail, the 2D index or any in-scene text; section numbers in the 2D index equal the 3D Plan's room numbers | true |
| P30 | Sheet geometry: left-edge x, width, top, `overflow-y` container and `scrollHeight` behaviour at 1024, 1280, 1440 and 1920 | equal within 1 px |
| P31 | Focus-ring computed style (outline, offset, box-shadow) on every focusable in the StudyBar, rail and sheet | identical in 2D and 3D |
| P32 | Sheet header: action-slot content (accessible name "Close", box, styles) and the serialised header DOM (the Close element itself, a link in 2D and a button in 3D, compared by class and content) | identical in 2D and 3D |
| P33 | Elements competing for attention with the open concept on the first screen: visible, uncovered controls, headings, images, canvases, badges and status messages, each counted once, grouped as sheet, shared chrome and navigation; the claim text is not counted | sheet count equal; each total at most 30; totals within 6 |

**How the checks map to the governing requirement.**

| Requirement | Checks |
|---|---|
| Equivalence of knowledge (same text, face, size, measure, line height, contrast, colour semantics, citation record, layers, figures) | P1, P2, P3, P4, P5, P10, P14, P18, P20, P25, P30, P32 |
| Ease of access (same controls, 44 x 44 targets, keyboard paths, interactions to claim, citation, figure and hint; same onboarding, hint, timer, error and empty states) | P6, P7, P8, P9, P11, P12, P13, P22, P23, P24, P27, P28, P31 |
| Neat UI that cannot skew results (no condition-only emphasis; equal salience of the three study traditions; balanced figures; same performance; navigation strings only in the rail; a low, comparable attention load) | P15, P16, P17, P19, P21, P26, P29, P33 |

A reviewer verifies parity from the stored report alone: every check row carries the 2D value, the 3D value, the delta and the tolerance. P28 to P33 are implemented in the suite (package 2D-C). P28's default state follows the lead's defaults (2D rail open from 1280 px, 3D rail collapsed, both drawers closed below 1280 px); P26's plaque part is reported in the 1280 x 800 runs, where it is measured. The existing content parity checks remain and are shown alongside these in the Equivalence Monitor.

---

## 13. Honesty Rules

1. **No invented facts.** `src/config/institution.ts` holds affiliation, ethics reference, paper citation and contact; each field is `null` until the team supplies it, and a `null` field renders nothing. No "to be confirmed" stubs.
2. **No fake data.** Live counts come from the database at request time. The Equivalence Monitor, the home page and the Colophon show only stored real runs.
3. **No stock or AI imagery.** Photographs are licence-checked records with credit, licence, source URL, max pixel size and expiry.
4. **Interpretations are labelled.** The indigo is documented as a design interpretation (R-C6). Content in `content/` is never edited by design work.

---

## 14. Do and Don't

| Do | Don't |
|---|---|
| Render both conditions' knowledge through the same components and tokens. | Restyle a shared component from a condition's own file, or pass condition-specific style props. |
| Keep `--ground` (white paper) as the single knowledge surface, opaque, in both conditions. | Use glass, blur, translucency, `--field` or any second paper behind claims. |
| Use indigo as the only interactive colour. | Bring back cream, a serif display, terracotta, madder, ochre, bands, ticks, markers or tradition colours. |
| Set hierarchy with planes, type and space. | Use tracked uppercase eyebrows, middle-dot joins, monospace as a data voice, left-edge bars, soft rounded shadowed cards or "→" in text. |
| Style the native control (select, radio, checkbox, details, file, date). | Rebuild a control in ARIA for looks, or leave an OS-default select, spinner, file button or disclosure triangle. |
| Keep a select's change behind a labelled action button. | Apply a select on change (WCAG SC 3.2.2). |
| Give every interactive element a 44 x 44 hit area and the two-tone ring. | Remove the focus ring (`outline-none`) or ship 28 to 36 px controls without a hit area. |
| Put Related Concepts at the end of the sheet in both conditions; share the one `PlaceRail`. | Add any pane, list or signal present in one condition only. The shared rail is present in both. |
| Use one fixed 3:2 figure slot; balance figure counts per section. | Let figure aspect vary, show "no image" placeholders in study, or give one tradition more figures. |
| Derive the short citation label in code. | Hand-write labels into `content/` or truncate mid-word. |
| Number figures and tables; caption with n, measure and uncertainty. | Use pies, 3D charts, dual axes, red/green pairs or causal wording. |
| Hide unverified institution and ethics facts. | Show placeholders that read as real or "to be confirmed" stubs. |
| Spend boldness once (Figure 1). | Animate anything in study, add entrance motion, loop, parallax, scroll-jack or count numbers up. |

---

## 15. Acceptance Checklist

All items are measurable; (auto) marks the automated ones.

**Contrast and colour**
- [ ] (auto) `contrast.test.ts` asserts the 4.3 values, truncated, for all four theme blocks, including the minima: light text 5.35, dark 5.11, HC light 7.74, HC dark 8.23; rule-strong on every surface at least 3.44; the focus ring at least 4.58 against any colour.
- [ ] (auto) Lint (`tests/unit/design/atlas-lint.test.ts`, `dead-aliases.test.ts`): no `madder`, `ochre`, `band`, `uppercase`, label tracking, `" · "`, left bars or `font-mono` outside code; no raw `<select>`, number spinner, raw file input, `accent-color` checkbox or marker-less summary; no retired utilities.
- [ ] (auto) The smoke test pins the body background to `rgb(255, 255, 255)` and the home h1 to "Immersive Episteme".

**Type and performance**
- [ ] (auto) Study and console routes preload exactly 1 font file (at most 34,500 bytes); public routes at most 2 files and 176,000 bytes; at most 230,000 bytes of fonts transferred on any page (Anek latin-ext measured).
- [ ] (auto) No italic or serif webfont is requested anywhere; no `font-variant-caps`.
- [ ] (auto) LCP at most 2.5 s on `/` and the 2D concept page; INP at most 200 ms for opening a citation record and the lightbox in both conditions; CLS 0.00 on study routes.
- [ ] 3D: the low-tier frame-time budget of DR-023 (C3/C9 at most 33 ms p95), measured on a quiet machine.

**Equivalence**
- [ ] (auto) P1 to P33 pass at every listed viewport and theme; the report is stored and the Equivalence Monitor shows it.
- [ ] (auto) Study semantics unchanged: the same claims, order, layers, exposure budget, timer, hint policy and telemetry names, plus the navigation-source field of DR-021.
- [ ] DR-021, DR-022 and DR-023 adopted, with methodologist sign-off, before any participant data.

**Accessibility**
- [ ] (auto) axe-core reports no WCAG 2.2 A or AA violation on every in-scope page in four themes, including `scrollable-region-focusable` on both sheets and both rails.
- [ ] (auto) Every focusable shows the two-tone ring, never hidden under sticky chrome; with `forced-colors: active` the outline remains and every skinned control reverts to `appearance: auto`.
- [ ] (auto) Every interactive element is at least 44 x 44 px (36 px visual with a 44 px hit only in compact console tables).
- [ ] (auto) No change of context on input: every select that changes the view keeps its labelled action button (SC 3.2.2).
- [ ] (auto) The text-spacing override (WCAG 1.4.12) causes no clipping in the sheet, rail, rows or badges in both conditions.
- [ ] Keyboard paths: rail to field to sheet, skip link, Escape closing the drawer, the record and the lightbox with focus restored, in both conditions.

**Screenshots** (production builds; the same access state in both conditions; light theme; the same concept from each study tradition): 1440 x 900 and 390 x 844 of the 2D concept page and the 3D museum with the sheet open, a citation record expanded, the public home, the dashboard, the CMS concept editor with the Proof in both placements, and admin users; 1280 x 720 for both conditions with a concept open. Each pair is reviewed side by side for alignment (parallel buttons on one line).

---

## 16. Performance and Image Pipeline

**Images.** Unchanged (Apparatus section 16): AVIF then WebP, the listed device sizes, `qualities: [75]`, local patterns for `/figures/**`; the `/figures/[assetId]` route serves only approved, licence-valid illustrations of a published bundle or public plates.

| Image | Sizes | Budget |
|---|---|---|
| Study figure | srcset 400, 544, 816, 1088 | at most 70 KB at 544 w; at most 250 KB of images per study page view |
| Study lightbox | one source at 768 px long edge | fetched only on open |
| 3D lettering and plates | per DR-023 | per room |
| CMS thumbnails | 192 w | lazy |

**Fonts.** One file on study and console routes (Atkinson, 33,996 bytes), two on public routes (plus Anek Latin, 103,760 bytes); no italic.

**Graphics.** No pattern SVG, no shadows, no `backdrop-filter`; diagrams are static inline SVG.

**JavaScript.** No animation library. ECharts dynamically imported, console only. Every skinned control is CSS on a native element (no extra JavaScript); `FileInput` is the only control client island added.

**Targets** on a 4x CPU throttle: LCP at most 2.5 s on public pages and 2D concept pages, interaction-to-next-paint at most 200 ms, CLS 0 on study routes, 3D panel open to first paint under 100 ms.

---

## 17. Residual Risks

1. **The docked sheet occludes the scene.** 39.25rem covers about half of a 1280 px viewport (a 364 px field while reading). If piloting shows harm, narrow the rail or the measure for BOTH conditions, never for 3D alone. Name it in the paper's limitations.
2. **The scene beside the text** remains a difference; it is the manipulation. No camera motion while the sheet is open.
3. **Figure balance may drop good photographs** (k can be 0). Freeze the study bundle so licence expiry cannot change content mid-study.
4. **Tradition order** is one canonical alphabetical order, identical in both conditions and not counterbalanced (DR-019); order effects on tradition-level analyses are reported as a limitation.
5. **Changing the visual system changes study materials.** Acceptable only before any participant data is collected, with decision records (DR-019, DR-022).
6. **3D lettering** depends on `document.fonts.ready`; it reads the Atkinson family through the retired variable aliases until the lettering atlas reads `--font-atkinson`.
7. **Arabic-script text** renders in a system font that differs by device but not by condition.
8. **Search** is off in study builds of both conditions (DR-019).
9. **Comparison content structure** must stay reachable in both conditions (unit test over the read model).
10. **R1, the 2D arm gets stronger** with a visible rail instead of "Contents": allowed, because navigation is the manipulated variable; frozen before piloting, reported, signed off (DR-021).
11. **R2, an open 3D rail shortens 3D navigation:** the 3D rail is collapsed by default, and the navigation source is logged in both conditions.
12. **R3, the Plan default** follows the protocol setting `studies.config.minimap`.
13. **R4, global overview asymmetry:** the 2D index shows section names, the 3D Plan shows numbers (the list-versus-space manipulation; reported).
14. **R5, the reading size changes from 18/28 to 20/30:** fewer lines per screen, equal in both conditions; cpl held near constant (5.2); P3 and P8 re-run.
15. **R6, common laptop viewports:** 1280 x 720 is added to the parity viewports.
16. **R7, aesthetic asymmetry:** a finished 3D gallery next to a plain 2D page could bias perceived usability and motivation; the 2D pass and the 3D finish ship in one release and the finish level of both is reported.

---

## 18. Work Packages

### 18.0 Atlas (DR-021 to DR-023), in Order

Run after the Apparatus rebuild, as two parallel tracks with disjoint file ownership (the 2D/UI track owns everything except the 3D scene, lettering, compiler and their tests), merged sequentially with the parity checks after each merge, and released together (R7).

1. **2D-A, visual system and controls (DR-022):** tokens, fonts and type (sections 4 and 5); the two-tone focus ring; the control set of section 9 (NativeSelect, Segmented, Disclosure, the `ie-check` checkbox and radio, OptionRow, FileInput, numbers and dates); every raw select and control replaced; every listed tell removed; public, console, CMS, admin and study pages restyled; the shared sheet's lean metadata and labelled evidence; tests (`contrast`, `focus-ring`, `atlas-lint`, `dead-aliases`) and this file.
2. **2D-B, layout parity (DR-021):** the shared `PlaceRail`, the right-docked sheet in 2D, the 2D index field, Close in the action slot, the drawer below 1280 px, the two-row StudyBar under 768 px, the navigation-source telemetry field.
2a. **2D-C, the sheet, citations, cognitive load and parity:** the numbered citation markers with in-place records and the reference list (9.9), the lean metadata without Status, P28 to P33 and the 1280 x 720 viewport in the parity suite, and the WP8 review majors on P23, P24, P26 and the axe and focus coverage.
3. **3D gallery finish (DR-023):** walls, floor, plaques (white, unlit, Atkinson, "Step n of N", "Start" and "Last step"), wash, junctions, the lobby directory wall, the lettering atlas on `--font-atkinson`, the `inputMethodUsed` and `setVisited` bridge contracts, and the low-tier measurement.
4. **Verification:** the parity suite and the acceptance suite at every viewport and theme, then side-by-side screenshots.

The Apparatus packages below are the record of the first rebuild; where their visual specs conflict with sections 3 to 11 above, the Atlas sections win.

Ownership is disjoint: every file below belongs to exactly one package. A package may read any file but edits only its own. New files are marked (new). WP0 runs first; WP1-WP7 run in parallel after WP0; WP8 runs last. Every package keeps `npm run lint`, `npm run typecheck` (or `tsc --noEmit`), the unit suite and its own e2e specs green, keeps headings on `titleCase()`, keeps parallel cards aligned (`mt-auto`), and right-aligns numbers with `tabular-nums`. No package edits `content/`.

### WP0 Foundation (Tokens, Fonts, Primitives, Shells, Shared Knowledge Components)

Files:
- `src/app/globals.css`, `src/app/layout.tsx`, `src/components/providers.tsx`, `next.config.ts`, `eslint.config.mjs`
- `src/components/ui/alert.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `field.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`, `radio-group.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `sonner.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `tooltip.tsx`
- `src/components/shell/auth-client.ts`, `console-nav-links.tsx`, `console-shell.tsx`, `gate-fallback.tsx`, `gates.tsx`, `index.ts`, `learning-shell.tsx`, `page-header.tsx`, `public-shell.tsx`, `sign-in-form.tsx`, `sign-out-button.tsx`, `study-shell.tsx`, `display-settings.tsx` (new)
- `src/components/learning/guidance.tsx`, `index.ts`, `learning-phase.tsx`, `learning-task-prompts.tsx`, `practice-session.tsx`, `practice-unavailable.tsx`, `unverified-content-notice.tsx`, `study-bar.tsx` (new), `onboarding.tsx` (new)
- `src/components/citations/citation-disclosure.tsx`, `src/components/citations/index.ts`
- `src/components/knowledge/index.ts`, `knowledge-sheet.tsx`, `claim-list.tsx`, `knowledge-figure.tsx`, `figure-lightbox.tsx`, `layer-tabs.tsx`, `related-concepts.tsx`, `pager.tsx`, `state-message.tsx`, `tradition-marker.tsx` (all new)
- `src/components/brand/wordmark.tsx`, `knockout-band.tsx`, `registration-ticks.tsx`, `outline-diagram.tsx` (all new)
- `src/features/learning-2d/ui/claim-list.tsx`, `related-concepts.tsx`, `relation-details.tsx`, `pager.tsx` (become re-exports of the shared components, then deleted once WP2 and WP3 import from `@/components/knowledge`)
- `src/features/learning/labels.ts`, `src/features/learning/strings.ts` (new)
- `src/features/knowledge/read/view.ts`, `src/server/knowledge/read-model.ts` (the figure query behind `view.ts`), `src/features/research/interface-parity.ts` (new), `src/features/telemetry/contracts.ts`, `db/seeds/reference.ts` (seeds the `event_types` registry, so the new display-settings covariate event type must be added here too)
- `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx` (all new; none exists today): rendered with `StateMessage`, so a 404 or a crash looks identical in both conditions and in study routes carries no outbound navigation beyond a 44 px "Return" action
- `src/components/parity/equivalence-monitor.tsx` (new), `src/server/research/parity/summary.ts` (new)
- `src/config/institution.ts` (new), `src/lib/a11y/contrast.ts`
- `tests/unit/contrast.test.ts`, `tests/unit/button.test.tsx`, `tests/unit/citation-disclosure.test.tsx`, `tests/unit/learning/guidance-ui.test.tsx`, `tests/unit/knowledge/knowledge-components.test.tsx` (new), `tests/content/scripts.test.ts` (new), `tests/e2e/smoke.spec.ts`
- `docs/decisions/0003-visual-system.md` (new), `docs/research/design-process/decisions.md`

Tasks:
1. Rewrite `globals.css`: raw tokens (4.2), semantic mapping, HC light and the new `.dark.a11y-contrast` block (4.4), non-colour tokens (4.6), type tokens as `@utility` classes (5.2), study-root rules (`font-synthesis: none`, zero transitions), focus rules, `scroll-padding-top`, pattern and tick CSS (7.2, 7.3). Delete the glass `.panel` utility and the dormant categorical colours. Add deprecated `@theme inline` aliases for old names (`paper`, `ink-soft`, `ink-muted`, `brand`, `card-warm`, `hairline`) and remove them once WP8's dead-alias test passes.
2. `layout.tsx`: replace Cormorant with `Source_Serif_4` and keep `Inter` exactly as in 5.1; update `themeColor` to `#F5F1E8`; restyle the skip link.
3. `providers.tsx`: keep forced light; apply Display Settings classes on mount from storage (try/catch).
4. `next.config.ts`: the `images` block in section 16, including `qualities: [75]` and `localPatterns` for `/figures/**`.
5. `eslint.config.mjs`: rules from section 15 (no madder/ochre outside public files; no raw Tailwind palette colours; no `transition`/`animate-` utilities under `src/app/(learning)`, `src/app/(study)`, `src/components/knowledge`, `src/components/learning`, `src/components/museum/overlays`, `src/features/learning-2d/ui`).
6. Restyle every `ui` primitive per section 9 (44 px defaults, compact size, booktabs table, underline tabs, square badges, inputs); keep deprecated size names mapped to the new defaults until WP8.
7. Shells and PageHeader per 9.16; AccessNotice per 9.15; public header and footer with the knock-out band and Display Settings; console shell with band slot (research), plain rule (CMS, admin); remove `PlaceholderNotice`.
8. Build the shared knowledge components (9.6-9.14, 9.17, 9.19), the brand components (section 7) and the StudyBar; derive `shortCitationLabel()` and resolve concept figures (asset links with role `illustration`, anchor = `position`) in `view.ts`; layer constant, canonical tradition order and learner strings in `labels.ts` and `strings.ts`; add the display-settings covariate event to telemetry contracts.
9. Define the interface parity report schema (`interface-parity.ts`): `{ runId, commit, runs: [{ viewport, theme, traditionKey, checks: [{ id, label, value2d, value3d, delta, tolerance, passed }] }] }`. Build the presentational Equivalence Monitor (section 10) and `summary.ts`, which returns the latest stored content parity report per study (existing store functions, read-only) and the parsed `analysis/parity/interface-parity.json` when present, else `null`.
10. Port the section 4.3 and 4.4 ratios into `contrast.test.ts` (including the new HC dark block); add the Indic script content test; write the decision record.

Acceptance:
- Contrast test passes for all four blocks with the section 15 minimums; smoke test unchanged and green.
- Built pages preload exactly 2 font files totalling at most 176,000 bytes; Cormorant files absent from `.next/static/media`.
- `button.test.tsx` and `citation-disclosure.test.tsx` pass; every exported primitive renders at least a 44 x 44 hit area at its default size (unit test with jsdom bounding stubs or a Playwright component page).
- Knowledge components unit test renders the same DOM for a fixture concept in both `placement="page"` and `placement="panel"`, apart from the Close slot contents.
- Lint passes with the new rules on WP0 files.

### WP1 Public Pages

Depends on: WP0.

Files:
- `src/app/(public)/layout.tsx`, `page.tsx`, `about/page.tsx`, `about/colophon/page.tsx` (new), `explore/page.tsx`, `accessibility/page.tsx`, `privacy/page.tsx`, `sign-in/page.tsx`, `sign-out/page.tsx`, `forbidden/page.tsx`
- `src/components/public/figure-one.tsx`, `condition-schematic.tsx`, `plate.tsx`, `tradition-plates.tsx`, `dataset-table.tsx`, `editorial-frame.tsx`, `sidenote.tsx`, `pull-quote.tsx`, `identical-differs-table.tsx`, `institution-strip.tsx` (all new)
- `src/server/public/dataset-stats.ts` (new)
- `tests/e2e/public-pages.spec.ts` (new)

Tasks:
1. Home per 11.1: hero with Plate 1 or the typographic specimen; Figure 1 with live counts inside `<Suspense>` (cacheComponents) and its text equivalent; the one-time draw-on (respecting reduced motion); Six Traditions plates with the all-or-none photo rule; Dataset Table 1; institution strip reading `src/config/institution.ts` with hidden null fields.
2. About and the new Colophon per 11.2, including the read-only Equivalence Monitor (WP0 component and `summary.ts`; it shows "No parity run recorded yet" until WP8 produces a real report).
3. Explore per 11.3 with line-art schematics, equal descriptions, the "What Is the Same" strip and control tables.
4. Accessibility, Privacy, Sign-in, Sign-out, Forbidden per 11.4.
5. Madder and ochre used only here, per the token limits.

Acceptance:
- Smoke test passes; no horizontal scroll at 390 px on every public page including `/about/colophon`.
- No number on the home page is hard-coded: a test seeds a different dataset and the counts change.
- With `prefers-reduced-motion: reduce`, Figure 1 is fully drawn and no animation runs.
- No placeholder text such as "to be confirmed" or dashed boxes in the rendered HTML; null institution fields render nothing.
- LCP at most 2.5 s on `/` at 4x CPU throttle; plates have credit and licence lines.

### WP2 2D Learning UI

Depends on: WP0.

Files:
- `src/app/(learning)/learn/2d/layout.tsx`, `practice/page.tsx`, `(content)/layout.tsx`, `(content)/page.tsx`, `(content)/categories/page.tsx`, `(content)/categories/[category]/page.tsx`, `(content)/comparisons/page.tsx`, `(content)/concepts/[conceptKey]/page.tsx`, `(content)/search/page.tsx`, `(content)/traditions/[traditionKey]/page.tsx`
- `src/features/learning-2d/ui/concept-list.tsx`, `crumbs.tsx`, `disclosure-section.tsx`, `exposure.tsx`, `frame.tsx`, `page-heading.tsx`, `page-layout.tsx`, `page-telemetry.tsx`, `practice.tsx`, `process-timeline.tsx`, `reading-progress.tsx`, `search-telemetry.tsx`, `session.tsx`, `site-header.tsx`, `tracked-link.tsx`, `use-stable-tracker.ts`
- `src/features/learning-2d/server/data.ts`, `src/features/learning-2d/navigation.ts`
- `tests/unit/learning-2d/condition-guard.test.ts`, `fixtures.ts`, `harness.tsx`, `learning-2d.test.tsx`, `scope-navigation.test.ts`, `tests/e2e/learning-2d-browse.spec.ts`

Tasks:
1. Replace the site header with the shared StudyBar; move Traditions, Categories, Comparisons and Search into its condition group (Contents and Search sheets); one AccessNotice slot.
2. Concept page renders the shared `KnowledgeSheet` centred (11.5) directly under the chrome, with Related Concepts and the pager at the end, no side rail and no breadcrumb (the "Up to <parent>" control goes in the StudyBar condition group); import `ClaimList`, `RelatedConcepts`, `Pager` from `@/components/knowledge`. Delete `reading-progress.tsx` (the progress bar now lives in the `KnowledgeSheet`, 9.11) and move focus to the sheet h1 after client navigation (P27).
3. Index per 11.5 (equal typographic tradition cards with no plate slot, counts hidden in study, category table, comparisons row link); tradition page with labelled `<dl>` metadata and the restyled section disclosures (no counts in study); comparisons rendered per aspect at the sheet measure through `ClaimList`, with an optional link-only overview table (11.5).
4. Canonical tradition order from `labels.ts` everywhere; content-unavailable and practice screens use `StateMessage`.
5. Keep every telemetry event name and payload unchanged.

Acceptance:
- Existing 2D unit tests and `learning-2d-browse.spec.ts` pass (selector updates only).
- No horizontal scroll at 390 px on all 2D routes; every interactive element at least 44 x 44.
- Tradition order identical on index, comparisons and search results.
- Chrome above content equals AccessNotice + 56 px StudyBar + 2 px rule.

### WP3 3D Museum Overlays

Depends on: WP0.

Files:
- `src/app/(learning)/learn/immersive/layout.tsx`, `page.tsx`, `practice/page.tsx`
- `src/components/museum/overlays/hud.tsx`, `info-panel.tsx`, `minimap.tsx`, `screens.tsx`
- `src/components/museum/immersive-session.tsx`, `museum-app.tsx`, `museum-canvas.tsx`, `practice-museum.tsx`
- `src/components/museum/three/labels.ts`, `src/components/museum/three/world.ts`
- `src/features/immersive/panel-content.ts`, `src/features/immersive/types.ts`, `src/features/immersive/server/payload.ts` (the panel payload must carry each concept's figures, from the same `view.ts` resolution 2D uses)
- `src/components/museum/museum-scene.tsx`, `src/components/museum/three/resources.ts`, `src/components/museum/three/geometry.ts` (typographic wall plates and plaque textures)
- `tests/unit/immersive/info-panel.test.tsx`, `tests/unit/immersive/panel-content.test.ts`, `tests/e2e/immersive-flow.spec.ts`, `tests/e2e/immersive-rendering.spec.ts`

Tasks:
1. Replace the glass HUD with the shared StudyBar (room name as the location slot and h1 rule from 9.11); Plan, Controls Help and Pause as 44 px labelled buttons in the condition group.
2. Rebuild `info-panel.tsx` as a placement of the shared `KnowledgeSheet`: docked 39.25rem at 1024 px and wider, full-screen below 1024 px and at 200% zoom, opaque `--ground`, Close in the reserved slot, focus to h1 on open, Escape returns focus; delete the inline claim, tab and `RelationDetails` markup.
3. Minimap per 11.6 (ink outlines, "You Are Here", no fills); room contents rows 44 px.
4. Signage: fixed-size plaques in Source Serif 4 via `CanvasTexture`, gated on `document.fonts.ready`; wall planes as identical typographic plates in study builds; plane activation opens the panel at its top.
5. All screens use `StateMessage` and the shared onboarding; no transitions anywhere in overlays. Remove `PANEL_TAB_LABELS` from `panel-content.ts`; `LayerTabs` reads names and order from `labels.ts`. Panel figures come through `payload.ts` and render with the shared `KnowledgeFigure`.
6. Respect `docs/architecture/immersive-rendering-quality.md`: no new flicker, artefacts or frame-time regressions (measure before and after).

Acceptance:
- `immersive-flow.spec.ts` (no overflow at 390) and `immersive-rendering.spec.ts` (sign contrast at least 4.5:1) pass.
- `info-panel.test.tsx` asserts the panel renders `KnowledgeSheet` and no duplicated claim markup.
- Panel computed background `rgb(245, 241, 232)` in light, `backdrop-filter: none`; every overlay control at least 44 x 44.
- Frame time and rendering-quality metrics no worse than the recorded baseline.

### WP4 Study Pages

Depends on: WP0.

Files:
- `src/app/(study)/study/layout.tsx`, `page.tsx`, `consent/page.tsx`, `complete/page.tsx`, `(session)/layout.tsx`, `(session)/device-check/page.tsx`, `(session)/post-test/page.tsx`, `(session)/pre-test/page.tsx`, `(session)/questionnaire/page.tsx`, `(session)/questionnaire/before/page.tsx`, `(session)/questionnaire/after-learning/page.tsx`, `(session)/reconstruction/page.tsx`, `(session)/session/page.tsx`, `(session)/task/page.tsx`, `(session)/transfer/page.tsx`, `(session)/withdraw/page.tsx`
- `src/components/study/action-form.tsx`, `assessment-form.tsx`, `assessment-step.tsx`, `consent-form.tsx`, `device-check.tsx`, `entry-form.tsx`, `session-widgets.tsx`, `step-footer.tsx`, `withdraw-form.tsx`
- `src/components/assessment/reconstruction-task.tsx`, `concept-map-editor.tsx`, `map-canvas.tsx`, `map-state.ts`, `relationship-panel.tsx`
- `tests/e2e/study-journey.spec.ts`, `tests/e2e/study-fixtures.ts`, `tests/e2e/assessment-concept-map.spec.ts`, `tests/unit/assessment-ui/concept-map-editor.test.tsx`, `tests/unit/assessment-ui/map-state.test.ts`

Tasks:
1. Apply 11.7: progress text and line, question typography, 56 px option rows with `--wash` selection, Likert tables stacking under 520 px, action row order.
2. Offer the High contrast accommodation once at study onboarding (before learning), identically for both allocations, and record it on the study session (DR-019). The theme stays light in study.
3. Consent and debrief in the editorial column; errors through `StateMessage` and field errors per 9.5.
4. Concept-map task: tokens, 44 px controls, zero motion; no behavioural change.

Acceptance:
- `study-journey.spec.ts` and `assessment-concept-map.spec.ts` pass; answers, allocation and timing behaviour unchanged (`tests/integration/study-engine.test.ts` green).
- No horizontal scroll at 390 px on every study step; every control at least 44 x 44; P12 zero motion on every study route.
- The Display Settings step renders identically whichever condition the participant is allocated to.

### WP5 Research Console and Dashboard

Depends on: WP0.

Files:
- `src/app/(research)/research/layout.tsx`, `page.tsx`, `_components/action-form.tsx`, `_components/action-state.ts`, `_components/common.tsx`, `analytics/page.tsx`, `assessments/page.tsx`, `assessments/[assessmentId]/page.tsx`, `assessments/[assessmentId]/reference/[referenceMapId]/page.tsx`, `dashboard/page.tsx`, `dashboard/_components/live-status.tsx`, `dashboard/_components/stats-table.tsx`, `exports/page.tsx`, `parity/page.tsx`, `participants/page.tsx`, `pathways/page.tsx`, `scoring/page.tsx`, `scoring/maps/[conceptMapId]/page.tsx`, `scoring/rubrics/[rubricId]/page.tsx`, `sessions/page.tsx`, `sessions/[sessionId]/page.tsx`, `studies/page.tsx`, `studies/[studyId]/page.tsx`
- `src/components/analytics/charts.tsx`, `use-echart.ts`
- `src/components/assessment/map-viewer.tsx`, `rater-editor.tsx`, `item-form.tsx`, `action-form.tsx`
- `tests/e2e/research-dashboard-live.spec.ts`, `tests/unit/research/viz-tokens.test.ts` (new)

Tasks:
1. Console pages per 11.8: band above PageHeader, booktabs lists, `<dl>` summaries, Demo data badge.
2. Dashboard per 11.9 and section 10: Table 1 stat row, slope and dot-CI figures, small multiples, heatmap, Table 2, Interface Parity card; live status with tokens and words.
3. `use-echart.ts` reads tokens through `getComputedStyle` and rebuilds on theme change; delete the hard-coded palette; `animation: false`; condition encoding with markers and dashes; direct labels.
4. Place the WP0 Equivalence Monitor on `/research` (summary) and `/research/parity` (full table beside the existing run form and history).
5. Assessment research components adopt tokens and 44 px controls.

Acceptance:
- `research-dashboard-live.spec.ts` and `tests/integration/research-dashboard*.test.ts` pass.
- Charts render in light, dark and HC with colours equal to the CSS tokens (unit test compares `VIZ` to computed values).
- `/research` and `/research/parity` render the Equivalence Monitor with "No parity run recorded yet" when no report exists and real values when a fixture report file is present; no sample-data path exists.
- No raw Tailwind palette colours remain in research files; no horizontal page scroll at 390 px.

### WP6 CMS

Depends on: WP0.

Files:
- `src/app/(cms)/cms/layout.tsx`, `page.tsx`, `concepts/page.tsx`, `concepts/[conceptId]/page.tsx`, `datasets/page.tsx`, `media/page.tsx`, `relations/page.tsx`, `review/page.tsx`, `sources/page.tsx`, `spatial/page.tsx`, `traditions/page.tsx`
- `src/components/cms/action-form.tsx`, `action-state.ts`, `bits.tsx`, `claims-editor.tsx`, `graph-workspace.tsx`, `history-list.tsx`, `notes-editor.tsx`, `relationship-form.tsx`, `relationship-table.tsx`, `transition-panel.tsx`, `media/asset-metadata-fields.tsx`, `media/media-library.tsx`, `media/upload-form.tsx`, `media/figure-balance.tsx` (new), `proof-frame.tsx` (new), `spatial/manifest-action-form.tsx`, `spatial/studio.tsx`
- `src/features/media/contracts.ts`, `db/schema/media.ts`, `db/migrations/0016_media_figure_governance.sql` (new), `db/migrations/meta/_journal.json`, `db/migrations/meta/0016_snapshot.json` (new; every earlier migration has one)
- `src/app/figures/[assetId]/route.ts` (new): the learner and public figure route of section 16
- `src/server/cms/media/actions.ts`, `src/server/cms/media/service.ts`, `src/server/research/parity/engine.ts`
- `tests/integration/cms-media.test.ts`, `tests/e2e/cms-guards.spec.ts`, `tests/unit/research/parity-figure-balance.test.ts` (new)

Tasks:
1. CMS pages and components per 11.10 (no madder; dense booktabs tables; status badges with words).
2. Concept editor Proof pane rendering the real `KnowledgeSheet` with the "Preview As: 2D Column | 3D Panel" switch.
3. Media governance: add `maxPixels`, `licenceExpiresOn`, `sourceUrl` to assets and `anchorClaimIndex` semantics to illustration links (migration plus contracts); upload form validation (alt about 15 words and different from caption; caption at most 180 characters).
4. Figure Balance matrix and a new content parity check in `engine.ts` (group a): per section (concept type), equal illustration counts across the three study traditions, at most one per concept, lightbox source at least the study cap; critical severity so activation is blocked.
5. Build the `/figures/[assetId]` route per section 16 (approved, licence-valid, published illustration or public plate only; 404 otherwise), with an integration test in `cms-media.test.ts`.

Acceptance:
- `cms-media.test.ts`, `cms-guards.spec.ts` and the new parity test pass; an unbalanced fixture fails activation with a readable issue.
- Migration applies on `episteme_test` (`npm run db:migrate -- --test`); `tests/integration/schema-*.test.ts` pass.
- Proof switch renders identical sheet DOM in both placements.
- No horizontal page scroll at 390 px on CMS pages; no madder token in CMS files (lint).

### WP7 Admin

Depends on: WP0.

Files:
- `src/app/(admin)/admin/layout.tsx`, `page.tsx`, `audit/page.tsx`, `roles/page.tsx`, `settings/page.tsx`, `users/page.tsx`
- `src/components/admin/user-forms.tsx`
- `tests/integration/admin-users.test.ts`

Tasks:
1. Apply 11.11: plain rule header, booktabs users and roles tables, permission matrix with sticky header and first column, audit log with mono tabular timestamps and filter bar, settings sections with sticky save bar and Danger zone.
2. Destructive actions through a confirm dialog with typed confirmation.

Acceptance:
- `admin-users.test.ts` and the admin parts of `alignment.spec.ts` pass; no horizontal page scroll at 390 px.
- Every control at least 44 x 44 (36 px compact rows keep 44 px hit areas).

### WP8 Verification and Cleanup

Depends on: WP0, WP1, WP2, WP3, WP4, WP5, WP6, WP7.

Files:
- `tests/e2e/parity.spec.ts` (new), `tests/e2e/design-acceptance.spec.ts` (new), `analysis/parity/interface-parity.json` (new, generated by CI), `tests/e2e/alignment.spec.ts`, `tests/e2e/telemetry-learning.spec.ts`
- `tests/unit/design/import-graph.test.ts` (new), `tests/unit/design/strings.test.ts` (new), `tests/unit/design/dead-aliases.test.ts` (new), `tests/unit/design/title-case-scan.test.ts` (new; the h1-h3 `titleCase()` scan from section 15)
- `.github/workflows/ci.yml` (runs the parity and acceptance specs and commits `analysis/parity/interface-parity.json`)
- `package.json`, `package-lock.json` (add `@axe-core/playwright` as an exactly pinned devDependency, the only dependency change in the redesign. **Requires the project lead's approval before install**, AGENTS.md)

Tasks:
1. Implement P1-P27 (section 12.4) and write the report JSON per WP0's schema to `analysis/parity/interface-parity.json`; CI commits it on the main branch.
2. Implement the section 15 automated checks: axe in four themes, 390 px and 200% zoom reflow, text-spacing override, font budget from the network log, image budgets, CLS, LCP and interaction latency under a CDP 4x CPU throttle, reduced motion.
3. Extend `alignment.spec.ts` with `/about/colophon` and the immersive route; update `telemetry-learning.spec.ts` selectors only.
4. Import-graph test (P19), string-table diff (P20) and a dead-alias test proving no file uses the deprecated token names or button sizes, after which the WP0 owner deletes the aliases.

Acceptance:
- All of section 15's automated items pass in CI; the stored interface parity report shows 27 of 27 checks passing for one concept per study tradition at every viewport and theme.
- The Equivalence Monitor and the Colophon show that real run.

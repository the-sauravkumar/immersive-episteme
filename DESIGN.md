# Immersive Episteme Design System: Apparatus

This file specifies the visual and interaction design of every surface of Immersive Episteme. It is the spec that implementation work packages (section 18) build against. When code and this file disagree, this file wins until a decision record says otherwise.

Read with: `docs/decisions/0001-stack-and-foundation.md`, `docs/architecture/immersive-rendering-quality.md`, `AGENTS.md`.

---

## 1. Why This Design Fits Immersive Episteme

Immersive Episteme exists to answer one question fairly: does learning the same cited knowledge in a 3D museum differ from learning it in conventional 2D pages? The interface must therefore be good in a specific way. It must be impressive enough that the project reads as serious, finished research, and neutral enough that no 2D-versus-3D difference can be blamed on the interface. Media comparison studies are criticised precisely because they "fail to control for instructional method" (R-L10). This design treats that criticism as its brief.

The system is called **Apparatus**, after the scholarly-edition term for the notes and sources printed with a text. The product's strongest existing trait is that every sentence is cited. Apparatus makes that the identity:

- **Every claim is numbered and carries its source line**, and the verbatim quote behind it is set as large as the claim. The evidence is never visually smaller than the statement it supports.
- **One knowledge sheet, two placements.** The 2D page column and the 3D information panel are the same React components, the same typography tokens, the same opaque cloth ground and the same measure. Only the spatial organisation around them differs, which is the experimental manipulation and nothing else. This is the craft's own logic: in Ajrakh the borders are fixed and "Only the motif in the centre of the cloth may be changed" (R-C11).
- **Craft as structure, not costume.** The graphic language comes from what all three study traditions share: the carved block (R-C18), its visible footprint (R-C7), registered layers (R-C8) and its corner registration marks (R-C9). It never uses one tradition's motifs or colour signature, because those carry identity (R-C1, R-C6, R-C10, R-C12, R-C14) and would make one tradition more salient.
- **Character where it is safe.** Public pages, the research console, the dashboard and the CMS get the indigo knock-out band, registration-ticked photographic plates, outline-then-fill diagrams, booktabs tables and a live Equivalence Monitor. Study pages get none of that; their quality comes from measure, rhythm, numerals and rules, which are identical in both conditions by construction.
- **Equivalence is visible.** The parity checks are not hidden tests. Their real results appear as an Equivalence Monitor in the research console and on the public Colophon, so a reviewer can audit that the interface is not a confound.

It answers the user's feedback ("boring and vibe-coded") with rigour rather than decoration. Learners in study mode see a calm, beautifully set reading surface; visitors and reviewers see an instrument that shows its own controls.

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

### 2.6 Decisions Taken Without Research Support

These are design judgements, labelled as such:

- **Source Serif 4 for headings, Inter for claims.** R-L13 classes typeface as a minor variable and no finding favours serif or sans for learning. Claims stay in Inter (as today) so the study baseline changes as little as possible; parity, not the face, protects validity.
- **Indigo as the single interactive accent.** Indigo appears in the documented processes of Ajrakh, Sanganeri, Bagru, Dabu and Kalamkari in the dataset (materials and explanations), so as a flat UI colour without star geometry (R-C12) it is not one tradition's marker. Never paired with madder as a brand duo (R-C13).
- **Square-cut geometry** (2-3 px radii). An aesthetic reference to the carved block's square footprint (a design judgement; R-C7 supports only that the footprint is visible); R-L13 says corner shape is minor.

---

## 3. Design Thesis

Treat the platform as a **critical edition**: one body of cited knowledge, typeset under one strict system, presented through two placements. Research grade comes from precision (measure, rhythm, numbering, rules, honest figures and tables), never from ornament. Character comes from the craft's shared structure (block module, registration, outline-then-fill, protected white space) and is spent only where it cannot touch a study result.

Three zones, three levels of expression:

| Zone | Routes | Expression |
|---|---|---|
| Study | `/learn/2d/*`, `/learn/immersive`, `/study/*` | Typography, rules and indigo only. Zero motion. No pattern, ticks, madder, ochre or imagery other than knowledge figures. Identical in both conditions by construction (one component set). |
| Console | `/research/*`, `/cms/*`, `/admin/*` | Booktabs tables, numbered figures, the Equivalence Monitor, a 48 px knock-out header band (research only), functional motion. No madder. |
| Public | `/`, `/about`, `/about/colophon`, `/explore`, `/accessibility`, `/privacy`, `/sign-in`, `/sign-out`, `/forbidden` | Full character: knock-out band, registration-ticked photographic plates, outline-then-fill diagrams, madder and ochre accents, one draw-on diagram. |

The memorable signatures, named exactly:

1. **Numbered claims with a source line under each**, the number hanging in the margin (study, both conditions).
2. **The evidence is as large as the claim**: the verbatim quote in the citation record is set at claim size in Source Serif 4 with a 2 px indigo rule (study, both conditions).
3. **Figure 1, "One Knowledge Model, Two Conditions"**: a live outline-then-fill diagram on the home page drawn from real database counts, with a table of what is identical and what differs.
4. **Registration-ticked plates**: licence-checked photographs framed by four corner registration ticks (R-C9) on public pages.
5. **The indigo knock-out band**: neutral block-module geometry reversed out of indigo, as resist protects white (R-C22).
6. **The Equivalence Monitor**: the measured parity checks (2D value, 3D value, delta, tolerance, status), fed only by real CI runs, in the console and on the Colophon.

---

## 4. Tokens

### 4.1 Rules for the Token File

- All tokens live in `src/app/globals.css`. Colour values stay as hex or `rgb(r g b / a)` literals inside flat `:root`, `.dark`, `.a11y-contrast` and the new `.dark.a11y-contrast` blocks, because `tests/unit/contrast.test.ts` parses them with regexes. WP0 extends the test parser to the new dark high-contrast block.
- Raw tokens below are mapped onto the shadcn semantic names (`--background`, `--foreground`, ...) so every primitive keeps working.
- `--ground` light stays `#F5F1E8`: `tests/e2e/smoke.spec.ts` pins `rgb(245, 241, 232)`.
- Every craft-derived token carries the comment `/* design interpretation; not a measured or historical dye colour */` (R-C6).
- Contrast ratios below are computed with the WCAG relative-luminance formula and **truncated** to two decimals, never rounded up (R-A2). They were computed with `design/spec/contrast.js` in the design scratchpad; WP0 ports the same pairs into `contrast.test.ts`.

### 4.2 Palette (Light and Dark)

| Token | Light | Dark | Role and limits |
|---|---|---|---|
| `--ground` | `#F5F1E8` | `#1A1714` | THE reading surface: page background and the background of every knowledge container (2D column AND 3D panel). Never tinted per tradition (R-C4, R-C5, R-C21). |
| `--surface` | `#FBF8F2` | `#221D19` | Raised non-knowledge surfaces: console cards, dialogs, popovers, CMS form pane. Never behind claims in study. |
| `--sunk` | `#ECE5D8` | `#2A241F` | Table header band, figure mat (letterbox inside the fixed slot), code cells, static loading blocks, console sidebar. |
| `--ink` | `#211D19` | `#EFE9DE` | All body text, claims, headings, the 2 px running-head rule, diagram outlines. Interpretation of iron black (R-C3). |
| `--ink-2` | `#3A332C` | `#DCD4C7` | Leads, figure captions, citation record values. |
| `--ink-3` | `#635A50` | `#ABA195` | Secondary text only: source lines, credit and licence lines, eyebrows, table units, inactive tabs. |
| `--rule` | `#CFC4B2` | `#3D352D` | Decorative hairlines only (between claims, table rows). Never the only boundary of a control. |
| `--rule-strong` | `#857A6C` | `#7D7366` | Boundaries of controls (inputs, outline buttons, Enlarge button, checkbox). |
| `--indigo` | `#24406E` | `#A9BEE6` | The single interactive accent everywhere, including study: primary buttons, links, active tab bar, focus ring, citation-quote rule. |
| `--indigo-hover` | `#1A3157` | `#C6D5F1` | Hover and pressed state of primary buttons and links. |
| `--on-indigo` | `#FBF8F2` | `#14171D` | Label colour on indigo fills. |
| `--wash` | `#E2E6EE` | `#24304A` | Selected row or selected answer option, always with a 2 px indigo bar plus a check icon or the word "Selected". In study, only for the chosen questionnaire option. |
| `--band` | `#24406E` | `#1C2D4D` | Field of the public and console knock-out bands. |
| `--madder` | `#8F2F1F` | `#E59580` | **Public pages only**: plate and figure numbers, the 2 px rule above public section heads, the About pull-quote bar. Never in study, console, CMS, admin, forms, alerts or charts. It measures 1.09:1 (light) and 1.02:1 (dark) against `--danger`, and dark red reads as near-black for protanopes (R-A15). |
| `--ochre` | `#7F5C14` | `#D6AE5E` | **Public pages only**: eyebrows on editorial sections, Colophon swatch labels. Never in study, where yellow is reserved for the guidance cue (a project accessibility rule, section 4.4). Interpretation of the myrobalan yellowish ground (R-C19). |
| `--ochre-deco` | `#C99A3A` | `#C99A3A` | Decorative dots in the knock-out band only. Never text. |
| `--danger` | `#A3242C` | `#F2918C` | Errors and destructive actions, always with an icon and the word "Error" or a field message (R-A4). |
| `--ok` | `#2E6A3E` | `#8CC7A0` | Console, CMS and admin status only (passed, published, live), with word and icon. |
| `--warn` | `#77540F` | `#D9B26A` | Console, CMS and admin status only (under review, licence expiring, stale), with word and icon. Brown-ochre, not yellow. Never in study. |
| `--series-2d` | `#3A5DA0` | `#8FAEE8` | Dashboard only: the 2D condition. Circle marker, solid line. |
| `--series-3d` | `#8E4D16` | `#E0A06A` | Dashboard only: the 3D condition. Square marker, 4-2 dashed line. Relative luminance 0.1127 vs 0.1112 (light) and 0.4194 vs 0.4203 (dark), a 1.00:1 match, so neither condition looks heavier in the researchers' charts; a warm/cool pair (R-A14). |
| `--grid` | `#DDD4C6` | `#352E27` | Chart y gridlines only, intentionally fainter than axis labels (R-T17). |
| `--viz-seq-1..6` | `#E4E3E6 #B9C3D6 #8A9DC0 #4F6A99 #36548A #1B3360` | `#2C2B33 #33405A #465C86 #6582B4 #90AADB #C3D3F1` | Single-hue indigo ramp for heatmaps and the CMS Figure Balance matrix. Cells always print their value. |

Shadcn semantic mapping (light, dark and both HC blocks): `background = ground`, `foreground = ink`, `card = surface`, `card-foreground = ink`, `popover = surface`, `popover-foreground = ink`, `primary = indigo`, `primary-foreground = on-indigo`, `secondary = sunk`, `secondary-foreground = ink`, `muted = sunk`, `muted-foreground = ink-3`, `accent = sunk`, `accent-foreground = ink`, `destructive = danger`, `border = rule`, `input = rule-strong`, `ring = indigo`.

The dormant categorical colours in `@theme` (`madder #a34a33`, `indigo #34506e`, `wood`, `wood-dark`, `cloth`, `ok`, `warn`, `danger`) are deleted and replaced by the tokens above. The glass `.panel` utility (`--panel-bg`, `--panel-bg-solid`, `--panel-blur`, `--shadow-panel-v`) is retired; 3D overlays become opaque. Old raw names (`--paper`, `--ink-soft`, `--ink-muted`, `--brand*`, `--card-warm`, `--hairline*`) are kept as `@theme inline` colour aliases by WP0 until WP8 removes them, so no package breaks mid-migration.

### 4.3 Computed Contrast

Light theme (foreground on ground / surface / sunk / wash):

| Foreground | ground | surface | sunk | wash | Allowed |
|---|---|---|---|---|---|
| ink `#211D19` | 14.85 | 15.79 | 13.36 | 13.38 | everywhere |
| ink-2 `#3A332C` | 11.02 | 11.72 | 9.92 | 9.93 | everywhere |
| ink-3 `#635A50` | 5.99 | 6.37 | 5.39 | 5.39 | everywhere, at 13 px or more |
| indigo `#24406E` | 9.16 | 9.74 | 8.24 | 8.25 | everywhere |
| indigo-hover `#1A3157` | 11.49 | 12.22 | 10.34 | 10.35 | everywhere |
| danger `#A3242C` | 6.54 | 6.96 | 5.89 | 5.89 | everywhere |
| madder `#8F2F1F` | 7.18 | 7.63 | 6.46 | n/a | public only |
| ochre `#7F5C14` | 5.41 | 5.75 | 4.86 | n/a | public only |
| ok `#2E6A3E` | 5.73 | 6.10 | 5.16 | n/a | console only |
| warn `#77540F` | 6.08 | 6.47 | 5.48 | n/a | console only |

On-indigo on indigo 9.74, on indigo-hover 12.22. Ground (`#F5F1E8`) on the light band (= indigo) 9.16. On-indigo on danger (destructive fill) 6.96 light, `#14171D` on dark danger 7.86. No focusable element ever sits on a band: the indigo focus ring on the light band measures 1.00:1.

Dark theme:

| Foreground | ground | surface | sunk | wash | Allowed |
|---|---|---|---|---|---|
| ink `#EFE9DE` | 14.77 | 13.81 | 12.68 | 10.88 | everywhere |
| ink-2 `#DCD4C7` | 12.14 | 11.35 | 10.42 | 8.94 | everywhere |
| ink-3 `#ABA195` | 7.02 | 6.56 | 6.02 | 5.17 | everywhere |
| indigo `#A9BEE6` | 9.51 | 8.90 | 8.16 | 7.01 | everywhere |
| indigo-hover `#C6D5F1` | 12.05 | 11.28 | 10.35 | 8.88 | everywhere |
| danger `#F2918C` | 7.82 | 7.31 | 6.71 | 5.76 | everywhere |
| madder `#E59580` | 7.60 | 7.10 | 6.52 | n/a | public only |
| ochre `#D6AE5E` | 8.56 | 8.01 | 7.35 | n/a | public only |
| ok `#8CC7A0` | 9.17 | 8.58 | 7.87 | n/a | console only |
| warn `#D9B26A` | 8.94 | 8.36 | 7.68 | n/a | console only |

On-indigo on indigo 9.56, on indigo-hover 12.12. Text `#EFE9DE` on the dark band `#1C2D4D` 11.34.

Non-text (WCAG 1.4.11 needs 3:1; R-A3):

| Pair | Light | Dark |
|---|---|---|
| rule-strong on ground / surface / sunk | 3.72 / 3.96 / 3.35 | 3.83 / 3.59 / 3.29 |
| rule-strong on wash | 3.35 | 2.82, so a selected row on wash always carries the 2 px indigo bar (7.01) |
| focus ring (indigo) on ground | 9.16 | 9.51 |
| series-2d / series-3d on surface | 6.08 / 6.14 | 7.46 / 7.47 |
| ochre-deco on band | 4.01 | 5.33 |
| rule on ground (decorative, exempt) | 1.52 | 1.48 |
| grid on surface (decorative, exempt) | 1.38 | 1.24 |

Watch pairs (these are why the usage rules exist): madder vs danger 1.09 light, 1.02 dark (so madder is public-only); series-2d vs indigo 1.59 light (so there are no links inside chart plot areas); indigo vs ink 1.62 light, 1.55 dark (so links are always underlined, never colour alone, R-A4).

Sequential ramp cell labels: light, `--ink` on steps 1-3 (13.09, 9.43, 6.10) and `--on-indigo` on steps 4-6 (5.14, 7.09, 11.72). Dark, `#EFE9DE` on steps 1-3 (11.58, 8.59, 5.54) and `#14171D` on steps 4-6 (4.61, 7.65, 11.88).

### 4.4 High-Contrast Mode

`.a11y-contrast` (light) and the new `.dark.a11y-contrast` (dark; missing today). Surfaces become opaque and flat; every rule becomes solid ink; patterns, ticks and knock-out bands are removed (a 2 px ink rule replaces each band); focus is the existing black/white double ring; yellow is never used except the guidance cue.

| Token | HC light | HC dark |
|---|---|---|
| ground = surface | `#FFFDF8` | `#0D0B09` |
| sunk | `#F1ECE2` | `#1C1813` |
| wash | `#E6EAF2` | `#1F2A40` |
| ink | `#111111` | `#FFFFFF` |
| ink-2 | `#2B2622` | `#F0EBE3` |
| ink-3 | `#3A342E` | `#E2DBD0` |
| indigo / indigo-hover | `#1B2F55` / `#111E38` | `#C9D7F2` / `#E1E9F8` |
| on-indigo | `#FFFDF8` | `#0D0B09` |
| danger | `#8A1A20` | `#FFB0AB` |
| rule = rule-strong | `#111111` | `#FFFFFF` |

Computed on ground / sunk / wash. HC light: ink 18.57 / 16.03 / 15.66; ink-2 14.72 / 12.71 / 12.41; ink-3 12.07 / 10.42 / 10.18; indigo 13.03 / 11.25 / 10.99; danger 9.18 / 7.92 / 7.74; button label 13.03. HC dark: ink 19.64 / 17.65 / 14.34; ink-2 16.55 / 14.87 / 12.09; ink-3 14.29 / 12.84 / 10.43; indigo 13.55 / 12.17 / 9.89; danger 11.27 / 10.13 / 8.23; button label 13.55. Rules 18.57 (light) and 19.64 (dark). Focus double ring 21.00.

### 4.5 Themes and Opt-In

- Light is forced by default in every area (`next-themes` `defaultTheme="light"`, `enableSystem={false}`, as today; R-A16).
- A new **Display Settings** control (Theme: Light or Dark; High contrast on or off; Reduce motion on or off) is reachable from the public footer and the console user menu (R-A17).
- **Study mode is fixed to the light theme in both conditions** (lead decision, DR-019).
  - A participant-chosen dark theme would darken the whole 2D page but only the chrome and panel in 3D, because the scene keeps its lighting. That is a condition asymmetry, and it adds a self-selected covariate.
  - Light mode is also the better default for reading (R-A16).
  - **High contrast** stays available in study as an accessibility accommodation. It is offered identically before learning in both conditions, applies to the same surfaces in both, and is logged on the study session through the study engine (not through telemetry, whose events require an allocated condition). Reduce motion is moot in study, which has no motion.
  - The classes written on `<html>` are the same in both conditions.

### 4.6 Non-Colour Tokens

| Token | Value |
|---|---|
| `--radius-control` | 3px (buttons, inputs, badges) |
| `--radius-card` | 2px (cards, dialogs); figure frames and the knowledge column 0 |
| shadows | none on any study surface; console popovers and dialogs `0 8px 24px -12px rgb(33 29 25 / 0.28)` |
| `--ease-museum` | `cubic-bezier(0.22, 0.61, 0.36, 1)` (kept) |
| `--dur-1 / --dur-2 / --dur-3` | 120ms / 150ms / 200ms |
| `--z-*` | unchanged scale (canvas 0 to skip-link 100) |
| `--measure` | 34rem (544 px) |
| `--hang` | 2.25rem (36 px) |
| `--studybar-h` | 3.5rem (56 px) |
| `--notice-h` | 2.5rem (40 px) |

---

## 5. Typography

### 5.1 Fonts (next/font, self-hosted)

All fonts are loaded in `src/app/layout.tsx` through `next/font/google`, which downloads at build time and self-hosts (R-T10); the CSP (`font-src 'self' data:`) is unchanged.

| Family | next/font call | Role | Why |
|---|---|---|---|
| **Source Serif 4** | `Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], style: ["normal"], display: "swap", variable: "--font-serif" })` (variable wght, no weight list) | Display, page and concept titles, section headings, the verbatim quote, home deck, wordmark | A text serif with an optical-size axis (R-T9), so one file serves the 80 px hero and the 32 px concept title. It replaces Cormorant Garamond, a display face whose hairlines break down at panel sizes. |
| **Inter** | `Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" })` (variable wght, normal only) | Claims, UI, controls, tables, source lines, captions, data | Already in the stack, so claims change least (section 2.6). The served file has `tnum` and `pnum` (measured GSUB features: `calt ccmp dnom frac locl numr pnum tnum`). |
| Monospace | system stack `ui-monospace, "Cascadia Code", Consolas, monospace` | Participant codes, IDs, timestamps, BibTeX | No download. |

Not loaded: Cormorant Garamond (removed), any italic file, any mono webfont. `font-synthesis: none` is set on study roots so no faux italic or bold appears in study text.

**Features the served file lacks are never used.** The Source Serif 4 file Google serves has no `onum`, `lnum` or `smcp` (R-T8), and CSS small caps would fall back to fake ones (R-T6, R-T7). So there is no `font-variant-caps`, no old-style figures and no small caps anywhere. Eyebrows and running heads are tracked uppercase Inter.

**Scripts other than Latin.** A count over `content/**/*.json` finds 0 Devanagari, 0 Bengali, 0 Gujarati and 0 Telugu characters (local terms are romanised), 1 Latin Extended character (`ć`) and 12 Arabic-script characters: 8 in a Sindhi/Persian verbatim quote in `content/traditions/ajrakh/tradition.json` and 4 in `content/review/media-proposals.json` (curation file, not learner-facing). Rules:

- Latin Extended: `next/font/google` emits `unicode-range` `@font-face` rules for the family's subsets and preloads only the listed `subsets`, so a latin-ext file downloads only when such a glyph renders.
- Indic scripts: no webfont is loaded while the count is zero. WP0 adds `tests/content/scripts.test.ts`, which fails as soon as any Indic codepoint appears. The team must then add the matching Noto Serif face (`Noto_Serif_Devanagari` and so on, `preload: false`, single script subset) for **every** script present, never for one tradition only, so no tradition's local terms fall back to a different system font.
- Arabic script: the system stack `"Segoe UI", "Noto Naskh Arabic", "Geeza Pro", serif`, inside `<span lang="sd" dir="rtl">` (or the language the content declares). It renders through the same component in both conditions, so any device difference is identical across conditions.
- The arrow `→` (9 occurrences) is outside Inter's latin subset and falls back to the system font identically in both conditions.

**Budget (measured).** Preloaded per page: Inter latin variable 48,432 bytes (measured in the current `.next/static/media`) plus Source Serif 4 latin variable with opsz 122,360 bytes (measured from the Google Fonts API response) = **170,792 bytes in 2 files**. Today's build preloads 3 files (125,512 bytes) and ships 16 font files. Budget: **at most 2 preloaded font files, at most 176,000 bytes preloaded, and at most 230,000 bytes of fonts transferred on any page** (latin-ext included). If the Source Serif 4 file exceeds 125,000 bytes after a Next upgrade, drop `axes: ["opsz"]`.

### 5.2 Type Scale

Sizes are rem at a 16 px root; every line height is a multiple of 4 px. Headings pass through `titleCase()` (`src/lib/text/title-case.ts`); buttons and links use sentence case, as today.

**Knowledge tokens** (study; identical in both conditions; consumed only through the shared components):

| Token | Face | Size / line height | Weight | Other |
|---|---|---|---|---|
| `text-title` | Source Serif 4 | 2rem / 2.5rem (32/40); under 520 px 1.75rem / 2.25rem | 600 | tracking -0.01em, `text-wrap: balance`. The concept h1 in 2D AND in the 3D panel (fixes 30 px vs 25.6 px today). |
| `text-reading` | Inter | 1.125rem / 1.75rem (18/28, ratio 1.556) | 400 | tracking 0; proportional lining figures; measure 34rem, about 60-64 characters (R-T1, R-T3; WCAG 1.4.8 leading). Claims, leads, task prompts, questions. |
| `text-claim-number` | Inter | 1.125rem / 1.75rem | 500 | `tabular-nums`, ink-3, right-aligned in the 2.25rem hang. |
| `text-quote` | Source Serif 4 | 1.125rem / 1.75rem | 400 | roman (no italic file), typographic quotation marks, 2 px indigo left rule. Same size as the claim. |
| `text-lead` | Inter | 1.25rem / 1.75rem | 400 | ink-2. |
| `text-h2` | Source Serif 4 | 1.5rem / 2rem | 600 | section and layer headings. |
| `text-h3` | Source Serif 4 | 1.1875rem / 1.75rem | 600 | |
| `text-eyebrow` | Inter | 0.8125rem / 1.25rem (13/20) | 600 | uppercase, tracking 0.06em, ink-3. Under `:lang(hi)`, `:lang(bn)`, `:lang(te)`, `:lang(gu)`, `:lang(sd)`: no uppercase, no tracking. Replaces the 10.5 px `kicker`. |
| `text-source` | Inter | 0.875rem / 1.25rem (14/20) | 400 | ink-3. The source line under each claim; wraps to at most 2 lines, never truncates mid-word. |
| `text-caption` | Inter | 0.9375rem / 1.5rem (15/24) | 400 | ink-2; begins with "Fig. n" in weight 600. |
| `text-credit` | Inter | 0.8125rem / 1.25rem (13/20) | 400 | ink-3; credit and licence line. |
| `text-ui` | Inter | 0.9375rem / 1.25rem (15/20) | 500 | buttons, tabs, nav, StudyBar. |
| `text-timer` | Inter | 0.9375rem / 1.25rem | 500 | `tabular-nums lining-nums`. |
| `text-dl-label` | Inter | 0.8125rem / 1.25rem | 600 | uppercase, 0.06em, ink-3. |
| `text-dl-value` | Inter | 0.9375rem / 1.5rem | 400 | ink. |

**Public, console, CMS and admin extras:**

| Token | Face | Size / line height | Weight | Other |
|---|---|---|---|---|
| `text-display-1` | Source Serif 4 | clamp(2.75rem, 1rem + 5.2vw, 5rem) / 1.04 | 400 | tracking -0.02em, opsz auto. Home h1 only. |
| `text-display-2` | Source Serif 4 | 2.5rem / 3rem | 400 | public section h2. |
| `text-deck` | Source Serif 4 | 1.375rem / 2rem | 400 | public subtitle, ink-2. |
| `text-body` | Inter | 1rem / 1.5rem | 400 | console prose; public long-form uses `text-reading`. |
| `text-table` | Inter | 0.875rem / 1.25rem | 400 | numbers `tabular-nums lining-nums`, right-aligned (R-T5, R-T11). |
| `text-stat` | Inter | 1.75rem / 2.25rem | 500 | `tabular-nums`. |
| `text-mono` | system mono | 0.8125rem / 1.25rem | 400 | IDs, codes, timestamps. |
| chart labels | Inter | 0.75rem / 1rem ink-3, and 0.875rem / 1.25rem ink | 400 / 500 | exactly two label levels (R-T18). |

**Numeral policy.** Proportional lining figures in prose (claims hold dates, GI numbers and quantities). Tabular lining figures in every number a reader compares: tables, timers, counts, stats, axis ticks, "Question 4 of 20", claim numbers. Old-style figures are never used (R-T8).

**Weights shipped:** Source Serif 4 at 400 and 600; Inter at 400, 500 and 600 (all from variable files). In study, no heading exceeds about twice the claim size (R-T4): title 32 px against claim 18 px.

---

## 6. Grid and Spacing

- **Baseline** 4 px. **Spacing scale** 4, 8, 12, 16, 24, 32, 48, 64, 96 (96 = one block cell).
- **Breakpoints**: 390 (minimum tested), 520 (`xs`, existing), 768, 1024, 1280, 1440.
- **Page gutters**: 16 px under 520, 24 px from 520 to 1023, 32 px from 1024.
- **Public and console grid**: 12 columns, max content 1280 px (console fluid to 1440), 24 px column gutters.
- **Editorial frame** (About, Colophon, Privacy, Accessibility): a 34rem text column, a 3rem gap and a 15rem margin column for sidenotes and marginal citations (R-T12 keeps notes next to text). Under 1024 px sidenotes become inline notes directly after their paragraph.

**Study knowledge frame (identical in both conditions):**

| Element | Value |
|---|---|
| Knowledge column (the `KnowledgeSheet`) | width `min(39.25rem, 100% - 2 x gutter)` = 34rem measure + 2.25rem hang + 2 x 1.5rem padding (628 px) |
| Claim measure | 34rem (544 px) at 1024 px and wider; below 1024 px the hang folds inside, so the measure is the column width minus the hang and padding, identically in both conditions |
| Claim number | right-aligned in the 2.25rem hang, top-aligned to the first line |
| Claim spacing | 24 px, with a 1 px `--rule` between claims |
| Source line | 4 px below the claim text |
| Figure | width = measure, aligned to the claim text (not the hang) |
| Section spacing | 48 px |
| Chrome above content | `--notice-h` (when the AccessNotice shows) + `--studybar-h` + 2 px running-head rule, sticky, in both conditions |

**2D page layout:** the KnowledgeSheet sits centred in the viewport on `--ground`, like a manuscript page. The pager is part of the sheet (9.11). On concept pages there is no breadcrumb above the sheet (it would push the h1 down in 2D only and fail P6); the 2D route back to the parent is an "Up to <parent>" control in the StudyBar's condition navigation group. Breadcrumbs remain on 2D index, tradition, category and search pages, which have no 3D counterpart that is measured. Nothing knowledge-bearing sits outside the sheet (this removes the 1100 px slab with an empty right half, and avoids a 2D-only side rail).

**3D panel layout:** at 1024 px and wider the same KnowledgeSheet docks right, full height below the chrome, opaque `--ground`, 1 px `--rule-strong` left border, no radius, no shadow, internal scroll. Below 1024 px, and at 200% zoom, it becomes full-width and full-height below the chrome (it covers the scene), exactly mirroring the 2D column. There is no 70dvh bottom sheet: a partial sheet would show fewer lines per screen than 2D.

**Equal reading viewport.** In 2D the page scrolls under the sticky chrome; in 3D the panel scrolls inside a container whose height is the viewport minus the same chrome. The number of claim lines visible in the first screen is therefore equal (parity check P8).

---

## 7. Graphic Language

The language is built from what the three study traditions share: the carved block (R-C18), its visible footprint (R-C7), registered layers (R-C8) and corner registration marks (R-C9), and white as protected space (R-C22). It never uses a tradition's signature: no stars or rosettes on indigo (R-C12), no indigo-with-madder brand duo (R-C1, R-C13), no floral butis or floral offset rows (R-C10), no mehrab arches, arched cards or arched doorways (R-C14), no crackle or veining texture (R-C15), no tradition colour codes or logos (R-C16), no tinted grounds (R-C4, R-C5, R-C21).

### 7.1 Block Module

- Unit 8 px; decorative cell 96 px. Tiles meet edge to edge with exact seams. No jitter, offset plates, faked misregistration, grain, wear, gradients, bevels or shadows on any pattern (a design judgement: flat, square-edged tiles).

### 7.2 Knock-Out Band (Public and Research Console Only)

Ground-coloured geometry reversed out of a solid `--band` field (R-C22). Always inline SVG, `aria-hidden="true"`, `focusable="false"`, documented on the Colophon as "decorative pattern, not craft content".

24 px header band (public header):

```html
<svg class="ie-band" aria-hidden="true" focusable="false" width="100%" height="24">
  <defs>
    <pattern id="ie-band-24" width="48" height="24" patternUnits="userSpaceOnUse">
      <rect class="ie-band__field" width="48" height="24" />
      <path class="ie-band__lozenge" d="M12 7 L17 12 L12 17 L7 12 Z" />
      <circle class="ie-band__dot" cx="36" cy="12" r="2" />
    </pattern>
  </defs>
  <rect width="100%" height="24" fill="url(#ie-band-24)" />
</svg>
```

96 px field tile (48 px console header band, empty-state art, Colophon swatch frame), on a STRAIGHT grid (lead decision): a half-drop of offset rows is the arrangement R-C10 ties to Sanganeri, and the public identity must not read as one tradition's grammar.

```html
<pattern id="ie-field-96" width="96" height="96" patternUnits="userSpaceOnUse">
  <rect class="ie-band__field" width="96" height="96" />
  <path class="ie-band__lozenge" d="M24 19 L29 24 L24 29 L19 24 Z" />
  <path class="ie-band__lozenge" d="M72 67 L77 72 L72 77 L67 72 Z" />
  <circle class="ie-band__dot" cx="72" cy="24" r="2" />
  <circle class="ie-band__dot" cx="24" cy="72" r="2" />
</pattern>
```

```css
.ie-band__field   { fill: var(--band); }
.ie-band__lozenge { fill: var(--ground); fill-opacity: 0.9; }  /* light: ground on #24406E */
.ie-band__dot     { fill: var(--ochre-deco); }                 /* 4.01:1 light, 5.33:1 dark */
.dark .ie-band__lozenge { fill: #EFE9DE; fill-opacity: 0.85; }
.a11y-contrast .ie-band, .a11y-contrast .ie-field { display: none; } /* replaced by a 2 px ink rule */
@media (forced-colors: active) { .ie-band, .ie-field { display: none; } }
```

The pattern `id` values are generated with `useId()` so several bands on one page never collide. The `<defs>` file stays under 2 KB.

### 7.3 Registration Ticks (Public, Colophon and CMS Proof Frame Only)

Four L-shaped corner ticks after the printer's corner registration marks (R-C9). Each tick is a 12 x 12 px L, 1.5 px stroke `--ink`, square caps, its corner placed 6 px outside the framed box's corner. Component `RegistrationTicks` renders four small inline SVGs inside a `position: relative` frame, all `aria-hidden`:

```html
<span class="ie-ticks" aria-hidden="true">
  <svg class="ie-tick ie-tick--tl" width="12" height="12" viewBox="0 0 12 12"><path d="M0.75 12 V0.75 H12"/></svg>
  <svg class="ie-tick ie-tick--tr" width="12" height="12" viewBox="0 0 12 12"><path d="M0 0.75 H11.25 V12"/></svg>
  <svg class="ie-tick ie-tick--bl" width="12" height="12" viewBox="0 0 12 12"><path d="M0.75 0 V11.25 H12"/></svg>
  <svg class="ie-tick ie-tick--br" width="12" height="12" viewBox="0 0 12 12"><path d="M0 11.25 H11.25 V0"/></svg>
</span>
```

```css
.ie-tick { position: absolute; overflow: visible; }
.ie-tick path { fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linecap: square; }
.ie-tick--tl { top: -6px; left: -6px; }    .ie-tick--tr { top: -6px; right: -6px; }
.ie-tick--bl { bottom: -6px; left: -6px; } .ie-tick--br { bottom: -6px; right: -6px; }
.a11y-contrast .ie-ticks { display: none; }
```

Never in study mode, in either condition. The study figure frame is a plain 1 px `--rule` box in both.

### 7.4 Outline-Then-Fill Diagrams (Public and Console)

Diagrams (Figure 1, the About study-flow figure, Explore schematics, empty-state art) are drawn as two registered layers like rekh and datai (R-C8): a 1.5 px `--ink` outline layer exactly over a flat fill layer at 0 offset. Fills are `--sunk`, `--wash` or `--indigo` only (never madder beside indigo). Text in diagrams is Inter 13/600 ink or Source Serif 600. Every diagram has a text equivalent (a list or table) next to it.

### 7.5 Rule System (All Areas, Including Study)

- 2 px `--ink` running-head rule under the public header, the console top bar and the StudyBar (identical in both conditions).
- 1 px `--rule` hairlines between claims and list rows.
- Booktabs tables: 1.5 px `--ink` top and bottom rules, 1 px `--ink` midrule under the header row, no vertical rules, no zebra.
- Public section heads may carry a 2 px `--madder` rule above them (public only).
- Rules are drawn with `border`, not background fills, so they survive `forced-colors`.

### 7.6 Numbering

Claims numbered per concept (1, 2, 3 ...); figures "Fig. n" per concept view; public photographs "Plate n"; dashboard charts "Figure n"; tables "Table n". Lining tabular figures.

### 7.7 Neutral Tradition Marker

Every tradition named in text may carry the identical marker: a 10 x 10 px square, 1.5 px `--ink` border, no fill, `margin-inline-end: 6px`, `vertical-align: -1px`, `aria-hidden`. Same for all six keys. No tradition colours, icons or motifs anywhere (R-C16).

### 7.8 Imagery

Only real, licence-checked photographs, always with caption, credit and licence (R-H5). No stock photographs, no AI images, no photographs as texture, no texture behind text, no swatch captioned as a dye colour (R-C6).

---

## 8. Motion Policy

CSS only. No animation library is added; `tw-animate-css` stays only for shadcn `data-state` transitions in console dialogs and menus.

| Zone | Allowed |
|---|---|
| Study (`/learn/*`, `/study/*`) | **Nothing.** Zero transitions and animations on chrome and content in both conditions: citation record, lightbox, hint panel, tabs, panel open and close, onboarding screens and the reading-progress bar all change instantly. Enforced by `.a11y-reduce-motion` on both shells, a lint rule and parity check P12. The 3D camera walk is the experimental manipulation and is governed by `docs/architecture/immersive-rendering-quality.md`, not by this policy; overlay chrome on top of it never animates. No camera motion while the panel is open. |
| Console, CMS, admin | Dialog, sheet, dropdown: 150 ms opacity plus a 4 px scale; row expand 120 ms. Charts `animation: false`. Skeleton pulse replaced by a static `--sunk` block. No hover lifts, no translate-y on press. |
| Public | Link underline thickens 1 px to 2 px over 120 ms. Figure 1 draws its two branch strokes once (stroke-dashoffset, 700 ms, `--ease-museum`) when it first enters the viewport (IntersectionObserver adds a class). Plates fade from opacity 0.001 to 1 over 200 ms on image load only, never the first plate (no LCP delay). Nothing moves more than 8 px, nothing loops, no parallax, no scroll-linked motion (R-A11), no count-up numbers. |

`prefers-reduced-motion: reduce` and `.a11y-reduce-motion` clamp every duration to 0.01 ms (existing rule) and render Figure 1 fully drawn (R-A10). The reduce-motion setting never changes the 3D camera behaviour itself (that would alter the manipulation for a subgroup); camera rules stay in the rendering-quality document.

---

## 9. Components

Primitives live in `src/components/ui` and change for everyone. Shared knowledge components live in `src/components/knowledge` and are imported by BOTH conditions; no condition-specific style props exist on them.

### 9.1 Button (`ui/button.tsx`)

- Default height 44 px (`h-11`), padding 0 20 px, radius 3 px, Inter 15/500, sentence case, optional 20 px lucide icon (stroke 1.75) on the left with an 8 px gap.
- Variants: **primary** `--indigo` fill, `--on-indigo` label, hover and pressed `--indigo-hover`; **outline** 1 px `--rule-strong` border, `--ink` label, transparent fill, hover `--sunk`; **ghost** no border, hover `--sunk`; **link** `--indigo`, underline 1 px at 3 px offset, 2 px on hover; **destructive** 1 px `--danger` border and label, filled `--danger` with an `--on-indigo` label only inside the confirm dialog (`#FBF8F2` on `#A3242C` 6.96 light; `#14171D` on `#F2918C` 7.86 dark; never white on dark danger, which is 2.28).
- Sizes: `default` 44; `icon` 44 x 44 with a 20 px glyph; `compact` 36 px visual height, console and CMS dense tables only, keeping a 44 x 44 hit area with `::after { inset: -4px }`. Sizes `xs`, `sm`, `icon-xs`, `icon-sm`, `lg`, `icon-lg` are removed (call sites migrate in their own package; WP0 keeps deprecated aliases that map to `default`/`icon` until WP8).
- No `active:translate-y`. Disabled: `--ink-3` label, `--rule` border, `aria-disabled` and focusable when it needs to explain why.
- Focus (all focusables, global rule): 2 px solid `--indigo` outline, 2 px offset, plus a 4 px `--ground` halo box-shadow (R-A5). HC: the existing black/white double ring. `scroll-padding-top` equals the sticky chrome height so focus is never hidden under it (R-A6).
- Keeps `role` and `data-slot="button"` (tests/unit/button.test.tsx).

### 9.2 Card (`ui/card.tsx`)

- `--surface`, 1 px `--rule` border (replacing `ring-1`), radius 2 px, no shadow, padding 24 px (16 px under 520 px). Optional "plate head": a 2 px `--ink` top border and an eyebrow.
- Parallel cards: grid stretch, `flex-col`, actions `mt-auto`; the title zone reserves two lines (`min-height: 2lh`) so a one-line title (Sanganeri) leaves no gap. Existing `tests/e2e/alignment.spec.ts` must keep passing (actions aligned within 1 px at 1280).
- Interactive cards (whole card is a link): border `--rule-strong` (3.72:1), hover `--sunk`.

### 9.3 Table (`ui/table.tsx`, booktabs)

- Optional caption above: "Table n." in Inter 15/600 then the title in Inter 15/400; source note below in `text-credit`.
- 1.5 px `--ink` top and bottom rules; header row in `text-dl-label` with a 1 px `--ink` midrule; row separators 1 px `--rule` (all rows in the console, where rows are long; omitted for 6 rows or fewer on public pages).
- No zebra, no vertical rules. Numbers right-aligned, `tabular-nums lining-nums`; units in the header ("Time (min)").
- Rows 44 px (36 px compact in dense console tables, with 44 px interactive cells). Console row hover `--sunk`; selected row `--wash` plus a 2 px indigo bar and a check icon.
- Wide tables scroll inside their own labelled region (`role="region"`, `tabindex="0"`, `aria-labelledby` the caption), never the page; under 640 px, console list tables may switch to stacked label/value cards.

### 9.4 Badge (`ui/badge.tsx`)

No pills. 24 px tall, radius 2 px, 1 px `--rule-strong` box, Inter 12/600 uppercase 0.06em, `--ink-3`. Status badges (console, CMS, admin only) add a 12 px icon and colour the label with `--ok`, `--warn` or `--danger`, always with the word. Never coloured per tradition. The study verification badge ("Under Review") is this component, in the same position in the metadata list, in both conditions.

### 9.5 Inputs (`input`, `select`, `textarea`, `checkbox`, `radio-group`, `label`, `field`, `form`)

- Height 44 px, 1 px `--rule-strong` border, radius 3 px, `--surface` fill, Inter 16 px (avoids iOS zoom).
- Label above in Inter 14/500 `--ink`; help text in `text-credit`; error message in `--danger` with an icon, `aria-invalid`, `aria-describedby`. Error summary at the top of long forms receives focus.
- Checkbox and radio: 20 px box inside a full-row label with a 44 px minimum height. Checked state is an `--indigo` fill with an `--on-indigo` mark, so on a selected `--wash` row the control boundary stays at least 3:1 (indigo on wash 8.25 light, 7.01 dark; the unfilled `--rule-strong` boundary is only 2.82 on dark wash, which is why an unchecked control is never shown on wash).

### 9.6 Tabs (`ui/tabs.tsx`) and `LayerTabs` (`knowledge/layer-tabs.tsx`)

- Underline style only (the pill variant is removed). Each tab min 44 px tall, padding 0 16 px, Inter 15/500; inactive `--ink-3`, active `--ink` with a 3 px `--indigo` bottom border and `aria-selected`; the tablist sits on a 1 px `--rule` baseline.
- Wraps to further rows; never scrolls horizontally (every layer name stays visible at 390 px).
- Roving tabindex, arrow keys, Home and End (ARIA tabs pattern).
- `LayerTabs` reads the layer list and order from one constant in `src/features/learning/labels.ts` (Overview, Artisan, Process, Science, Compare) and is the only layer navigation in both conditions. In 2D this replaces the concept-page layer disclosures; the tradition-page section disclosures stay disclosures (they are a list of sections, not layers of one concept), restyled per 9.13.

### 9.7 Alert and `StateMessage` (`knowledge/state-message.tsx`)

- Alert: `--ground` fill, 1 px `--rule-strong` border, 4 px left border in the status colour (`--ink` for info), 20 px icon, a bold word ("Error", "Note"), body Inter 15.
- `StateMessage` is the ONE error, empty, unavailable and loading component for study surfaces: 2D content-unavailable and practice-unavailable pages, every 3D screen (onboarding, help, paused, context lost, failed, no WebGL, loading) and `/study` errors. Same copy source, same 32 px outline icon, Source Serif h1 or h2, one sentence in `text-reading`, one 44 px primary action. Loading in study is a static `--sunk` block, not a pulse.

### 9.8 `CitationNote` and `CitationRecord` (`citations/citation-disclosure.tsx`, shared)

- **Collapsed** (one per claim, directly under it): a full-width native `<button>`, min-height 44 px, left-aligned, no border. Content: a 16 px lucide `ChevronRight` (rotates to `ChevronDown` instantly when open), the word "Source" in `text-eyebrow`, then the short label in `text-source`, for example "Office of the Controller General, Year · p. 2" (the real year comes from the source record). The short label is **derived** in the view layer (`shortCitationLabel()` in `src/features/knowledge/read/view.ts`: first author or publisher short name, year, locator); it is not hand-written into `content/`. It wraps to at most two lines and is never truncated mid-word.
- **Expanded**: renders inline directly under the note, at the claim measure, in both conditions:
  1. the verbatim quote in `text-quote` (Source Serif 4 18/28) with a 2 px `--indigo` left rule and 16 px inset, inside typographic quotation marks; supporting passages each as their own block;
  2. a two-column `<dl>` (label column 9rem, `text-dl-label`; values `text-dl-value`): Title, Author, Publisher, Year, Locator, Kind of Source, Reliability, Accessed. Under 520 px each label stacks over its value;
  3. "Open the source" as a 44 px link-styled button with an external-link icon.
- Escape closes the record and returns focus to the note. Telemetry `citation_opened` / `citation_closed` as today. One activation to reach the record from any claim, in both conditions.
- When the same source supports several claims, every claim still shows its own note (no "first occurrence only" rule, which would make rendering depend on layout).

### 9.9 `KnowledgeFigure` and `FigureLightbox` (`knowledge/knowledge-figure.tsx`, `knowledge/figure-lightbox.tsx`)

- `<figure>` at measure width, aligned with claim text, rendered immediately after its anchor claim (asset link role `illustration`, `position` = zero-based index of the anchor claim within the concept's claim list). At most one figure per concept in a study bundle.
- **Fixed 3:2 slot** (`aspect-ratio: 3 / 2`), `--sunk` mat, 1 px `--rule` outline, image `object-fit: contain` (portrait and square images letterbox inside the same box), so every study figure has the same footprint whatever the source aspect. No registration ticks, no rounded corners, no shadow.
- Image: `next/image`, explicit `width`/`height`, `sizes="(min-width: 1024px) 544px, calc(100vw - 32px)"` (a string literal: `var()` is not valid in `sizes`; the same literal in both conditions because it lives in the shared component), AVIF then WebP, `decoding="async"`. Loading policy identical in both conditions: the first figure of a concept view is `loading="eager"` without `fetchpriority`; all others `loading="lazy"`.
- `figcaption`, under the image: line 1 "Fig. n" (600) + caption in `text-caption`; line 2 credit and licence in `text-credit`, for example "Photo: Name, Institution · CC BY-SA 4.0" with the licence linked (R-H5). Caption at most 180 characters (CMS-enforced). A caption must restate or point to its anchor claim; it never adds knowledge (R-L9, R-H6).
- Alt text: required, about 15 words, describes what is visible and never repeats the caption (R-H6) or adds knowledge absent from the claims.
- An **Enlarge** outline button, 44 x 44 with a `Maximize2` icon and the accessible name "Enlarge figure n", right-aligned in the caption row (not overlaid on the image). The image itself is not a second trigger, so there is exactly one control in both conditions.
- **Lightbox**: native `<dialog>` modal with focus trap; **opaque** `--ground` full viewport (an opaque backdrop is required: a translucent one would show a page behind it in 2D and the scene in 3D). Image at natural size capped at **768 px on the long edge for every study figure** (R-C20; one cap for all figures so no tradition's images look sharper), centred; caption and credit repeated below; Close button 44 x 44 top-right with the label "Close"; Escape closes and returns focus to the Enlarge button. No zoom gestures, no animation. One activation from the figure, one to return.

**Figure kinds (DR-018).** A study figure is one of two kinds, rendered by the same `KnowledgeFigure` frame (slot, caption, credit line, Enlarge button and lightbox are identical):

- **`diagram` (now).** An explanatory SVG generated from the verified knowledge graph. It shows nothing that the concepts, claims and relationships do not state.
  - **Types** (same set for every study tradition):
    - *Process sequence*: the PRECEDES chain, with stage titles as node labels.
    - *Materials and tools by stage*: the USES/REQUIRES edges of the stage concepts.
    - *Colour mechanism*: the chain from dye and mordant concepts to outcome concepts, through SCIENTIFICALLY_EXPLAINED_BY / PRODUCES.
  - **Style:** ink lines on the 3:2 `--sunk` mat, nodes as square-cut boxes with Title Case concept titles in `text-caption`, the relationship type as a small label on each edge, no colour coding beyond ink and one indigo accent for the current concept, identical in both conditions.
  - **Text:** SVG text is selectable; the figure's alt text is a generated textual equivalent (the node sequence in order).
  - **Caption and credit:** the caption names the concepts shown and the anchor claim. The credit line reads "Diagram generated from the project's knowledge graph (snapshot <label>)".
  - **Lightbox:** shows the same SVG, scaled to the same 768 px long edge.
- **`photo` (later).** A rights-cleared photograph (asset link role `illustration`), under all the rules above, once licences are cleared (`content/review/media-proposals.md`).
- **Balance applies per kind.** Each study tradition gets the same diagram types in the same sections. Process-sequence and materials diagrams anchor on the tradition's process section; the colour-mechanism diagram anchors on its science section.
- **Structure-diagram switch.** `figures.structureDiagrams` (default on) is a protocol setting that switches the structure diagrams off in BOTH conditions together, so researchers can rule out the 2D condition gaining structural visualisation (DR-018).

### 9.10 `ClaimList` (`knowledge/claim-list.tsx`)

`<ol>` of claims; each `<li>` holds the hanging number (`text-claim-number`, `aria-hidden` because the `<ol>` already numbers for assistive technology), the claim `<p class="text-reading">`, its `CitationNote`, then any figure anchored to it. 24 px between claims with a 1 px `--rule` separator. Replaces `src/features/learning-2d/ui/claim-list.tsx` and the inline claim markup in `info-panel.tsx`.

### 9.11 `KnowledgeSheet` (`knowledge/knowledge-sheet.tsx`)

The one container for a concept in both conditions:

1. Header row: eyebrow ("Material · Step 3 of 9"), `text-title` h1, and a **reserved 44 x 44 action slot** top-right (holds Close in 3D; empty but reserved in 2D, so title wrapping is identical).
2. Metadata `<dl>`: Local Terms (each in `<span lang="…">`, roman), Tradition (with the neutral marker), Category, Status (verification badge).
3. `LayerTabs`.
4. The field: running head "From the Sources" (`text-eyebrow`), `ClaimList` with figures and citation notes, comparison blocks.
5. `RelatedConcepts` (9.12) at the end of the column.
6. Pager (prev/next).

Reading progress: a 2 px `--ink` on `--rule` bar (9.71:1 light, 9.95:1 dark) directly under the header row, labelled `role="progressbar"`, no transition. It measures the sheet's own scroll container in both placements (the window in 2D, the panel in 3D), so it is present and identical in both conditions. It replaces the 2D-only `reading-progress.tsx` bar.

Focus on open: when a concept opens, focus moves to the sheet h1 (`tabindex="-1"`) in BOTH conditions (2D after client navigation, 3D on panel open), so the keyboard path from concept open to the first claim and CitationNote is identical (P13).

Region semantics: `<section aria-labelledby={titleId}>`. Exactly one h1 per view: on a concept view the h1 is the concept title in both conditions. In 3D, while no concept is open, the room name in the StudyBar is the view's h1; when the panel opens, the room name becomes a non-heading `aria-live` text and the panel title is the h1.

### 9.12 `RelatedConcepts` (`knowledge/related-concepts.tsx`)

At the end of the knowledge column in BOTH conditions (never a 2D side rail). Grouped by relation verb: the verb as an h3 in `text-h3` ("Is Affected By"), then the related concept links in Inter 15/500 `--indigo`, underlined, 44 px rows. One "About these links" disclosure (44 px) per group replaces the four-fold "About this link". In 2D a link navigates; in 3D the same-looking link walks to the exhibit (the walk is the manipulation). Replaces both copies of `RelationDetails`.

### 9.13 Section Disclosure (2D tradition page only, `features/learning-2d/ui/disclosure-section.tsx`)

56 px rows within the sheet width: a 20 px chevron in a 44 px box at the left edge, the section label in `text-h2`. No concept count in study mode (12.3 rule 13; the museum rooms show none). The museum mirrors the same section order as rooms. Instant open, logs `information_layer_opened` as today.

### 9.14 `StudyBar` (`learning/study-bar.tsx`, shared)

56 px, opaque `--ground`, 2 px `--ink` rule below, the same component in both conditions. Contents, in DOM and visual order:

1. Wordmark "Immersive Episteme" (Source Serif 4 600, 18 px) as plain text, not a link (no outbound navigation in study).
2. Location slot: 2D, the current page title (non-heading); 3D, the room name (h1 when no concept is open, see 9.11), Source Serif 4 600 18 px, truncated with an ellipsis on one line.
3. Shared controls: Hint (`HintControl`), Time Left (`LearningTimer`, `text-timer`), Finish. Same labels, same 44 px buttons.
4. Condition navigation group (allowed to differ, same button style and size): 2D Contents, Search and, on concept pages, "Up to <parent>"; 3D Plan, Controls Help, Pause. Text labels visible from 1024 px; icon plus `aria-label` and tooltip below.

A skip link "Skip to content" (same label in both) targets the knowledge column (2D) or the panel when open, otherwise the scene region (3D).

### 9.15 `AccessNotice` (`shell/learning-shell.tsx`)

The demo notice and the "under review" notice merge into one 40 px strip (`--sunk`, `text-ui`, an "End demo" 44 px ghost button where applicable), rendered in the same slot above the StudyBar in both conditions. Participants see none in either condition.

### 9.16 Navigation and Shells

- **Public header**: wordmark (Source Serif 4 600, 22 px) left; links About, Explore, Accessibility, Privacy, Staff sign in, all plain text links in Inter 15/500 with 44 px hit areas, the current page underlined 2 px indigo ("Staff sign in" is no longer a pill). 2 px ink rule below, then the 24 px knock-out band. Under 768 px the links fold into a 44 px "Menu" button opening a sheet.
- **Public footer**: colophon style: one-line project statement, links (Colophon, Accessibility, Privacy, Image credits), Display Settings button, and institution lines only when configured (13.1).
- **Console shell**: 15rem left rail on `--sunk` with the wordmark, an eyebrow area label ("Research Console", "Content Console", "Admin Console"), 44 px nav links (active: `--ink` 600 with a 3 px indigo left rule; no card, no shadow). Top bar 56 px (area switcher as underline tabs; user menu with name, role badges, Display Settings, sign out) with a 2 px ink rule. Session-dependent parts stay inside `<Suspense>` (cacheComponents).
- **PageHeader** (`shell/page-header.tsx`): eyebrow, h1 in `text-title`, description in `text-body` `--ink-2` at 40rem, actions right-aligned (wrapping under 768 px). Research pages place a 48 px knock-out band above it; CMS and admin use a plain 2 px ink rule. `PlaceholderNotice` (the dashed box) is deleted; sections without real content are omitted.
- **Study shell**: wordmark, "Study" eyebrow, "Step n of N" (`tabular-nums`), 2 px ink rule, a 40rem single column on `--ground`, no outbound navigation, footer "Ask the study facilitator".
- **Breadcrumb**: single line; the middle crumbs collapse to an ellipsis button that reveals them; full path in `title`. Under 520 px it shows "← Parent" only.
- **Pager**: two equal-width 64 px cards (grid), label "Previous" or "Next" in `text-eyebrow`, title in `text-h3`, both left-aligned; the next card carries a right arrow.

### 9.17 Guidance (`learning/guidance.tsx`)

`HintControl` is a 44 px ghost button in the StudyBar; its panel is a non-modal `--surface` card with a 1 px `--rule-strong` border (no shadow), opening instantly. `StallCue` is a `--ground` card with a 4 px `--indigo` left border in normal mode; in high contrast the reserved yellow guidance cue applies, identically in both conditions.

### 9.18 Dialog, Sheet, Dropdown, Tooltip

`--surface`, 1 px `--rule-strong` border, radius 2 px, console shadow token; close buttons 44 x 44 with a visible "Close" label or tooltip. In study routes they open with no transition (the global study zero-motion rule overrides `tw-animate-css`).

### 9.19 Display Settings (`shell/display-settings.tsx`)

A dialog with three 44 px switches (Dark theme, High contrast, Reduce motion), each a labelled `role="switch"`. Writes classes on `<html>` and persists per device in `localStorage` (guarded by try/catch). Same component in every placement. In study mode only the High contrast switch is shown. Its choice is recorded on the study session by the study engine (DR-019), so no telemetry event type is needed.

### 9.20 Onboarding (`learning/onboarding.tsx`, shared)

One component renders the onboarding of both conditions: a `StateMessage`-style column at 40rem on `--ground`, an h1 in `text-title`, numbered steps in `text-reading`, a static line-art key of the controls (ink outlines, no animation, no photograph), and one 44 px primary "Start" action. Both conditions show the same number of screens and the same shared text (time limit, Hint, Time Left, Finish, how to open a citation and a figure); only the paragraph that explains movement differs (2D: Contents, Search and links; 3D: Plan, keyboard and mouse movement), and the two versions are written to the same length (within 10% of words, P23). Strings come from `src/features/learning/strings.ts`. The practice sessions in both conditions use the same component.

---

## 10. Data Visualisation Rules

The dashboard reads as the results section of a paper (R-T13, R-T14, R-T16).

**Frame.** Every chart is a `<figure>` with a numbered caption above or below: "Figure 2. Learning Gain by Condition" plus a "How to read" line that states n, the measure, the unit and the uncertainty ("Points show participant scores; bars show 95% CI; n = 24 per condition"). Captions never use causal wording. Under every chart a "Data table" disclosure (existing `charts.tsx` pattern) renders the same data as a booktabs table, and "Download CSV" is a 44 px outline button.

**Forms.** Dot-and-interval and strip plots for condition comparisons, showing every participant when n ≤ 200 (R-T19); slope charts for pre-test to post-test; small multiples for the three study traditions on identical scales, in canonical order, labelled by name; bars only for counts (enrolment, completion), always from zero. No pie, no 3D, no dual axes, no gradients, no red/green pairs.

**Encoding.** 2D = `--series-2d`, circle marker, solid 1.75 px line; 3D = `--series-3d`, square marker, 4-2 dashed line (R-A12). 2D is always first or left. Direct labels at line ends or beside groups instead of legends (R-A13). Traditions are never colour-coded. Heatmaps use the sequential indigo ramp with values printed in cells.

**Style.** ECharts SVG renderer (kept, loaded on demand in the console only); `animation: false`. Axis labels Inter 12 `--ink-3` `tabular-nums`; titles of axes Inter 14/500 `--ink` (two levels, R-T18); x axis line 1 px `--ink`; y gridlines `--grid`; no chart border; plot area on `--surface`. Tooltip as a booktabs mini-table, keyboard reachable. No links inside the plot area (series-2d vs indigo is only 1.59:1).

**Single palette source.** `src/components/analytics/use-echart.ts` builds its `VIZ` object from CSS custom properties through `getComputedStyle(document.documentElement)` at mount and on theme change, so charts follow light, dark and HC. The separate `#2a78d6 / #eb6834 / #1baf7a` palette is deleted.

**Stat tiles** become "Table 1. Enrolment and Completion": a booktabs row of figures (label `text-dl-label`, value `text-stat`, comparator line `text-credit`, e.g. "2D 41 · 3D 39" or "of 120 target"), baselines aligned by the existing three-row grid. No trend arrows coloured red or green.

**Live status.** `--ok`, `--warn`, `--danger` with an icon and a word ("Live", "Stale", "Error") and an "as of hh:mm:ss" timestamp in `text-mono` (R-T20). Replaces the raw `emerald` and `amber` classes.

**Precision.** Fixed decimals per column (scores 1 dp, effect sizes 2 dp, p values 3 dp with "< .001" as the floor). No more precision than the measure supports.

**Equivalence Monitor** (`src/components/parity/equivalence-monitor.tsx`, data from `src/server/research/parity/summary.ts`). A booktabs table: Check, 2D, 3D, Delta, Tolerance, Status (icon + "Pass" or "Fail"), plus a run line ("Interface parity run: commit abc123, 1280 x 800 light; 27 of 27 checks pass"). Fed only by stored parity reports: the existing content parity engine (`src/server/research/parity/engine.ts`) and the latest interface parity report produced by `tests/e2e/parity.spec.ts` in CI and committed as `analysis/parity/interface-parity.json`. If no real report exists, the component renders "No parity run recorded yet" and nothing else; it never shows sample or placeholder values.

---

## 11. Page Compositions

### 11.1 Public Home (`/`)

1. **Header**: running head (9.16) and the 24 px knock-out band.
2. **Hero** on the 12-column grid. Columns 1-7: eyebrow "A Research Platform" in `--ochre`; h1 "Immersive Episteme" in `text-display-1` (the smoke test's accessible name is unchanged); a deck in `text-deck` that names the subject: "Six traditions of Indian hand-block printing, Ajrakh, Bagh, Bagru, Dabu, Machilipatnam Kalamkari and Sanganeri, as one cited body of knowledge, learned two ways." Buttons on one row, equal width 12rem: primary "Explore the demo" and outline "Read the method"; full width and stacked under 520 px. Columns 8-12: **Plate 1**, a licence-checked photograph (for example a printer at work or a carved block) in a 4:5 box with registration ticks, "Plate 1." in `--madder` 600 then caption, credit and licence. Until a licensed photograph is approved, this slot holds a typographic specimen: one real dataset claim with its source line and open citation record, inside the same ticked frame (never a stock image).
3. **Figure 1. One Knowledge Model, Two Conditions** (full width, outline-then-fill SVG): left, a node cluster labelled with live counts (traditions, concepts, relations, sources), read from the database at request time inside `<Suspense>` with a static fallback that shows no numbers; two equal-weight branches lead to a miniature page (text lines with numbered claims) and a miniature floor plan (rooms as squares). The branch strokes draw on once (section 8). Under it a booktabs two-column table: "Identical in Both Conditions" (claims, citations, figures, typefaces and sizes, controls, timer, hints) and "Differs by Design" (spatial organisation, navigation). A text list repeats the diagram for assistive technology.
4. **Six Traditions**: a 3 x 2 grid of equal plates in canonical order (11.10). Each: a 3:2 photo slot, the neutral marker, the name in Source Serif 4 600 24 px, the region in `text-eyebrow`. Photographs are shown only when all six have an approved licensed image; otherwise all six show a typographic plate (the name on `--sunk`). Never some with and some without.
5. **Dataset at a Glance**: booktabs "Table 1" with counts by tradition (right-aligned, tabular), live from the database.
6. **Institution strip**: affiliation, paper citation, ethics approval reference, read from `src/config/institution.ts`; each field is hidden until the team sets it. Nothing is invented and nothing says "to be confirmed".
7. **Footer** as colophon (9.16).

At 390 px: the hero stacks with the plate after the deck; Figure 1 switches to a vertical flow; no horizontal scroll.

### 11.2 About (`/about`) and Colophon (`/about/colophon`)

Editorial frame (section 6). **About**: h1 "About the Project", lead, then sections in order: Purpose; Method, with Figure 2 (study flow: consent, pre-test, learning phase in 2D or 3D, post-test, delayed test) drawn outline-then-fill; Equivalence (embeds the read-only Equivalence Monitor, or the line "No parity run recorded yet"); Dataset and Citation Standard (table of the six traditions by concepts, claims, sources); Images and Licences; Team and Affiliations; Ethics and Data Protection; How to Cite (BibTeX in a `--sunk` mono block with a 44 px Copy button); Contact. Sidenotes in the margin column carry citations for any statement about the craft. A pull-quote (a real cited claim) in Source Serif 4 28 px with a 3 px `--madder` left bar. A section with no verified content is omitted entirely; the dashed placeholder box is removed.

**Colophon**: typefaces with specimens and the measured font budget; palette swatches, each framed by registration ticks and labelled "Design interpretation; not a measured or historical dye colour" (R-C6); the decorative pattern note; the full parity-check list (section 12.4) with the latest real result per check.

### 11.3 Explore (`/explore`)

PageHeader with the honest lede ("This is not part of a study and nothing you do is recorded as study data"). A full-width "What Is the Same" strip above both cards (`--surface`, 4 px indigo left rule): "Same claims, citations, figures, typefaces, controls and timer. Different: how you move through the knowledge." Two equal cards (columns 1-6 and 7-12; stacked at 390 px, 2D first; the fixed 2D-left order is documented on the Colophon): a 16:10 **line-art schematic** drawn in the outline-then-fill style (a page miniature; a floor-plan miniature), never a screenshot, so neither condition looks richer; the title in Source Serif 4 600 26 px; a description written to the same number of lines at 1280 px (reserved 3-line height); a 44 px primary button with `mt-auto`. Below: "Before You Start" with the keyboard and control summary for each condition in two equal booktabs tables, and the Display Settings button.

### 11.4 Accessibility, Privacy, Sign-In, Sign-Out, Forbidden

Editorial frame; Accessibility documents themes, high contrast, reduced motion, keyboard paths and the Display Settings control; Privacy as long-form text with a `<dl>` for contacts. Sign-in: a centred 24rem `--surface` card on `--ground` with 44 px fields, no band. Forbidden and sign-out use `StateMessage`-style layout with public chrome.

### 11.5 2D Learning Pages (`/learn/2d/*`)

**Chrome**: AccessNotice slot (40 px, or absent), StudyBar (56 px), 2 px ink rule. Nothing else stacks above content. The 2D navigation (Traditions, Categories, Comparisons, Search) lives in the StudyBar's condition group ("Contents" opens a sheet listing Traditions, Categories, Comparisons; "Search" opens a sheet with a 44 px input), so the chrome height equals 3D.

**Index**: a column at the sheet width, centred.
- "Traditions": the study traditions as equal typographic cards in canonical order, each with a reserved two-line title zone and the neutral marker. No photograph or plate slot on study index cards (the 3D entry has no equivalent, and section 3 allows no imagery in study other than knowledge figures). Concept counts are hidden in study mode (they are shown in neither condition, since the museum shows none).
- "Browse by Knowledge Category": a booktabs table (Category, one-line description; no count column in study mode, 12.3 rule 13), each row a 44 px link. Replaces the 13 pills and the orphan grid cells.
- "Comparisons Across Traditions": one table row link to the comparisons page, not an orphan button.

**Tradition page**: PageIntro with a labelled `<dl>` (Also Known As, Region, GI Status) one value per line; Overview claims through `ClaimList`; provenance as a `<dl>`, not a run-on line; the ten section disclosures (9.13) within the sheet width.

**Concept page**: the `KnowledgeSheet` (9.11) centred, directly under the chrome (no breadcrumb, see section 6); the reading-progress bar is part of the sheet and is identical in 3D (9.11).

**Comparisons**: claim text is never set in narrow matrix cells, because that would give 2D comparison claims a different measure and line count from the 3D Compare layer. Each comparison renders, at the sheet measure, one block per aspect: the aspect as an h2, then the three study traditions in canonical order, each as an h3 (tradition name with the neutral marker) followed by its claims through `ClaimList` with their `CitationNote`s, exactly the components the 3D Compare layer uses. An optional overview table above (rows = aspects, columns = the three traditions with equal widths) holds only in-page links to those blocks, no claim text.

**Practice page**: the real chrome and components with practice content (as today).

### 11.6 3D Museum Overlays (`/learn/immersive`)

- **StudyBar**: the shared component (9.14), opaque, replacing the glass HUD blocks.
- **Info panel**: the `KnowledgeSheet` docked right at 1024 px and wider (39.25rem, opaque `--ground`, 1 px `--rule-strong` left border, no radius, no shadow, internal scroll, full height below the chrome); full width and full height below the chrome under 1024 px and at 200% zoom. Close sits in the reserved action slot (44 x 44, label "Close"). Opening moves focus to the h1; Escape closes and returns focus to the exhibit trigger. Non-modal at 1024 px and wider; modal under 1024 px.
- **Minimap**: bottom-left, 192 x 192 on opaque `--ground` (study palette rule 5 keeps `--surface` for the hint panel and dialogs) with a 1 px `--rule-strong` border and an eyebrow "Plan". Rooms are 1.5 px `--ink` outlines, unfilled, labelled with section numbers in `tabular-nums`; the current room has a 2 px ink outline, an 8 px ink dot and the text "You Are Here". No colour fills, no tradition colour. A 44 px "Expand plan" button opens a full plan dialog with room names. The minimap is hidden while the panel is open under 1024 px.
- **Room contents list**: 44 px rows.
- **Signage (in scene)**: room plaques of one fixed size for every room (1.6 x 0.5 m), ink on `#F5F1E8`, Source Serif 4 600 for the name at a fixed cap height (wrapping to two lines, e.g. "Machilipatnam Kalamkari"), rendered to a `CanvasTexture` with the already loaded webfont; scene start is gated on `document.fonts.ready` so plaques never render in a fallback font. Contrast stays at least 4.5:1 under scene lighting (existing `immersive-rendering.spec.ts`).
- **Wall exhibit planes**: every exhibit plane has the same size and shows a **typographic plate** (concept title in Source Serif 4 600 on `#F5F1E8`, 1 px ink frame) in study builds. Photographs appear only inside the panel figure, identical to 2D, so imaged concepts are not more salient in the 3D field of view. Activating any plane opens the panel at its top, never the lightbox directly. (A photograph-plane mode may exist behind a flag for public demos only; it is off for every study.)
- **Screens** (onboarding, help, paused, context lost, failed, no WebGL, loading): `StateMessage` and the shared onboarding component, with the same copy, layout and button sizes as the 2D practice and error pages.

### 11.7 Study Pages (`/study/*`)

Study shell (9.16). Progress: "Question 4 of 20" in Inter `tabular-nums` and a 2 px `--ink`-on-`--rule` line, no transition, no percentages, badges or confetti. Question text in Inter 20/28 600 `--ink`. Options: full-row 56 px labels with a 20 px radio, separated by 1 px `--rule`; selected = `--wash`, 2 px `--indigo` left border and a check icon. Likert scales: a 5- or 7-column table with tabular numbers and end labels in `text-eyebrow`; stacked vertically under 520 px. Free text: textarea, min 132 px. Action row: "Back" outline (left) and "Continue" primary (right, last in DOM and tab order), 44 px. Consent, information and debrief use the editorial text column without sidenotes. Errors use `StateMessage`; field errors per 9.5. The concept-map reconstruction task keeps its canvas but adopts the tokens, 44 px controls and zero motion. No pattern, madder, ochre, ticks or imagery.

### 11.8 Research Console (`/research/*`)

Console shell with the 48 px knock-out band above each PageHeader. The landing page (`/research`) leads with the **Equivalence Monitor** summary (content parity status of each active study plus the latest interface parity run) above the study list. Lists (studies, sessions, participants, assessments, exports) are booktabs tables with 44 px rows, mono participant codes and status badges with words. Detail pages: a two-column `<dl>` summary, then sections under `text-eyebrow` running heads; protocols as numbered lists. `/research/parity` keeps its run form and history and adds the interface parity section. Analytics, scoring and pathways pages follow section 10. A "Demo data" `--warn` badge appears on every panel while `is_demo` records are shown.

### 11.9 Research Dashboard (`/research/dashboard`)

A results sheet, in rows:
1. Table 1, Enrolment and Completion (stat row) with the live status line at the right.
2. Figure 1, Pre/Post Score by Condition (slope chart) and Figure 2, Learning Gain by Condition (dot plus 95% CI with raw points), two equal columns.
3. Figure 3, Gain by Tradition: small multiples for the three study traditions on identical y scales, canonical order.
4. Figure 4, Dwell Time per Layer (heatmap, sequential ramp, values in cells); Table 2, Per-Item Statistics (booktabs, right-aligned tabular, Download CSV).
5. An "Interface Parity" card linking to the latest parity run, so the confound control sits next to the results.

No decorative band on the dashboard beyond the console header band.

### 11.10 CMS (`/cms/*`)

Console shell, plain 2 px ink rule above page headers (no madder anywhere in the CMS). Lists are dense booktabs tables (36 px compact rows with 44 px hit areas), mono IDs, status badges with words.
- **Concept editor**: split view, form 60% and **Proof** 40%. The Proof renders the real `KnowledgeSheet` inside a frame with registration ticks; a "Preview As: 2D Column | 3D Panel" tab switch renders the same component in both placements, as a standing parity demonstration.
- **Media library**: booktabs table with Thumbnail (3:2), Credit, Licence, Max Pixels, Licence Expiry (tabular date), Linked Concept, Anchor Claim, Tradition and Layer. Licence-expiring rows flagged with `--warn` plus the word. Upload form requires alt text (about 15 words, must differ from the caption), caption (at most 180 characters, must name its anchor claim), credit, licence, source URL, max pixel size, expiry, linked concept and anchor claim.
- **Figure Balance** (new review gate, in `/cms/media`): a matrix table of the three study traditions (columns, canonical order) by section (rows, grouped under their layer) giving figure counts on the sequential ramp with printed values. A row whose counts differ shows `--danger` with an icon and the words "Unbalanced: blocks publication to a study". The rule (section 12.3) is enforced server-side by the content parity engine, not only displayed.
- Demo records carry the "Demo:" title prefix and a "Demo" badge and are never publishable into a study.

### 11.11 Admin (`/admin/*`)

Console shell, plainest skin: no band, a plain 2 px ink rule. Users and roles as booktabs tables with 44 px rows, role badges and a trailing 44 px row-action menu; the roles page is a permission matrix with check glyphs plus visually hidden text, sticky first column and header. Audit log: mono timestamps in `tabular-nums`, actor, action, target, a filter bar of 44 px inputs and diffs in a `--sunk` mono block. Settings: sectioned forms with `text-eyebrow` running heads, a sticky "Save changes" bar, and a "Danger zone" alert with a `--danger` left rule; destructive actions need typed confirmation in a dialog.

---

## 12. Condition Parity (Study-Mode Equivalence Rules)

This section is the user's governing requirement made testable: **equivalence of knowledge, ease of access, and a neat UI that cannot skew 3D vs 2D results**. Where any other section conflicts with it, this section wins.

Scope: `/learn/2d/*`, `/learn/immersive` (all DOM overlays and in-scene text), `/study/*`. These rules override every aesthetic preference in this document. Their purpose is that a 2D vs 3D difference in results cannot be explained by interface quality (R-L4, R-L10), by unequal cues (R-L5) or by unequal salience (R-H2, R-T15).

### 12.1 One Source of Truth

1. `KnowledgeSheet`, `ClaimList`, `CitationNote`/`CitationRecord`, `KnowledgeFigure`, `FigureLightbox`, `LayerTabs`, `RelatedConcepts`, `StudyBar`, `HintControl`, `StallCue`, `LearningTimer`, `StateMessage`, onboarding and `DisplaySettings` each exist once and are imported by both conditions. The inline claims, tabs and `RelationDetails` copy in `info-panel.tsx` are deleted.
2. Layer names and order, concept type and category labels, and the canonical tradition order come from `src/features/learning/labels.ts`. All learner-visible interface strings for both conditions come from one module (`src/features/learning/strings.ts`).
3. Allowed differences between conditions, and only these: the placement of the `KnowledgeSheet` (page flow vs docked panel), the presence of the 3D scene, the condition navigation group in the StudyBar (2D Contents and Search; 3D Plan, Controls Help, Pause; same size and style), how a related-concept or pager link acts (navigate vs walk), and the 2D-only "Up to <parent>" control inside the condition navigation group. The path from the learning start to a concept is the manipulation and is not equalised; it is logged per session (navigation events) so it can be modelled. Everything from the moment a concept is open is equalised and measured (12.4).

### 12.2 Typography, Surface, Palette and Motion

4. Every knowledge string (title, claims, captions, credits, citation records, relation verbs, layer names) uses the same token in both conditions. The knowledge container background is `--ground` in both, for all six tradition keys; the 3D panel is opaque with `backdrop-filter: none`.
5. Study palette: `--ground`, `--surface` (hint panel and dialogs only), `--sunk`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-strong`, `--indigo` (+ hover, on-indigo), `--danger` (errors only), `--wash` (chosen questionnaire option only). No madder, ochre, ok, warn, bands, patterns, ticks, outline-then-fill art or tradition colour. Yellow only for the guidance cue.
6. Zero motion (section 8), no shadows on knowledge containers, no glass, no badges or emphasis present in one condition only.
7. Light theme unless the participant opts into dark, high contrast or reduced motion through Display Settings, offered identically before learning in both conditions and logged.

### 12.3 Figures and Salience

8. Each study figure is attached to a concept and an anchor claim and renders right after that claim in both conditions, with identical caption, credit, licence, alt text, 3:2 slot and lightbox behaviour (9.9). Images never replace a claim and never carry knowledge that the claims and alt text do not also carry (R-L2, R-L3, R-L8).
9. **Balancing rule.** At most one figure per concept. Within each section (the concept type: the 2D tradition-page section and the museum room), Ajrakh, Sanganeri and Machilipatnam Kalamkari carry **exactly the same number of figures**: k(section) = the minimum number of approved, licence-checked figures available across the three for that section. Because the knowledge layer is a function of the concept type (`exposureLayerOf()` in `labels.ts`), per-section balance also balances every layer and the per-tradition total. Surplus figures are held back from the study bundle (they may appear on public pages). No visible empty placeholders are rendered in study; balance comes from equal counts and the identical fixed slot. The content parity engine fails the study activation when any section is unbalanced, and the CMS Figure Balance matrix shows why.
10. Lightbox long edge capped at 768 px for every study figure (R-C20), one activation to open in both conditions. A study may raise the cap to 1200 px only if every figure in its frozen bundle is at least 1200 px on the long edge; the cap is recorded in the study protocol and applies to both conditions.
11. 3D wall planes show typographic plates only in study builds (11.6), all one size; photographs appear only in the panel figure.
12. **Canonical tradition order**: alphabetical by display name (Ajrakh, Bagh, Bagru, Dabu, Machilipatnam Kalamkari, Sanganeri; the three study traditions as Ajrakh, Machilipatnam Kalamkari, Sanganeri), fixed and identical in both conditions (DR-019). It applies on every list, table column, comparison matrix, dashboard facet and museum wing sequence. The current Ajrakh/Machilipatnam/Sanganeri vs Ajrakh/Sanganeri/Machilipatnam inconsistency is removed.
13. Traditions are identified by name and the identical neutral marker only. Concept counts are hidden in study mode (the museum shows none). The three study traditions get the same card, the same plate rule and the same visual weight.

### 12.4 Parity Checks

`tests/e2e/parity.spec.ts` runs each check at viewports 390 x 844, 768 x 1024, 1280 x 800 and 1440 x 900, in light, dark, HC light and HC dark, for one concept from each study tradition, comparing the 2D concept page with the 3D panel for the same concept. It writes a JSON report (schema in `src/features/research/interface-parity.ts`) to `analysis/parity/interface-parity.json`, which CI commits and the Equivalence Monitor reads. Tolerance is 0 unless stated.

| ID | Check | Pass condition |
|---|---|---|
| P1 | Computed style of the claim `<p>`, title h1, caption, credit, quote, source line and citation button: font-family, font-size, line-height, font-weight, letter-spacing, color, font-variant-numeric, font-feature-settings | equal in 2D and 3D |
| P2 | Content box width of the claim paragraph | equal within 1 px |
| P3 | Line-break parity: number of rendered lines per claim (`Range.getClientRects()`) | equal for every claim |
| P4 | Knowledge container `background-color` and `backdrop-filter` | `--ground` value and `none` in both, for all six tradition keys |
| P5 | Text content of claims, citation records, figure captions, credits and alt text for the same concept | byte-identical |
| P6 | Chrome offset: y of the KnowledgeSheet's first heading below the bottom of the chrome | equal within 1 px |
| P7 | StudyBar height and AccessNotice height | equal (or AccessNotice absent in both) |
| P8 | Claim lines visible in the first screen of the knowledge column | equal within 1 line |
| P9 | Bounding box of every interactive element in StudyBar, LayerTabs, CitationNote, Enlarge, lightbox Close, panel Close, RelatedConcepts, pager and minimap controls | at least 44 x 44 px; allow-list empty |
| P10 | Text contrast of every text node in the knowledge container, from computed styles (truncated, R-A2) | at least 4.5:1 |
| P11 | Scripted interaction counts from an open concept: to see the first claim of the Overview layer (expected 0: it is visible on open); to the expanded citation record; to the lightbox; to switch layer; lightbox back to its trigger (Escape) | 0 for the first claim, 1 for each of the others, equal in both |
| P12 | Computed `transition-duration` and `animation-duration` of every element on study routes | `0s` (or the 0.01 ms clamp) |
| P13 | Tab stops from the top of the knowledge container to the first CitationNote | equal |
| P14 | Figure slots: count, order index, src, alt, caption, credit, licence, rendered aspect box size, lightbox max dimension | equal; aspect 3:2; long edge at most 768 px |
| P15 | Cumulative Layout Shift on 2D load and on 3D panel open | 0.00 |
| P16 | Figure decode latency: concept open to first figure decode complete, low-spec profile (4x CPU throttle) | median difference under 150 ms |
| P17 | Neutral tradition marker computed color, size and border | identical for all six keys |
| P18 | Related Concepts block: DOM position and y-offset below the last claim of the field | follows the field and precedes the pager in both; offset equal within 1 px |
| P19 | Import graph: both route trees resolve the shared knowledge components from the same module files | true |
| P20 | String table: learner-visible interface strings used by both conditions | diff is empty |
| P21 | Figure-count matrix of the published study bundle | equal per section (and so per layer and in total) across the three study traditions |
| P22 | StudyBar shared group (wordmark, Hint, Time Left, Finish) and the skip link: accessible names, DOM order, tab order, bounding boxes, computed styles | identical in 2D and 3D; boxes within 1 px |
| P23 | Shared-component DOM snapshot: hint panel open, StallCue, LearningTimer, onboarding screens, StateMessage (unavailable, error, loading), Display Settings dialog, rendered from the same fixture in each condition's shell | byte-identical serialised DOM and equal computed styles, apart from the condition-specific onboarding body text, whose word count differs by at most 10% |
| P24 | Interaction counts for shared chrome: open and close the hint panel; open Display Settings; reach Finish from the knowledge container by keyboard (tab stops) | equal in 2D and 3D |
| P25 | Reading-progress bar inside the KnowledgeSheet: presence, height, colour, `role`, and value after scrolling the container to the end | present in both; equal; 100 at the end |
| P26 | Tradition salience: for each of the three study traditions, on the 2D index and comparisons pages and in the 3D panel and room plaques, the title computed style, card or plaque box size, marker and the presence of any image | identical across the three traditions within each condition |
| P27 | Focus on concept open: `document.activeElement` after a concept opens | the sheet h1 in both conditions |

**How the checks map to the governing requirement.**

| Requirement | Checks |
|---|---|
| Equivalence of knowledge (same text, face, size, measure, line height, contrast, colour semantics, citation panel, layer names and order, figures) | P1, P2, P3, P4, P5, P10, P14, P18, P20, P25 |
| Ease of access (same controls, 44 x 44 targets, keyboard paths, interactions to claim, citation, figure and hint; same onboarding, hint, timer, error and empty states) | P6, P7, P8, P9, P11, P12, P13, P22, P23, P24, P27 |
| Neat UI that cannot skew results (no condition-only emphasis; equal salience of Ajrakh, Sanganeri and Machilipatnam Kalamkari; balanced figures; same performance) | P15, P16, P17, P19, P21, P26 |

A reviewer verifies parity from the stored report alone: every check row carries the 2D value, the 3D value, the delta and the tolerance (section 10, Equivalence Monitor).

The existing content parity checks (engine groups base and a-f) remain and are shown alongside these in the Equivalence Monitor.

---

## 13. Honesty Rules

1. **No invented facts.** `src/config/institution.ts` holds affiliation, ethics reference, paper citation and contact; each field is `null` until the team supplies it, and a `null` field renders nothing. No "to be confirmed" stubs.
2. **No fake data.** Live counts come from the database at request time. The Equivalence Monitor and the Colophon parity list show only stored real runs.
3. **No stock or AI imagery.** Photographs are licence-checked records with credit, licence, source URL, max pixel size and expiry.
4. **Craft-derived design is labelled.** Every craft-derived token, pattern and swatch is documented as a design interpretation and decoration (R-C6). Content in `content/` is never edited by design work.

---

## 14. Do and Don't

| Do | Don't |
|---|---|
| Render both conditions' knowledge through the same components and tokens. | Restyle a shared component from a condition's own file, or pass condition-specific style props. |
| Keep `--ground` as the single knowledge surface, opaque, in both conditions. | Use glass, blur, translucency or `--surface` behind claims in one condition. |
| Use indigo as the only accent in study. | Use madder, ochre, ok, warn, bands, ticks or tradition colours in study. |
| Keep madder on public pages only. | Put madder in the console, CMS, admin, forms, alerts or charts (1.09:1 vs danger). |
| Draw patterns from neutral units (dot, lozenge) on the offset-row structure. | Use stars or rosettes on indigo, floral butis, mehrab arches, crackle textures, or the indigo + madder + black + white set as branding. |
| Seam tiles exactly; keep everything flat. | Fake misregistration, offset "second impression" plates, grain, wear, gradients or bevels. |
| Use tracked uppercase Inter for eyebrows; lining figures. | Use `font-variant-caps`, small caps or old-style figures (the served file lacks them). |
| Give every interactive element a 44 x 44 hit area. | Ship 28-36 px controls, tiny disclosure glyphs or one-line citation buttons. |
| Put Related Concepts at the end of the knowledge column in both conditions. | Add a 2D side rail, a 2D-only section index or any persistent pane one condition lacks. |
| Use one fixed 3:2 figure slot; balance figure counts per layer. | Let figure aspect vary, show "no image" placeholders in study, or give one tradition more figures. |
| Cap every study lightbox at the same long edge; open it in one activation. | Use zoom gestures or a different viewer in one condition. |
| Show every claim's own source line. | Shorten repeated sources to "first occurrence only". |
| Derive the short citation label in code. | Hand-write labels into `content/` or truncate mid-word. |
| Number figures and tables; caption with n, measure and uncertainty. | Use pies, 3D charts, dual axes, red/green pairs or causal wording. |
| Hide unverified institution and ethics facts. | Show placeholders that read as real or "to be confirmed" stubs. |
| Keep motion to the public pages, once, short and skippable. | Animate anything in study, loop, parallax, scroll-jack or count numbers up. |
| Use real licence-checked photographs with credit and licence. | Use stock photographs, AI images or swatches captioned as dye colours. |

---

## 15. Acceptance Checklist

All items are measurable; WP8 automates the ones marked (auto).

**Contrast and colour**
- [ ] (auto) `tests/unit/contrast.test.ts` passes for `:root`, `.dark`, `.a11y-contrast` and `.dark.a11y-contrast`, and asserts at least these values (truncated): ink on ground 14.85 light / 14.77 dark; ink-3 on sunk 5.39 / 6.02; indigo on ground 9.16 / 9.51; on-indigo on indigo 9.74 / 9.56; danger on ground 6.54 / 7.82; rule-strong on sunk 3.35 / 3.29; HC ink 18.57 / 19.64.
- [ ] (auto) No `#ffd400` or other yellow in the CSS outside the guidance cue; no `--faint` token (existing assertions).
- [ ] (auto) Lint: no `madder` or `ochre` token or utility in any file outside `src/app/(public)/**` and `src/components/public/**`; no raw Tailwind palette colours (`emerald-*`, `amber-*`, `red-*`) in `src/`.
- [ ] (auto) Series-2d and series-3d relative luminance within 2% in both themes.

**Layout and reflow**
- [ ] (auto) No horizontal scroll at 390 px on every in-scope page (existing `alignment.spec.ts` list plus `/about/colophon` and the immersive route), and at 1280 px with 200% zoom (640 CSS px).
- [ ] (auto) Parallel-card actions aligned within 1 px at 1280 px (existing `alignment.spec.ts`).
- [ ] (auto) Every interactive element on study routes is at least 44 x 44 px (P9); every interactive element on public, console, CMS and admin pages is at least 44 x 44 px, or 36 px visual with a 44 x 44 hit area in compact console tables.
- [ ] (auto) Text spacing override (line height 1.5, paragraph spacing 2x, letter 0.12em, word 0.16em; R-A8) causes no clipping or overlap on the concept page in both conditions.

**Motion**
- [ ] (auto) P12 passes on all study routes.
- [ ] (auto) With `prefers-reduced-motion: reduce`, public pages have no running animation and Figure 1 renders fully drawn.

**Fonts and performance**
- [ ] (auto) At most 2 preloaded font files and at most 176,000 bytes preloaded; at most 230,000 bytes of fonts transferred on `/`, `/learn/2d/concepts/[key]` and `/learn/immersive`; no request to a third-party host (CSP unchanged).
- [ ] (auto) No `font-variant-caps` and no `onum` in the CSS.
- [ ] (auto) Study figure at 544 px wide is at most 70 KB; at most 250 KB of images per study page view; lightbox images fetched only on open; CLS 0.00 on study routes.
- [ ] (auto) Measured in Playwright with a CDP 4x CPU throttle and PerformanceObserver: LCP at most 2.5 s on `/` and on `/learn/2d/concepts/[key]`, interaction-to-next-paint at most 200 ms for opening a citation record and the lightbox in both conditions, CLS 0 on study routes.
- [ ] 3D wall textures at most 512 px long edge and 60 KB each, loaded per room.

**Equivalence and study semantics**
- [ ] (auto) P1-P27 pass and the report is stored; the Equivalence Monitor shows the run.
- [ ] (auto) Study semantics unchanged: the same claims, order, layers, exposure budget, timer, hint policy, telemetry event names and payloads as before the redesign (existing unit and integration suites in `tests/unit/learning*`, `tests/unit/immersive`, `tests/integration/learning-*`, `tests/integration/telemetry-ingest.test.ts`, `tests/e2e/telemetry-learning.spec.ts` pass unchanged except for selector updates).
- [ ] (auto) Content parity engine fails a study with an unbalanced figure matrix.
- [ ] (auto) `tests/e2e/smoke.spec.ts` passes unchanged (home h1 "Immersive Episteme"; body background `rgb(245, 241, 232)`).
- [ ] (auto) `tests/unit/title-case.test.ts` passes; every h1-h3 in `src/` passes through `titleCase()` (lint or unit scan).
- [ ] (auto) `tests/unit/button.test.tsx` passes (role and `data-slot="button"` kept).
- [ ] A decision record in `docs/decisions/` records the visual system, the claim face (Inter kept), the 768 px lightbox cap, the panel width and the canonical order, before any participant data is collected.

**Accessibility**
- [ ] (auto) axe-core (via `@axe-core/playwright`, the only new dependency, pinned exactly by WP8) reports no WCAG 2.2 A or AA violation on every in-scope page in light, dark, HC light and HC dark.
- [ ] (auto) Focus indicator present on every focusable element (2 px indigo outline or HC double ring) and never obscured by sticky chrome.
- [ ] (auto) Keyboard: LayerTabs arrow navigation; CitationRecord and FigureLightbox close on Escape and restore focus; skip link works in both conditions.
- [ ] Local terms carry `lang`; the Sindhi/Persian quote renders right-to-left with `lang` and `dir`.

---

## 16. Performance and Image Pipeline

**Images.** `next.config.ts` gains `images: { formats: ["image/avif", "image/webp"], deviceSizes: [400, 544, 816, 1088, 1600], imageSizes: [96, 192, 288], qualities: [75], localPatterns: [{ pathname: "/figures/**" }, { pathname: "/_next/static/media/**" }] }` (Next 16 allows only listed local patterns and defaults `qualities` to `[75]`; no query strings on figure URLs). All images are local (CSP `img-src 'self' blob: data:` unchanged).

**Figure delivery.** The existing `/cms/media/file/[assetId]` route is staff-only, and the Next image optimiser fetches sources without the visitor's cookies, so learner figures need their own route: `src/app/figures/[assetId]/route.ts` (new, WP6) serves an asset only when it is approved, licence-valid on the request date, and linked with role `illustration` to a concept in a published study bundle or flagged for public plates; anything else returns 404. It sets `Cache-Control: public, max-age=31536000, immutable` and the content type from the database row. The proxy matcher does not cover `/figures`, so no redirect applies. Both conditions request the same URLs through the same `KnowledgeFigure`. Every image has explicit `width` and `height` and sits in a reserved aspect box (CLS 0).

| Image | Sizes | Budget |
|---|---|---|
| Study figure | srcset 400, 544, 816, 1088; `sizes` per 9.9 | at most 70 KB at 544 w; at most 250 KB of images per study page view |
| Study lightbox | one source at 768 px long edge | fetched only on open |
| 3D wall plates | typographic textures, 512 px long edge | at most 60 KB each, mipmapped, loaded per room |
| Public plates | up to 1600 w AVIF | at most 180 KB each; lazy below the fold; the first plate is not faded and may use `fetchpriority="high"` |
| CMS thumbnails | 192 w | lazy |

**Graphics.** Patterns are inline SVG (`<defs>` under 2 KB); no raster textures. The glass panel and `backdrop-filter` are removed (cheaper on low-spec GPUs while WebGL is busy).

**JavaScript.** No animation library. ECharts stays dynamically imported and console-only. The `KnowledgeSheet` is a server component where possible; only `CitationNote`, `LayerTabs`, `FigureLightbox`, `DisplaySettings` and the StudyBar controls are client islands.

**Targets** on a 4x CPU throttle: LCP at most 2.5 s on public pages and 2D concept pages, interaction-to-next-paint at most 200 ms, CLS 0 on study routes, 3D panel open to first paint under 100 ms (it is DOM, not a scene change).

---

## 17. Residual Risks

1. **The docked panel occludes the scene.** 39.25rem covers about 49% of a 1280 px viewport and the whole scene under 1024 px. This is the cost of equal reading width. Pilot it; if it harms navigation, narrow the measure for BOTH conditions (for example 30rem), never for 3D alone. Name it in the paper's limitations.
2. **The scene beside the text** (peripheral colour and form) remains a difference; it is the manipulation. No camera motion while the panel is open.
3. **Figure balance may drop good photographs** when one study tradition has fewer licensed images; k(layer) can be 0. The Figure Balance matrix makes the trade-off visible. Freeze the study bundle so licence expiry cannot change content mid-study.
4. **Tradition order (resolved, DR-019): one canonical alphabetical order (Ajrakh, Machilipatnam Kalamkari, Sanganeri), fixed and identical in both conditions.**
   - It is used everywhere: 2D lists and comparison cards, 3D wing order (the compiler orders wings by slug, which gives the same order) and figure order.
   - It is not counterbalanced. In 3D the order is spatial, so counterbalancing would need a separate compiled museum per order, and an order identical across conditions cannot confound the condition comparison.
   - Order effects on tradition-level analyses are reported as a limitation.
5. **Changing the visual system changes study materials.** Acceptable only before any participant data is collected, with a decision record (DR-019).
6. **Token and size changes break tests and reflow console pages** (contrast test token names, 44 px default buttons). WP0 keeps deprecated aliases until every package lands.
7. **Canvas signage** depends on `document.fonts.ready`; a race would show fallback-font plaques in 3D only. Scene start is gated on it.
8. **Arabic-script text** renders in a system font that differs by device but not by condition.
9. **2D Search has no 3D counterpart.** Search lets a 2D learner reach claims by keyword; the museum has no equivalent. It is navigation (allowed by 12.1 rule 3), but it is also a retrieval aid. **Resolved (DR-019): search is off in study builds of both conditions.** `searchEnabled` defaults to false in the study contract. A protocol that turns it on must justify it in its decision record, and search events are then logged as a covariate. Search stays available in the public demo.
10. **Dark theme scope (resolved, DR-019).** A dark theme would darken the whole 2D page but only the chrome and panel in 3D, so study mode is fixed to light in both conditions. Only the High contrast accommodation is offered there, identically, and it is recorded on the session. Analyses should check that it is balanced across conditions.
11. **Comparison content structure.** The 2D comparisons page (from `content/comparisons.json`) and the 3D Compare layer (counterparts from the manifest's compare hotspots) may not expose the same claims. 11.5 equalises their typography; WP2 and WP3 must also confirm, with a unit test over the read model, that each comparison's claims are reachable in both conditions, or record the difference in the decision record.

---

## 18. Work Packages

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

# Photo proposals for the study traditions

This is a proposal for curators. It is not content. Nothing here has been added to `tradition.json`, and no caption here is a craft fact. Each caption restates a claim that is already in the tradition file, plus the image record's own description. Each photo would appear identically in the 2D and 3D conditions, as a captioned figure attached to one concept.

The machine-readable list is `media-proposals.json`, next to this file. It holds 93 entries: 3 proposed, 27 reserve and 63 rejected. Entries from the earlier pass are kept, so no history is lost. Each proposed entry has the licence, the URL where the licence was checked, the verbatim licence text, the verbatim words that name the tradition, the creator, a ready-to-print credit line, the caption, the alt text, the pixel size and the SHA-256 of the stored file.

## Rules used in this pass

**Licences.**
- Tier 1 (preferred): public domain, CC0, CC BY, CC BY-SA.
- Tier 2 (allowed, because the platform and the study are non-commercial academic research): CC BY-NC, CC BY-NC-SA, and museum terms that allow free non-commercial or scholarly display online. The V&A terms are the only museum terms used.
- Rejected: all rights reserved, unclear licences, "fair use", terms that forbid online display, licence laundering, watermarks, stock sites and AI images.

**Identification.** A photo counts for a tradition only if its own record names the tradition or its place. Recognising a style by eye does not count. Hedges such as "probably" stay in the caption. The Ajrakh photographer writes "dhamanka"; reading it as Dhamadka is our inference, so it appears in brackets.

**Balance.** Every tradition gets the same kinds of photo, one per kind. All photos of a kind attach to concepts in the same section. A kind that is missing for one tradition is dropped for all three. A kind whose images differ too much in medium or salience across the traditions is held back for all three.

**Display size.** The V&A allows at most 768 px on the long edge. Every study photo is therefore served at 768 px at most, with no larger srcset step. One cap for all photos means no tradition's images look sharper.

## Result

| Tradition | Kind | Photo | Concept (section) | Licence | Size |
|---|---|---|---|---|---|
| Ajrakh | textile | Pieces of an ajrakh shawl or cover, Sind, about 1855–79 (V&A 5473A/(IS)) | `ajrakh.historical_context.sindh-indus-origins` (context) | V&A non-commercial terms (Tier 2) | 2013 x 2500 |
| Machilipatnam Kalamkari | textile | Dress fabric, Machilipatnam, 1879 (V&A IS.1765-1883) | `machilipatnam-kalamkari.historical_context.persian-export-trade` (context) | V&A non-commercial terms (Tier 2) | 2500 x 1688 |
| Sanganeri | textile | Wrapped garment with an octroi stamp, probably Sanganer, about 1855–79 (V&A 4497(IS)) | `sanganeri.historical_context.eighteenth-century-records` (context) | V&A non-commercial terms (Tier 2) | 2500 x 1910 |

Each tradition gets one photo: a textile, attached to the context section. The three place images are held in reserve (decision 4).

The original files are copied, unmodified, to `scratchpad/photos/selected/<tradition>-<kind>.jpg`.

### Captions

| Tradition | Kind | Caption | Claim restated |
|---|---|---|---|
| Ajrakh | textile | Pieces of an ajrakh shawl or cover made in Sind, about 1855–79 (V&A 5473A/(IS)): a blue field of large and small circles with an end border of floral medallions. | sindh-indus-origins #4, #3 |
| Machilipatnam Kalamkari | textile | Dress fabric, Machilipatnam, 1879, block printed with pen work. The museum says it was probably made for export to Iran; it bears a printed Persian inscription. | persian-export-trade #0 |
| Sanganeri | textile | Wrapped garment, probably Sanganer, about 1855–79, with a black octroi (tax collection) stamp (V&A 4497(IS)). Dupattas printed at Sanganer carry dated octroi stamps. | eighteenth-century-records #1 |

Claim ids use the form `conceptKey#index`, counting from zero, because claims have no id field.

## Coverage per kind

"Eligible" means kept by the verifier.

| Kind | Ajrakh | Machilipatnam Kalamkari | Sanganeri | Outcome |
|---|---|---|---|---|
| textile | 6 | 3 | 5 | kept: one each, all in context |
| place | 2 | 1 | 1 | held in reserve for all three: not comparable (decision 4) |
| process | 3 | 0 | 3 | dropped for all three |
| tool | 3 | 0 | 1 | dropped for all three |

Process and tool are dropped because no Machilipatnam Kalamkari image of either has a record that names Machilipatnam, Masulipatam or Pedana. The research covered Commons, Flickr, Openverse, Europeana, Wellcome and the Met, Cleveland, Art Institute of Chicago, Rijksmuseum, V&A, British Museum, Science Museum Group and Cooper Hewitt collections.

## Balancing decisions

1. **Textiles: three museum studio photos.** Each tradition's textile is a whole-object V&A studio photograph, showing a printed field and an end border. Each one is the object that its claim cites. This gives the closest match in framing, colour and quality across the three traditions.
2. **Ajrakh textile moved to context.** The researcher attached the V&A shawl to a design concept. Claim #4 of `sindh-indus-origins` names this very object, so the photo now sits in context with the other two textiles.
3. **Sanganeri textile: the octroi garment over the chintz detail.** The 1882 chintz (V&A IS.517-1883) is the object that `export-and-museum-record` #1 describes. It is a dull close-up, though, and the other two textiles show whole objects. The octroi garment matches them better. Its caption only points to the claim about dated stamps, because this stamp is not dated. Curators may swap the two.
4. **Places held back for all three (lead decision, after viewing the images).** The three place images are not comparable:
   - Sanganeri: a colour street scene at the Malapur Gate, with identifiable passers-by and a police sign.
   - Ajrakh: a dim workshop rinse tank, held only at 768 px.
   - Machilipatnam Kalamkari: a monochrome 18th-century etching, the only eligible place image. No open-licence photograph of Pedana or Machilipatnam was found.

   The three differ in medium, light and subject, and the gate shows nothing about the craft. Showing them would make one tradition's place figure more salient than another's, so the kind is held in reserve for all three.
5. **Ajrakh place moved to context (now in reserve).** The rinse-tank photo was attached to an environment concept. It now restates `dhamadka-centre` #0, so all three place photos sit in context. The caption does not link the bore well to the river claim.
6. **Licence tiers.** All three proposed photos are Tier 2 (V&A terms). No Sanganeri textile under a Tier 1 licence has a record naming Sanganer, so a Tier 1 textile set is not possible. The V&A conditions fall on all three traditions equally.
7. **V&A scope check.** The V&A terms allow "Academic e-publications, online journals, non-commercial websites and blogs". They put "exhibitions, displays and catalogues" and "home page uses" under commercial conditions. The study figures are inside a non-commercial academic web platform, so they fall in the first category. However:
   - The photos are not used on the public home page or in any promotional material.
   - A confirmation request is drafted for the team to send to the V&A image licensing team (vaimages@vam.ac.uk). It asks whether figures inside a virtual-museum research study count as an "exhibition display". The V&A confirmed the use (DR-020).

## Conditions before ingest

1. **Ajrakh place original (only if the place kind reopens).** Flickr refused the original download (HTTP 429). Only the 768 x 1024 rendition is stored, which is below the 1200 px minimum.
2. **V&A terms.** Serve a 768 px derivative at most. Online use is allowed for 5 years from publication. V&A content must stay under 25% of the project's content. Use the credit "© Victoria and Albert Museum, London". Download through the collections site, not by hotlinking the API.
3. **Crops.** Machilipatnam textile: about 13% off the left edge, to remove the museum's paper tag. The stored originals stay unmodified.
4. **Concepts.** None of the three anchor concepts is verified yet; all are under review. A figure goes live only when its anchor claim is verified.

## Reserve

| Tradition | Photo | Kind | Concept | Why reserve |
|---|---|---|---|---|
| Ajrakh | V&A 8450(IS), Fatehgarh fragments | textile | four-colour-ajrakh-cloth | anchor in outcomes; a north-Indian piece |
| Ajrakh | Ajrak Print 8 (SMarndi, CC BY-SA 4.0) | textile | kutch-ajrakh | Tier 1, but a phone close-up, less comparable to the museum photos |
| Ajrakh | "traditional double-sided ajrak" (Rick Bradley) | textile | both-sided-printing | anchor in design; original not fetched |
| Ajrakh | Finnish Heritage Agency VK6514:35 | textile | geometric-symmetry | anchor in design; exactly 1200 px |
| Ajrakh | V&A IND.LOST.143, stages sample | textile | multi-block-set | informal snapshot; anchor in design |
| Ajrakh | stirring alizarin-dyed cloth (Rick Bradley) | process | copper-dye-pot | process kind dropped |
| Ajrakh | cooking cloth in an alizarin bath (Rick Bradley) | process | red-dyeing | process kind dropped; concept needs evidence |
| Ajrakh | inside the Khatri workshop (Rick Bradley) | process | kutch-ajrakh | process kind dropped |
| Ajrakh | printing blocks, Ajrakhpur (Rick Bradley) | tool | wooden-blocks | tool kind dropped |
| Ajrakh | big copper dye vat (Rick Bradley) | tool | copper-dye-pot | tool kind dropped; best tool photo |
| Ajrakh | rinsing out the cloth (Rick Bradley) | tool | washing-tanks | tool kind dropped |
| Ajrakh | cloth laid out to dry (Rick Bradley) | place | sun-and-temperature | alternate place photo |
| Ajrakh | "double-sided ajrak detail" and Ajrak Print 1 | textile | earlier pass | carried over; not re-checked |
| Machilipatnam Kalamkari | Met 30.96.1 palampore | textile | coromandel-chintz-trade | conservation netting; painted; "probably Masulipatam" |
| Machilipatnam Kalamkari | Bapu Museum table cloth | textile | machilipatnam-kalamkari | weak photo, shot through glass |
| Sanganeri | V&A IS.517-1883 chintz | textile | export-and-museum-record | first alternate; see decision 3 |
| Sanganeri | V&A 823-1852, 817-1852, 0170(IS) | textile | design and outcomes concepts | anchors outside context |
| Sanganeri | three Eric Parker printing and washing photos | process | sanganeri-hand-block-printing, final-washing | process kind dropped |
| Sanganeri | used printing blocks (Eric Parker) | tool | bunta-wooden-block | tool kind dropped |

## Rejected

Full reasons are in the JSON. They fall into these groups.

**This pass**
- **Living designer's work.** Two Design Museum photos of a 2015 ajrakh sari and its blocks. The photo licence does not cover the design.
- **Image does not show the record.** The Ajrakh alum-paste and drying-field photos. The V&A quilted cover, whose image does not match its record's description.
- **Redundant.** The Atlas of Mutual Heritage view of Masulipatam (same view, gutter fold), V&A 823A-1852 (near-duplicate design), and a second Sanganer street scene.
- **Privacy.** The Sanganer block-printing demonstration, dominated by a named private visitor.
- **Superseded.** Ajrak Print 6 shows almost no red. The two ISS frames' records name only "View of India".

**Earlier pass, still rejected**
- **Ajrakh (15).** Rick Bradley photos of iron tanks, a second alum-paste frame, beating and indigo; nevil zaveri photos (484 px, workers); Ajrak printing materials; Ajrak_Craft (identifiable man); Met 448530; and provenance or licence problems (Ajrakh_Chemical_and_Natural_Dyes, Ajrak.jpg, Ajruk.jpg, a user-drawn map, Block_printing.jpg).
- **Sanganeri (19).** Seven Jaipur and Anokhi images that never name Sanganer; Fabric drying (copyvio pattern); A.Savin and Mubarak Mahal (licence); Jain-temple images, the Akbar painting, the constituency map, Met 264521 and ISS frame 42884 (no concept fit).
- **Machilipatnam Kalamkari (17).** Iranian qalamkar and Srikalahasti pieces (wrong place); the India Post stamp, the Forbes India re-upload and a Rijksmuseum 1990s photo (licence); Golconda rumals and coverlet, the Curtain Cloth, the Pedana mandal map, the station sign and the siege drawing (concept not evidenced); Met 2026.237 (re-review candidate).

Ten earlier entries were re-assessed in this pass. Their earlier status and reasons are kept inside the new entries, under `earlierPass`.

## Decided, and still open

The project lead asked the build team to choose the photos itself. Decided:
- The three textiles above (decisions 1–3, 6).
- Place held back (decision 4).
- Process and tool dropped.

Still open:
1. **V&A confirmation: received.** The V&A treats the use as non-commercial academic use under section 3, including the virtual museum and the public research demonstration. The conditions are recorded in DR-020 and the reply is in `docs/research/va-image-licence-reply.md`.
2. **Anchor verification.** Each photo goes live only when its anchor claim is verified (condition 4).
3. **Paper reporting.** The paper reports which photos were shown, and that they appeared identically in both conditions.
4. **More kinds.** Process and tool open only when a Machilipatnam or Pedana image turns up with an open licence and a record that names the place. Leads: Finnish Heritage Agency VK6419:66–69 and Gothenburg 1954.20.0001 (both Masulipatam, both need high-resolution files on request).

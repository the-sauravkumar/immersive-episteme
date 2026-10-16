# Photo Anchor Concepts: Verification Sheet for Curators

This sheet is for the curator (Ankit Kumar or Priyadarshi Patnaik) who verifies the six concepts the study photographs anchor to, in the CMS: concept page → Transition panel → Verify.

**Why a person must do this:**
- Verification is per concept. Only the curator and principal investigator roles may verify (`src/lib/permissions/matrix.ts`), and never their own edits.
- Project policy says "only a human curator can verify" (`content/FORMAT.md`; DR-020 addendum).
- Claude checked every quote mechanically, but did not and must not mark anything verified.

**Result of the mechanical check:** 45 of 45 quotes were found verbatim at their locators, and all 15 sources returned HTTP 200 on re-fetch. Seven fixes are listed at the end. Make the starred (★) ones before verifying the concept they belong to.

| Concept | State now | Before verifying |
|---|---|---|
| ajrakh.tool.wooden-blocks | under_review | ★ fixes 1 and 2 |
| machilipatnam-kalamkari.tool.teak-printing-blocks | under_review | ★ fix 3 |
| sanganeri.tool.bunta-wooden-block | under_review | none; check the OCR quotes against the PDF, p.13 |
| ajrakh.historical_context.sindh-indus-origins | **needs_evidence**; resubmit to under_review first | ★ fix 6 |
| machilipatnam-kalamkari.historical_context.persian-export-trade | under_review | none |
| sanganeri.historical_context.eighteenth-century-records | under_review | ★ fix 4; fix 5 optional |

After verifying, a photo still shows only once:
- the asset is reviewed by someone other than its uploader;
- the concept is in a published release;
- the `figures.photos` switch is on.

A release is refused while anything else in review is unaccepted.

---

## Result in one line

**45/45 quotes were found verbatim at their stated locator. No quote is not found, paywalled or not fetchable.** Five claims say more than their stored quotes; for four of them, the extra wording is in the same source. One claim's quote is truncated in a way that reverses its sense when read alone.

## Per claim

QF means the quote was found at the locator. The "Claim within quote?" column answers check 3.

### ajrakh.tool.wooden-blocks (S1 = GI Journal 188, appl. 1050; S8 = Khamir "Art of Ajrakh")

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:2102) shisham first stage, teak third/fourth; mustard oil | QF S1 p.5 x2 | Yes. The claim omits the source's reason ("so that they do not expand in the rainy season"). |
| #1 (:2120) "Each design is a set of four to six blocks." | QF S1 p.4 | Yes, identical. **The proposed Ajrakh caption restates this claim.** |
| #2 (:2133) registration marks "aid double-sided registration" | QF S1 p.6, p.2 | **Exceeds the quote.** The p.6 quote begins "This is helped by…" and does not say *double-sided*. The p.2 quote is about the cost of double-sided Ajrakh. The same p.6 passage does support the claim: "When double sided Ajrakh is printed it is essential that the same outline design be printed on the reverse … to ensure proper registration. This is helped by small registration marks on the corners of the symmetrically patterned blocks." Fix: extend the p.6 quote. |
| #3 (:2151) "carved from teak (sag); … Pethapur near Gandhinagar" | QF S8 § "Crafting the block" | **Exceeds the quote.** "teak (sag)" is not in the stored quote. The same S8 page has "Today, blocks are made using teak wood (sag)." Fix: add that sentence as evidence. (The source says "Pethapur near Gandhinagar, Kachchh"; the claim correctly drops "Kachchh".) |
| #4 (:2164) many artisans carve teak blocks themselves | QF S1 p.9 | Yes ("chiseling teak wood blocks themselves"). |

### machilipatnam-kalamkari.tool.teak-printing-blocks (S13, S14 Sahapedia; S6 Chitrolekha PDF; S5 asiainch)

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:1587) pen drawing transferred to carved teakwood blocks; "each colour gets its own block" | QF S13 § "Rajarshi Sengupta" x2 | **Exceeds the quotes.** Neither quote mentions colours. S13 does say "for each colour, separate blocks are used". The same S13 paragraph also says "In Machilipatnam, for the block printed textiles, line drawings are not necessary", which a curator should reconcile with the first quote. Fix: add the colour sentence as evidence. |
| #1 (:1605) blocks generally teak-wood, designs etched | QF S6 p.6 | Yes, near-identical. |
| #2 (:1618) cross section for blocks vs longitudinal for temple carving | QF S14 § "Kalamkari Woodblock Makers" (occ. 2 of 2) | Yes. |
| #3 (:1631) "The blocks used are made by specialist artisans." | QF S5 § "Hand Block – Printing/ Kalamkari of Machilipatnam…" | Yes, verbatim fragment. **The proposed Machilipatnam caption restates this claim.** |

### sanganeri.tool.bunta-wooden-block (S1 GI application PDF, OCR text; S10 fibre2fashion PDF; S5, S6 V&A)

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:1673) buntas: blocks of various shapes, motifs engraved on the bottom face, wooden handle the printer strikes | QF S1 p.13 x2 (OCR: "wooden had-printing blocks of diferent shapes", "To tie upper side of tie bunta is 6xed a wooden handle … over which the printer strikes") | Yes. **The proposed Sanganeri caption restates this claim.** |
| #1 (:1691) dried wood of shisham, gurjan, mango, teak | QF S1 p.2, S10 p.5 | Yes. S1 also lists "ardu", which the claim leaves out. |
| #2 (:1710) extremely hard wood, usually teak; Pethapur blocks most esteemed | QF S5 (V&A O77745) § "Textile" | Yes. |
| #3 (:1723) seasoned teak blocks, chhapas or buntis | QF S6 (V&A O147901) § "Textile" | Yes. |
| #4 (:1736) 3–5 in. blocks grew to 4–6 in. and larger | QF S10 p.9 x2 | Yes. |

### V&A anchor: ajrakh.historical_context.sindh-indus-origins (concept is `needs_evidence`)

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:339) originally came from Sindh (1971 Gazetteer, via GI) | QF S1 p.3 | Yes. Context on p.3 confirms that the passage is the gazetteer's ("…published in at Ahmedabad in 1971, at pages 248 & 249. The district gazetteers of 1971 have mentioned…"). |
| #1 (:352) block printing on cotton thought to be over 4500 years old; Indus evidence | QF S1 p.3 x2 | Yes. |
| #2 (:370) 3000-year-old madder-dyed strands at Mohenjo-Daro; "does not tie these finds directly to the Khatris" | QF S7 § "Origins in Sindh" | The first half is within the quote. The second half is a negative statement about the source that no quote can carry. In the surrounding S7 text the strands passage is not linked to the Khatris; only the trefoil motif is linked to Ajrakh ("Block printers will identify the trefoil motif as kakkar"). A curator should judge it. |
| #3 (:383) "likely origins of Ajrakh lie in Sind" | QF S12 § "Abstract" ("can be traced to Sind, Pakistan") | Yes; the claim is weaker than the quote. **Anchor claim.** |
| #4 (:396) "19th-century ajrakh cloths made in Sind are held by the V&A (e.g. 5473A/(IS), ca. 1855-79)" | QF S4 (V&A O469296) § "Textile" | **Slightly exceeds the quote.** The plural "cloths" rests on a single object record. The museum number is not in the quote but is on the page ("Accession number 5473A/(IS)"). **Anchor claim.** |

### V&A anchor: machilipatnam-kalamkari.historical_context.persian-export-trade

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:479) 1879 dress fabric probably for export to Iran; Persian inscription names trader, calls it qalamkar, a printed imitation | QF S8 (V&A O164855) § "Object details" x2 | Yes. The year is not in the quotes but is on the page ("dated AH 1297/1879 AD"). **Anchor claim.** |
| #1 (:497) 19th-century quilted cover printed by Iranian craftsmen in Masulipatam for the Iranian market | QF S9 (V&A O152293) § "Object details" | Yes. The date is on the page ("Cover 1800-1860 (made)"). |
| #2 (:510) majorly exported to Persia from the 17th century; link broken in 1924 | QF S6 p.5, p.7 | Yes. |

### V&A anchor: sanganeri.historical_context.eighteenth-century-records

| Claim | Quotes | Claim within quote? |
|---|---|---|
| #0 (:520) EIC records of the 16th/17th c. do not name Sanganer; 1703 dastur-al-amal and 1727 rangkhana tax records | QF S1 p.4 x2 | Within the quote, but the PDF text is OCR-garbled ("16t nod lf centuries", "dos:tw-alanal", "rangffitana"). The reading "17th" is supported in clean text only by S10 p.3 ("16th and 17th century records of the East India Company"), and S10 is not cited on this claim. |
| #1 (:538) head-dress octroi seal V.S. 1856 (A.D. 1799); dupattas with stamps 1853 and 1906 | QF S1 p.8 x2, p.4 x2 | Yes (OCR text; the dates and "Sanganer" are legible). **Anchor claim; the V&A caption's "Dupattas printed at Sanganer carry dated octroi stamps" rests on it.** |
| #2 (:566) archival records from 1727; no Sanganer printing unit traced before the 18th c. | QF S10 p.3 x2 | **The claim is supported, but the stored quote is truncated.** It starts mid-sentence after a page-header artefact ("www.fibre2fashion.com record of printing unit of Sanganer can be traced"). Read alone, it says the opposite of the claim. The full sentence is "Sanganer printing was on records since the beginning of 18th century as earlier to this no www.fibre2fashion.com record of printing unit of Sanganer can be traced." Fix: store the full sentence. |
| #3 (:584) Watt, Indian Art at Delhi 1902-03: "very metropolis of the calico printing craft" | QF S1 p.4, p.7; S10 p.3 | Yes. |

## Fixes for the curation work (not applied)

1. `ajrakh.tool.wooden-blocks#2`: extend the S1 p.6 quote to include the "When double sided Ajrakh is printed…" sentence.
2. `ajrakh.tool.wooden-blocks#3`: add S8 "Today, blocks are made using teak wood (sag)."
3. `machilipatnam-kalamkari.tool.teak-printing-blocks#0`: add S13 "…for each colour, separate blocks are used." Also reconcile it with "line drawings are not necessary" in the same paragraph.
4. `sanganeri.historical_context.eighteenth-century-records#2`: replace the truncated S10 quote with the full sentence.
5. `sanganeri.historical_context.eighteenth-century-records#0`: optionally cite S10 p.3 for the clean "16th and 17th century" reading.
6. `ajrakh.historical_context.sindh-indus-origins#4`: "cloths" to "cloth", or cite a second V&A Sind ajrakh record. #2: the curator should judge the negative clause.
7. Add the GI journal PDF hash (`aef5e0ee9144cfc1159fd2d99cea7fc3e183d69726dae7be44ae7559d2d1fcd3`) to the manifest so that Ajrakh S1's page locators are pinned.

## Bearing on the three captions in PROCESS-PHOTO-PROPOSAL.md (lines 81-83)

The claims the captions restate pass both checks:

- `ajrakh.tool.wooden-blocks#1`, identical to its quote;
- `machilipatnam-kalamkari.tool.teak-printing-blocks#3`, a verbatim fragment;
- `sanganeri.tool.bunta-wooden-block#0`, within its OCR quotes.

The proposal (lines 97-99) still requires curation to mark the anchor concepts verified first. All three are `under_review`, and this check does not change that.

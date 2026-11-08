# Proposed Label Corrections

Labels, local names, captions and keys belong to the curation effort (`content/`), and keys are used by code, so none of these was changed. Each proposal comes from the row verification of 2026-11-05 (DR-084): a researcher's answer checked by an independent skeptic, with the quotes held in `docs/research/substance-looks.json` and matched by `docs/research/tools/verify_substance_looks.py`. Where the evidence leaves a question open, the proposal says so.

## Ajrakh: "Dhawri / Tamarisk Galls" (`ajrakh.material.dhawri-tamarisk`, Red Dyeing)

- **Applied (DR-125, 2026-11-08):** the concept title is "Dhawri flowers (dhaori na phool)", so both doors show "Dhawri Flowers" with the local name Dhaori Na Phool; the key is unchanged. S1 itself names the material dhaori na phool and "dried tamansk flowers", so the new label rests on the record's own source. The `comparisons.json` sentences quote the GI's tamarisk wording and are left to curation.

- **Proposed label:** "Dhaori Na Phool (Dhawri Flowers)"; keep the local name "Dhaori Na Phool". The key also names tamarisk, but keys are used by code, so it is left as it is.
- **Why:** the flower named in present-day Kutch Ajrakh is dhavadi. Khamir lists the "flower of Dhavadi". Abdul Jabbar Khatri, in the Warwick oral-history summary, says "they now use dhavadi na phul brought from Madhya Pradesh". The Ayurvedic Pharmacopoeia of India (Part I Vol. I, Dhataki, PDF p. 55) gives "Gujrati : Dhavadi, Dhavani" for Woodfordia fruticosa. The only craft photograph of the material (Crafts Museum, Barmer, "Davdi ka phool (Davdi flowers) being added into the Alizarin solution") shows slender florets, not round galls.
- **What stays open:** the identification runs only through the vernacular name, and no Kutch voucher specimen exists. Ismail Khatri's labelled samples say "temrix flowers" and "termix powder", which nobody has explained. Whether padvas or shakun was tamarisk gall is not established: no source says so, and Gaatha lists "sakun seeds" as a material in use.
- **Also affected (curation):** `content/comparisons.json` says "Ajrakh dyers add dried tamarisk flowers if colour spreads into white areas" and "Different plants are named (tamarisk in Ajrakh; Woodfordia at Bagru)". Both conflict with this finding.

## Machilipatnam Kalamkari: karakkaya described as flowers

- **Applied (DR-125, 2026-11-08):** nothing a learner reads calls karakkaya flowers: the stage caption and the material's claims say myrobalan, and S4's "dried flowers called karakkaya" sits only in `open_question.myrobalan-part-and-milk-step`, which records it as an unsettled question. No change was needed.

- **Where:** the template label "Myrobalan" with local name "Karakkaya" is right. The problem is the source wording that S4 (Craftmark / AIACA, PDF p. 5) carries into the knowledge base: "dried flowers called karakkaya" and "Myrobalan flowers are crushed and mixed with water to get a yellowish myrobalan pulp".
- **Proposed correction:** describe karakkaya as the dried fruit of Terminalia chebula wherever a caption or claim calls it flowers for the mordant bath, and record S4's wording as a conflict rather than a fact.
- **Why:** C. P. Brown's Telugu-English Dictionary (1903, p. 248) gives karaka as "The yellow myrobalan Terminalia chebula", and karakkaya (p. 249) as its fruit. The Ayurvedic Pharmacopoeia lists "Telugu : Karaka, Karakkaya" in the Haritaki fruit monograph. A named Polavaram dyer in Sengupta's thesis (form-feed p. 94) says "Myrobalan seeds [locally available] are used for tanning and also making yellow pigment", which contradicts flowers for the bath.
- **What stays open:** the material for the yellow. S4 p. 11 and Down To Earth say flowers, the Polavaram dyer says the same material does both, and what a "myrobalan flower" physically is (true flower or leaf gall) is unknown.

## Ajrakh: "Fermented Iron-Jaggery Black Paste" (Outline And Black Printing)

- **Applied (DR-125, 2026-11-08):** the concept title is "Kut (iron-water black paste)", so the label is "Iron-Water Black Paste" with the local name Kut. The shorter form was chosen because S1 names both thickeners: tree gum in the kut quote on this concept, and tamarind seed powder for the black solution in a quote on the tamarind seed paste concept.

- **Proposed label:** "Iron-Water Black Paste Thickened With Tamarind Seed"; local name "Kut (also kat)".
- **Why:** the paste is the second of two stages. The GI Journal (PDF p. 6) continues after the fermentation sentence: "The resulting liquid or "ironwater" is drained off and mixed with smooth tree gum paste." Khatri via Clifford, Karolia and Buch, D'source and Assal describe the drained iron water boiled with tamarind seed. What is printed is the thickened paste, not the ferment.
- **What stays open:** the thickener is a majority choice, not a ruling. Tamarind seed has several independent witnesses; tree gum appears at GI PDF p. 6 and in Wandering Silk, which share wording. If curation prefers not to name the thickener, "Iron-Water Black Paste (Kut)" avoids the question.

## Ajrakh: "Tamarind Seed Paste", local name "Kachika" (Alum And Mud-Resist Printing)

- **Applied (DR-125, 2026-11-08):** the concept title is "Tamarind seed paste (pa)" with `pa` first in its local terms, so the local name shown is Pa; kachika stays a local term for the flour.

- **Proposed local name:** "Pa (Pah)", with kachika recorded as the seed flour. A fuller label would be "Tamarind Seed And Alum Printing Paste".
- **Why:** the GI Journal (PDF p. 6) says "This smooth paste called Pa, is printed with blocks". Karolia and Buch give "kachuka no lot" for the powdered seed and Phulli or Kan for the printing. Kachika is the flour, not the paste.
- **What stays open:** nothing about the name. The paste's colour is a separate question, recorded on the look row.

## Machilipatnam Kalamkari: "Karam" on the alum fixing dip

- **Applied (DR-125, 2026-11-08):** the dip uses a new concept `machilipatnam-kalamkari.material.alum` ("Alum", no local name) whose claim and BELONGS_TO link quote S4 PDF p. 12; `alum-karam` keeps the printing stage, the dip stage drops `karam` from its local terms, and the dip's look rows drop the local name.

- **Where:** the template's Alum item at the Alum Fixing Dip carries the local name "Karam", and the sheet's alum dip bath and alum crystal rows mirror it.
- **Proposed correction:** drop "Karam" at the fixing dip, and keep it on the alum printing paste at the mordant-printing stage.
- **Why:** Census 1961 (para 15) uses karam for the gum-and-alum red printing mixture, and Varadarajan calls the alum printing mordant karam. S4 glosses alum as Karam, but no source names the dip bath so.

## Machilipatnam Kalamkari: the kasim pot as a "buried stone pot" (curation records)

- **Applied (DR-125, 2026-11-08):** the tool is titled "Earthen pot for kasim"; its claims keep both sources (S4's stone pot, S15's mud jar immersed in soil). No stage shows this tool, so no still changed.

- **Where:** `content/traditions/machilipatnam-kalamkari/tradition.json` has a tool "Buried stone pot for kasim", and the kasim material summary presents stone and burial as general fact. `content/comparisons.json` quotes the neighbouring S4 sentences.
- **Proposed correction:** "Large earthen pot for kasim", with burial recorded as one workshop's practice.
- **Why:** the GI application (PDF p. 8), Sengupta at Polavaram (p. 85) and the Pitchuka workshop at Pedana describe an earthen pot. "Stone" appears only in S4, and Varadarajan, whom S4 follows, prints "barrel shaped brass pot".
- **What stays open:** whether the pot is sunk. Burial is attested only by one Pedana family and by S4, whose independence is unproven, and the two give different depths.

# Cross-Tradition Comparisons: Source Verification (2026-11-08)

Evidence table for `content/comparisons.json`, verified under the lead's delegation (DR-126) by the method of the DR-120 tradition checks and the DR-122 shared-science check. Every claim and every relationship was checked only against the sources this file already records, each re-declared from a tradition file as `<tradition>:<id>`, each quote at its page or section, with a verbatim quote that a script finds in the archived source text. No source was added.

## Why

DR-120 verified the six tradition files and DR-122 the shared craft science, but `comparisons.json` never had the source check (DR-124 corrected two items and listed the full check as not done). Its 11 concepts and 79 relationships stayed `under_review`, 66 of the relationships had no located passage for any cited source, and three claim quotes failed at their locators.

## Result

- **Quotes:** 360 of 360 found verbatim at their locator (before the changes below: 213 of 216).
- **Claims:** 69 in 11 concepts, unchanged in number; every cited source of every claim has at least one quote, and every claim was read against its quotes.
- **Concepts:** 11 verified (all were `under_review`).
- **Relationships:** 79, all verified, none removed. Every cited source of every relationship has its one quote of at most 25 words (before: 13 relationships had passages, 66 had none). Every endpoint is a verified concept of a tradition file or of this file.

## Method

- **Tool:** `content/review/tools/evidence/verify_tradition.py content/comparisons.json <archive dir> <out.json>` (the DR-122 version, unchanged), xpdf `pdftotext` 4.06. Normalisation is `norm()` from `verify_quotes.py` only.
- **Archive:** no new download. Each `<tradition>:<id>` source maps to the copy archived for its tradition's own check, under `D:/Work/IIT-KGP/Paper_1-artifacts/sources/`: `ajrakh-2026-11-07`, `bagh-2026-11-07` (`archive.tsv`), `bagru-2026-11-08` (`archive.json`, cache files), `dabu-2026-11-07`, `machilipatnam-kalamkari-2026-11-08` and `sanganeri-2026-11-07`. The combined `archive.json` for this file is kept as `D:/Work/IIT-KGP/Paper_1-artifacts/sources/comparisons-2026-11-08/archive.json`, with the check's output `verify-result.json` beside it. The SHA-256 of every copy read:

| Source | Copy | SHA-256 |
|---|---|---|
| ajrakh:S1 | pdf `gi-journal-1050.pdf` | `aef5e0ee9144cfc1159fd2d99cea7fc3e183d69726dae7be44ae7559d2d1fcd3` |
| ajrakh:S1 | html `S1.bin` | `c603cb4fa24c54c11ef9f670d8c0a1568eb9305ce1916566bd57919c989dd45d` |
| ajrakh:S2 | pdf `gi-journal-1050.pdf` | `aef5e0ee9144cfc1159fd2d99cea7fc3e183d69726dae7be44ae7559d2d1fcd3` |
| ajrakh:S2 | html `S1.bin` | `c603cb4fa24c54c11ef9f670d8c0a1568eb9305ce1916566bd57919c989dd45d` |
| ajrakh:S3 | html `S3.bin` | `2a8ad1e93af75dfb800187fbff3edff54896ebf81b6ba277327be3b278264caf` |
| ajrakh:S7 | html `S7.bin` | `fe769214f0c7e20ae17291ba36b219495383fb4791e5d35c0deda6fe1f900a95` |
| ajrakh:S8 | html `S8.bin` | `4cfe231a887f44f4c8a1fb409dd60671b5a7b5a00a9eb74b84fac3a5e4f92fec` |
| ajrakh:S9 | html `S9.bin` | `fcf29a3662db396e3cb2e9e64a1d2bc555b8eb2df4c3ee99251338769f823d76` |
| ajrakh:S10 | html `S10.bin` | `d38c47e6311507576f37358ce076ddb21d935832238f3a6b47cfff608496c7de` |
| ajrakh:S11 | html `S11.bin` | `691324d8f471caf0dc42b7662846c3c741fa43bcd8dd1e0b51c276bc6bf029dc` |
| bagh:S1 | pdf `14008717a7b4.raw` | `b0e6f4487225a12ca566b9cdf24592b9e97de6432f4d00d996a33847eb490fed` |
| bagh:S2 | html `7dea80e07da2.raw` | `235e1960ebe49313e407c10b56493f9684241e2bda23ac2813d1a10d282dd952` |
| bagh:S3 | html `d0819f500a9a.raw` | `ea7aa69e50fe599dad9d9fd063d31088c66362d8110762043d00d86823ae2b7b` |
| bagh:S4 | html `3e3ae624a40e.raw` | `909f72acd25e9a647cdf94a42acdaafc90614a699ff2c84c280579d68ae7dcb0` |
| bagh:S5 | html `876972ac07dd.raw` | `f2c4651a687b16b122c4075d4f31f3ed71965a54334d87e0a7de2b7b86d99b7a` |
| bagh:S6 | html `33eeb4356076.wb.raw` | `02514a83ba0899c2a0080dee7827d9cd3492f34368e85240c64edd45fd3483c7` |
| bagh:S7 | pdf `2d97df1beb6a.raw` | `c3cffb3cd753d74508befad93aa2050cb2d41d8a6e75bcb4da65bce2166b5d25` |
| bagh:S12 | html `57e76fee13ba.raw` | `5cd0024a7178803a69d0674f53ab68e06b9984274b70c9a5678b12635df08cb4` |
| bagru:S1 | pdf `b7ad8eb0b223.bin` | `e63d8ebafe1c3fae3d3d9c04486ec7d10ff15dc78c0f6a4a37a41155af93c569` |
| bagru:S2 | html `f896df0a3b86.bin` | `ed4d5fffd8e50aa9d4deac6241a07bda94919e5e96492c8d83beac63c6f757f9` |
| bagru:S3 | pdf `9cf5a8dd74f1.bin` | `7b588259e0bc08b9b617733f279c28da24179a54459bcb78112c792672758dcd` |
| bagru:S4 | pdf `f3ef062a367e.bin` | `34100398c940a9915c31b7ab0b5376504a3aa19a2e8684ed9a71a1d7a283c6d5` |
| bagru:S5 | html `8b78dcd3bccd.bin` | `21f095d04e1512594990ad2995502a742ee41e75104988767e439717ea305e10` |
| bagru:S6 | html `3c0a3bd8ea5e.bin` | `280467e416050dcdd264089a79783d3eba99c07d93f4fc3258e043513dc69653` |
| bagru:S8 | html `2f0c3689a03f.bin` | `512070568af561418a941b81f9c64aaa3d3e73b16a7ca816da3d257d8936daeb` |
| dabu:S1 | html `S1.html` | `cd3daff897e6eadf8ae602364b9c5b796cc0be08d2fdf2e270e9b3930e053752` |
| dabu:S2 | html `S2.html` | `0187c1717d57aab2ec65aa3a58002406d89e2848ae260fd93155941d19ee6f90` |
| dabu:S3 | html `S3.html` | `ee5a7601a177ff902e1fce511982de426559aadf15eacf1093ca5b4df01117e7` |
| dabu:S5 | html `S5.html` | `3f462f1dfd02509b0812737f554ebac353240a2f755b00674a9d74adb40ccddc` |
| dabu:S6 | html `S6.html` | `f51586967b81539ad8de0c8e49ae5cf6f4cbea42c06f3f4ab45c61d2c45f4a5e` |
| dabu:S12 | html `S12.html` | `deca7fa95b05ca94731248d3aaa310a8619acb821ea4a69406aa3361f6063aec` |
| dabu:S18 | html `S18.html` | `8bb660b954f7f01debc62c74b28ee36bc2b7509e704d17c83cd2df27091840b0` |
| dabu:S20 | html `S20.html` | `21d5ca9349d9a8c5f975e97adf3de9d03f8040f721a99627f9c79b20b033e379` |
| dabu:S23 | pdf `S23.pdf` | `34100398c940a9915c31b7ab0b5376504a3aa19a2e8684ed9a71a1d7a283c6d5` |
| machilipatnam-kalamkari:S1 | html `S1.html` | `c19cfee28d6f5ebac41b1dcc24621a8e93c9313b91255ee29b2d15c291304bb8` |
| machilipatnam-kalamkari:S3 | html `S3.html` | `f83c6d8aa6dbfd2cee4c31c4876549016dca2f81bd003eea7059cb5bf9193cf8` |
| machilipatnam-kalamkari:S4 | pdf `S4.pdf` | `74b0f3d5f95d6bb29f11d4e16c8fcbd89e379e02e8dedd8adeba7e924f4862f7` |
| machilipatnam-kalamkari:S5 | html `S5.html` | `473ab3fc26600f64aa62994d438888b892dd445bd5d7de9dacdafb5c25311ac9` |
| machilipatnam-kalamkari:S6 | pdf `S6.pdf` | `4dc5b58970ffc578566d886cd6b91a72485249db7c3959e46e5c68c97c86c41b` |
| machilipatnam-kalamkari:S10 | html `S10.html` | `dc48381f7d4094e0e5f13023ae8bb8e0be7f6b2221591a6350778521ecd16c37` |
| machilipatnam-kalamkari:S11 | html `S11.html` | `1a7239e7b7a9839356fb1d1975c9c22b7d010294402830650e2e7e24393718e1` |
| machilipatnam-kalamkari:S13 | html `S13.html` | `5f777f5c38ec825c0d6720a35e098e6ff068ee0a839cd186459fba21a0f1aa7b` |
| machilipatnam-kalamkari:S15 | html `S15.html` | `5d3e71e62ca0822b18332fa97fb5d20b6c18c67b7031913fb827fd10c08714d0` |
| sanganeri:S1 | pdf `S1.pdf` | `3fcd0bfc38871cfadf524dc0ace1b133730db81bf4a5e74dea258f6bcdc290f0` |
| sanganeri:S2 | pdf `S2.pdf` | `95cec494c3096f0f9eef58b27907676b90425ca2d0d5ec94fdacd3fb79c861d7` |
| sanganeri:S4 | pdf `S4.pdf` | `7b588259e0bc08b9b617733f279c28da24179a54459bcb78112c792672758dcd` |
| sanganeri:S5 | html `S5.html` | `857437a3b1abb2c7951af23474f412143e007becc0fcb308ccd480505f9b10b8` |
| sanganeri:S8 | html `S8.html` | `6dc7b4fd31ba5f67c5981924d7d00b491760d332db2b309c3945de940358f6e1` |
| sanganeri:S9 | html `S9.html` | `9606d697aebafadcb69b68bbf17c28f944c6aa984ec3531c87e1dd0c401d93d7` |
| sanganeri:S10 | pdf `S10.pdf` | `f6f4b8c67b681c7cea739acd46b4b45ed0d651b66833f29406734d8c41e5ba0d` |
| sanganeri:S11 | openalex `s11-openalex.json` | `9ff3f428294d454c3aa92ca09c45ac00d37c181b013f7b6091cb5159a9f13ec7` |
| sanganeri:S12 | html `S12.html` | `47c621f8aa9572b42309c738df3bfb19afa582065fe2f7ca6dc56c3d4bb8e45f` |
| sanganeri:S14 | html `S14.html` | `072556f18f4b05ca59e6da4ecfd03042de4e87e0d003d7176cc997ee1a455f72` |

## Changes Made

Quotes that failed at their locator:

- `resist-methods #2`: dabu:S3 'Location: Deesa, Gujarat' is in the section `§ "Craft Revival Trust New Delhi, India"`, not under a `Details` heading (the Dabu file's own locator).
- `process-length #0`: ajrakh:S10 '16-stage, water-intensive' is under `§ "Share this article"`, the Ajrakh file's locator.
- `water-dependence #6`: the sanganeri:S11 quote began with an editorial '[Abstract via OpenAlex ...]' note that is not in the abstract; the quote is now the abstract's own sentence.

Quotes that did not bear on their claim, removed: the Machilipatnam 'chief material' sentence (cotton base, not wax), the ajrakh:S11 Shakilbhai scarf caption (replaced by S11's 'He could taste a dye bath and know if it needed lime, soda ash, or dates.'), the bagru:S1 p. 8 history, p. 2 made-ups, p. 7 'heritage textiles' and p. 9 stage list sentences, the sanganeri:S1 p. 6 design sentence, the dabu:S2 'Significance' and page-chrome lines and the dabu:S1 tag list, the ajrakh:S1 'interesting fact' and 'Two Master Artisans' lines, two off-topic ajrakh:S10 sentences, the bagh:S1 p. 16 'Uniqueness' line, the sanganeri:S10 p. 3 royal patronage sentence, the ajrakh:S7 camel-dung caption, the bagru:S8 category footer, the sanganeri:S14 page title and the bagru:S4 bibliography line (S4 is no longer cited by that claim). One bagh:S1 quote was cut to the sentence that carries the claim; the sanganeri:S1 p. 9 quote now includes 'Sun Bleaching ... Tapai', the step it calls most typical; machilipatnam-kalamkari:S3 gained its 'Myrobalan treatment' sentence, which names the solution the claim is about. `dabu:S12`, listed in `sources` but cited by nothing, was taken out of the list.

Claims reworded to what their quotes say: lime, mud and sand resists as one Akola account (`resist-methods #3`); kali mitti as the source's 'clay soil' (`#4`); the Machilipatnam wax account is Asia InCH's account of Machilipatnam, not a general kalamkari description (`#5`); green to blue as oxygen meets the dye (`indigo-application #0`); vat judged by taste and by colour (`#4`); harara aiding the black and red (`mordant-systems #1`); tannic acid attracting the mordants (`#2`); the karakayya solution (`#3`); iron with jaggery, fermentation only where stated (`#4`); alizarin with each mordant, as each source puts it (`#5`); the Bagru account in the Dabu file without the unsourced 'only' and 'low reliability' (`#6`); madder and coal-tar alizarin (`red-dye-sources #0`); madder and the shortage of vegetable alizarin (`#2`); Mumbai alizarin (`#3`); naphthol and the red salt (`#4`); dhawadi phool (`#5`); the over-dyed Sanganeri ground and the tapai step (`ground-after-red-bath #1`); the Saraswati and the other local conditions (`water-dependence #3`); the Coromandel combination of chemicals (`#4`); Beduch water and residue water, without 'chemical' (`#5`); discharge without treatment (`#6`); Sanganer Chhipas described as Hindus and followers of Namdev (`community-histories #3`); Ismail Khatri's words on Maldhari styles (`community-specific-design #0`); Adivasis 'only for particular occasions' (`#1`); green by a further yellow dyeing (`bagru-sanganeri-parallel #1`); the Bagru GI's 'does not differ except' background, without the OCR-doubtful 'fawn' (`#3`). Each concept's summary and body follow its claims.

Relationships: each explanation and condition now says no more than its passages. Conditions that only reported an endpoint as `needs_evidence` (no longer true since DR-120 and DR-122) or a fact no cited source states (Akola tar boiled off, copper versus iron vessels at Machilipatnam, the 2001 relocation, alkaline boiling at Pedana, tamarind in kut, the Khatri credit for Dabu, the aal open question) were removed. `bagru.tradition.bagru-hand-block-print CONTRASTS_WITH sanganeri.tradition.sanganeri-hand-block-printing` no longer cites bagru:S4, whose passages state neither centre's ground or milieu.

## Concepts

| Concept | Claims | Quotes | State |
|---|---|---|---|
| comparisons.comparison.resist-methods | 6 | 17 | verified |
| comparisons.comparison.indigo-application | 5 | 19 | verified |
| comparisons.comparison.mordant-systems | 7 | 24 | verified |
| comparisons.comparison.red-dye-sources | 9 | 17 | verified |
| comparisons.comparison.ground-after-red-bath | 5 | 12 | verified |
| comparisons.comparison.process-length | 7 | 12 | verified |
| comparisons.comparison.water-dependence | 7 | 16 | verified |
| comparisons.comparison.community-histories | 7 | 16 | verified |
| comparisons.comparison.community-specific-design | 5 | 9 | verified |
| comparisons.comparison.gi-status | 7 | 18 | verified |
| comparisons.comparison.bagru-sanganeri-parallel | 4 | 10 | verified |

## Relationships

| Relationship | Source | Locator | Quote |
|---|---|---|---|
| bagru.material.dabu-paste SIMILAR_TO sanganeri.material.dabu-resist-paste | bagru:S1 | PDF p. 13 | Dabu paste is prepared by mixing 'Kali Mitti" (clay soil), lime @idhan) wheat flour and gum. |
| bagru.material.dabu-paste SIMILAR_TO sanganeri.material.dabu-resist-paste | sanganeri:S1 | PDF p. 14 | Dabu paste is prepared by mixing *Kali mittf', lime (Bidhan) wheai flour and gurn |
| bagru.material.dabu-paste SIMILAR_TO dabu.material.mud-black-clay | bagru:S1 | PDF p. 14 | *Dabu" (Resist) paste used at Bagru is made out of looally available black clay soil. |
| bagru.material.dabu-paste SIMILAR_TO dabu.material.mud-black-clay | dabu:S20 | § "CRAFT HISTORY" | The process involves applying a handmade resist paste of black clay, lime, and natural gum to block-printed designs |
| bagru.material.dabu-paste SIMILAR_TO dabu.material.mud-black-clay | dabu:S3 | § "Craft Revival Trust New Delhi, India" | The resist Dabu clay paste is made of a complex mixture of silt, from the dried river-bed, a local natural gum, lime, sugar-cane molasses |
| ajrakh.material.gach-mud-resist SIMILAR_TO dabu.material.mud-black-clay | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | a smooth fine paste is mixed from tree gum (Guar ka godh), clay (lal mitti), water and millet flour. |
| ajrakh.material.gach-mud-resist SIMILAR_TO dabu.material.mud-black-clay | dabu:S3 | § "Craft Revival Trust New Delhi, India" | The resist Dabu clay paste is made of a complex mixture of silt, from the dried river-bed, a local natural gum, lime, sugar-cane molasses |
| ajrakh.material.gach-mud-resist SIMILAR_TO dabu.material.mud-black-clay | dabu:S20 | § "CRAFT HISTORY" | The process involves applying a handmade resist paste of black clay, lime, and natural gum to block-printed designs |
| ajrakh.process_stage.gach CONTRASTS_WITH bagru.process_stage.dabu-printing | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | act as a resist, preventing indigo from staining the cloth beneath, whilst the alum content acts a mordant for subsequent application of red dye. |
| ajrakh.process_stage.gach CONTRASTS_WITH bagru.process_stage.dabu-printing | bagru:S1 | PDF p. 11 | Dhabu aca as mechanical resist and prevents the penetration of dye during dyeing on areas covered wilh 'dhabu'' |
| ajrakh.material.lime-gum-resist SIMILAR_TO dabu.material.lime-chuna | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 6 | Outlines of the design, where white is required, are printed with a carved wooden block and a resist paste containing lime and tree gum. |
| ajrakh.material.lime-gum-resist SIMILAR_TO dabu.material.lime-chuna | dabu:S6 | § "Hand Block Printing of Akola, Rajasthan" | chuna /lime or kirana is the weakest resist which is used for fine outlines. |
| ajrakh.material.dusting-agents SIMILAR_TO dabu.material.sawdust | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | Saw dust or finely powdered cow dung is sprinkled over immediately after printing these two gach pastes, to prevent the wet day from smudging. |
| ajrakh.material.dusting-agents SIMILAR_TO dabu.material.sawdust | dabu:S3 | § "Craft Revival Trust New Delhi, India" | covered with sawdust without delay to ensure the wet clay does not smudge |
| bagru.material.sawdust SIMILAR_TO sanganeri.material.sawdust | bagru:S1 | PDF p. 11 | Saw dust has two major functiofls at this stage-first to absorb water from the Dhabu paste and give additional layers of resist' |
| bagru.material.sawdust SIMILAR_TO sanganeri.material.sawdust | sanganeri:S1 | PDF p. 11 | Saw dust has two major functions at this stage-first to absorb water from the Dha!,u paste and glve additional layers of resist. |
| dabu.artisan_decision.choosing-resist-strength SIMILAR_TO bagru.artisan_decision.dabu-strength-selection | dabu:S6 | § "Hand Block Printing of Akola, Rajasthan" | Mitti /mud is used when the cloth needs to be immersed in indigo a few times |
| dabu.artisan_decision.choosing-resist-strength SIMILAR_TO bagru.artisan_decision.dabu-strength-selection | bagru:S4 | PDF p. 5 | Gawarbali Dabu has oil and gawar seed powder added to the paste which gives strength to cloth to go through repeated dyeing. |
| sanganeri.process_stage.dabu-resist-printing SIMILAR_TO dabu.artisan_decision.mud-versus-tar | sanganeri:S1 | PDF p. 11 | Since the resist paste'dlwbu'is thick and sticky no sharp definitioas are achieved. |
| sanganeri.process_stage.dabu-resist-printing SIMILAR_TO dabu.artisan_decision.mud-versus-tar | dabu:S2 | § "Design:" | shifted to the use of tar in a quest for obtaining more refined designs, which was difficult with the use of mud, which mostly cracked |
| sanganeri.process_stage.dabu-resist-printing SIMILAR_TO dabu.artisan_decision.mud-versus-tar | dabu:S1 | § "Dabu printing" | the craftsmen began to use tar instead of mud in case of designs which require sharper contrasts. |
| ajrakh.process_stage.resist-washing SIMILAR_TO dabu.process_stage.washing-off-resist | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | This washing begins gently, to loosen the clay of the resist pastes without smudging, then becomes a vigorous soaking and beating |
| ajrakh.process_stage.resist-washing SIMILAR_TO dabu.process_stage.washing-off-resist | dabu:S18 | § "Dabu Printing" | dried again and then washed thoroughly to remove all traces of the paste and excess dye. |
| machilipatnam-kalamkari.material.beeswax-resist CONTRASTS_WITH dabu.material.mud-black-clay | machilipatnam-kalamkari:S5 | § "Hand Block – Printing/ Kalamkari of Machilipatnam, Andhra Pradesh" | The wax-resist is hand-printed on to the fabric with a kalam or pen made of an iron loop attached to a bamboo stick. |
| machilipatnam-kalamkari.material.beeswax-resist CONTRASTS_WITH dabu.material.mud-black-clay | machilipatnam-kalamkari:S4 | PDF p. 3 | Dyes-They are described in detail in the process. 3. Beeswax 4. Fuel |
| machilipatnam-kalamkari.material.beeswax-resist CONTRASTS_WITH dabu.material.mud-black-clay | dabu:S3 | § "Craft Revival Trust New Delhi, India" | The resist Dabu clay paste is made of a complex mixture of silt, from the dried river-bed, a local natural gum, lime, sugar-cane molasses |
| machilipatnam-kalamkari.material.indigo CONTRASTS_WITH dabu.process_stage.dip-dyeing | machilipatnam-kalamkari:S4 | PDF p. 12 | Indigo does not require any mordant so the solution is printed directly. |
| machilipatnam-kalamkari.material.indigo CONTRASTS_WITH dabu.process_stage.dip-dyeing | dabu:S3 | § "Craft Revival Trust New Delhi, India" | The fabric is then dip dyed. |
| machilipatnam-kalamkari.material.indigo CONTRASTS_WITH dabu.process_stage.dip-dyeing | dabu:S2 | § "process:" | It is a cold dyeing process where the cloth is dipped in a solution of Indigo dye. |
| ajrakh.artisan_decision.indigo-dip-count SIMILAR_TO dabu.artisan_decision.number-of-dips-and-cycles | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | If a design required the darkest shades of the blue then the cloth may be subjected to a total of three or four immersions |
| ajrakh.artisan_decision.indigo-dip-count SIMILAR_TO dabu.artisan_decision.number-of-dips-and-cycles | dabu:S2 | § "process:" | The process is repeated again to obtain the required shade. |
| ajrakh.artisan_decision.indigo-dip-count SIMILAR_TO dabu.artisan_decision.number-of-dips-and-cycles | dabu:S18 | § "Dabu Printing" | This process can be done more than once to achieve the desired color and effect. |
| ajrakh.artisan_decision.tasting-indigo-vat SIMILAR_TO bagru.artisan_decision.reading-the-indigo-vat | ajrakh:S8 | § "We work in harmony with nature" | they could dip their finger in a pot of indigo, taste it, and be able to tell the shade and quality. |
| ajrakh.artisan_decision.tasting-indigo-vat SIMILAR_TO bagru.artisan_decision.reading-the-indigo-vat | ajrakh:S11 | § "Indigo in Kutch, India: Art and Science, Environment and Economics" | He could taste a dye bath and know if it needed lime, soda ash, or dates. |
| ajrakh.artisan_decision.tasting-indigo-vat SIMILAR_TO bagru.artisan_decision.reading-the-indigo-vat | bagru:S1 | PDF p. 11 | An expert indigo dyer can tell the stat of dye by the colour |
| ajrakh.tool.underground-indigo-vat SIMILAR_TO sanganeri.tool.indigo-vat | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | An indigo vat need only be made once, then used daily and ingredients replenished to keep the Vat active, sometimes for decades. |
| ajrakh.tool.underground-indigo-vat SIMILAR_TO sanganeri.tool.indigo-vat | sanganeri:S1 | PDF p. 11 | once tle val is ready for usg it is kept 'alive' by constant addition of iadigo lime and jaggery. |
| bagru.process_stage.neel-rangai-indigo SIMILAR_TO sanganeri.process_stage.indigo-dyeing | bagru:S1 | PDF p. 11 | Indigo has poor affinity to the Abric in t}e presence of water, so tlre first 'dip' gives a pale sky blue shade. |
| bagru.process_stage.neel-rangai-indigo SIMILAR_TO sanganeri.process_stage.indigo-dyeing | sanganeri:S1 | PDF p. 12 | Indigo has poor atrni1V to the fabric in the presio"" of water, so the first 'dip' gves a pale sky blue shade. |
| ajrakh.process_stage.kasano SIMILAR_TO bagru.process_stage.peela-karna-harda | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 5 | The tannin in the Myroballan penetrates the cotton fibres and is essential pre-mordant which aids the adhesion of the subsequent printed mordants onto the cloth. |
| ajrakh.process_stage.kasano SIMILAR_TO bagru.process_stage.peela-karna-harda | bagru:S1 | PDF p. 10 | 'Ilarda' powder is mixed with water, and the cloth is submerged in it, squeezed and dried flat on the ground. |
| bagh.process_stage.harara-treatment SIMILAR_TO machilipatnam-kalamkari.process_stage.myrobalan-treatment | bagh:S1 | PDF p. 12 | On the day after mengnikarna the fabric has to be treated with a solution of harara powder |
| bagh.process_stage.harara-treatment SIMILAR_TO machilipatnam-kalamkari.process_stage.myrobalan-treatment | machilipatnam-kalamkari:S4 | PDF p. 7 | The cloth thus bleached is then soaked in a myrobalan solution. |
| bagh.process_stage.harara-treatment SIMILAR_TO machilipatnam-kalamkari.process_stage.myrobalan-treatment | machilipatnam-kalamkari:S3 | § "Process involved in Block printing with Natural Dyes in Pedana" | After 45 minutes the cloth is` taken out, squeezed evenly and dried in the sunlight. |
| bagru.process_stage.peela-karna-harda SIMILAR_TO sanganeri.process_stage.harda-treatment | bagru:S1 | PDF p. 10 | it is folded and beaten with a wooden mallet to remove excss 'harda' powder and open up the fiber to accept the dye. |
| bagru.process_stage.peela-karna-harda SIMILAR_TO sanganeri.process_stage.harda-treatment | sanganeri:S1 | PDF p. 10 | it is folded and beaten with a wooden mallet to remove excess 'harda' powder and open up the fiber to accept the dye. |
| machilipatnam-kalamkari.process_stage.myrobalan-treatment SIMILAR_TO bagru.process_stage.peela-karna-harda | machilipatnam-kalamkari:S3 | § "Process involved in Block printing with Natural Dyes in Pedana" | After 45 minutes the cloth is` taken out, squeezed evenly and dried in the sunlight. |
| machilipatnam-kalamkari.process_stage.myrobalan-treatment SIMILAR_TO bagru.process_stage.peela-karna-harda | bagru:S1 | PDF p. 10 | 'Ilarda' powder is mixed with water, and the cloth is submerged in it, squeezed and dried flat on the ground. |
| ajrakh.material.kut-iron-paste SIMILAR_TO machilipatnam-kalamkari.material.kasim-iron-acetate | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 6 | made from jaggery, or molasses, in which scrap iron such as horse-hoes and besan (gram flour) have been fermented for ten to fifteen days. |
| ajrakh.material.kut-iron-paste SIMILAR_TO machilipatnam-kalamkari.material.kasim-iron-acetate | machilipatnam-kalamkari:S4 | PDF p. 8 | Iron acetate is a fermented mixture of paddy husk , ironfilings , salt and jaggery. |
| bagru.material.syahi-iron-black SIMILAR_TO sanganeri.material.syahi-iron-black | bagru:S1 | PDF p. 13 | essentially a fermented solution ofiron and fermenting agent molasses 6iggery, gur) and gum. Syahi in combination with harda dev'elops into a deep black colour. |
| bagru.material.syahi-iron-black SIMILAR_TO sanganeri.material.syahi-iron-black | sanganeri:S1 | PDF p. 14 | essentially a fermented solution of iron and fermenting agent molasses fiiggery, gur) and gum. Syahi in combination witl harda develops into a deep black colour. |
| bagru.material.syahi-iron-black SIMILAR_TO sanganeri.material.syahi-iron-black | sanganeri:S10 | PDF p. 6 | iron pieces in the form of horse shoe and jaggery were placed in a certain proportion in cold water for a fortnight |
| bagh.material.iron-black SIMILAR_TO bagru.material.syahi-iron-black | bagh:S1 | PDF p. 13 | Hirakasish or iron sulphate or iron filings are filled in earthen pot where jaggery and water are added to the pot |
| bagh.material.iron-black SIMILAR_TO bagru.material.syahi-iron-black | bagru:S1 | PDF p. 10 | ferrous (syahee) which is traditionally made by reaction of old rusted hone shoe nails with jigsery. |
| bagh.scientific_mechanism.indirect-mordant-dyeing SIMILAR_TO bagru.scientific_mechanism.two-mordant-single-dyebath | bagh:S7 | PDF p. 1 | the mordants applied during the course of printing with the blocks react with the dyeing compound (alizarin in this case) to give the final colours. |
| bagh.scientific_mechanism.indirect-mordant-dyeing SIMILAR_TO bagru.scientific_mechanism.two-mordant-single-dyebath | bagh:S1 | PDF p. 13 | first block printing is done with alum, which is a mordant, after which the colour is retained by dipping the cloth in the specific solution |
| bagh.scientific_mechanism.indirect-mordant-dyeing SIMILAR_TO bagru.scientific_mechanism.two-mordant-single-dyebath | bagru:S1 | PDF p. 10 | the dye reacts with two mordanb at two different locations on tle same print giving two different shades of colours. |
| bagru.scientific_mechanism.two-mordant-single-dyebath SIMILAR_TO sanganeri.explanation.one-dye-two-mordants | bagru:S1 | PDF p. 10 | the dye reacts with two mordanb at two different locations on tle same print giving two different shades of colours. |
| bagru.scientific_mechanism.two-mordant-single-dyebath SIMILAR_TO sanganeri.explanation.one-dye-two-mordants | sanganeri:S1 | PDF p. 11 | the dye reacts with two mordents at two diiTerent locations on the same print grvhg two different shades of colours' |
| machilipatnam-kalamkari.scientific_mechanism.mordant-selective-red-development SIMILAR_TO bagh.scientific_mechanism.indirect-mordant-dyeing | machilipatnam-kalamkari:S10 | § "Bed curtain" | The areas to be red in the finished piece are painted with an alum mordant, and the black areas with an iron mordant. |
| machilipatnam-kalamkari.scientific_mechanism.mordant-selective-red-development SIMILAR_TO bagh.scientific_mechanism.indirect-mordant-dyeing | machilipatnam-kalamkari:S4 | PDF p. 11 | the red color develops as a result of the combination of alum and alizerine |
| machilipatnam-kalamkari.scientific_mechanism.mordant-selective-red-development SIMILAR_TO bagh.scientific_mechanism.indirect-mordant-dyeing | bagh:S7 | PDF p. 3 | The Alizarin powder reacts with the iron rust to give a bright black colour and with the alum solution to give a bright red colour. |
| ajrakh.process_stage.kut CONTRASTS_WITH bagh.scientific_mechanism.iron-alizarin-black | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 6 | onto the harde treated cloth kut develops a deep fast chocolate-black colour as the iron particles in the kut paste oxidise with the tannic acid. |
| ajrakh.process_stage.kut CONTRASTS_WITH bagh.scientific_mechanism.iron-alizarin-black | bagh:S7 | PDF p. 3 | The Alizarin powder reacts with the iron rust to give a bright black colour and with the alum solution to give a bright red colour. |
| bagh.artisan_decision.printing-blind-with-alum SIMILAR_TO sanganeri.material.begar-alum-mordant | bagh:S1 | PDF p. 13 | Since alum is colourless, to enable the block-printer to gauge his print during the printing process, a simple colour (chemical) colour is used |
| bagh.artisan_decision.printing-blind-with-alum SIMILAR_TO sanganeri.material.begar-alum-mordant | sanganeri:S8 | § "Syahi Begar" | Alum was mixed with sticky tree gum paste and a pinch of Geru red ochre to bring out colour in the otherwise transparent paste. |
| bagh.artisan_decision.printing-blind-with-alum SIMILAR_TO sanganeri.material.begar-alum-mordant | sanganeri:S10 | PDF p. 6 | Red colour dye was made using alum and ,,geru a red soil |
| ajrakh.artisan_decision.lime-alum-separation SIMILAR_TO machilipatnam-kalamkari.artisan_decision.avoid-iron-with-alum | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 6 | Care must be taken not to mix this Pa with the areas printed in lime Khariyanu otherwise the lime will discharge the alum |
| ajrakh.artisan_decision.lime-alum-separation SIMILAR_TO machilipatnam-kalamkari.artisan_decision.avoid-iron-with-alum | machilipatnam-kalamkari:S4 | PDF p. 5 | A mixture of iron in any form leads to darkening of the color and for this reason the iron implements and utensils are avoided. |
| ajrakh.environmental_condition.water-iron-content SIMILAR_TO machilipatnam-kalamkari.artisan_decision.avoid-iron-with-alum | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | presence of iron in the water supply dulls and darkens the final result. |
| ajrakh.environmental_condition.water-iron-content SIMILAR_TO machilipatnam-kalamkari.artisan_decision.avoid-iron-with-alum | machilipatnam-kalamkari:S4 | PDF p. 5 | A mixture of iron in any form leads to darkening of the color and for this reason the iron implements and utensils are avoided. |
| machilipatnam-kalamkari.process_stage.alum-fixing-dip SIMILAR_TO bagru.scientific_mechanism.alum-fixes-fugitive-yellow | machilipatnam-kalamkari:S4 | PDF p. 12 | The fabric is then submerged in this solution for a while. The excess yellow color runs off and all the colors are fixed. |
| machilipatnam-kalamkari.process_stage.alum-fixing-dip SIMILAR_TO bagru.scientific_mechanism.alum-fixes-fugitive-yellow | bagru:S1 | PDF p. 12 | The dye extractd from turmeric and pomegranate peals is very fugitive and in order to make it fast, post mordanting is done with alum (fitkari) |
| ajrakh.material.synthetic-alizarin SIMILAR_TO bagru.material.madder-alizarin | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | Derived from coal tar this crystalline red dye rapidly superseded madder, its natural counterpart. |
| ajrakh.material.synthetic-alizarin SIMILAR_TO bagru.material.madder-alizarin | bagru:S1 | PDF p. 14 | maddar (Rubia thctoria, Rubia manjista) which contairu substances called alizarine and purpurin. Nowadays synthetic alizarine is used due to shortage of vegetable alizarine. |
| bagh.material.alizarin SIMILAR_TO machilipatnam-kalamkari.material.alizarin-and-red-roots | bagh:S1 | PDF p. 13 | Earlier, the root of the aal tree (aalkajad) was used as a fastening agent; now alizarine has taken its place. |
| bagh.material.alizarin SIMILAR_TO machilipatnam-kalamkari.material.alizarin-and-red-roots | machilipatnam-kalamkari:S4 | PDF p. 2 | chay (chay is oldenlandia), the root of oldenlandia umbellata, were highly estimated as fine sources of red in the south. |
| bagh.material.alizarin SIMILAR_TO machilipatnam-kalamkari.material.alizarin-and-red-roots | machilipatnam-kalamkari:S6 | PDF p. 6 | Alizarin is used today instead of organic matter. |
| dabu.material.alizarin-and-naphthol-reds CONTRASTS_WITH sanganeri.material.madder-alizarin | dabu:S1 | § "Dabu printing" | Alizarin pigment used to impart red color was replaced by Naphthol |
| dabu.material.alizarin-and-naphthol-reds CONTRASTS_WITH sanganeri.material.madder-alizarin | dabu:S2 | § "process:" | dipped in a red salt, which reacts with the naphthol to give a bright red shade |
| dabu.material.alizarin-and-naphthol-reds CONTRASTS_WITH sanganeri.material.madder-alizarin | sanganeri:S1 | PDF p. 14 | maddar (Rubia tirctoria, Rubia manjista) which contains substanoes called alizarine and purpurin. Nowadays synthetic alizarine is used due to shortage of vegetable alizarine. |
| bagru.material.dhawai-flowers SIMILAR_TO sanganeri.material.dhawai-phool | bagru:S1 | PDF p. 10 | 'l)hawadi pha>l', a local flower is boiled along with alizarin to avoid patches and staining. |
| bagru.material.dhawai-flowers SIMILAR_TO sanganeri.material.dhawai-phool | sanganeri:S1 | PDF p. 11 | 'Dluwadi phool', a local flower is boiled along with alizarin to avoid patches and staining. |
| bagh.material.dhavda-flowers SIMILAR_TO sanganeri.material.dhawai-phool | bagh:S1 | PDF p. 15 | it is boiled in a solution of dhavdakaphool (for shining and fixing) and alizarine (to fasten colours). |
| bagh.material.dhavda-flowers SIMILAR_TO sanganeri.material.dhawai-phool | bagh:S5 | § "Bagh and its legacy in print" | boiled in a mixture containing alizarin (the chemical that transforms the fuchsia pink to the delightful red), dhavdi flowers (Woodfordia fruticosa |
| bagh.material.dhavda-flowers SIMILAR_TO sanganeri.material.dhawai-phool | sanganeri:S1 | PDF p. 11 | 'Dluwadi phool', a local flower is boiled along with alizarin to avoid patches and staining. |
| ajrakh.material.dhawri-tamarisk SIMILAR_TO bagru.material.dhawai-flowers | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | if colour spreads into the white areas a handful of dried tamansk flowers are added. |
| ajrakh.material.dhawri-tamarisk SIMILAR_TO bagru.material.dhawai-flowers | bagru:S1 | PDF p. 10 | 'l)hawadi pha>l', a local flower is boiled along with alizarin to avoid patches and staining. |
| machilipatnam-kalamkari.material.dye-bath-plant-additives SIMILAR_TO bagh.material.dhavda-flowers | machilipatnam-kalamkari:S13 | § "Rajarshi Sengupta" | While boiling, leaves from the local forest, known as gaja, are added to the water to fix the colours. |
| machilipatnam-kalamkari.material.dye-bath-plant-additives SIMILAR_TO bagh.material.dhavda-flowers | bagh:S1 | PDF p. 15 | it is boiled in a solution of dhavdakaphool (for shining and fixing) and alizarine (to fasten colours). |
| ajrakh.tool.copper-dye-pot SIMILAR_TO bagh.tool.copper-bhatti-vat | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 7 | Alizarin crystals or the crushed and steeped roots of majeeta or Indian Madder are gently heated in a large copper pot. |
| ajrakh.tool.copper-dye-pot SIMILAR_TO bagh.tool.copper-bhatti-vat | bagh:S1 | PDF p. 15 | The vats are generally made of copper and are fixed on brick and cement furnaces. |
| ajrakh.historical_context.synthetic-dye-shift-and-revival SIMILAR_TO sanganeri.open_question.natural-vs-synthetic-share | ajrakh:S9 | § "Everything was broken" | But most of us shifted to working with chemicals and eventually stopped natural dyeing. Now we do it if there's a need or an order |
| ajrakh.historical_context.synthetic-dye-shift-and-revival SIMILAR_TO sanganeri.open_question.natural-vs-synthetic-share | sanganeri:S4 | PDF p. 5 | that includes the usage of chemical dyes in abundance and the usage of natural dyes only for specific orders. |
| bagru.open_question.natural-vs-synthetic-share SIMILAR_TO bagh.environmental_condition.synthetic-substitution | bagru:S3 | PDF p. 5 | that includes the usage of chemical dyes in abundance and the usage of natural dyes only for specific orders. |
| bagru.open_question.natural-vs-synthetic-share SIMILAR_TO bagh.environmental_condition.synthetic-substitution | bagh:S5 | § "Bagh and its legacy in print" | Owing to its time inefficiency, artists and small entrepreneurs have forayed into synthetic colours, which are more diverse and cater to urban demands. |
| ajrakh.process_stage.tapano SIMILAR_TO sanganeri.process_stage.sun-bleaching | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | The dyed cloth would be soaked in a solution of camel dung, then spread on the sandy banks of a river in the sun |
| ajrakh.process_stage.tapano SIMILAR_TO sanganeri.process_stage.sun-bleaching | sanganeri:S1 | PDF p. 11 | In this process the fabrio is laid flat on a river bed, A mild solution ofcow dung and water is sprhkled over the fubric. |
| ajrakh.scientific_mechanism.madder-staining-and-clearing SIMILAR_TO sanganeri.explanation.tapai-alkali-and-heat | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | the sun, moisture and various compound in the dung would have acted as a bleaching agent on the white areas of a design. |
| ajrakh.scientific_mechanism.madder-staining-and-clearing SIMILAR_TO sanganeri.explanation.tapai-alkali-and-heat | sanganeri:S1 | PDF p. 11 | The interaction of alkali (of cow dung) and thennal heat (sun ray) bleach the ground colour making it look white again. |
| bagh.process_stage.tarai SIMILAR_TO sanganeri.process_stage.sun-bleaching | bagh:S1 | PDF p. 15 | after washing the cloth, when it is being dried, it is repeatedly moistened by spraying water on it with the hands. |
| bagh.process_stage.tarai SIMILAR_TO sanganeri.process_stage.sun-bleaching | bagh:S6 | § "This 400-year-old tradition of block printing, using natural ingredients and labour-intensive techniques, is no mean fea" | sun-dried on river stones for natural bleaching, and washed three times in running water; a process called tarai . |
| bagh.process_stage.tarai SIMILAR_TO sanganeri.process_stage.sun-bleaching | sanganeri:S1 | PDF p. 11 | A mild solution ofcow dung and water is sprhkled over the fubric. This process is repeated again when the fabric is drying. |
| bagru.design_principle.off-white-ground CONTRASTS_WITH sanganeri.outcome.white-ground-red-black | bagru:S1 | PDF p. 14 | The ground colour of Bagru l{and Block Textile is mostly off white (cream). |
| bagru.design_principle.off-white-ground CONTRASTS_WITH sanganeri.outcome.white-ground-red-black | sanganeri:S1 | PDF p. 11 | In order to make the ground look whitg again the fabric is sun-bleached. |
| bagru.design_principle.off-white-ground CONTRASTS_WITH sanganeri.outcome.white-ground-red-black | sanganeri:S8 | § "Syahi Begar" | This resulted in a bright white background and clear richly coloured butis and butahs. |
| machilipatnam-kalamkari.outcome.pink-ground-and-red-black CONTRASTS_WITH sanganeri.outcome.white-ground-red-black | machilipatnam-kalamkari:S4 | PDF p. 11 | The portions not treated with alum imbibe a pinkish color. |
| machilipatnam-kalamkari.outcome.pink-ground-and-red-black CONTRASTS_WITH sanganeri.outcome.white-ground-red-black | sanganeri:S1 | PDF p. 11 | In order to make the ground look whitg again the fabric is sun-bleached. |
| bagh.process_stage.curing SIMILAR_TO bagru.process_stage.sukhai-ageing | bagh:S1 | PDF p. 14 | The printed material when dry is rolled into bundles and kept away for eight to fifteen days. This allows the colour to set in properly. |
| bagh.process_stage.curing SIMILAR_TO bagru.process_stage.sukhai-ageing | bagru:S1 | PDF p. 10 | The printed ftbric is left for at least three-four days so that the print (mordant paste) panetrates into the fiber struoture. |
| machilipatnam-kalamkari.process_stage.curing-drying SIMILAR_TO sanganeri.process_stage.ageing | machilipatnam-kalamkari:S4 | PDF p. 10 | After block printing the cloth is kept for two to three days until dried. |
| machilipatnam-kalamkari.process_stage.curing-drying SIMILAR_TO sanganeri.process_stage.ageing | machilipatnam-kalamkari:S3 | § "Process involved in Block printing with Natural Dyes in Pedana" | After printing with black and alum the cloth is dried under sun light for one day. |
| machilipatnam-kalamkari.process_stage.curing-drying SIMILAR_TO sanganeri.process_stage.ageing | sanganeri:S1 | PDF p. 10 | The printed fabric is left for at least three-four days so that the print (mordant paste) penetrates |
| bagh.process_stage.bichalna SIMILAR_TO machilipatnam-kalamkari.process_stage.degumming-wash | bagh:S1 | PDF p. 15 | Each piece needs to be kept under flowing water for at least 20 minutes. |
| bagh.process_stage.bichalna SIMILAR_TO machilipatnam-kalamkari.process_stage.degumming-wash | machilipatnam-kalamkari:S4 | PDF p. 10 | It is washed in flowing water to remove the gum and any unwanted mordant so as to avoid development of color in any unwanted area |
| bagru.process_stage.dhulai-mordant-wash SIMILAR_TO machilipatnam-kalamkari.process_stage.degumming-wash | bagru:S1 | PDF p. 10 | The printed 6bric is washed in nuuring water to remove excess mordanb. |
| bagru.process_stage.dhulai-mordant-wash SIMILAR_TO machilipatnam-kalamkari.process_stage.degumming-wash | machilipatnam-kalamkari:S4 | PDF p. 10 | It is washed in flowing water to remove the gum and any unwanted mordant so as to avoid development of color in any unwanted area |
| ajrakh.process_stage.saaj SIMILAR_TO bagh.process_stage.mengni-karna | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 5 | by the third or fourth steeping the dung and oil mixture emulsifies to produce a rich lather, which leaves the cloth bright white and soft |
| ajrakh.process_stage.saaj SIMILAR_TO bagh.process_stage.mengni-karna | bagh:S1 | PDF p. 11 | 1 kg of arandikatel or unrefined castor oil. The three are mixed to make a dhaul solution. |
| bagru.process_stage.hari-sarana-scouring SIMILAR_TO machilipatnam-kalamkari.process_stage.scouring-dung-bleaching | bagru:S1 | PDF p. 9 | Cow dung and watr are mixed together and the cloth is then left dipped in that paste ovemight |
| bagru.process_stage.hari-sarana-scouring SIMILAR_TO machilipatnam-kalamkari.process_stage.scouring-dung-bleaching | machilipatnam-kalamkari:S4 | PDF p. 6 | a solution of buffalo or cow dung and water for 5 to 10 minutes. It is wrung out a little and kept wet overnight. |
| ajrakh.environmental_condition.water-iron-content CONTRASTS_WITH bagh.environmental_condition.river-water-chemistry | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 8 | presence of iron in the water supply dulls and darkens the final result. |
| ajrakh.environmental_condition.water-iron-content CONTRASTS_WITH bagh.environmental_condition.river-water-chemistry | ajrakh:S10 | § "History repeats itself" | If there is even one percent iron in water, the (pale yellow) cloth gets black spots. |
| ajrakh.environmental_condition.water-iron-content CONTRASTS_WITH bagh.environmental_condition.river-water-chemistry | bagh:S4 | § "Thappa Chappai" | The iron content of the river and the running water helps in bringing out finer colors and also softens the fabric. |
| bagh.environmental_condition.river-water-chemistry SIMILAR_TO bagru.open_question.water-quality-claim | bagh:S1 | PDF p. 9 | The chemical composition of this river water has proved to be good for the vegetable dyes used for printing at bagh. |
| bagh.environmental_condition.river-water-chemistry SIMILAR_TO bagru.open_question.water-quality-claim | bagru:S1 | PDF p. 14 | Locally awailable water has excellent properties, ideal for dyeing and printing. |
| sanganeri.open_question.which-river-and-water-effect SIMILAR_TO machilipatnam-kalamkari.environmental_condition.coromandel-soil-water-plants | sanganeri:S10 | PDF p. 5 | The water of the river „Saraswati‟, the soil, the sunshine, the humid air, and the availability of flowers |
| sanganeri.open_question.which-river-and-water-effect SIMILAR_TO machilipatnam-kalamkari.environmental_condition.coromandel-soil-water-plants | machilipatnam-kalamkari:S11 | § "Chintz hanging" | These techniques are particularly associated with coastal south-east India (the so-called 'Coromandel Coast') because of the particularly favourable combination of chemicals in the local soil |
| ajrakh.environmental_condition.soft-water-siting SIMILAR_TO bagh.environmental_condition.flowing-river-water | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 3 | Ajrakh printing originally came from Sindh and got concentrated where extra soft water was available. |
| ajrakh.environmental_condition.soft-water-siting SIMILAR_TO bagh.environmental_condition.flowing-river-water | bagh:S1 | PDF p. 8 | Bagh's proximity to the river was an important reason for its choice as flowing river water is vital to the process of printing. |
| ajrakh.environmental_condition.soft-water-siting SIMILAR_TO bagh.environmental_condition.seasonal-water-availability | ajrakh:S7 | § "Khavda" | But the weather and the water was different, and so the shades of the color were different. |
| ajrakh.environmental_condition.soft-water-siting SIMILAR_TO bagh.environmental_condition.seasonal-water-availability | bagh:S3 | § "Hand Block – Printing of Bagh, Madhya Pradesh" | he has to go to Narmada (40 km away) to wash the textiles, he finds that reds and greys do not come out properly. |
| ajrakh.historical_context.dhamadka-centre SIMILAR_TO bagru.environmental_condition.water-sanjaria-river | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 3 | This water stream dried up in 1989 and water levels from wells and tanks continued to fall. |
| ajrakh.historical_context.dhamadka-centre SIMILAR_TO bagru.environmental_condition.water-sanjaria-river | ajrakh:S9 | § "We are running out of water" | In Dhamadka, the river Saran was always flowing, but it died a slow death by 1989. |
| ajrakh.historical_context.dhamadka-centre SIMILAR_TO bagru.environmental_condition.water-sanjaria-river | bagru:S4 | PDF p. 3 | Today though the river runs dry these artisans thrive in Bagru practicing their same methods of the past |
| bagh.environmental_condition.seasonal-water-availability SIMILAR_TO bagru.environmental_condition.water-sanjaria-river | bagh:S1 | PDF p. 8 | the river Bagh that flows through Bagh is dry several times during the year |
| bagh.environmental_condition.seasonal-water-availability SIMILAR_TO bagru.environmental_condition.water-sanjaria-river | bagru:S4 | PDF p. 3 | Today though the river runs dry these artisans thrive in Bagru |
| ajrakh.environmental_condition.water-availability SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | ajrakh:S9 | § "We are running out of water" | the level of water has been going down by 10-15 feet every year even here. |
| ajrakh.environmental_condition.water-availability SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | ajrakh:S11 | § "Indigo in Kutch, India: Art and Science, Environment and Economics" | the recycled water can be reused for washing fabric. |
| ajrakh.environmental_condition.water-availability SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | bagru:S6 | § "Place: The Final Process" | the region's water table has dropped, threatening the long-term production of textiles in the village. |
| ajrakh.environmental_condition.water-availability SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | bagru:S4 | PDF p. 4 | Now-a-days the used water is treated for recycling or charged into underground. |
| sanganeri.environmental_condition.effluent-and-water-pollution SIMILAR_TO machilipatnam-kalamkari.environmental_condition.effluent-pollution | sanganeri:S10 | PDF p. 10 | Along with them there were some 300 Screen Printing units, which were the main source of the pollution. |
| sanganeri.environmental_condition.effluent-and-water-pollution SIMILAR_TO machilipatnam-kalamkari.environmental_condition.effluent-pollution | machilipatnam-kalamkari:S15 | § "As fake Kalamkari takes over the market, the original struggles in Andhra’s Pedana" | The chemicals used in the colours let out toxic effluents, which is contaminating the water table. |
| dabu.environmental_condition.water-pollution-and-hazards SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | dabu:S2 | § "Waste:" | with the advent of chemical dyes and other mordents, the residue water which washes back into the ground is polluting the groundwater of the region |
| dabu.environmental_condition.water-pollution-and-hazards SIMILAR_TO bagru.environmental_condition.groundwater-and-effluent | bagru:S5 | § "Waste:" | The chemicals in the water seep underground, polluting the underground water of the area |
| ajrakh.historical_context.khatri-migration-to-kutch SIMILAR_TO bagh.historical_context.khatri-migration-from-sindh | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 9 | came to Kutch from Sindh some 400 years ago at the behest of the King of Kutch, who invited craftsmen from Khatri community |
| ajrakh.historical_context.khatri-migration-to-kutch SIMILAR_TO bagh.historical_context.khatri-migration-from-sindh | bagh:S1 | PDF p. 8 | khatri community which comprises the chhipas or printers are believed to have come to Bagh - about 400 years ago - from Larkana is Sindh |
| bagru.historical_context.chhipa-community SIMILAR_TO sanganeri.historical_context.chhipa-community | bagru:S5 | § "Myths & Legends:" | All the Chiapas of Bagru claim to be the descendants of saint Namdeo of Maharashtra (1270-1350). |
| bagru.historical_context.chhipa-community SIMILAR_TO sanganeri.historical_context.chhipa-community | sanganeri:S10 | PDF p. 5 | The printers belong to Chhipa community. They were all Hindus and were followers of the renowned Marathi Saint Namdev. |
| bagru.historical_context.chhipa-community SIMILAR_TO dabu.historical_context.chhipa-and-allied-communities | bagru:S1 | PDF p. 7 | The hand printers" known as chhipa, came from Sawai ll{adhopur, Alwar, Jhuojhunu and Siker districts of Rajasthan to satle in Bagru |
| bagru.historical_context.chhipa-community SIMILAR_TO dabu.historical_context.chhipa-and-allied-communities | dabu:S1 | § "Dabu printing" | the native craftsmen known as Chippas , specialize in block printing. |
| bagru.historical_context.chhipa-community SIMILAR_TO dabu.historical_context.chhipa-and-allied-communities | dabu:S2 | § "History:" (occurrence 1 of 2) | The Hindu caste of cotton printers and dyes known as Chippas were the prominent printing community in Rajasthan. |
| bagru.historical_context.chhipa-community CONTRASTS_WITH ajrakh.historical_context.khatri-migration-to-kutch | bagru:S1 | PDF p. 7 | The hand printers" known as chhipa, came from Sawai ll{adhopur, Alwar, Jhuojhunu and Siker districts of Rajasthan to satle in Bagru |
| bagru.historical_context.chhipa-community CONTRASTS_WITH ajrakh.historical_context.khatri-migration-to-kutch | bagru:S5 | § "Myths & Legends:" | All the Chiapas of Bagru claim to be the descendants of saint Namdeo of Maharashtra (1270-1350). |
| bagru.historical_context.chhipa-community CONTRASTS_WITH ajrakh.historical_context.khatri-migration-to-kutch | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 9 | came to Kutch from Sindh some 400 years ago at the behest of the King of Kutch, who invited craftsmen from Khatri community |
| bagru.historical_context.chhipa-community CONTRASTS_WITH ajrakh.historical_context.khatri-migration-to-kutch | bagh:S1 | PDF p. 8 | khatri community which comprises the chhipas or printers are believed to have come to Bagh - about 400 years ago - from Larkana is Sindh |
| bagru.historical_context.chhipa-community CONTRASTS_WITH ajrakh.historical_context.khatri-migration-to-kutch | bagru:S3 | PDF p. 6 | The artisans were mostly from the Khatri or Chhipa community. |
| bagru.historical_context.kharadi-block-makers SIMILAR_TO sanganeri.historical_context.kharadi-block-makers | bagru:S1 | PDF p. 2 | Tumers locally known as Kharadiyes posses the skill of producing desired blocks using dried wood of plants like 'shisham", "gu{an", *mango", "teak" and "ardu'. |
| bagru.historical_context.kharadi-block-makers SIMILAR_TO sanganeri.historical_context.kharadi-block-makers | sanganeri:S1 | PDF p. 2 | Turners locally known as Kharadiyes posses the skill of producing tlesired blocks using dried wood ofplants like *shisham-, *eurjao", "6ango", "teak" and "ardu". |
| ajrakh.design_principle.community-specific-designs SIMILAR_TO bagh.historical_context.community-specific-prints | ajrakh:S7 | § "We have walked all over the Banni" | the Maldhari community had a distinct style, a distinct color palette and design. |
| ajrakh.design_principle.community-specific-designs SIMILAR_TO bagh.historical_context.community-specific-prints | bagh:S1 | PDF p. 16 | Earlier the artisans used to make different prints and even different clothes for different communities and castes |
| bagru.historical_context.community-clientele SIMILAR_TO dabu.design_principle.community-specific-patterns | bagru:S1 | PDF p. 14 | Colours and designs on Bagru l{and Block Print enables identification of user community. (Coloun and designs are specific for Jat, Meena, Rajput, Mali communities). |
| bagru.historical_context.community-clientele SIMILAR_TO dabu.design_principle.community-specific-patterns | dabu:S6 | § "Hand Block Printing of Akola, Rajasthan" | The former is worn primarily by the women of the Jat and Chaudhury castes |
| sanganeri.design_principle.social-design-categories SIMILAR_TO bagru.historical_context.community-clientele | sanganeri:S8 | § "Syahi Begar" | The 'Syahi Begar' black and red designs on gossamer white cloth adorned the Safa turbans or Angochha shawls of men of the local community . |
| sanganeri.design_principle.social-design-categories SIMILAR_TO bagru.historical_context.community-clientele | sanganeri:S9 | § "Sanganeri" | Fabrics and garments with floral motifs on white or soft-toned colours were patronised by the nobility at Jaipur court |
| sanganeri.design_principle.social-design-categories SIMILAR_TO bagru.historical_context.community-clientele | bagru:S1 | PDF p. 5 | Irr contrast to the courtly sensibility of the Sanganer work, the Bagru lland Block Prints are deeply rooted in the local folk milieu. |
| ajrakh.design_principle.both-sided-printing CONTRASTS_WITH sanganeri.outcome.print-visible-on-reverse | ajrakh:S1 | GI Journal No. 188 copy (application 1050), PDF p. 6 | When double sided Ajrakh is printed it is essential that the same outline design be printed on the reverse of the cloth. |
| ajrakh.design_principle.both-sided-printing CONTRASTS_WITH sanganeri.outcome.print-visible-on-reverse | sanganeri:S1 | PDF p. 1 | Itfut design is equally vividly seen on the underside ofthe cloth. |
| ajrakh.design_principle.both-sided-printing CONTRASTS_WITH sanganeri.outcome.print-visible-on-reverse | sanganeri:S10 | PDF p. 5 | „gurjan‟, „mango‟ and „teak‟ wood that the print appeared vividly at the backside. |
| dabu.historical_context.gi-application CONTRASTS_WITH ajrakh.historical_context.gi-registration | dabu:S5 | § "Application Details" | Application Number 845 Geographical Indications Aakola Dabu Prints Status Pre Examination |
| dabu.historical_context.gi-application CONTRASTS_WITH ajrakh.historical_context.gi-registration | ajrakh:S2 | § "Application Details" | Status Registered |
| dabu.open_question.gi-status SIMILAR_TO bagru.open_question.gi-date-reporting | dabu:S5 | § "Application Details" | Application Number 845 Geographical Indications Aakola Dabu Prints Status Pre Examination |
| dabu.open_question.gi-status SIMILAR_TO bagru.open_question.gi-date-reporting | dabu:S20 | § "WHAT MAKES IT UNIQUE:" | Received a GI tag in 2023 |
| dabu.open_question.gi-status SIMILAR_TO bagru.open_question.gi-date-reporting | bagru:S2 | § "Application Details" | Certificate Number 150 Certificate Date 11-05-2011 |
| dabu.open_question.gi-status SIMILAR_TO bagru.open_question.gi-date-reporting | bagru:S8 | § "Bagru Print GI Tag" | In 2024, Bagru print was granted the Geographical Indication (GI) tag |
| bagru.historical_context.market-change-and-imitation SIMILAR_TO sanganeri.historical_context.screen-printing-shift | bagru:S1 | PDF p. 16 | Fake (screm printe/) Bagru Textiles are being sold ali over India in the name of Bagru l{and Block Print. |
| bagru.historical_context.market-change-and-imitation SIMILAR_TO sanganeri.historical_context.screen-printing-shift | sanganeri:S1 | PDF p. 16 | Fake (screen printed) Sanganeri Textiles are being sold all over India in tle name of Sanganeri Print. |
| machilipatnam-kalamkari.outcome.screen-printed-imitation SIMILAR_TO sanganeri.historical_context.screen-printing-shift | machilipatnam-kalamkari:S15 | § "As fake Kalamkari takes over the market, the original struggles in Andhra’s Pedana" | If you use chemical colours, it may be cheaper, but the colour fades in two to three washes |
| machilipatnam-kalamkari.outcome.screen-printed-imitation SIMILAR_TO sanganeri.historical_context.screen-printing-shift | sanganeri:S12 | § "Textile mills pollute the waters" | Screen printing was a cost effective, mechanical and faster way of printing by using synthetic dyes and chemicals for bleaching. |
| bagru.process_stage.chhapai-mordant-printing SIMILAR_TO sanganeri.process_stage.mordant-printing | bagru:S1 | PDF p. 10 | two mordant-fenous ('syahee ) made out of rusted horse shoe nails, and aluminum sulphate ('beggar). Usually ferrous is printed with the outline block ('rekh). |
| bagru.process_stage.chhapai-mordant-printing SIMILAR_TO sanganeri.process_stage.mordant-printing | sanganeri:S1 | PDF p. 10 | two mordant-ferrous ('ry"h*r) made out of rusted horse shoe nails, and aluminum zulphate (b*SC*) Uzually ferrous is printed with the outline block ('reAh'). |
| bagru.process_stage.chhapai-mordant-printing SIMILAR_TO sanganeri.process_stage.mordant-printing | sanganeri:S8 | § "Syahi Begar" | The begar paste was then applied using a 'Datta' block to fill in the 'Rekh' (the outlining block) |
| bagru.process_stage.haldi-naspal-putai SIMILAR_TO sanganeri.process_stage.yellow-dyeing | bagru:S1 | PDF p. 11 | Four persons hold it at each oomer and fifth person dips a loose-woven woolen fabrio which acts as a sponge in the dye |
| bagru.process_stage.haldi-naspal-putai SIMILAR_TO sanganeri.process_stage.yellow-dyeing | sanganeri:S1 | PDF p. 12 | Four persons hold it at each corner and fifth person dips a loose-woven woolel fabric which acts as a sponge in the dye |
| bagru.outcome.bagru-green SIMILAR_TO sanganeri.outcome.green-by-overdyeing | bagru:S1 | PDF p. 11 | green it is taken for further process of yellow dyeing but before this it is printed with dhabu to retain some blue areas. |
| bagru.outcome.bagru-green SIMILAR_TO sanganeri.outcome.green-by-overdyeing | sanganeri:S1 | PDF p. 12 | green it is taken for further process of yellow dyeing but before this it is printed with dhabu to refain some blue areas. |
| bagru.outcome.bagru-green SIMILAR_TO sanganeri.outcome.green-by-overdyeing | sanganeri:S5 | § "Textile" | green made by combining indigo with a yellow dye, probably turmeric. |
| bagru.tradition.bagru-hand-block-print CONTRASTS_WITH sanganeri.tradition.sanganeri-hand-block-printing | bagru:S1 | PDF p. 5 | Irr contrast to the courtly sensibility of the Sanganer work, the Bagru lland Block Prints are deeply rooted in the local folk milieu. |
| bagru.tradition.bagru-hand-block-print CONTRASTS_WITH sanganeri.tradition.sanganeri-hand-block-printing | sanganeri:S1 | PDF p. 1 | Base colour of S4rganri tland Block Printings is white. |

Every relationship above is `verified`.

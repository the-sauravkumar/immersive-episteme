# Fact-check: bagh/tradition.json

Date: 2026-10-14. Scope: 180 claims in 60 concepts, 60 relationships, 13 sources and 4 media candidates. I checked every claim against the text of the source it cites.

How the sources were re-fetched:
- S1 (Wayback copy of GI Journal 75) and S7: text extracted with pdftotext. S1 was read in full for the Bagh section (journal pp. 6–17).
- S10 (PIB brochure PDF): text extracted with pdftotext.
- All other pages: fetched with curl and converted to text.
- I also checked the registry record for application 98 (the product GI) to confirm the `gi` block.

## Sources

| ID | Status | Notes |
|---|---|---|
| S1 GI Journal 75, app. 505 (logo) | ok | Method order: Khara karna → Mengni karna → Harara → Making colours → Printing → Curing (8–15 days) → Bichalna → Bhatti → Tarai (washing/bleaching) → Over-dyeing (optional). Much of the text matches S3 verbatim (measured in verification.md V2; direction of copying not established). |
| S2 Registry record 505 | ok | Filed 08-01-2015; Class 24; Journal 75; Cert. 239 dated 31-03-2016; valid to 07-01-2025. The registry also lists a "Renewal Notice" dated 26-11-2024; I added this to the notes. Product application 98 was checked separately on the registry: filed 13-06-2007, Cert. 78 dated 10-07-2008. This matches the `gi` block and S12. |
| S3 Asia InCH / Craft Revival Trust | **reliability overstated** | Lowered from high to medium: the page is unsigned, undated field documentation (written about 2002, since it says "40 years ago (1962)"). It does not call Ismail Khatri a "national awardee", and it does not list kosa, chiffon, georgette or mulberry silk; those two claims are now cited to S1 only. |
| S4 Gaatha | ok | |
| S5 Down To Earth (14 Jun 2014) | ok | |
| S6 Outlook Traveller (Nov 2017) | **misattributed in 2 concepts + source note** | Outlook identifies the bhatti *dhawadi* as **Woodfordia fruticosa**. It gives *Anogeissus latifolia* only for the "dhawda plant" whose **leaves** make khaki. It also says harada-yellowed cloth is dried in **controlled sunshine** and that **shade** drying turns it green, the opposite of Gaatha. |
| S7 Jain 2019 | ok | |
| S8 Paramparik Karigar 2017 p.38 | ok | Quotes are verbatim; the source uses a curly apostrophe. |
| S9 Incredible India | ok (low) | |
| S10 PIB-hosted Tribes India brochure | **reliability overstated** | Lowered from medium to low: it is a TRIFED marketing brochure. |
| S11 The Hitavada 29-11-2022 | ok | |
| S12 Global InCH index | ok | Certificate date 10/7/2008. |
| S13 Wikipedia "Bagh print" | ok (low) | Has "Application number 98 in 2008". |

No source is dead. All 4 media candidates are on Commons and licensed CC BY-SA 4.0, as stated.

## Claims changed (before → after, reason)

1. **master-artisans-recognition**: "Ismail Khatri is described as an eminent printer and national awardee" [S1,S3] → [S1]. Reason: S3 does not say this.
2. **base-fabric**: list of fabrics including kosa, chiffon, georgette and mulberry silk [S1,S3] → [S1]. Reason: S3 lacks these fabrics.
3. **alum**: body "a fugitive colour may be added" → "a simple temporary (chemical) colour is added", and the unsourced local term `phitkari` was removed. The **printing-blind-with-alum** summary was reworded the same way.
4. **dhavda-flowers**: claim "Dhawda is identified as Anogeissus latifolia [S6]" → "Outlook identifies the bhatti dhawadi as Woodfordia fruticosa, and names the dhawda plant whose leaves are used for khaki as Anogeissus latifolia". The body was rewritten. Reason: the original misread S6. The sources agree on the bhatti flower; the open issue is that one name may cover two plants.
5. **open_question.dhavda-identity-and-role**: the S6 claim and the summary were rewritten as in item 4, and a note was added.
6. **harara-treatment** body: a note was added that Outlook contradicts Gaatha on shade versus sun drying.
7. **drying-light** → needs_evidence. The summary now states the conflict, and a note was added. Relationship AFFECTED_BY `harara → drying-light`: the explanation and conditions were updated and S6 was added as the contradicting source.
8. **bhatti** body: "four–six hours (GI, Gaatha)" → "about three hours (Down To Earth) and five to six hours (Gaatha); the GI says about eight people work a bhatti for six hours". Reason: no source gives "four".
9. **Relationship removed**: USES `over-dyeing → secondary-dyes`. Reason: S1's over-dyeing stage uses harara + alum or iron sulphate followed by bichalna and bhatti. The khaki, mustard and indigo dyes are not part of that stage.
10. **Relationship** DEPENDS_ON `double-dye → over-dyeing` → needs_evidence. Reason: S1 describes the two separately.
11. **Relationship** SCIENTIFICALLY_EXPLAINED_BY `harara-tannin-ground → shared.tannin-pre-mordanting` → needs_evidence. Reason: the Bagh sources report the brightening effect but not tannin chemistry.

Verified unchanged:
- All 8 quotes are verbatim and 25 words or fewer.
- The 9 PRECEDES links (ordinals 1–9) follow S1's stage order.
- The local stage names match S1 and S6: khara karna, mengni karna, harara/peela, bichalna, bhatti, tarai.
- There are no CAUSES links. DEPENDS_ON, REQUIRES and the other SCIENTIFICALLY_EXPLAINED_BY links are supported. Iron-alizarin black and the river-chemistry claims were already needs_evidence.

## Concepts removed

None.

## Residual risks

- S1 (GI) and S3 (Asia InCH) share text, so most "S1, S3" pairs are a single source counted twice.
- Process quantities come from two informants quoted in S3, Amar Singh Chauhan and Ismail Khatri, and their figures differ:
  - harara: 10 kg vs 15–20 kg;
  - mordant ageing: 8 vs 10 days;
  - Narmada: 30 km vs 40 km vs "five hours away".
- The river-water chemistry claims (copper, iron, lime) have no measurements and remain an open question.
- Dhavda's identity is unresolved: possibly two plants under one name.
- Whether today's alizarin is synthetic is undocumented.
- Down To Earth lists harra and bahera in the bhatti bath, which conflicts with the GI's statement that bahera is not used. This conflict is not recorded in the file.
- The S7 journal's peer-review status is uncertain.

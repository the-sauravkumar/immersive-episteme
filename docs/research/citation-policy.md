# Citation policy

Applies to **every citation in this project**: research documents, the knowledge dataset
(`content/`), the design-process record, specifications, code comments that justify a
decision, and reports to the project lead. It covers earlier citations too; older ones are
being backfilled (see "Backfill status").

## What every citation must contain

1. **A specific source.** Author(s), year, title, venue and DOI or URL. For a web page:
   publisher, page title, URL and access date.
2. **A precise location.**
   - Paginated sources (PDFs, journals, books): the **PDF page index** and, where different,
     the **printed page number**, written as `p. 4362 (PDF p. 4)`.
   - Unpaginated sources (web pages, HTML records, registry entries): a **locator**, i.e. the
     nearest section heading, field name or table row, e.g. `§ "Process", para 3`.
   - The concept note (a Word document without page numbers): **section and paragraph
     id**, e.g. `§9, P98`, where P-numbers count non-empty paragraphs from the start.
3. **The exact verbatim quotation** that supports the statement, in quotation marks. Do not
   edit words, word order or punctuation. An omission is shown with `…` and an insertion
   with `[ ]`. Keep quotations short (normally ≤ 40 words) and quote only what supports
   the statement.

## Verification

A citation is valid only when its quotation has been found **on the stated page** of an
archived copy of the source by the project's verifier (`verify_quotes.py`). The only
normalisation it allows is for PDF-extraction artefacts: ligatures, curly quotes and dashes,
line-end hyphenation and whitespace. Anything else is a failure. A failed or unverifiable
citation is removed or marked **UNVERIFIED** with the reason. It is never left looking
authoritative.

## Authority and conflicts

- The **concept note** is the primary authority for project scope and research intent.
- A claim *in the concept note* about another work is checked against that work. Each one
  is marked **Supported**, **Partly supported**, **Not supported**, **Contradicted** or
  **Not verifiable** (source not available).
- Any contradiction between the concept note and a reference is flagged explicitly, quoting
  both sides. The concept note stays authoritative for scope, but the conflict is
  recorded for the researchers to resolve.
- Secondary reporting (a paper describing *another* paper's finding) is labelled
  **secondary**, and the original is cited when available.

## Backfill status

| Area | Status |
|---|---|
| Technical requirements from the concept note and reference papers | **Done:** `technical-requirements.md` (25 concept-note requirements, 224 paper requirements; 56 + 788 quotations verified verbatim) |
| Knowledge dataset claims (`content/`) | **Done:** every one of 1,256 claims carries `evidence[]` with a located verbatim passage from each source it cites (1,888 passages after removing page chrome; `content/review/verification.md` §V11). Passages support curator review; they do not verify the claim. They are carried through the snapshot and the database (`concept_claim_sources.evidence`, migration 0012) into the shared citation panel, the same in 2D and 3D |
| Design-process record (`docs/research/design-process/`) | **DR-014 done:** each of its 9 claims now carries source, locator and verified verbatim quote (Courrèges 2015; Epic GPU Lightmass, TSR and Nanite docs; Yang, Liu & Salvi 2020; three.js 0.186.1 source lines). DR-016 quotes Petersen et al. 2022 p. 9; DR-017 cites `study-decisions.md`, where every source is quoted with its page (170 quotations verified). Module records written by build agents are checked when they are integrated |
| Rendering research (`docs/architecture/immersive-rendering-quality.md`, DR-014) | **Done:** 37 claims cited inline, keyed to a source table (§5); 6 marked **UNVERIFIED** with reasons; budgets and thresholds restated as our own requirements measured by C1–C12. Flagged: 2 claims contradicted by their sources (UASTC memory saving "4–8×": sources support ~4×; "no lossy shortcuts" vs lossy KTX2/UASTC) and 1 source conflict (UASTC for normal maps: Khronos guide vs MDN). 65 quotations verified (6 PDF via `verify_quotes.py`; 59 web/code via a section-scoped check with the same normalisation) |

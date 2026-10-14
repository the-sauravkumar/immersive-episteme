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
| Knowledge dataset claims (`content/`) | Pending: add a verbatim evidence excerpt and page/locator to every claim |
| Design-process record (`docs/research/design-process/`) | Pending: add page and quotation to literature citations (e.g. DR-014) |
| Rendering research (`docs/architecture/immersive-rendering-quality.md`, DR-014) | Pending |

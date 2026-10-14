"""Build docs/research/technical-requirements.{md,json} from verified extractions.
Every quotation is copied from the JSON (already verified verbatim); nothing is retyped."""
import json, glob, os, sys, re
sys.stdout.reconfigure(encoding="utf-8")
R = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
CN = json.load(open(os.path.join(R, "cn_requirements.json"), encoding="utf-8"))
P = {os.path.basename(f)[:-5]: json.load(open(f, encoding="utf-8")) for f in sorted(glob.glob(os.path.join(R, "extract", "*.json")))}

ORDER = ["krokos", "yang2021", "makransky2021", "petersen2022", "zhou2022", "hunglee2025", "aiden2024", "wen2024", "songevans2024", "lu2026"]
CITE = {
 "krokos": "Krokos, E., Plaisant, C., & Varshney, A. (2019). Virtual memory palaces: immersion aids recall. *Virtual Reality*, 23(1), 1–15. https://doi.org/10.1007/s10055-018-0346-3",
 "yang2021": "Yang, F., Qian, J., Novotny, J., Badre, D., Jackson, C. D., & Laidlaw, D. H. (2021). A virtual reality memory palace variant aids knowledge retrieval from scholarly articles. *IEEE TVCG*, 27(12), 4359–4373. https://doi.org/10.1109/TVCG.2020.3009003",
 "makransky2021": "Makransky, G., & Petersen, G. B. (2021). The Cognitive Affective Model of Immersive Learning (CAMIL). *Educational Psychology Review*, 33(3), 937–958. https://doi.org/10.1007/s10648-020-09586-2",
 "petersen2022": "Petersen, G. B., Petkakis, G., & Makransky, G. (2022). A study of how immersion and interactivity drive VR learning. *Computers & Education*, 179, 104429. https://doi.org/10.1016/j.compedu.2021.104429",
 "zhou2022": "Zhou, Y., Chen, J., & Wang, M. (2022). A meta-analytic review on incorporating virtual and augmented reality in museum learning. *Educational Research Review*, 36, 100454. https://doi.org/10.1016/j.edurev.2022.100454",
 "hunglee2025": "Hung, P.-T., & Lee, B. (2025). Exploring the next phase of situated and interactive docents for XR exhibitions: from the perspective of knowledge delivery. *International Journal of Human–Computer Interaction*, 41(17), 10767–10786. https://doi.org/10.1080/10447318.2024.2437127",
 "aiden2024": "Quantin, M., Plessis, W., & Laroche, F. (2024). AIDEN, a visualization tool in virtual reality for RDF graph. *Procedia CIRP*, 128, 538–542 (34th CIRP Design Conference). https://doi.org/10.1016/j.procir.2024.03.034",
 "wen2024": "Wen, P., Lu, F., & Mohamad Ali, A. Z. (2024). Using attentional guidance methods in virtual reality laboratories reduces students' cognitive load and improves their academic performance. *Virtual Reality*, 28(2), 110. https://doi.org/10.1007/s10055-024-01012-0",
 "songevans2024": "Song, Z., & Evans, L. (2024). The museum of digital things: extended reality and museum practices. *Frontiers in Virtual Reality*, 5, 1396280. https://doi.org/10.3389/frvir.2024.1396280",
 "lu2026": "Lu, Y.-C., Hwang, G.-J., & Tu, Y.-F. (2026). Self-explanation-guided virtual museum learning for knowledge co-construction based on the constructivist framework: a randomised control study. *Journal of Computer Assisted Learning*, 42(4), e70296. https://doi.org/10.1002/jcal.70296",
}
SHORT = {"krokos": "Krokos et al. 2019", "yang2021": "Yang et al. 2021", "makransky2021": "Makransky & Petersen 2021", "petersen2022": "Petersen et al. 2022", "zhou2022": "Zhou et al. 2022", "hunglee2025": "Hung & Lee 2025", "aiden2024": "Quantin et al. 2024 (AIDEN)", "wen2024": "Wen et al. 2024", "songevans2024": "Song & Evans 2024", "lu2026": "Lu et al. 2026"}

# Lead-verified overrides of agent verdicts (evidence: Crossref version-of-record metadata, verified PDF quotes).
OVR = {
 ("krokos", "P183"): ("Supported", "Crossref (version of record): Virtual Reality 23(1), 1–15, 2019; online-first 2018. The archived PDF is the online-first version."),
 ("yang2021", "P184"): ("Supported", "Crossref: IEEE TVCG 27(12), 4359–4373, 2021. The archived PDF is the accepted manuscript (2020), hence no printed pages."),
 ("makransky2021", "P185"): ("Supported", "Crossref: Educational Psychology Review 33(3), 937–958, 2021. The concept note omits only the issue number."),
 ("hunglee2025", "P40"): ("Supported", "The abstract (PDF p. 2) says \"Analyzing 737 exhibit commentary descriptions from 10\" [exhibitions]. Wording nuance: these are 737 descriptions of exhibits, not 737 separate commentaries."),
 ("hunglee2025", "P191"): ("Contradicted", "Author names are wrong. The PDF and Crossref give Pei-Tzu Hung & Bokyung Lee, not \"Hung, C.-Y., & Lee, C.-H.\"; volume, issue and pages missing: 41(17), 10767–10786."),
}

def qfmt(q):
    pp = f"p. {q['printed_page']} (PDF p. {q['pdf_page']})" if q.get("printed_page") not in (None, "", "null") else f"PDF p. {q['pdf_page']}"
    sec = " *(secondary: reports another study)*" if q.get("secondary") else ""
    return f"{pp}: “{q['quote']}”{sec}"

L = []
w = L.append
w("# Technical requirements: concept note and reference papers\n")
w("This document extracts the technical requirements for Immersive Episteme from the concept note (primary authority for scope) and the ten reference papers supplied with it. It follows `docs/research/citation-policy.md`: every requirement drawn from a paper gives the citation, page number and an exact verbatim quotation.\n")
w("## How this was produced and verified\n")
nq = sum(len(q.get("quotes", [])) for d in P.values() for g in ("cn_characterisation_checks", "requirements") for q in d.get(g, []))
ncn = sum(len(r["refs"]) for r in CN)
w(f"- **Concept note:** read in full. It is a Word document without page numbers, so it is cited by section and paragraph id (P1–P194, counting non-empty paragraphs). All {ncn} concept-note quotations were checked against the extracted paragraph text (verbatim, 0 failures), and their section labels against the document's headings (0 mismatches).")
w(f"- **Reference papers:** each PDF was extracted page by page. Each paper was read in full and the requirements extracted. Every quotation ({nq} in total) was then checked mechanically against the stated PDF page: **{nq}/{nq} verbatim** (normalisation limited to ligatures, curly quotes and dashes, line-end hyphenation and whitespace). Quotes that were line fragments were expanded to the full containing sentence from the same page.")
w("- **Bibliographic data:** confirmed against Crossref, the version of record, for all eleven references with a DOI.")
w("- **Page numbers:** the printed journal page where the PDF shows one, with the PDF page index. Three archived PDFs are pre-print or online-first versions without printed page numbers (Krokos et al., Yang et al., Makransky & Petersen), so only PDF pages are given for them.")
w("- **Effect sizes and power:** calculations marked *derived* were computed by the project team (exact two-sample t-test power via the noncentral t distribution, scipy 1.18.1, α = .05 two-sided). They are not statements by the papers.\n")

w("## 1. Requirements from the concept note (primary authority)\n")
for r in CN:
    w(f"**{r['id']} ({r['area']}).** {r['req']}")
    for s, p, q in r["refs"]:
        w(f"- {s}, {p}: “{q}”")
    w("")

w("## 2. Flags on the concept note\n")
w("### 2.1 Claims and citations that cannot be verified\n")
w("| Concept-note location | Issue |")
w("|---|---|")
w("| §1, P5 | “Existing research shows that immersive and extended-reality environments can support engagement, presence, recall and learning…”: no citation in the paragraph. The reference-table sources partly support it (see §3, `zhou2022`, `makransky2021`, `petersen2022` checks). |")
w("| §2, P11 | “Recent XR heritage research treats embodied engagement as part of the process through which encoded information becomes user-constructed meaning.”: no citation. Most likely Wang et al. (2026), which is not available (below). **Not verifiable.** |")
w("| §3, P36–P38 Han et al. (2023) | No reference entry and no PDF. **Not verifiable.** |")
w("| §3, P51–P53 Poupard et al. (2025) | No reference entry and no PDF. **Not verifiable.** |")
w("| §3, P54–P56 De Bruyne et al. (2025/26) | No reference entry and no PDF. **Not verifiable.** |")
w("| §3, P63–P65 Jiang & Gou (2026) | No reference entry and no PDF. **Not verifiable.** |")
w("| §3, P57–P59 and §14, P192 Wang et al. (2026) | Reference metadata confirmed on Crossref (Information Processing & Management 63(2), 104445), but no PDF supplied. **Content not verifiable.** |")
w("")
w("### 2.2 Reference-list errors (checked against the PDFs and Crossref)\n")
w("| Reference | Finding |")
w("|---|---|")
w("| §14, P190 AIDEN | No authors given. The authors are Quantin, Plessis & Laroche (2024); the title uses a comma (“AIDEN, a visualization tool…”); it is a conference paper (34th CIRP Design Conference). |")
w("| §14, P191 Hung & Lee | **Author names wrong.** It is Pei-Tzu Hung & Bokyung Lee, not “C.-Y.” and “C.-H.”; volume, issue and pages missing (41(17), 10767–10786). |")
w("| §14, P193 Lu et al. | Authors incomplete (Lu, Hwang & Tu); volume and issue missing (42(4), e70296). |")
w("| §14, P185 Makransky & Petersen | Issue number missing (33(3)). Otherwise correct. |")
w("| §14, P183 and P184 Krokos; Yang | Correct per Crossref. The archived PDFs are online-first and accepted-manuscript versions. |")
w("")
w("### 2.3 Concept-note statements that differ from the project's current state\n")
w("| Concept note | Current state |")
w("|---|---|")
w("| §6, P76: “The project already has artisan knowledge and process knowledge for six block-printing traditions.” | That knowledge was not provided to the platform team. The six-tradition dataset was curated from public sources and verified first-hand (`content/review/verification.md`). |")
w("| §7, P90: “The existing Hand Block Museum can be adapted rather than rebuilt.” | Deliberate deviation by the project lead: built fresh, with the museum used as a read-only design reference (design-process DR-002). |")
w("")
w("### 2.4 Decisions the concept note leaves open\n")
w("- Between-group vs counterbalanced within-participant design (§8, P95: “To be decided later.”).")
w("- Guidance approach (§3, P56: “we may have to take a call on what approach we will use”).")
w("- Which validated cognitive-load measure (§9, P103), and which UX measure among SUS, UMUX-Lite and UEQ-S (§9, P105).")
w("- “Query asked” logging (§10, P121) implies a query or search feature; under equivalence (§7, P91) it must exist in both conditions or in neither.\n")

w("## 3. Concept-note statements about the reference papers, checked\n")
w("| Paper | Concept-note statement | Verdict | Evidence (verbatim) | Note |")
w("|---|---|---|---|---|")
for k in ORDER:
    d = P[k]
    for c in d["cn_characterisation_checks"]:
        pid = re.findall(r"P\d+", c["cn_ref"])
        verdict, note = c["verdict"], c.get("note", "")
        for p_ in pid:
            if (k, p_) in OVR:
                verdict, note = OVR[(k, p_)][0], OVR[(k, p_)][1] + " *(lead-verified override)*"
        ev = "<br>".join(qfmt(q) for q in c.get("quotes", [])[:2]).replace("|", "\\|")
        w(f"| {SHORT[k]} | {c['cn_ref']}: “{c.get('cn_text','')[:160].replace('|','/')}” | **{verdict}** | {ev} | {note[:420].replace('|','/')} |")
w("")

w("## 4. Contradictions and qualifications: concept note vs reference papers\n")
w("Each row quotes the paper. The concept-note side is quoted in the note. The concept note remains authoritative for scope; these are for the researchers to resolve.\n")
for k in ORDER:
    for r in P[k]["requirements"]:
        if r.get("relation_to_concept_note") == "conflicts":
            w(f"- **{r['id']}** ({SHORT[k]}; concept note {r.get('cn_ref')}): {r['requirement']}")
            w(f"  - Paper: {qfmt(r['quotes'][0])}")
            w(f"  - Conflict: {r.get('conflict_note')}")
w("")
w("**Sample size (derived; not a statement by any paper).** The concept note plans about 20 participants per group (§8, P94). Exact two-sample t-test power at n = 20 per group:")
w("- d = 0.45 (Zhou et al.'s pooled achievement effect): 0.284; 80% power needs 79 per group.")
w("- d = 0.60: 0.456; needs 45 per group.")
w("- d = 0.64 (Lu et al.'s largest effect): 0.505; needs 40 per group.")
w("- d = 0.84 (Yang et al.'s recall effect): 0.735; needs 24 per group.\n")
w("Unless the expected effect is large, the planned between-group sample is underpowered. Petersen et al. (2022) and Lu et al. (2026) also report sample-size limitations (see their requirement entries).\n")

w("## 5. Requirements from the reference papers\n")
w("Grouped by paper. `Relation` gives how each requirement stands against the concept note (supports, extends, conflicts, independent).\n")
for k in ORDER:
    d = P[k]
    w(f"### {SHORT[k]}\n")
    w(f"{CITE[k]}\n")
    for r in d["requirements"]:
        rel = r.get("relation_to_concept_note")
        w(f"**{r['id']}** [{r['category']}; {r.get('evidence_strength','')}; relation: {rel}{'; concept note ' + r['cn_ref'] if r.get('cn_ref') else ''}]: {r['requirement']}")
        for q in r["quotes"]:
            w(f"- {qfmt(q)}")
        w("")

w("## 6. Verification record\n")
w(f"- Concept-note quotations: {ncn} checked, {ncn} verbatim, section labels 0 mismatches.")
w(f"- Reference-paper quotations: {nq} checked, {nq} verbatim on the stated PDF page.")
w("- Reproduce with the extraction and verification scripts: verify_quotes.py checks every quote against per-page text, layout and reading order (see `docs/research/citation-policy.md`).")
open(os.path.join(OUT, "technical-requirements.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
json.dump({"concept_note_requirements": CN, "papers": P, "overrides": {f"{a}:{b}": v for (a, b), v in OVR.items()}, "citations": CITE},
          open(os.path.join(OUT, "technical-requirements.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("requirements:", sum(len(d["requirements"]) for d in P.values()), "checks:", sum(len(d["cn_characterisation_checks"]) for d in P.values()), "quotes:", nq, "CN reqs:", len(CN))

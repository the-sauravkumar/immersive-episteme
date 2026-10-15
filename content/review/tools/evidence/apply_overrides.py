"""Pin the correct supporting passage for claims whose automatic excerpt was wrong or incomplete.
Each pinned excerpt is the sentence (from the same archived source, located segment) that matches
the regex; it is prepended to that claim-source's excerpts. Reviewed by hand (review-weak.txt)."""
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
SCR = sys.argv[1]
sys.path.insert(0, os.path.join(SCR, "reqs"))
from verify_quotes import norm
SEG = json.load(open(os.path.join(SCR, "evidence", "segments.json"), encoding="utf-8"))
rows = json.load(open(os.path.join(SCR, "evidence", "evidence.json"), encoding="utf-8"))

# (claim key, claim index, source id) -> regex that the supporting sentence must contain
PINS = [
 ("comparisons.comparison.community-specific-design", 0, "ajrakh:S7", r"distinct style, a distinct colou?r palette"),
 ("shared.scientific_mechanism.iron-tannin-black", 5, "S5", r"most achromatic shade"),
 ("ajrakh.historical_context.earthquake-2001-ajrakhpur", 1, "S9", r"completely destroyed"),
 ("ajrakh.historical_context.earthquake-2001-ajrakhpur", 1, "S9", r"40 kms away"),
 ("ajrakh.historical_context.earthquake-2001-ajrakhpur", 1, "S9", r"80 Khatri families"),
 ("ajrakh.open_question.migration-date", 3, "S12", r"year 1586"),
 ("ajrakh.process_stage.kasano", 1, "S10", r"initial stages is when the cloth is dyed with myrobalan"),
 ("bagru.design_principle.motif-groups", 2, "S4", r"Chhota Bel"),
 ("comparisons.comparison.resist-methods", 5, "machilipatnam-kalamkari:S4", r"Beeswax"),
 ("machilipatnam-kalamkari.material.beeswax-resist", 0, "S4", r"Beeswax"),
 ("bagh.tool.wooden-blocks", 2, "S4", r"immersed in oil for a few days"),
 ("bagh.tool.wooden-blocks", 2, "S4", r"Teak provides the perfect base"),
 ("machilipatnam-kalamkari.design_principle.market-customised-design", 2, "S14", r"mainly want these traditional designs"),
 ("machilipatnam-kalamkari.design_principle.mordant-palette", 1, "S4", r"imbibe a pinkish colou?r"),
 ("machilipatnam-kalamkari.material.kora-cotton-cloth", 2, "S14", r"mangalgiri and other cotton"),
 ("sanganeri.artisan_decision.design-for-patron-and-occasion", 2, "S10", r"buyer decides the motif"),
 ("sanganeri.historical_context.eighteenth-century-records", 1, "S1", r"\(A\.D\. 1799\) in a square octroi seal"),
 ("sanganeri.historical_context.eighteenth-century-records", 1, "S1", r"1910 \(A\.D\. 1853\)"),
 ("sanganeri.historical_context.eighteenth-century-records", 1, "S1", r"1963 \(A\.D\. 1906\)"),
 ("sanganeri.outcome.product-range", 1, "S1", r"length 8 mtrs"),
 ("sanganeri.tool.bunta-wooden-block", 4, "S10", r"instead of 3-5 inches"),
 ("comparisons.comparison.mordant-systems", 6, "dabu:S23", r"[Hh]arda"),
 ("ajrakh.outcome.traditional-garments", 1, "S6", r"width of the cloth is 1 metre"),
 ("shared.scientific_mechanism.tannin-pre-mordanting", 4, "S5", r"contains 28% tannins"),
]
# Pairs whose decisive passage could not be extracted verbatim; the note tells the curator where to look.
NOTES = {
 ("shared.scientific_mechanism.tannin-pre-mordanting", 4, "S5"):
  "The statement that tannin behaves as a mordant is on PDF p. 11, in a passage whose extracted text is corrupted (doubled glyphs); check it against the PDF page.",
}

def sentences(url):
    for s in SEG.get(url, []):
        t = norm(s["text"])
        for x in re.split(r"(?<![\s(]\d)(?<![\s(]\d\d)(?<=[.!?])\s+(?=[A-Z0-9\"'(“])", t):
            yield s["locator"], x.strip()

applied, missing = 0, []
for key, idx, sid, rx in PINS:
    r = next((r for r in rows if r["key"] == key and r["claim_index"] == idx and r["source_id"] == sid), None)
    if not r:
        missing.append((key, idx, sid, "no claim-source row")); continue
    hit = next(((loc, s) for loc, s in sentences(r["url"]) if re.search(rx, s)), None)
    if not hit:  # abbreviations such as "A.D." break sentence splitting: fall back to a word window
        for sg in SEG.get(r["url"], []):
            t = norm(sg["text"]); m = re.search(rx, t)
            if m:
                pre, w = t[:m.start()].split(), t[m.start():].split()
                hit = (sg["locator"], " ".join(pre[-20:] + w[:25])); break
    if not hit:
        missing.append((key, idx, sid, rx)); continue
    loc, s = hit
    w = s.split()
    if len(w) > 60:  # trim to a 60-word window around the match
        m = re.search(rx, s); pre = len(s[:m.start()].split())
        a = max(0, pre - 25); s = " ".join(w[a:a + 60])
    ex = {"locator": loc, "quote": s, "pinned": True}
    r["excerpts"] = [ex] + [e for e in r["excerpts"] if e["quote"] != s]
    applied += 1
for r in rows:
    n = NOTES.get((r["key"], r["claim_index"], r["source_id"]))
    if n: r["note"] = n
json.dump(rows, open(os.path.join(SCR, "evidence", "evidence.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("pins applied:", applied, "not found:", missing)

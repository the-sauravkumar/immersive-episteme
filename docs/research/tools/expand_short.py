"""Expand quotes shorter than 8 words to the full sentence that contains them, taken verbatim
from the reading-order extraction of the same page (flow/). Quotes that cannot be located in the
reading-order text, or whose sentence is not cleanly bounded, are left unchanged and reported."""
import json, glob, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(__file__))
from verify_quotes import norm  # same normalisation the verifier uses

R = os.path.dirname(os.path.abspath(__file__))
MAXW = 60
changed = kept = 0
for f in sorted(glob.glob(os.path.join(R, "extract", "*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    key = d["paper"]
    for grp in ("cn_characterisation_checks", "requirements"):
        for it in d.get(grp, []):
            for q in it.get("quotes", []):
                if len(q["quote"].split()) >= 8:
                    continue
                fp = os.path.join(R, "flow", key, f"p{q['pdf_page']}.txt")
                t = norm(open(fp, encoding="utf-8", errors="ignore").read()) if os.path.exists(fp) else ""
                i = t.find(norm(q["quote"]))
                if i < 0:
                    kept += 1; print("KEEP (not in reading-order text)", key, q["pdf_page"], q["quote"]); continue
                # sentence start: after the last ". " / "? " / "! " before i; end: next terminator after the quote
                starts = [m.end() for m in re.finditer(r"[.?!]\s+(?=[A-Z\"'(])", t[:i])]
                s = starts[-1] if starts else max(0, t.rfind(" ", 0, max(0, i - 300)))
                m = re.search(r"[.?!](?=\s|$)", t[i + len(norm(q["quote"])):])
                e = i + len(norm(q["quote"])) + (m.end() if m else 0)
                sent = t[s:e].strip()
                if not m or len(sent.split()) > MAXW or len(sent.split()) < len(q["quote"].split()):
                    kept += 1; print("KEEP (sentence unbounded or too long)", key, q["pdf_page"], q["quote"]); continue
                q["quote_fragment_original"] = q["quote"]
                q["quote"] = sent
                changed += 1
    json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"expanded {changed}; kept {kept}")

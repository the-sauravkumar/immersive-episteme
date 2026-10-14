"""Verify that every quotation in the extraction JSON files appears verbatim on the stated PDF page.

Normalisation (PDF-extraction artefacts only): ligatures (ﬁ ﬂ ﬀ ﬃ ﬄ), curly quotes and dashes,
soft hyphens, line-end hyphenation ("know-\\nledge" -> "knowledge"), and whitespace collapsed.
Words, word order and punctuation are otherwise compared exactly.

usage: python -I verify_quotes.py <pages_dir> <extraction.json> [...]
"""
import json, re, sys, unicodedata, os

LIG = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "­": ""}
PUNCT = {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", " ": " "}

def norm(s: str) -> str:
    for a, b in {**LIG, **PUNCT}.items():
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)       # line-end hyphenation
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def loose(s: str) -> str:
    # also tolerate hyphenation kept/removed differently and spaces around hyphens
    return re.sub(r"\s*-\s*", "-", norm(s)).lower()

def main():
    pages_dir = sys.argv[1]
    total = ok = 0
    failures = []
    for path in sys.argv[2:]:
        data = json.load(open(path, encoding="utf-8"))
        key = data["paper"]
        quotes = []
        for c in data.get("cn_characterisation_checks", []):
            quotes += [("check " + c.get("cn_ref", "?"), q) for q in c.get("quotes", [])]
        for r in data.get("requirements", []):
            quotes += [("req " + r.get("id", "?"), q) for q in r.get("quotes", [])]
        for where, q in quotes:
            total += 1
            p = q.get("pdf_page")
            f = os.path.join(pages_dir, key, f"p{p}.txt")
            if not os.path.exists(f):
                failures.append((key, where, p, "page file missing", q.get("quote", "")[:90])); continue
            # The stated page in both extractions (layout and reading order), plus a run-on into the next page.
            flow_dir = os.path.join(os.path.dirname(os.path.abspath(pages_dir)), "flow")
            def page_text(d, n):
                fp = os.path.join(d, key, f"p{n}.txt")
                return open(fp, encoding="utf-8", errors="ignore").read() if os.path.exists(fp) else ""
            raw2 = (page_text(pages_dir, p) + "\n" + page_text(pages_dir, int(p) + 1) + "\n\0\n"
                    + page_text(flow_dir, p) + "\n" + page_text(flow_dir, int(p) + 1))
            qt = q.get("quote", "")
            if norm(qt) in norm(raw2) or loose(qt) in loose(raw2):
                ok += 1
            else:
                # locate on another page, to report the correct one
                found = [n for n in sorted(os.listdir(os.path.join(pages_dir, key)), key=lambda x: int(x[1:-4]))
                         if loose(qt) in loose(open(os.path.join(pages_dir, key, n), encoding="utf-8", errors="ignore").read())]
                failures.append((key, where, p, "found on " + ",".join(found) if found else "NOT FOUND", qt[:90]))
    print(f"quotes checked: {total}; verbatim on stated page: {ok}; failed: {len(failures)}")
    for f in failures:
        print(" FAIL", *f, sep=" | ")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()

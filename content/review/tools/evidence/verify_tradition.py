"""Check every evidence quote of one tradition file against an archive of its own recorded sources.

usage: python -I verify_tradition.py <tradition.json> <archive dir> <out.json>

The archive dir holds archive.json: {"<source id>": {"html": "<file>", "pdf": "<file>"}}, naming the
archived copy of each recorded source (either key may be absent). A quote passes only at its locator:
  - 'PDF p. N': on page N of the archived PDF alone (pdftotext -f N -l N);
  - '§ "<heading>"' (with an optional '(occurrence k of n)'): inside the section that follows that
    h1-h4 heading in the archived HTML (the k-th such section when given);
Normalisation is norm() from verify_quotes.py: ligatures, quote marks, dashes, soft hyphens,
line-end hyphenation and whitespace only. A claim's own `quote` passes when it is found anywhere in
one of the claim's sources (its locators are reported). Each quote that fails is searched for in the whole
source, so the report says where it really is. Every claim also gets a width list: the content
words of the claim that none of its quotes contain, which a reader then judges against the quotes.
"""
import hashlib, html, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_quotes import norm

sys.stdout.reconfigure(encoding="utf-8")
PDFTOTEXT = os.environ.get("PDFTOTEXT", "pdftotext")
STOP = set("a an the of and or to in on for with by from as at is are was were be been being it its this that these those which who whom into than so not but also can may might will would should could has have had do does did there their they them we our you your if when where how what why all any each both more most other some only own same very just such then".split())
words = lambda s: [w for w in re.findall(r"[a-z0-9]+", norm(s).lower()) if w not in STOP and len(w) > 2]


def low(s):
    return re.sub(r"\s*-\s*", "-", norm(s)).lower()


def pdf_pages(path):
    pages, n = [], 1
    while True:
        r = subprocess.run([PDFTOTEXT, "-enc", "UTF-8", "-f", str(n), "-l", str(n), path, "-"], capture_output=True)
        if r.returncode != 0:
            break
        pages.append(r.stdout.decode("utf-8", "ignore"))
        n += 1
        if n > 2000:
            break
    return pages


def html_sections(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    raw = re.sub(r"(?is)<(script|style|noscript|svg)\b.*?</\1>", " ", raw)
    parts = re.split(r"(?is)(<h[1-4][^>]*>.*?</h[1-4]>)", raw)
    segs, head = [], "page text"
    for p in parts:
        m = re.match(r"(?is)<h[1-4][^>]*>(.*?)</h[1-4]>", p)
        if m:
            head = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip()[:120] or head
            continue
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p))).strip()
        if t:
            segs.append((head, t))
    return segs


def main():
    tradition, archive, out = sys.argv[1:4]
    data = json.load(open(tradition, encoding="utf-8"))
    amap = json.load(open(os.path.join(archive, "archive.json"), encoding="utf-8"))
    text = {}
    for sid, files in amap.items():
        entry = {}
        if files.get("pdf"):
            p = os.path.join(archive, files["pdf"])
            entry["pdf"] = [low(t) for t in pdf_pages(p)]
            entry["pdf_sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        if files.get("html"):
            p = os.path.join(archive, files["html"])
            entry["html"] = [(low(h), low(t)) for h, t in html_sections(p)]
            entry["html_sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        text[sid] = entry

    def where(sid, q):
        e, found = text.get(sid, {}), []
        found += [f"PDF p. {i + 1}" for i, t in enumerate(e.get("pdf", [])) if q in t]
        found += [f'§ "{h}"' for h, t in e.get("html", []) if q in t]
        return found

    def check(sid, locator, quote):
        q, e = low(quote), text.get(sid)
        if not e:
            return {"ok": False, "why": "source not archived"}
        m = re.search(r"PDF p\. (\d+)", locator)
        if m:
            n = int(m.group(1))
            ok = 0 < n <= len(e.get("pdf", [])) and q in e["pdf"][n - 1]
        else:
            h = re.search(r'§ "(.+?)"(?: \(occurrence (\d+) of \d+\))?$', locator)
            if not h:
                return {"ok": False, "why": "locator is not a page or a heading", "found": where(sid, q)}
            secs = [t for hd, t in e.get("html", []) if hd == low(h.group(1))]
            if h.group(2):
                k = int(h.group(2)) - 1
                secs = secs[k:k + 1]
            ok = any(q in t for t in secs)
            if not secs:
                return {"ok": False, "why": "heading not in archived page", "found": where(sid, q)}
        return {"ok": True} if ok else {"ok": False, "why": "not at locator", "found": where(sid, q)}

    rows = []
    for c in data["concepts"]:
        for i, cl in enumerate(c["claims"]):
            evs = []
            for e in cl.get("evidence", []):
                evs.append({"source_id": e["source_id"], "locator": e["locator"], "quote": e["quote"], **check(e["source_id"], e["locator"], e["quote"])})
            covered = set(w for e in cl.get("evidence", []) for w in words(e["quote"]))
            gap = [w for w in dict.fromkeys(words(cl["text"])) if w not in covered]
            uncited = [s for s in cl["source_ids"] if s not in {e["source_id"] for e in cl.get("evidence", [])}]
            if cl.get("quote"):
                found = [f for s in cl["source_ids"] for f in where(s, low(cl["quote"]))]
                evs.append({"source_id": "claim quote", "locator": ", ".join(found) or "-", "quote": cl["quote"], "ok": bool(found), **({} if found else {"why": "claim quote not in any cited source"})})
            rows.append({"kind": "claim", "key": c["key"], "state": c["verification_state"], "index": i, "text": cl["text"], "source_ids": cl["source_ids"], "uncited": uncited, "width_gap": gap, "evidence": evs})
    for i, r in enumerate(data["relationships"]):
        evs = [{"source_id": e["source_id"], "locator": e["locator"], "quote": e["quote"], **check(e["source_id"], e["locator"], e["quote"])} for e in r.get("evidence", [])]
        uncited = [s for s in r["source_ids"] if s not in {e["source_id"] for e in r.get("evidence", [])}]
        rows.append({"kind": "relationship", "index": i, "source": r["source"], "target": r["target"], "type": r["type"], "state": r["verification_state"], "explanation": r.get("explanation"), "source_ids": r["source_ids"], "uncited": uncited, "evidence": evs})

    hashes = {sid: {k: v for k, v in e.items() if k.endswith("sha256")} for sid, e in text.items()}
    json.dump({"tradition": data["slug"], "archive": hashes, "rows": rows}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    quotes = [e for r in rows for e in r["evidence"]]
    bad = [(r, e) for r in rows for e in r["evidence"] if not e["ok"]]
    print(f"quotes {len(quotes)}; at locator {len(quotes) - len(bad)}; failed {len(bad)}")
    for r, e in bad:
        print(" FAIL", r.get("key") or f'rel {r["index"]} {r["source"]} -{r["type"]}-> {r["target"]}', e["source_id"], e["locator"], e["why"], e.get("found"), "|", e["quote"][:80])
    for r in rows:
        if r["uncited"]:
            print(" NO EVIDENCE", r.get("key") or f'rel {r["index"]}', r.get("index"), r["uncited"])
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

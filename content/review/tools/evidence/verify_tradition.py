"""Check every evidence quote of one tradition file against an archive of its own recorded sources.

usage: python -I verify_tradition.py <tradition.json> <archive dir> <out.json>

The archive dir holds archive.json: {"<source id>": {"html": "<file>", "pdf": "<file>", "openalex": "<file>", "pages": "<dir>"}},
naming the archived copy of each recorded source (any key may be absent). "pages" is a directory of p1.txt..pN.txt,
the per-page text extracted from a PDF whose copy is no longer served, checked like a PDF's pages. A quote passes only at its locator:
  - 'PDF p. N': on page N of the archived PDF alone (pdftotext pages split at form feeds, read with
    both UTF-8 and Latin1 output encodings: the Latin1 text drops the glyphs a scanned text layer maps
    outside Latin-1 and keeps ',,' for low double quotes, as the 2026-10-14 extraction did);
  - 'PDF pp. N-M': on pages N to M read as one run of text;
  - 'Abstract ...': in the abstract of an archived OpenAlex record (key "openalex");
  - '§ "<heading>"' (with an optional '(occurrence k of n)'): inside the section that follows that
    h1-h4 heading in the archived HTML, or that bold subheading (a paragraph or line break holding only
    bold or italic text, as article pages mark their sections), up to the next such heading (the k-th such
    section when given);
Normalisation is norm() from verify_quotes.py: ligatures, quote marks, dashes, soft hyphens,
line-end hyphenation and whitespace only. Each quote that fails is searched for in the whole
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


def pdf_pages(path, enc="UTF-8"):
    r = subprocess.run([PDFTOTEXT, "-enc", enc, path, "-"], capture_output=True, check=True)
    pages = r.stdout.decode("latin-1" if enc == "Latin1" else "utf-8", "ignore").split(chr(12))
    return pages[:-1] if pages and not pages[-1].strip() else pages


def pdf_renderings(path):
    return [tuple(low(t) for t in page) for page in zip(pdf_pages(path), pdf_pages(path, "Latin1"))]


def openalex_abstract(path):
    inv = json.load(open(path, encoding="utf-8"))["abstract_inverted_index"]
    return " ".join(w for _, w in sorted((i, w) for w, ix in inv.items() for i in ix))


HEAD = r"<h[1-4][^>]*>(.*?)</h[1-4]>"
BOLD = r"<p[^>]*>\s*<(?:strong|b|em|i)>([^<]{2,120})</(?:strong|b|em|i)>\s*</p>|<br\s*/?>\s*<b>([^<]{2,120})</b>\s*<br\s*/?>"


def html_sections(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    raw = re.sub(r"(?is)<(script|style|noscript|svg)\b.*?</\1>", " ", raw)
    segs = []
    for marks in (HEAD, HEAD + "|" + BOLD):
        head, bold = "page text", False
        for p in re.split(f"(?is)((?:{marks}))", raw):
            if p is None:
                continue
            m = re.fullmatch(f"(?is){marks}", p)
            if m:
                h = next(g for g in m.groups() if g is not None)
                bold = m.group(1) is None
                head = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()[:120] or head
                continue
            t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p))).strip()
            if t and (marks == HEAD or bold):
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
            entry["pdf"] = pdf_renderings(p)
            entry["pdf_sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        if files.get("pages"):
            d = os.path.join(archive, files["pages"])
            n = len([f for f in os.listdir(d) if re.fullmatch(r"p\d+\.txt", f)])
            raw = [open(os.path.join(d, f"p{i}.txt"), "rb").read() for i in range(1, n + 1)]
            entry["pdf"] = [(low(b.decode("utf-8", "ignore")),) * 2 for b in raw]
            entry["pages_sha256"] = hashlib.sha256(b"".join(raw)).hexdigest()
        if files.get("html"):
            p = os.path.join(archive, files["html"])
            entry["html"] = [(low(h), low(t)) for h, t in html_sections(p)]
            entry["html_sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        if files.get("openalex"):
            p = os.path.join(archive, files["openalex"])
            entry["abstract"] = low(openalex_abstract(p))
            entry["openalex_sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        text[sid] = entry

    def where(sid, q):
        e, found = text.get(sid, {}), []
        found += [f"PDF p. {i + 1}" for i, page in enumerate(e.get("pdf", [])) if any(q in t for t in page)]
        found += [f'§ "{h}"' for h, t in e.get("html", []) if q in t]
        found += ["Abstract"] if q in e.get("abstract", "") else []
        return found

    def check(sid, locator, quote):
        q, e = low(quote), text.get(sid)
        if not e:
            return {"ok": False, "why": "source not archived"}
        m = re.search(r"PDF pp?\. (\d+)(?:-(\d+))?", locator)
        if locator.startswith("Abstract"):
            ok = q in e.get("abstract", "")
        elif m:
            a, b = int(m.group(1)), int(m.group(2) or m.group(1))
            ok = 0 < a <= b <= len(e.get("pdf", [])) and any(q in " ".join(page[k] for page in e["pdf"][a - 1:b]) for k in (0, 1))
        else:
            h = re.search(r'§ "(.+?)"(?: \(occurrence (\d+) of \d+\))?$', locator)
            if not h:
                return {"ok": False, "why": "locator is not a page, a heading or an abstract", "found": where(sid, q)}
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

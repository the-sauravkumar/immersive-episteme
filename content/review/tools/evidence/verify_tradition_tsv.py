USAGE = """Check one tradition file's evidence against archived copies of its own recorded sources.

usage:
  python -I verify_tradition_tsv.py check <tradition.json> <archive.tsv> <source-manifest.tsv> <report.json>
  python -I verify_tradition_tsv.py find <archive.tsv> <source id> <regex> [context chars]
  python -I verify_tradition_tsv.py suggest-rel <tradition.json> <archive.tsv> <out.json>
  python -I verify_tradition_tsv.py table <report.json>

archive.tsv rows: source id, archived file, where the copy came from, retrieval date (tab separated).
A source may have several rows; each copy is segmented like segment_sources.py (PDF pages,
HTML sections under their nearest h1-h4 heading) and searched in row order.
check exits 1 when any quote of a verified item is not verbatim at its locator, or a verified
item lacks a located passage for a cited source."""
import hashlib, json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from segment_sources import html_sections, pdf_pages
from verify_quotes import loose, norm

STOP = set("a an the of and or to in on for with by from as at is are was were be been being it its this that these those which who whom into than so not but also can may might will would should could has have had do does did there their they them we our you your if when where how what why all any each both more most other some only own same very just one two such then".split())
ACCEPTED = ("verified", "published")


def stem(w):
    for suf in ("ing", "ed", "es", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def toks(s):
    return {stem(w) for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2}


def load_archive(path):
    base = os.path.dirname(os.path.abspath(path))
    rows = [l.rstrip("\n").split("\t") for l in open(path, encoding="utf-8") if l.strip() and not l.startswith("source_id")]
    cache_path = path + ".segments.json"
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    copies = {}
    for sid, f, origin, retrieved in rows:
        fp = f if os.path.isabs(f) else os.path.join(base, f)
        data = open(fp, "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        if sha not in cache:
            cache[sha] = pdf_pages(fp) if data[:5].startswith(b"%PDF") else html_sections(fp)
        copies.setdefault(sid, []).append({"file": f, "origin": origin, "retrieved": retrieved,
                                           "sha256": sha, "segments": cache[sha]})
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
    return copies


def base_locator(loc):
    m = re.match(r"^(.*?)\s*\(occurrence (\d+) of (\d+)\)$", loc)
    return (m.group(1), int(m.group(2))) if m else (loc, None)


def segment_text(segs, locator):
    base, occ = base_locator(locator)
    m = re.match(r"^PDF p\. (\d+)$", base)
    if m:
        n = int(m.group(1))
        return "\n".join(s["text"] for s in segs if s["locator"] in (f"PDF p. {n}", f"PDF p. {n + 1}"))
    hits = [s["text"] for s in segs if s["locator"] == base]
    if occ is not None:
        hits = hits[occ - 1: occ]
    return "\n".join(hits)


def contains(hay, quote):
    return norm(quote) in norm(hay) or loose(quote) in loose(hay)


def locate(copies, sid, locator, quote):
    for c in copies.get(sid, []):
        if contains(segment_text(c["segments"], locator), quote):
            return "verbatim at locator", c["file"]
    for c in copies.get(sid, []):
        for s in c["segments"]:
            if contains(s["text"], quote):
                return f"verbatim at {s['locator']}", c["file"]
    return "not found", None


def items(j):
    for c in j["concepts"]:
        yield "concept", c["key"], c
    for r in j["relationships"]:
        yield "relationship", f"{r['source']} {r['type']} {r['target']}", r


def check(tpath, apath, mpath, out):
    j = json.load(open(tpath, encoding="utf-8"))
    copies = load_archive(apath)
    manifest = {l.split("\t")[3].strip(): l.split("\t")[2] for l in open(mpath, encoding="utf-8") if len(l.split("\t")) >= 4}
    sources = []
    for s in j["sources"]:
        want = manifest.get((s.get("url") or "").strip())
        sources.append({"id": s["id"], "url": s.get("url"), "manifest_sha256": want,
                        "copies": [{k: c[k] for k in ("file", "origin", "retrieved", "sha256")} | {"manifest_match": c["sha256"] == want}
                                   for c in copies.get(s["id"], [])]})
    rows, problems = [], []
    for kind, ident, it in items(j):
        state = it["verification_state"]
        groups = [(i, cl["text"], cl["source_ids"], cl.get("evidence", []), cl.get("quote")) for i, cl in enumerate(it["claims"])] if kind == "concept" \
            else [(None, it.get("explanation") or "", it.get("source_ids", []), it.get("evidence", []), None)]
        for idx, text, sids, ev, short in groups:
            located = set()
            ev_rows = []
            for e in ev:
                status, f = locate(copies, e["source_id"], e["locator"], e["quote"])
                if status == "verbatim at locator":
                    located.add(e["source_id"])
                ev_rows.append({"source_id": e["source_id"], "locator": e["locator"], "quote": e["quote"], "status": status, "copy": f})
            if short:
                inside = any(contains(e["quote"], short) for e in ev) or any(
                    locate(copies, sid, "", short)[0] != "not found" for sid in sids)
                ev_rows.append({"source_id": "+".join(sids), "locator": "claim quote", "quote": short,
                                "status": "verbatim in a cited source" if inside else "not found", "copy": None})
            ct = toks(text)
            covered = set().union(*[toks(e["quote"]) for e in ev]) if ev else set()
            cov = round(len(ct & covered) / len(ct), 2) if ct else 0.0
            missing_src = [s for s in sids if s not in located]
            bad = [r for r in ev_rows if r["status"] != "verbatim at locator" and r["locator"] != "claim quote"] + \
                  [r for r in ev_rows if r["locator"] == "claim quote" and r["status"] == "not found"]
            if state in ACCEPTED and (missing_src or bad):
                problems.append(f"{ident} claim {idx}: unlocated {missing_src} / failing {[(r['source_id'], r['locator']) for r in bad]}")
            rows.append({"kind": kind, "id": ident, "state": state, "claim_index": idx, "text": text, "source_ids": sids,
                         "coverage": cov, "unlocated_sources": missing_src, "evidence": ev_rows})
    keys = {c["key"]: c["verification_state"] for c in j["concepts"]}
    for r in j["relationships"]:
        if r["verification_state"] in ACCEPTED:
            for end in (r["source"], r["target"]):
                if end in keys and keys[end] not in ACCEPTED:
                    problems.append(f"{r['source']} {r['type']} {r['target']}: verified but {end} is {keys[end]}")
    json.dump({"tradition": j["slug"], "sources": sources, "rows": rows, "problems": problems},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ev_all = [e for r in rows for e in r["evidence"]]
    print(f"items {sum(1 for _ in items(j))}; claim/relationship rows {len(rows)}; passages {len(ev_all)}; "
          f"verbatim at locator {sum(1 for e in ev_all if e['status'] == 'verbatim at locator')}; "
          f"elsewhere {sum(1 for e in ev_all if e['status'].startswith('verbatim at ') and e['status'] != 'verbatim at locator')}; "
          f"not found {sum(1 for e in ev_all if e['status'] == 'not found')}; problems {len(problems)}")
    for p in problems:
        print(" PROBLEM", p)
    sys.exit(1 if problems else 0)


def find(apath, sid, rx, ctx=160):
    copies = load_archive(apath)
    for c in copies.get(sid, []):
        for s in c["segments"]:
            t = re.sub(r"\s+", " ", s["text"])
            for m in list(re.finditer(rx, t, re.I))[:4]:
                print(f"[{c['file']} | {s['locator']}] …{t[max(0, m.start() - ctx):m.end() + ctx]}…")


def windows(text, size=25):
    words = norm(text).split()
    for i in range(0, max(1, len(words) - size + 1)):
        yield " ".join(words[i:i + size])


def suggest_rel(tpath, apath, out):
    j = json.load(open(tpath, encoding="utf-8"))
    copies = load_archive(apath)
    titles = {c["key"]: c["title"] for c in j["concepts"]}
    res = []
    for r in j["relationships"]:
        want = toks((r.get("explanation") or "") + " " + titles.get(r["source"], "") + " " + titles.get(r["target"], ""))
        cand = {}
        for sid in r.get("source_ids", []):
            top = (0, None, None)
            for c in copies.get(sid, [])[:1]:
                for s in c["segments"]:
                    for w in windows(s["text"]):
                        sc = len(want & toks(w))
                        if sc > top[0]:
                            top = (sc, s["locator"], w)
            cand[sid] = {"score": top[0], "locator": top[1], "quote": top[2]}
        res.append({"source": r["source"], "type": r["type"], "target": r["target"], "explanation": r.get("explanation"), "candidates": cand})
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def cell(s):
    return (s or "").replace("|", "\\|").replace("\n", " ")


def table(rpath):
    rep = json.load(open(rpath, encoding="utf-8"))
    print("| Item | Claim or explanation | Source | Locator | Verbatim passage | Quote check | State |")
    print("|---|---|---|---|---|---|---|")
    for r in rep["rows"]:
        label = r["id"] + (f" #{r['claim_index'] + 1}" if r["claim_index"] is not None else "")
        for e in r["evidence"] or [{"source_id": ", ".join(r["source_ids"]), "locator": "", "quote": "", "status": "no passage"}]:
            print(f"| {cell(label)} | {cell(r['text'])} | {e['source_id']} | {cell(e['locator'])} | {cell(e['quote'])} | {e['status']} | {r['state']} |")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["check"] and len(a) == 5:
        check(*a[1:5])
    elif a[:1] == ["find"] and len(a) in (4, 5):
        find(a[1], a[2], a[3], int(a[4]) if len(a) > 4 else 160)
    elif a[:1] == ["suggest-rel"] and len(a) == 4:
        suggest_rel(*a[1:4])
    elif a[:1] == ["table"] and len(a) == 2:
        table(a[1])
    else:
        sys.exit(USAGE)

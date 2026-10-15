"""For every claim and every source it cites, select the best verbatim evidence excerpt
(1-2 sentences, <= 45 words) from the located source segments, with its locator.
Writes evidence.json: [{file, key, claim_index, source_id, url, locator, quote, coverage}]."""
import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")
SCR, CONTENT = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(SCR, "reqs"))
from verify_quotes import norm

STOP = set("a an the of and or to in on for with by from as at is are was were be been being it its this that these those which who whom into than so not but also can may might will would should could has have had do does did there their they them we our you your if when where how what why all any each both more most other some only own same very s t just one two three such then".split())
toks = lambda s: [w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2]
SEG = json.load(open(os.path.join(SCR, "evidence", "segments.json"), encoding="utf-8"))
# pre-split segments into normalised sentences
SENT = {}
for url, segs in SEG.items():
    out = []
    for s in segs:
        t = norm(s["text"])
        sents = [x.strip() for x in re.split(r"(?<![\s(]\d)(?<![\s(]\d\d)(?<=[.!?])\s+(?=[A-Z0-9\"'(“])", t) if x.strip()]
        out.append((s["locator"], sents))
    SENT[url] = out

def best(claim, url):
    ct = set(toks(claim))
    if not ct or url not in SENT:
        return None
    top = (0.0, None, None)
    for loc, sents in SENT[url]:
        for i in range(len(sents)):
            for span in (1, 2):
                q = " ".join(sents[i:i + span])
                wq = q.split()
                if len(wq) > 45:
                    if span == 1:  # trim a long single sentence around its densest 45-word window
                        bestw = (0, 0)
                        for j in range(0, len(wq) - 44):
                            sc = len(ct & set(toks(" ".join(wq[j:j + 45]))))
                            if sc > bestw[0]: bestw = (sc, j)
                        q = " ".join(wq[bestw[1]:bestw[1] + 45])
                    else:
                        continue
                cov = len(ct & set(toks(q))) / len(ct)
                # prefer fewer words at equal coverage
                if cov > top[0] + 1e-9 or (abs(cov - top[0]) < 1e-9 and top[2] and len(q) < len(top[2])):
                    top = (cov, loc, q)
    return top if top[1] else None

files = ["shared/craft-science.json", "comparisons.json"] + [f"traditions/{d}/tradition.json" for d in sorted(os.listdir(os.path.join(CONTENT, "traditions")))]
rows = []
for f in files:
    j = json.load(open(os.path.join(CONTENT, f), encoding="utf-8"))
    src = {s["id"]: s for s in j["sources"]}
    for c in j["concepts"]:
        for ci, cl in enumerate(c["claims"]):
            for sid in cl["source_ids"]:
                url = src[sid]["url"].strip()
                b = best(cl["text"], url)
                ex = []
                if b:
                    ex.append({"locator": b[1], "quote": b[2]})
                    missing = set(toks(cl["text"])) - set(toks(b[2]))
                    if b[0] < 0.75 and missing:
                        b2 = best(" ".join(sorted(missing)), url)
                        if b2 and b2[2] != b[2] and b2[0] >= 0.34:
                            ex.append({"locator": b2[1], "quote": b2[2]})
                covered = set().union(*[set(toks(e["quote"])) for e in ex]) if ex else set()
                ct = set(toks(cl["text"]))
                rows.append({"file": f, "key": c["key"], "claim_index": ci, "source_id": sid, "url": url,
                             "claim": cl["text"], "excerpts": ex,
                             "coverage": round(len(ct & covered) / len(ct), 3) if ct else 0.0})
json.dump(rows, open(os.path.join(SCR, "evidence", "evidence.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
import collections
band = collections.Counter("≥0.6" if r["coverage"] >= 0.6 else "0.4–0.6" if r["coverage"] >= 0.4 else "<0.4" for r in rows)
print("claim-source pairs:", len(rows), dict(band), "no excerpt:", sum(1 for r in rows if not r["excerpts"]))

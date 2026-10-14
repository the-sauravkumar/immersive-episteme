import json, re, sys, os, hashlib
SRC = sys.argv[1]; ROOT = sys.argv[2]; OUT = sys.argv[3]
STOP = set("a an the of and or to in on for with by from as at is are was were be been being it its this that these those which who whom into onto than then so such not no but also can may might will would should could has have had do does did there their they them he she his her we our you your i over under about after before during while if when where how what why all any each both more most other some only own same very s t just one two three".split())
url2h = {}
for l in open(os.path.join(SRC, "manifest.tsv"), encoding="utf-8"):
    p = l.rstrip("\n").split("\t")
    if len(p) == 5: url2h[p[4].strip()] = p[0]
def toks(s): return [w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2]
cache = {}
def windows(h):
    if h in cache: return cache[h]
    f = os.path.join(SRC, h + ".txt")
    t = open(f, encoding="utf-8", errors="ignore").read() if os.path.exists(f) else ""
    t = re.sub(r"\s+", " ", t)
    sents = re.split(r"(?<=[.!?])\s+", t)
    ws = []
    for i in range(len(sents)):
        w = " ".join(sents[i:i+3])[:900]
        ws.append((w, set(toks(w))))
    cache[h] = ws; return ws
files = ["shared/craft-science.json", "comparisons.json"] + [f"traditions/{d}/tradition.json" for d in sorted(os.listdir(os.path.join(ROOT, "traditions")))]
out = []
for f in files:
    j = json.load(open(os.path.join(ROOT, f), encoding="utf-8"))
    sm = {s["id"]: s for s in j["sources"]}
    for c in j["concepts"]:
        for ci, cl in enumerate(c["claims"]):
            ct = set(toks(cl["text"]))
            best = (0, "", "")
            for sid in cl["source_ids"]:
                s = sm.get(sid)
                if not s: continue
                h = url2h.get(s["url"].strip())
                for w, wt in windows(h) if h else []:
                    sc = len(ct & wt) / max(1, len(ct))
                    if sc > best[0]: best = (sc, w, sid)
            qok = None
            if cl.get("quote"):
                q = re.sub(r"\s+", " ", cl["quote"].lower())
                qok = any(re.sub(r"\s+", " ", q) in re.sub(r"\s+", " ", w.lower()) for sid in cl["source_ids"] if sm.get(sid) and url2h.get(sm[sid]["url"].strip()) for w, _ in windows(url2h[sm[sid]["url"].strip()]))
            out.append({"file": f, "key": c["key"], "i": ci, "claim": cl["text"], "src": cl["source_ids"], "score": round(best[0], 2), "best_sid": best[2], "passage": best[1], "quote_found": qok})
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
import collections
b = collections.Counter(("hi" if o["score"] >= .7 else "mid" if o["score"] >= .4 else "lo") for o in out)
print(len(out), dict(b), "quotes:", collections.Counter(o["quote_found"] for o in out if o["quote_found"] is not None))

# For every substantive relationship, find the best source window for its explanation (+conditions).
import json, re, sys, os
SRC, ROOT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.stdout.reconfigure(encoding="utf-8")
STOP = set("a an the of and or to in on for with by from as at is are was were be been being it its this that these those which who into than so not but also can may might will would should could has have had do does did there their they them we our you your if when where how what why all any each both more most other some only own same very just one two three".split())
url2h = {l.split("\t")[4].strip(): l.split("\t")[0] for l in open(os.path.join(SRC, "manifest.tsv"), encoding="utf-8") if len(l.split("\t")) == 5}
toks = lambda s: set(w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2)
cache = {}
def wins(h):
    if h not in cache:
        f = os.path.join(SRC, h + ".txt")
        t = re.sub(r"\s+", " ", open(f, encoding="utf-8", errors="ignore").read()) if os.path.exists(f) else ""
        ss = re.split(r"(?<=[.!?])\s+", t)
        cache[h] = [(" ".join(ss[i:i+3])[:900], toks(" ".join(ss[i:i+3]))) for i in range(len(ss))]
    return cache[h]
files = ["shared/craft-science.json", "comparisons.json"] + [f"traditions/{d}/tradition.json" for d in sorted(os.listdir(os.path.join(ROOT, "traditions")))]
concepts = {}
data = []
for f in files:
    j = json.load(open(os.path.join(ROOT, f), encoding="utf-8")); data.append((f, j))
    for c in j["concepts"]: concepts[c["key"]] = c
out = []
for f, j in data:
    sm = {s["id"]: s for s in j["sources"]}
    trad = next((c["key"] for c in j["concepts"] if c["type"] == "tradition"), None)
    for i, r in enumerate(j["relationships"]):
        if r["type"] == "BELONGS_TO" and r["target"] == trad: continue
        text = (r.get("explanation") or "") + " " + (r.get("conditions") or "")
        w = toks(text); best = (0, "", "")
        for sid in r.get("source_ids", []):
            s = sm.get(sid); h = url2h.get(s["url"].strip()) if s else None
            for p, pw in (wins(h) if h else []):
                sc = len(w & pw) / max(1, len(w))
                if sc > best[0]: best = (sc, p, sid)
        out.append(dict(file=f, i=i, type=r["type"], source=r["source"], target=r["target"],
                        st=concepts.get(r["source"], {}).get("title"), tt=concepts.get(r["target"], {}).get("title"),
                        ordinal=r.get("ordinal"), expl=r.get("explanation"), cond=r.get("conditions"), src=r.get("source_ids"),
                        state=r.get("verification_state"), score=round(best[0], 2), sid=best[2], passage=best[1]))
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
import collections
print(len(out), collections.Counter("hi" if o["score"] >= .7 else "mid" if o["score"] >= .4 else "lo" for o in out))

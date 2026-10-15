"""Write the verified evidence excerpts into the content files as claims[].evidence[].
Every quote is re-checked to occur verbatim (after normalisation) in its located source segment."""
import json, os, sys, collections
sys.stdout.reconfigure(encoding="utf-8")
SCR, CONTENT = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(SCR, "reqs"))
from verify_quotes import norm
SEG = json.load(open(os.path.join(SCR, "evidence", "segments.json"), encoding="utf-8"))
rows = json.load(open(os.path.join(SCR, "evidence", "evidence.json"), encoding="utf-8"))
bad, by = [], collections.defaultdict(list)
for r in rows:
    same = [norm(s["text"]) for s in SEG[r["url"]]]
    locs = [s["locator"] for s in SEG[r["url"]]]
    for e in r["excerpts"]:
        q = norm(e["quote"])
        occ = [i for i, l in enumerate(locs) if l == e["locator"]]
        hit = [k for k, i in enumerate(occ) if q in same[i]]
        if not hit:
            bad.append((r["key"], r["claim_index"], r["source_id"], e["locator"], q[:80])); continue
        if len(occ) > 1:  # the same heading occurs more than once on the page: say which one
            e["locator"] = f"{e['locator']} (occurrence {hit[0] + 1} of {len(occ)})"
    by[(r["file"], r["key"], r["claim_index"])].append(r)
if bad:
    print("NOT VERBATIM:", len(bad)); [print(" ", b) for b in bad[:20]]; sys.exit(1)
n_claims = n_ev = 0
for f in sorted({k[0] for k in by}):
    p = os.path.join(CONTENT, f)
    j = json.load(open(p, encoding="utf-8"))
    for c in j["concepts"]:
        for ci, cl in enumerate(c["claims"]):
            ev = []
            for r in by.get((f, c["key"], ci), []):
                for e in r["excerpts"]:
                    item = {"source_id": r["source_id"], "locator": e["locator"], "quote": e["quote"]}
                    if r.get("note"): item["note"] = r["note"]
                    ev.append(item)
            assert ev, (f, c["key"], ci)
            cl["evidence"] = ev
            n_claims += 1; n_ev += len(ev)
    open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(j, ensure_ascii=False, indent=2) + "\n")
print("all excerpts verbatim; claims:", n_claims, "evidence items:", n_ev)

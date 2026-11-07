import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_quotes import loose
from source_archive import MANIFEST, at_locator, load

ap = argparse.ArgumentParser(description="Re-find every evidence quote of one content file in its archived source, at its stated locator.")
ap.add_argument("content_file")
ap.add_argument("archive", help="folder holding <cache_id>.bin for each source, as named in source-manifest.tsv")
ap.add_argument("--manifest", default=MANIFEST)
ap.add_argument("--out")
a = ap.parse_args()
sys.stdout.reconfigure(encoding="utf-8")

doc = json.load(open(a.content_file, encoding="utf-8"))
archive = load(doc, a.archive, a.manifest)


def check(sid, locator, quote):
    if archive.get(sid, {}).get("status") != "archived":
        return "source not archived", []
    q = loose(quote)
    if any(q in loose(x["text"]) for x in at_locator(archive, sid, locator)):
        return "verbatim at locator", []
    found = [x["locator"] for x in archive[sid]["segments"] if q in loose(x["text"])]
    return ("verbatim elsewhere" if found else "not found"), found


def row(kind, key, index, state, sid, locator, quote, words_max=None):
    if locator is None:
        return {"kind": kind, "key": key, "index": index, "state": state, "source_id": sid, "locator": None, "quote": None, "status": "no passage", "found_at": []}
    st, found = check(sid, locator, quote)
    if st == "verbatim at locator" and words_max and len(quote.split()) > words_max:
        st = f"over {words_max} words"
    return {"kind": kind, "key": key, "index": index, "state": state, "source_id": sid, "locator": locator, "quote": quote, "status": st, "found_at": found}


rows = []
for c in doc["concepts"]:
    for i, cl in enumerate(c["claims"]):
        covered = {e["source_id"] for e in cl.get("evidence", [])}
        rows += [row("claim", c["key"], i, c["verification_state"], e["source_id"], e["locator"], e["quote"]) for e in cl.get("evidence", [])]
        rows += [row("claim", c["key"], i, c["verification_state"], sid, None, None) for sid in sorted(set(cl["source_ids"]) - covered)]
for i, r in enumerate(doc["relationships"]):
    rid = f'{r["source"]} {r["type"]} {r["target"]}'
    covered = {e["source_id"] for e in r.get("evidence", [])}
    rows += [row("relationship", rid, i, r["verification_state"], e["source_id"], e["locator"], e["quote"], 25) for e in r.get("evidence", [])]
    rows += [row("relationship", rid, i, r["verification_state"], sid, None, None) for sid in sorted(set(r["source_ids"]) - covered)]

for sid, x in archive.items():
    print(f'{sid} {x["status"]} {x.get("cache_id")} sha256={x.get("sha256", "-")[:12]} manifest_match={x.get("manifest_match")} segments={len(x["segments"])}')
counts = {}
for r in rows:
    counts[(r["kind"], r["status"])] = counts.get((r["kind"], r["status"]), 0) + 1
for k, v in sorted(counts.items()):
    print(*k, v, sep="\t")
for r in rows:
    if r["status"] != "verbatim at locator":
        print("FAIL", r["kind"], r["key"], r["index"], r["source_id"], r["locator"], r["status"], r["found_at"], sep=" | ")
if a.out:
    json.dump({"sources": {k: {kk: vv for kk, vv in v.items() if kk != "segments"} for k, v in archive.items()}, "rows": rows}, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
sys.exit(1 if any(r["status"] != "verbatim at locator" for r in rows) else 0)

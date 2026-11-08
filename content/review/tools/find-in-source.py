import json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "evidence"))
from source_archive import load

if len(sys.argv) < 5:
    sys.exit("usage: find-in-source.py <content file> <archive folder> <source id> <regex> [context chars]")
f, folder, sid, rx = sys.argv[1:5]
ctx = int(sys.argv[5]) if len(sys.argv) > 5 else 160
doc = json.load(open(f, encoding="utf-8"))
segs = load({"sources": [s for s in doc["sources"] if s["id"] == sid]}, folder)[sid]["segments"]
seen, total = {}, 0
for seg in segs:
    seen[seg["locator"]] = seen.get(seg["locator"], 0) + 1
    n = sum(1 for x in segs if x["locator"] == seg["locator"])
    loc = seg["locator"] + (f" (occurrence {seen[seg['locator']]} of {n})" if n > 1 else "")
    for m in re.finditer(rx, seg["text"], re.I):
        total += 1
        print(f"[{loc}] …{seg['text'][max(0, m.start() - ctx):m.end() + ctx]}…")
print(f"{sid} | {total} hit(s) for /{rx}/")

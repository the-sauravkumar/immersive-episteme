# usage: find.py <content file> <source id> <regex> [ctx]
import sys; sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import json, re, sys, os
S = os.path.dirname(os.path.abspath(__file__))
f, sid, rx = sys.argv[1], sys.argv[2], sys.argv[3]; ctx = int(sys.argv[4]) if len(sys.argv) > 4 else 160
j = json.load(open(f, encoding="utf-8")); s = {x["id"]: x for x in j["sources"]}[sid]
url2h = {l.split("\t")[4].strip(): l.split("\t")[0] for l in open(S + "/src/manifest.tsv", encoding="utf-8") if len(l.split("\t")) == 5}
t = re.sub(r"\s+", " ", open(S + "/src/" + url2h[s["url"].strip()] + ".txt", encoding="utf-8", errors="ignore").read())
hits = [m for m in re.finditer(rx, t, re.I)]
print(f"{sid} {s['title'][:60]} | {len(hits)} hit(s) for /{rx}/")
for m in hits[:4]: print("  …" + t[max(0, m.start()-ctx):m.end()+ctx] + "…")

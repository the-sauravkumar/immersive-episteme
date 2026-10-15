"""Split every archived source into located segments for citation:
PDF -> one segment per page (locator "PDF p. N"); HTML -> one segment per section under its nearest
h1-h4 heading (locator '§ "<heading>"'). Output: segments.json {url: [{locator, text}]}."""
import html, json, os, re, subprocess, sys
SCR = sys.argv[1]
SRC = os.path.join(SCR, "src")
GI = os.path.join(SCR, "gi-pdfs")
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(SRC, "manifest.tsv"), encoding="utf-8")]
rows = [r for r in rows if len(r) == 5]

def pdf_pages(path, label=""):
    out, i = [], 1
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout or "Pages: 0").group(1)) \
        if subprocess.run(["which", "pdfinfo"], capture_output=True).returncode == 0 else None
    while True:
        r = subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), path, "-"], capture_output=True)
        if r.returncode != 0 or (n is not None and i > n):
            break
        t = r.stdout.decode("utf-8", "ignore")
        if not t.strip() and n is None and i > 400:
            break
        out.append({"locator": f"{label}PDF p. {i}", "text": t})
        i += 1
        if n is None and i > 1200:
            break
    return [s for s in out if s["text"].strip()]

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
            segs.append({"locator": f'§ "{head}"', "text": t})
    return segs

out = {}
for h, code, ctype, size, url in rows:
    b = os.path.join(SRC, h + ".bin")
    if code != "200" or not os.path.exists(b):
        continue
    if open(b, "rb").read(5).startswith(b"%PDF"):
        segs = pdf_pages(b)
    else:
        segs = html_sections(b)
    out[url.strip()] = segs

# Sources recovered through other routes (see content/review/verification.md §V3, §V5).
aj = "https://search.ipindia.gov.in/GIRPublicSearch/Application/Details/1050"
out[aj] = out.get(aj, []) + pdf_pages(os.path.join(GI, "aj-journal.pdf"), "GI Journal No. 188 copy (application 1050), ")
ax = "https://arxiv.org/abs/1412.2842"
out[ax] = out.get(ax, []) + pdf_pages(os.path.join(GI, "arxiv1412.2842.pdf"), "arXiv:1412.2842 full text, ")
doi = "https://doi.org/10.3906/muh-1310-8"
out[doi] = [{"locator": "Abstract (OpenAlex record; full text not reachable)", "text": open(os.path.join(SRC, "115389d60da6.txt"), encoding="utf-8").read()}]

json.dump(out, open(os.path.join(SCR, "evidence", "segments.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("sources:", len(out), "segments:", sum(len(v) for v in out.values()),
      "pdf-page segments:", sum(1 for v in out.values() for s in v if "PDF p." in s["locator"]))

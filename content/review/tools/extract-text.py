import re, html, os, subprocess

rows = [l.rstrip("\n").split("\t") for l in open("manifest.tsv", encoding="utf-8")]
rows = [r for r in rows if len(r) == 5]
out = open("textstats.tsv", "w", encoding="utf-8")
for h, code, ctype, size, url in rows:
    b = h + ".bin"
    if not os.path.exists(b) or code != "200":
        out.write(f"{h}\t0\tFAIL\t{url}\n")
        continue
    if open(b, "rb").read(5).startswith(b"%PDF"):
        subprocess.run(["pdftotext", "-layout", b, h + ".txt"], stderr=subprocess.DEVNULL)
        kind = "pdf"
    else:
        t = open(b, encoding="utf-8", errors="ignore").read()
        t = re.sub(r"(?is)<(script|style|noscript|svg)\b.*?</\1>", " ", t)
        t = html.unescape(re.sub(r"<[^>]+>", " ", t))
        t = re.sub(r"\s+", " ", t)
        open(h + ".txt", "w", encoding="utf-8").write(t)
        kind = "html"
    t = open(h + ".txt", encoding="utf-8", errors="ignore").read() if os.path.exists(h + ".txt") else ""
    n = len(t.split())
    bot = bool(re.search(r"captcha|just a moment|verify you are human|are you a robot|preparing to download", t, re.I)) and n < 500
    out.write(f"{h}\t{n}\t{kind}{' BOT?' if bot else ''}\t{url}\n")
out.close()

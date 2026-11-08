import hashlib, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segment_sources import pdf_pages, html_sections

MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "source-manifest.tsv")
OCC = re.compile(r"\s*\(occurrence (\d+) of (\d+)\)$")


def read_manifest(path=MANIFEST):
    out = {}
    for line in open(path, encoding="utf-8"):
        p = line.rstrip("\r\n").split("\t")
        if len(p) == 4 and p[0] != "cache_id":
            out[p[3].strip()] = {"cache_id": p[0], "sha256": p[2]}
    return out


def load(doc, folder, manifest_path=MANIFEST):
    manifest = read_manifest(manifest_path)
    archive = {}
    for s in doc["sources"]:
        m = manifest.get(s["url"].strip())
        path = os.path.join(folder, m["cache_id"] + ".bin") if m else None
        if not path or not os.path.exists(path):
            archive[s["id"]] = {"cache_id": m and m["cache_id"], "status": "not archived", "segments": []}
            continue
        raw = open(path, "rb").read()
        digest = hashlib.sha256(raw).hexdigest()
        segs = pdf_pages(path) if raw.startswith(b"%PDF") else html_sections(path)
        for seg in segs:
            seg["text"] = re.sub(r"\s+", " ", seg["text"]).strip()
        archive[s["id"]] = {"cache_id": m["cache_id"], "sha256": digest, "manifest_match": digest == m["sha256"], "segments": segs, "status": "archived"}
    return archive


def at_locator(archive, sid, locator):
    segs = archive[sid]["segments"]
    m = OCC.search(locator)
    hits = [x for x in segs if x["locator"] == OCC.sub("", locator)]
    if m:
        k = int(m.group(1)) - 1
        hits = hits[k:k + 1]
    return hits


def cut(archive, sid, locator, start, end):
    for seg in at_locator(archive, sid, locator):
        i = seg["text"].find(start)
        if i < 0:
            continue
        j = seg["text"].find(end, i)
        if j < 0:
            continue
        return seg["text"][i:j + len(end)]
    raise LookupError(f"{sid} {locator}: no passage from {start!r} to {end!r}")

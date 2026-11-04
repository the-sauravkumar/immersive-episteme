import argparse
import glob
import html
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ARCHIVE = "D:/Work/IIT-KGP/Paper_1-artifacts"
LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "\u00ad": "", "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", "\u00a0": " "}
WEB_COPIES = {
    "phytojournal.com": ["hari.txt", "hari-flow.txt"],
    "fao.org/fileadmin/user_upload/jecfa_additives/docs/monograph3/additive-014": ["alum.txt"],
    "Additive-086": ["cah.txt"],
    "X3860E": ["gum.html"],
    "dranshublog": ["dr.html"],
    "tradeindia": ["ti.html"],
    "cmro.gov.hk": ["rubia.txt"],
    "Alizarin": ["alizarin.html"],
    "Turmeric": ["turmeric.html"],
    "Cow_dung": ["cow.html"],
    "maiwahandprints": ["maiwa.html"],
    "botanicalcolors": ["bot.txt"],
    "dairyknowledge": ["wood.txt"],
    "coloriasto": ["ure.html"],
}
PAGE_FILES = {
    ("ajrakh", "S1"): "corpus-check/pages/p{:02d}.txt",
    ("sanganeri", "S1"): "corpus-check/pages/S1/p{}.txt",
    ("machilipatnam-kalamkari", "S4"): "corpus-check/pages/817797c4a68d.p{}.txt",
    ("machilipatnam-kalamkari", "S6"): "corpus-check/pages/d64fd9619977.p{}.txt",
}
WHOLE_FILES = {
    ("sanganeri", "S8"): "gaatha.html",
    ("dabu", "S17"): "s17.html",
}


def normalise(text):
    for old, new in LIGATURES.items():
        text = text.replace(old, new)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    return re.sub(r"\s+", " ", text).strip()


def read_text(path):
    raw = open(path, encoding="utf8", errors="ignore").read()
    if path.endswith(".html"):
        raw = re.sub(r"(?s)<(script|style).*?</\1>", " ", raw) if "wikipedia" not in raw[:2000].lower() else raw
        raw = html.unescape(re.sub(r"<[^>]+>", "", raw) + " " + re.sub(r"<[^>]+>", " ", raw))
    return raw


def tradition_quotes():
    found = {}
    for path in glob.glob(os.path.join(ROOT, "content", "traditions", "*", "tradition.json")):
        data = json.load(open(path, encoding="utf8"))

        def walk(node):
            if isinstance(node, dict):
                if isinstance(node.get("quote"), str):
                    ids = node.get("source_ids") or [node.get("source_id")]
                    for source_id in ids:
                        found.setdefault((data["slug"], source_id), []).append(node["quote"])
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(data)
    return found


def check_project(entry, claims, thesis, archive):
    quote = entry["quote"]
    if "Sengupta" in entry["source"]:
        page = int(re.search(r"PDF p\. (\d+)", entry["locator"]).group(1))
        return ("thesis page", True) if normalise(quote) in normalise(thesis[page - 1]) else ("thesis page", False)
    match = re.search(r"\(([a-z-]+) (S\d+),", entry["source"])
    key = (match.group(1), match.group(2))
    if key in PAGE_FILES:
        page = int(re.search(r"PDF p\. (\d+)", entry["locator"]).group(1))
        path = os.path.join(archive, "scratchpad-archive", PAGE_FILES[key].format(page))
        if os.path.exists(path):
            text = open(path, encoding="utf8", errors="ignore").read()
            if quote in text:
                return ("cited page, exact", True)
            if normalise(quote) in normalise(text):
                return ("cited page, whitespace or punctuation normalised", True)
            return ("cited page", False)
    if key in WHOLE_FILES:
        path = os.path.join(archive, "looks-check", WHOLE_FILES[key])
        if normalise(quote) in normalise(read_text(path)):
            return ("archived web copy", True)
    if any(quote in claim for claim in claims.get(key, [])):
        return ("tradition.json only, no archived page", True)
    return ("no match", False)


def check_web(entry, archive):
    target = entry["source"] + " " + entry["locator"]
    for needle, names in WEB_COPIES.items():
        if needle in target:
            for name in names:
                if normalise(entry["quote"]) in normalise(read_text(os.path.join(archive, "looks-check", name))):
                    return ("archived web copy", True)
            return ("archived web copy", False)
    return ("no archived copy", False)


def template_gaps(rows):
    gaps = []
    for path in glob.glob(os.path.join(ROOT, "content", "study", "*.template.json")):
        template = json.load(open(path, encoding="utf8"))
        slug = os.path.basename(path).split(".")[0]
        for stage in template["stages"]:
            for item in stage.get("items", []):
                if item.get("role") != "material":
                    continue
                matches = [r for r in rows if slug in r["traditions"] and stage["key"] in r["stages"] and r["label"] == item["label"]]
                if len(matches) != 1:
                    gaps.append((slug, stage["key"], item["label"], len(matches)))
    return gaps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", default=ARCHIVE)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    rows = json.load(open(os.path.join(ROOT, "docs", "research", "substance-looks.json"), encoding="utf8"))
    thesis = open(os.path.join(args.archive, "looks-check", "ubc-full.txt"), encoding="utf8", errors="ignore").read().split("\f")
    claims = tradition_quotes()
    tally = {}
    failures = []
    seen = set()
    for row in rows:
        for entry in row["evidence"]:
            identity = (entry["kind"], entry["source"], entry["locator"], entry["quote"])
            if identity in seen:
                continue
            seen.add(identity)
            where, passed = check_project(entry, claims, thesis, args.archive) if entry["kind"] == "project-source" else check_web(entry, args.archive)
            label = entry["kind"] + ": " + where
            tally[label] = tally.get(label, 0) + 1
            if not passed:
                failures.append((row["key"], entry["locator"], entry["quote"]))
    uncovered = template_gaps(rows)
    for gap in uncovered:
        print("NOT COVERED", gap)
    print("template material items not matching exactly one row", len(uncovered))
    print("distinct quotes", len(seen))
    for label, count in sorted(tally.items()):
        print(count, label)
    for failure in failures:
        print("FAIL", failure)
    print("failures", len(failures))
    return 1 if failures or uncovered else 0


if __name__ == "__main__":
    sys.exit(main())

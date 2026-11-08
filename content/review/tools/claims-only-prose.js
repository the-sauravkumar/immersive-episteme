const fs = require("fs");
const path = require("path");

const files = ["shared/craft-science.json", "comparisons.json",
  ...fs.readdirSync("traditions").map((d) => `traditions/${d}/tradition.json`)];

const archive = { generated: "2026-10-14", note: "Free prose removed from learner-facing fields because it was not verified sentence-by-sentence against sources. Curators may promote sentences to claims only with a verified source excerpt.", concepts: [] };
let n = 0;

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const c of j.concepts) {
    archive.concepts.push({ file: f, key: c.key, summary: c.summary, body_md: c.body_md });
    const claims = c.claims.map((x) => x.text.trim());
    c.summary = claims[0] ?? "";
    c.body_md = claims.map((t, i) => `${t} [${c.claims[i].source_ids.join(", ")}]`).join("\n\n");
    c.prose_policy = "claims-only";
    n++;
  }
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}
fs.writeFileSync(path.join("review", "prose-archive.json"), JSON.stringify(archive, null, 2) + "\n");
console.log("rebuilt", n, "concepts; archived prose for", archive.concepts.length);

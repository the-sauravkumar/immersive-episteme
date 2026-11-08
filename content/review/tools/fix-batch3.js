const fs = require("fs");
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const save = (f, j) => fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
const T = "traditions/";

{
  const f = T + "machilipatnam-kalamkari/tradition.json", j = load(f);
  const r = j.relationships.find((r) => r.type === "PRECEDES" && r.ordinal === 4);
  r.conditions = "Craftmark contradicts itself: its numbered stage list puts outline block printing first, but its printing section says \"First the background is printed followed by the printing of the outline and the motifs\", with the background printed in alum and the outline in iron acetate.";
  save(f, j); console.log("kalamkari PRECEDES#4 conditions updated");
}

{
  const f = T + "bagru/tradition.json", j = load(f);
  const c = j.concepts.find((c) => c.key === "bagru.process_stage.dhulai-mordant-wash");
  c.title = "5. Washing off excess mordant (khulai)";
  c.local_terms = ["khulai"];
  save(f, j); console.log("bagru step 5 renamed to khulai");
}

{
  const f = T + "dabu/tradition.json", j = load(f);
  const P = (s, t) => j.relationships.find((r) => r.type === "PRECEDES" && r.source === s && r.target === t);
  const bad = P("dabu.process_stage.paste-preparation", "dabu.process_stage.fabric-washing");
  if (!bad) throw new Error("paste->washing link not found");
  bad.target = "dabu.process_stage.resist-printing";
  bad.type = "REQUIRES";
  [bad.source, bad.target] = ["dabu.process_stage.resist-printing", "dabu.process_stage.paste-preparation"];
  bad.ordinal = null;
  bad.explanation = "Block-printing the resist uses the prepared mud-resist paste.";
  bad.conditions = "Paste preparation runs in parallel with cloth preparation; the sources give no order between paste-making and washing the cloth.";
  bad.source_ids = ["S3", "S18"];
  const chain = ["fabric-washing", "pre-printing-colour", "resist-printing"];
  const soak = P("dabu.process_stage.mud-soaking", "dabu.process_stage.paste-preparation");
  soak.ordinal = null;
  soak.conditions = "Paste-making sequence (separate from the cloth sequence).";
  const pre = P("dabu.process_stage.fabric-washing", "dabu.process_stage.pre-printing-colour");
  pre.explanation = "S18: the cloth is first washed, then designs are hand block printed using fast dyes, before the mud resist is applied.";
  pre.source_ids = ["S18"];
  const cloth = j.relationships.filter((r) => r.type === "PRECEDES" && r.ordinal != null).sort((a, b) => a.ordinal - b.ordinal);
  const loop = cloth.filter((r) => (r.conditions || "").startsWith("Loop"));
  loop.forEach((r) => { r.ordinal = null; });
  cloth.filter((r) => !loop.includes(r)).forEach((r, i) => { r.ordinal = i + 1; });
  save(f, j); console.log("dabu: paste link -> REQUIRES; cloth chain renumbered", cloth.map((r) => r.ordinal).join(","));
}

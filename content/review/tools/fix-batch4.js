// First-hand verification fixes, batch 4: remove relationships no source states
// (they were self-described as inferences, or I could find no source support). Run from content/.
const fs = require("fs");
const removed = [];
const drop = (file, type, srcEnd, tgtEnd, why) => {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const i = j.relationships.findIndex((r) => r.type === type && r.source.endsWith(srcEnd) && r.target.endsWith(tgtEnd));
  if (i < 0) throw new Error(`not found: ${file} ${srcEnd} -${type}-> ${tgtEnd}`);
  const [r] = j.relationships.splice(i, 1);
  removed.push({ file, ...r, removal_reason: why });
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log("removed", file, r.source, "-" + type + "->", r.target);
};
const T = "traditions/";
drop("shared/craft-science.json", "ENABLES", "thickened-print-paste-rheology", "alum-mordant-complexation", "Self-described inference; rheology evidence is from screen printing, the Indian alum-paste thickener is undocumented.");
drop("comparisons.json", "SIMILAR_TO", "clay-resist-cold-vat-compatibility", "sanganeri.artisan_decision.protecting-dabu-during-dyeing", "Inference across files; no source compares these.");
drop("comparisons.json", "SIMILAR_TO", "clay-resist-cold-vat-compatibility", "bagru.artisan_decision.protecting-the-resist", "Inference across files; no source compares these.");
drop(T + "ajrakh/tradition.json", "USES", "process_stage.vichharnu", "", "Self-described inference: the GI names washing tanks only for resist washing.");
drop(T + "bagh/tradition.json", "SIMILAR_TO", "iron-alizarin-black", "shared.scientific_mechanism.iron-tannin-black", "Self-described: Bagh sources do not invoke iron-tannin chemistry.");
drop(T + "sanganeri/tradition.json", "REQUIRES", "fine-floral-on-white", "bunta-wooden-block", "Self-described inference; requirement not stated by sources.");
drop(T + "sanganeri/tradition.json", "ENABLES", "process_stage.ageing", "", "Self-described inference; causal link not stated by sources.");
drop(T + "machilipatnam-kalamkari/tradition.json", "AFFECTED_BY", "kalam-to-block-shift", "coromandel-chintz-trade", "No source attributes the pen-to-block shift to the trade; sources only record that blocks later took over.");
const out = "review/removed-relationships.json";
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
fs.writeFileSync(out, JSON.stringify(prev.concat(removed), null, 2) + "\n");

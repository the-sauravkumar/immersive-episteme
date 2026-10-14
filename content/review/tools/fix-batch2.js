// First-hand verification fixes, batch 2 (partial-match claims). Run from content/.
const fs = require("fs");
function edit(file, key, match, fn) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = j.concepts.find((c) => c.key === key);
  if (!c) throw new Error("no concept " + key);
  const i = c.claims.findIndex((x) => x.text.includes(match));
  if (i < 0) throw new Error("no claim '" + match + "' in " + key);
  const before = c.claims[i].text;
  fn(c.claims[i], c);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log("ok", key, "#" + i, "\n  -", before, "\n  +", c.claims[i].text, c.claims[i].source_ids.join(","));
}
const T = "traditions/";

// Ajrakh: the 1 lakh litres is a stated recycling requirement, not measured total use.
edit(T + "ajrakh/tradition.json", "ajrakh.environmental_condition.water-availability", "1 lakh", (x) => {
  x.text = "Ajrakh is described as a 16-stage, water-intensive technique; an artisan states that the craftsmen's requirement is to recycle about 1 lakh litres of water every day.";
});
// Bagh: lime-and-iron is the documenter's bracketed speculation, not the artisan's statement.
edit(T + "bagh/tradition.json", "bagh.environmental_condition.river-water-chemistry", "lime and iron", (x) => {
  x.text = "An artisan says the Bagh river water gives the prints their colour; the documenter adds, as a possible scientific reason, that Bagh soil has high contents of lime and iron.";
});
// Bagru: the GI names rekh and dotu; the gudh/rekh/datta naming comes from the Block Shop profile (S6).
edit(T + "bagru/tradition.json", "bagru.tool.wooden-block", "gad, rekh and datta", (x) => {
  x.text = x.text.replace("types are gad, rekh and datta", "the GI names the outline block (rekh) and filler block (dotu), and a maker profile names the background (gudh), outline (rekh) and filler (datta) blocks");
  if (!x.source_ids.includes("S6")) x.source_ids.push("S6");
});
// Bagru: "fawn" is in neither cited source.
edit(T + "bagru/tradition.json", "bagru.comparison.bagru-vs-sanganer", "fawn", (x) => {
  x.text = x.text.replace(/ or fawn/, "");
});
// Dabu: riverbank appears only in the origin legend, not as the source of paste mud.
edit(T + "dabu/tradition.json", "dabu.material.mud-black-clay", "riverbank", (x) => {
  x.text = "Mud soaked in water overnight is used to make a sticky paste.";
});
edit(T + "dabu/tradition.json", "dabu.process_stage.mud-soaking", "riverbank", (x) => {
  x.text = "The mud is soaked in water overnight before being made into the paste.";
});
// Dabu: the source calls for water reuse; it does not quantify use as high.
edit(T + "dabu/tradition.json", "dabu.environmental_condition.water-pollution-and-hazards", "Water use is high", (x) => {
  x.text = "The craft archive calls for measures to reuse water, and states that residue water from chemical dyes and mordants is polluting local groundwater.";
});
edit("comparisons.json", "comparisons.comparison.water-dependence", "water use is high", (x) => {
  x.text = "Akola depends on the Beduch river plus hand pumps and tube wells; the craft archive calls for water reuse and reports that chemical residues pollute groundwater.";
});

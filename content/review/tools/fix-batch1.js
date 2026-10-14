// First-hand verification fixes, batch 1 (weak-match claims). Run from content/.
const fs = require("fs");
function edit(file, key, match, fn) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = j.concepts.find((c) => c.key === key);
  if (!c) throw new Error("no concept " + key);
  const i = c.claims.findIndex((x) => x.text.includes(match));
  if (i < 0) throw new Error("no claim '" + match + "' in " + key);
  fn(c.claims[i], c);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  console.log("ok", key, "#" + i);
}
const T = "traditions/";

edit("comparisons.json", "comparisons.comparison.mordant-systems", "Iron black is made by fermenting scrap iron", (x) => {
  x.text = "Iron black is made from iron fermented with jaggery or molasses: scrap iron in Ajrakh (kut), iron strips with jaggery and salt water in Machilipatnam (kasim), and an iron-molasses-gum solution in Bagru and Sanganeri (syahi); the Bagh GI describes iron sulphate or iron filings with jaggery.";
});
edit("comparisons.json", "comparisons.comparison.mordant-systems", "a single alizarin bath gives red on alum and black on iron", (x) => {
  x.text = "In Bagru, Sanganeri and Bagh the alizarin bath develops red on alum-printed areas and black on iron-printed areas. In Machilipatnam the black is produced earlier, by iron reacting with the myrobalan tannin, and the alizarin bath helps fix that black.";
});
edit(T + "bagh/tradition.json", "bagh.historical_context.master-artisans-recognition", "trained over a thousand", (x) => {
  x.text = "Ismail Suleimanji Khatri received a national award in 1984 for a work with 1,230 geometric patterns; the Khatris are credited with training and inspiring over a thousand villagers to take up the craft.";
});
edit(T + "bagh/tradition.json", "bagh.open_question.river-water-effect", "an artisan cites lime and iron", (x) => {
  x.text = "Gaatha names copper and iron in the river water. Asia InCH quotes an artisan saying the Bagh river water gives the colour, and separately, as the documenter's own speculation rather than the artisan's, suggests that Bagh soil is high in lime and iron.";
});
edit(T + "bagru/tradition.json", "bagru.historical_context.historical-records", "ghagra", (x) => {
  x.text = "A mid-to-late 19th-century block-printed, mud-resist, mordant-dyed cotton textile from Bagru, described by the Penn Museum as \"for Kagra, to be worn only by a woman\", is held by the Penn Museum.";
});
edit("shared/craft-science.json", "shared.scientific_mechanism.mud-resist-barrier", "critical cracking thickness", (x) => {
  x.text = "Citing earlier studies, the paper notes that drying clay films have a critical cracking thickness below which they dry without cracking, and that average crack spacing is of the order of the film thickness.";
});
edit("shared/craft-science.json", "shared.scientific_mechanism.mud-resist-barrier", "fewer in number but wider", (x) => {
  x.text = "Citing earlier work, the paper notes that in thicker clay layers cracks are generally fewer in number but wider on average.";
});

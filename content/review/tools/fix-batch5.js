// Fix the 24 integrity warnings (KG108, KG316, KG700, KG800). Every new link or concept
// restates claims already verified against sources (content/review/verification.md). Run from content/.
const fs = require("fs");
const T = "traditions/";
const files = {};
const load = (f) => (files[f] ??= JSON.parse(fs.readFileSync(f, "utf8")));
const saveAll = () => { for (const [f, j] of Object.entries(files)) fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n"); };
const concept = (f, k) => { const c = load(f).concepts.find((c) => c.key === k); if (!c) throw new Error("no concept " + k); return c; };
const srcOf = (c) => [...new Set(c.claims.flatMap((x) => x.source_ids))].sort();
const rel = (f, source, type, target, explanation, source_ids, provenance_kind = "historical_documentation") => {
  const j = load(f);
  if (j.relationships.some((r) => r.source === source && r.target === target && r.type === type)) throw new Error("dup " + source);
  j.relationships.push({ source, target, type, explanation, conditions: null, ordinal: null, provenance_kind, verification_state: "under_review", source_ids });
  console.log("+", source, "-" + type + "->", target);
};
const claimsOnly = (c) => { c.summary = c.claims[0]?.text ?? ""; c.body_md = c.claims.map((x) => `${x.text} [${x.source_ids.join(", ")}]`).join("\n\n"); c.prose_policy = "claims-only"; };

// --- KG108: comparison concepts must name what they compare -----------------------------
concept(T + "ajrakh/tradition.json", "ajrakh.comparison.kutch-vs-barmer-vs-sindh").compares =
  ["ajrakh.tradition.kutch-ajrakh", "ajrakh.historical_context.barmer-practice", "ajrakh.historical_context.sindh-indus-origins"];
concept(T + "bagru/tradition.json", "bagru.comparison.bagru-vs-sanganer").compares =
  ["bagru.tradition.bagru-hand-block-print", "sanganeri.tradition.sanganeri-hand-block-printing"];
{
  // Its only claim (S19) compares Dabu with Bagru and Sanganeri prints; nothing supports "wax and direct print".
  const c = concept(T + "dabu/tradition.json", "dabu.comparison.mud-resist-vs-wax-and-direct-print");
  c.title = "Dabu and other Rajasthani block prints (Bagru, Sanganeri)";
  c.compares = ["dabu.tradition.dabu-mud-resist-printing", "bagru.tradition.bagru-hand-block-print", "sanganeri.tradition.sanganeri-hand-block-printing"];
}
{
  // Add Srikalahasti as a concept built only from source-checked Srikalahasti statements.
  const f = T + "machilipatnam-kalamkari/tradition.json";
  const j = load(f);
  const key = "machilipatnam-kalamkari.historical_context.srikalahasti-style";
  const sk = {
    key, type: "historical_context", category: "cross_tradition_comparisons",
    title: "Srikalahasti kalamkari (the hand-painted style)", summary: "", body_md: "", local_terms: [],
    provenance_kind: "historical_documentation", verification_state: "under_review",
    claims: [
      { text: "The Srikalahasti style of kalamkari is drawn freehand with a pen, with motifs and stories from Hindu mythology.", source_ids: ["S7"] },
      { text: "In Srikalahasti the textiles are painted with pens made of bamboo and cotton.", source_ids: ["S13"] },
      { text: "The river Swarnamukhi in Srikalahasti supplies the running water the process needs.", source_ids: ["S13"] },
      { text: "At Kalahasti the artists and craftsmen were from a caste called Balojas.", source_ids: ["S6"] },
    ],
  };
  claimsOnly(sk);
  j.concepts.push(sk);
  concept(f, "machilipatnam-kalamkari.comparison.vs-srikalahasti").compares = ["machilipatnam-kalamkari.tradition.machilipatnam-kalamkari", key];
  rel(f, "machilipatnam-kalamkari.tradition.machilipatnam-kalamkari", "CONTRASTS_WITH", key,
    "Machilipatnam kalamkari is hand-block printed in karkhanas, whereas Srikalahasti kalamkari is drawn freehand with a pen.", ["S7", "S13"]);
}

// --- KG316: Sanganeri block carving -------------------------------------------------------
{
  const f = T + "sanganeri/tradition.json";
  const j = load(f);
  const r = j.relationships.find((r) => r.source === "sanganeri.process_stage.block-carving" && r.target === "sanganeri.process_stage.mordant-printing" && r.type === "ENABLES");
  r.type = "REQUIRES";
  [r.source, r.target] = [r.target, r.source];
  r.explanation = "Printing is done by stamping wooden hand blocks (GI), and those blocks are made in the carving sequence (ghisai, chakai, khudai, dabana, chilai).";
  r.provenance_kind = "historical_documentation";
  r.source_ids = ["S1", "S10"];
  console.log("~ sanganeri printing REQUIRES block carving");
}

// --- KG700: comparative link worded causally ------------------------------------------------
{
  const r = load("comparisons.json").relationships.find((r) => r.source === "bagh.process_stage.bichalna" && r.target === "machilipatnam-kalamkari.process_stage.degumming-wash");
  r.explanation = "Printed cloth is washed in flowing water to remove unfixed mordant and gum before the red bath. Both sources warn about faulty washing: permanent stains at Bagh, colour developing in unwanted areas at Machilipatnam.";
  console.log("~ bichalna/degumming explanation reworded");
}

// --- KG800: orphan concepts, each linked to what its own claims are about -------------------
const A = T + "ajrakh/tradition.json", B = T + "bagh/tradition.json", R = T + "bagru/tradition.json", D = T + "dabu/tradition.json";
const link = (f, src, type, tgt, expl) => rel(f, src, type, tgt, expl, srcOf(concept(f, src)));
link(A, "ajrakh.open_question.etymology", "BELONGS_TO", "ajrakh.tradition.kutch-ajrakh", "The question concerns the meaning and origin of the name 'Ajrakh'.");
link(A, "ajrakh.open_question.iron-cause-and-levels", "BELONGS_TO", "ajrakh.environmental_condition.water-iron-content", "The question concerns why and how far iron rose in Dhamadka's water.");
link(A, "ajrakh.open_question.migration-date", "BELONGS_TO", "ajrakh.historical_context.khatri-migration-to-kutch", "The question concerns when the Khatri printers settled in Kutch.");
link(A, "ajrakh.open_question.thermal-comfort-claim", "BELONGS_TO", "ajrakh.outcome.four-colour-ajrakh-cloth", "The question concerns a claimed thermal property of the finished natural-dyed cloth.");
link(B, "bagh.design_principle.variation-on-old-designs", "BELONGS_TO", "bagh.tradition.bagh-print", "New Bagh designs are made as variations of the old ones.");
link(B, "bagh.historical_context.bagh-town-geography", "BELONGS_TO", "bagh.tradition.bagh-print", "Bagh print takes its name from Bagh town, on the Baghini river in Dhar district.");
link(B, "bagh.historical_context.master-artisans-recognition", "BELONGS_TO", "bagh.tradition.bagh-print", "Publicly honoured Bagh printers of the Khatri family.");
link(B, "bagh.process_stage.khara-karna", "USES", "bagh.material.base-fabric", "Khara karna washes and desizes the base cloth.");
concept(B, "bagh.process_stage.khara-karna"); // (source ids for the USES link come from the stage's own claims)
link(B, "bagh.material.secondary-dyes", "BELONGS_TO", "bagh.tradition.bagh-print", "Natural dyes recorded in use at Bagh beyond the red and black (khaki, mustard, indigo, harda, bahera, pomegranate).");
link(B, "bagh.open_question.origin-dating", "BELONGS_TO", "bagh.historical_context.khatri-migration-from-sindh", "The question concerns when and from where the Bagh printers came.");
link(R, "bagru.design_principle.dense-pattern-hides-drips", "BELONGS_TO", "bagru.tradition.bagru-hand-block-print", "A design observation about Bagru printing: open modern layouts expose dye drips.");
link(R, "bagru.tradition.bagru-hand-block-print", "AFFECTED_BY", "bagru.environmental_condition.semi-arid-seasonality", "Production follows the seasons: cloth is dried in courtyards in the hot dry months, and the monsoon halts work (S6).");
link(D, "dabu.historical_context.antiquity-claims", "BELONGS_TO", "dabu.tradition.dabu-mud-resist-printing", "Sources give conflicting dates for the origin of Dabu.");
link(D, "dabu.historical_context.etymology-and-origin-legend", "BELONGS_TO", "dabu.tradition.dabu-mud-resist-printing", "The origin legend of Dabu mud-resist printing.");
link(D, "dabu.open_question.akola-current-resist", "BELONGS_TO", "dabu.artisan_decision.mud-versus-tar", "The question concerns whether Akola printers now resist with mud, tar or gum.");
link(D, "dabu.open_question.dating-and-community", "BELONGS_TO", "dabu.historical_context.akola-cluster", "The question concerns Akola's district and which community the printers belong to.");
link(D, "dabu.open_question.paste-recipe", "BELONGS_TO", "dabu.process_stage.paste-preparation", "The question concerns the ingredients of the resist paste.");
link("shared/craft-science.json", "shared.open_question.sun-bleaching-photochemistry", "BELONGS_TO", "shared.scientific_mechanism.sun-bleaching", "The question concerns the photochemistry behind traditional sun bleaching.");

saveAll();

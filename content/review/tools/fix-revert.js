// Revert two batch-2 edits: S15 does say "We collect mud from the riverbank" (Aavaran founder).
const fs=require("fs");const f="traditions/dabu/tradition.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));
const set=(key,match,text)=>{const c=j.concepts.find(c=>c.key===key);const x=c.claims.find(x=>x.text.includes(match));if(!x)throw new Error(key);console.log("revert",key,"\n  -",x.text,"\n  +",text);x.text=text;};
set("dabu.material.mud-black-clay","Mud soaked in water overnight","Artisans collect mud from riverbanks and soak it overnight into a sticky paste.");
set("dabu.process_stage.mud-soaking","The mud is soaked in water overnight","Mud collected from riverbanks is soaked overnight.");
fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");

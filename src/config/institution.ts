interface InstitutionAffiliation {
  number: number;
  name: string;
}

interface InstitutionAuthor {
  name: string;
  affiliations: readonly number[];
  orcid: string | null;
}

export interface InstitutionConfig {
  affiliation: string | null;
  paperCitation: string | null;
  ethicsReference: string | null;
  contact: string | null;
  authors: readonly InstitutionAuthor[];
  affiliations: readonly InstitutionAffiliation[];
}

const PLATFORM_NAME = "Immersive Episteme";

export const INSTITUTION: InstitutionConfig = {
  affiliation:
    "Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, and Department of Humanities and Social Sciences, Indian Institute of Technology Kharagpur, West Bengal 721302, India",
  paperCitation: null,
  ethicsReference: "Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, Approval Number CXA/ETH/01",
  contact: "cxa.craftecosystem@gmail.com",
  authors: [
    { name: "Saurav Kumar", affiliations: [1], orcid: null },
    { name: "Ankit Kumar", affiliations: [1], orcid: "0009-0009-1282-0309" },
    { name: "Priyadarshi Patnaik", affiliations: [1, 2], orcid: null },
  ],
  affiliations: [
    { number: 1, name: "Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, Indian Institute of Technology Kharagpur, Kharagpur, West Bengal 721302, India" },
    { number: 2, name: "Department of Humanities and Social Sciences, Indian Institute of Technology Kharagpur" },
  ],
};

export function institutionLines(config: InstitutionConfig = INSTITUTION): { key: "affiliation" | "paperCitation" | "ethicsReference" | "contact"; label: string; value: string }[] {
  const labels = {
    affiliation: "Affiliation",
    paperCitation: "Paper",
    ethicsReference: "Ethics approval",
    contact: "Contact",
  } as const;
  return (Object.keys(labels) as (keyof typeof labels)[])
    .map((key) => ({ key, label: labels[key], value: config[key]?.trim() ?? "" }))
    .filter((l) => l.value.length > 0);
}

export function citationName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const family = parts.pop() ?? "";
  const initials = parts.map((p) => `${p[0]!.toUpperCase()}.`).join(" ");
  return initials ? `${family}, ${initials}` : family;
}

export function howToCite(config: InstitutionConfig = INSTITUTION): string | null {
  if (config.paperCitation?.trim()) return config.paperCitation.trim();
  if (config.authors.length === 0) return null;
  const names = config.authors.map((a) => citationName(a.name));
  const authors = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]!}`;
  const publisher = config.affiliations[0]?.name.split(",").slice(0, 2).join(",").trim();
  return `${authors} (n.d.). ${PLATFORM_NAME}: a research platform comparing a visual course and a walkthrough of a craft process [Research software].${publisher ? ` ${publisher}.` : ""}`;
}

export function orcidUrl(orcid: string): string {
  return `https://orcid.org/${orcid}`;
}

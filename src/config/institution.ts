/**
 * Institution facts shown on public pages (DESIGN.md 11.1 item 6, 9.16 footer, 13 rule 1), on About
 * (Team and Affiliations, Ethics, How to Cite, Contact) and on the study's information and consent
 * page.
 *
 * Every field is empty (`null`, or an empty list) until the team supplies it, and an empty field
 * renders nothing: nothing is invented and nothing says "to be confirmed". The values below are the
 * ones the project lead supplied, recorded with their provenance in
 * docs/research/study-decisions.md ("Team, affiliations and ethics approval"): the authors in
 * citation order, their affiliations as verified on the Centre's people pages and the faculty page,
 * and Ankit Kumar's ORCID. There is no published paper yet, so `paperCitation` stays null and How
 * to Cite gives the platform citation. Personal emails and phone numbers are never used; the one
 * contact address is the project's.
 */
export interface InstitutionAffiliation {
  /** 1-based number used by the author superscripts. */
  number: number;
  name: string;
}

export interface InstitutionAuthor {
  name: string;
  /** Affiliation numbers, in order. */
  affiliations: readonly number[];
  /** ORCID iD (the 16-digit form), when the author has supplied one. */
  orcid: string | null;
}

export interface InstitutionConfig {
  /** The affiliation line of the footer and the home-page strip. */
  affiliation: string | null;
  paperCitation: string | null;
  ethicsReference: string | null;
  contact: string | null;
  /** Authors in citation order (empty: no Team section). */
  authors: readonly InstitutionAuthor[];
  affiliations: readonly InstitutionAffiliation[];
}

/** The platform's name, as cited. */
export const PLATFORM_NAME = "Immersive Episteme";

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

/** The configured one-line fields only, in display order, for compact lines such as the public footer. */
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

/** "Kumar, S." from "Saurav Kumar": the family name is the last word of the name as supplied. */
export function citationName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const family = parts.pop() ?? "";
  const initials = parts.map((p) => `${p[0]!.toUpperCase()}.`).join(" ");
  return initials ? `${family}, ${initials}` : family;
}

/**
 * How to cite the work: the paper once it is published, otherwise the platform itself, with the
 * authors in citation order and the Centre as publisher. No year is given ("n.d.") because the
 * platform has no publication date yet; nothing is invented.
 */
export function howToCite(config: InstitutionConfig = INSTITUTION): string | null {
  if (config.paperCitation?.trim()) return config.paperCitation.trim();
  if (config.authors.length === 0) return null;
  const names = config.authors.map((a) => citationName(a.name));
  const authors = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]!}`;
  const publisher = config.affiliations[0]?.name.split(",").slice(0, 2).join(",").trim();
  return `${authors} (n.d.). ${PLATFORM_NAME}: a research platform comparing conventional pages and a walkable 3D museum [Research software].${publisher ? ` ${publisher}.` : ""}`;
}

/** The ORCID record URL of an iD. */
export function orcidUrl(orcid: string): string {
  return `https://orcid.org/${orcid}`;
}

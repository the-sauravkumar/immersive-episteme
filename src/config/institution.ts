/**
 * Institution facts shown on public pages (DESIGN.md 11.1 item 6, 9.16 footer, 13 rule 1).
 *
 * Every field is `null` until the team supplies it, and a `null` field renders nothing: nothing is
 * invented and nothing says "to be confirmed". The values below are the ones the project lead
 * supplied, recorded with their provenance in docs/research/study-decisions.md ("Team,
 * affiliations and ethics approval"). There is no published paper yet, so `paperCitation` stays
 * null. Personal emails and phone numbers are never used; the one contact address is the
 * project's.
 */
export interface InstitutionConfig {
  affiliation: string | null;
  paperCitation: string | null;
  ethicsReference: string | null;
  contact: string | null;
}

export const INSTITUTION: InstitutionConfig = {
  affiliation:
    "Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, and Department of Humanities and Social Sciences, Indian Institute of Technology Kharagpur, West Bengal 721302, India",
  paperCitation: null,
  ethicsReference: "Centre of Excellence for Unified AI-Enabled Craft Ecosystem Platform, Approval Number CXA/ETH/01",
  contact: "cxa.craftecosystem@gmail.com",
};

/** The configured fields only, in display order, for compact lines such as the public footer. */
export function institutionLines(config: InstitutionConfig = INSTITUTION): { key: keyof InstitutionConfig; label: string; value: string }[] {
  const labels: Record<keyof InstitutionConfig, string> = {
    affiliation: "Affiliation",
    paperCitation: "Paper",
    ethicsReference: "Ethics approval",
    contact: "Contact",
  };
  return (Object.keys(labels) as (keyof InstitutionConfig)[])
    .map((key) => ({ key, label: labels[key], value: config[key]?.trim() ?? "" }))
    .filter((l) => l.value.length > 0);
}

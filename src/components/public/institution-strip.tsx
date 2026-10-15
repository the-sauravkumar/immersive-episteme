/**
 * Institution strip (DESIGN.md 11.1 item 6, 13 rule 1): affiliation, paper citation, ethics
 * approval reference and contact. Every field is null until the team supplies it, and a null field
 * renders nothing; with every field null the strip renders nothing at all. Nothing is invented and
 * nothing says "to be confirmed".
 *
 * The values come from `src/config/institution.ts` (the home page passes `INSTITUTION`).
 */
import type { InstitutionConfig } from "@/config/institution";
import { titleCase } from "@/lib/text/title-case";

export type { InstitutionConfig };

export const NO_INSTITUTION: InstitutionConfig = { affiliation: null, paperCitation: null, ethicsReference: null, contact: null, authors: [], affiliations: [] };

const FIELDS: readonly ["affiliation" | "paperCitation" | "ethicsReference" | "contact", string][] = [
  ["affiliation", "Affiliation"],
  ["paperCitation", "Paper"],
  ["ethicsReference", "Ethics approval"],
  ["contact", "Contact"],
];

export function InstitutionStrip({ institution }: { institution: InstitutionConfig }) {
  const rows = FIELDS.filter(([key]) => !!institution[key]?.trim());
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="institution-heading" data-slot="institution-strip" className="border-t border-rule-strong pt-4">
      <h2 id="institution-heading" className="sr-only">
        {titleCase("Institution")}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-label">{label}</dt>
            <dd className="text-value break-words">{institution[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

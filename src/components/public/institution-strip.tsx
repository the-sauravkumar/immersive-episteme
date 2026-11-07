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
    <section aria-labelledby="institution-heading" data-slot="institution-strip" className="border-t border-lime-dim pt-4">
      <h2 id="institution-heading" className="sr-only">
        {titleCase("Institution")}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="t-label">{label}</dt>
            <dd className="t-b break-words">{institution[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

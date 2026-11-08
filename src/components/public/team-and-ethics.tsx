import { howToCite, orcidUrl, type InstitutionConfig } from "@/config/institution";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

const LINK =
  "text-turmeric underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-turmeric-hi hover:decoration-2";

export function TeamList({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  if (institution.authors.length === 0) return null;
  return (
    <ul data-slot="team-list" className={cn("flex flex-col gap-2", className)}>
      {institution.authors.map((a) => (
        <li key={a.name} className="t-b text-lime">
          {a.name}
          <sup className="ml-0.5 text-[0.7em] tabular-nums" aria-label={`affiliation ${a.affiliations.join(" and ")}`}>
            {a.affiliations.join(",")}
          </sup>
          {a.orcid ? (
            <>
              {", ORCID "}
              <a href={orcidUrl(a.orcid)} className={cn(LINK, "t-table font-semibold wrap-anywhere inline-flex min-h-11 items-center whitespace-nowrap")} rel="noopener noreferrer" target="_blank">
                {a.orcid}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AffiliationList({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  if (institution.affiliations.length === 0) return null;
  return (
    <ol data-slot="affiliation-list" className={cn("flex list-none flex-col gap-2", className)}>
      {institution.affiliations.map((f) => (
        <li key={f.number} className="t-s text-lime-dim grid grid-cols-[1.5rem_minmax(0,1fr)] text-lime-dim">
          <span className="tabular-nums">{f.number}</span>
          <span>{f.name}</span>
        </li>
      ))}
    </ol>
  );
}

export function ContactLink({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  const contact = institution.contact?.trim();
  if (!contact) return null;
  return (
    <a href={`mailto:${contact}`} className={cn(LINK, "break-all", className)}>
      {contact}
    </a>
  );
}

export function CitationText({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  const text = howToCite(institution);
  if (!text) return null;
  return (
    <p data-slot="how-to-cite" className={cn("t-b max-w-[34rem] text-lime", className)}>
      {text}
    </p>
  );
}

export function StudyTeamAndEthics({ institution }: { institution: InstitutionConfig }) {
  const ethics = institution.ethicsReference?.trim();
  const hasTeam = institution.authors.length > 0;
  if (!hasTeam && !ethics && !institution.contact?.trim()) return null;
  return (
    <section aria-labelledby="study-team-heading" data-slot="study-team-ethics" className="flex flex-col gap-4">
      <h2 id="study-team-heading" className="t-h4 text-lime">
        {titleCase("Research team and ethics")}
      </h2>
      <dl className="flex max-w-[34rem] flex-col gap-4">
        {hasTeam ? (
          <div className="flex flex-col gap-2">
            <dt className="t-label">Researchers</dt>
            <dd className="flex flex-col gap-3">
              <TeamList institution={institution} />
              <AffiliationList institution={institution} />
            </dd>
          </div>
        ) : null}
        {ethics ? (
          <div className="flex flex-col gap-1">
            <dt className="t-label">Ethics approval</dt>
            <dd className="t-b text-lime">{ethics}</dd>
          </div>
        ) : null}
        {institution.contact?.trim() ? (
          <div className="flex flex-col gap-1">
            <dt className="t-label">Questions about the study</dt>
            <dd className="t-b text-lime">
              <ContactLink institution={institution} />
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

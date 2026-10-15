/**
 * The team, affiliations, ethics approval, contact and citation of the project, from
 * `src/config/institution.ts`. One set of components for About (its Team and Affiliations,
 * Ethics, How to Cite and Contact sections) and for the study's information and consent page, so
 * both say exactly the same. Every part renders nothing when its config field is empty.
 *
 * Author names carry their affiliation numbers as superscripts, in citation order; an ORCID iD is
 * a plain link to its record. No personal email or phone number is ever shown: the contact is the
 * project's address.
 */
import { howToCite, orcidUrl, type InstitutionConfig } from "@/config/institution";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

const LINK =
  "text-indigo underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2";

/** Authors in citation order, each with the numbers of their affiliations. */
export function TeamList({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  if (institution.authors.length === 0) return null;
  return (
    <ul data-slot="team-list" className={cn("flex flex-col gap-2", className)}>
      {institution.authors.map((a) => (
        <li key={a.name} className="text-reading text-ink">
          {a.name}
          <sup className="ml-0.5 text-[0.7em] tabular-nums" aria-label={`affiliation ${a.affiliations.join(" and ")}`}>
            {a.affiliations.join(",")}
          </sup>
          {a.orcid ? (
            <>
              {", ORCID "}
              <a href={orcidUrl(a.orcid)} className={cn(LINK, "text-id whitespace-nowrap")} rel="noopener noreferrer" target="_blank">
                {a.orcid}
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The numbered affiliations the author superscripts refer to. */
export function AffiliationList({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  if (institution.affiliations.length === 0) return null;
  return (
    <ol data-slot="affiliation-list" className={cn("flex list-none flex-col gap-2", className)}>
      {institution.affiliations.map((f) => (
        <li key={f.number} className="text-source grid grid-cols-[1.5rem_minmax(0,1fr)] text-ink-2">
          <span className="tabular-nums">{f.number}</span>
          <span>{f.name}</span>
        </li>
      ))}
    </ol>
  );
}

/** The project's contact address as a mail link, or nothing. */
export function ContactLink({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  const contact = institution.contact?.trim();
  if (!contact) return null;
  return (
    <a href={`mailto:${contact}`} className={cn(LINK, "break-all", className)}>
      {contact}
    </a>
  );
}

/** The citation of the work (the paper once published, otherwise the platform), or nothing. */
export function CitationText({ institution, className }: { institution: InstitutionConfig; className?: string }) {
  const text = howToCite(institution);
  if (!text) return null;
  return (
    <p data-slot="how-to-cite" className={cn("text-reading max-w-[34rem] text-ink", className)}>
      {text}
    </p>
  );
}

/**
 * The block on the study's information and consent page: who runs the study, the ethics approval
 * and the contact, before the participant decides. Labels and values as in the home-page strip.
 */
export function StudyTeamAndEthics({ institution }: { institution: InstitutionConfig }) {
  const ethics = institution.ethicsReference?.trim();
  const hasTeam = institution.authors.length > 0;
  if (!hasTeam && !ethics && !institution.contact?.trim()) return null;
  return (
    <section aria-labelledby="study-team-heading" data-slot="study-team-ethics" className="flex flex-col gap-4">
      <h2 id="study-team-heading" className="text-h2 text-ink">
        {titleCase("Research team and ethics")}
      </h2>
      <dl className="flex max-w-[34rem] flex-col gap-4">
        {hasTeam ? (
          <div className="flex flex-col gap-2">
            <dt className="text-label">Researchers</dt>
            <dd className="flex flex-col gap-3">
              <TeamList institution={institution} />
              <AffiliationList institution={institution} />
            </dd>
          </div>
        ) : null}
        {ethics ? (
          <div className="flex flex-col gap-1">
            <dt className="text-label">Ethics approval</dt>
            <dd className="text-reading text-ink">{ethics}</dd>
          </div>
        ) : null}
        {institution.contact?.trim() ? (
          <div className="flex flex-col gap-1">
            <dt className="text-label">Questions about the study</dt>
            <dd className="text-reading text-ink">
              <ContactLink institution={institution} />
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

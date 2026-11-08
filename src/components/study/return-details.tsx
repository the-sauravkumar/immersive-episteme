import { studyReturnLink } from "@/lib/access/share-links";
import { titleCase } from "@/lib/text/title-case";

import { STUDY_LINK_CLASS } from "./step-footer";

const CODE = "t-table font-semibold wrap-anywhere whitespace-nowrap text-lime";

export function ReturnDetails({ origin, studySlug, participantCode, title, lead }: { origin: string; studySlug: string; participantCode: string; title: string; lead: string }) {
  const link = studyReturnLink(origin, studySlug, participantCode);
  return (
    <section aria-labelledby="return-heading" className="flex flex-col gap-4">
      <h2 id="return-heading" className="t-h4 text-lime">
        {titleCase(title)}
      </h2>
      <p className="t-b max-w-[34rem] text-lime">{lead}</p>
      <p className="t-b max-w-[34rem] text-lime">
        Your participant code is <span className={CODE}>{participantCode}</span> and the study code is <span className={CODE}>{studySlug}</span>. Keep them: together they are the only way back to your answers.
      </p>
      <p className="t-b max-w-[34rem] break-all text-lime">
        Return link:{" "}
        <a className={STUDY_LINK_CLASS} href={link}>
          {link}
        </a>
      </p>
    </section>
  );
}

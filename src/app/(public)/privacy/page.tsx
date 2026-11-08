import type { Metadata } from "next";

import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { PageHeader } from "@/components/shell/page-header";
import { duration, STAFF_COOKIES, VISITOR_COOKIES } from "@/server/public/cookie-inventory";

export const metadata: Metadata = { title: "Privacy" };

const LIST = "t-b flex list-disc flex-col gap-2 pl-6 text-lime marker:text-lime-dim";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Privacy"
        description="Participants take part under a pseudonymous study identifier. They do not create an account."
      />
      <EditorialFrame>
        <EditorialSection id="participants" title="Taking part in a study">
          <EditorialRow
            note={
              <Sidenote>
                <p>The study identifier is an opaque code. It holds no name or email address.</p>
              </Sidenote>
            }
          >
            <Prose>
              You join a study with the study link or code the researchers give you. The platform then knows you only by a pseudonymous study
              identifier and the learning condition you were allocated to. It records your answers to the questions and tasks, and, during the
              learning task, what you open and for how long, so that the two conditions can be compared.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="demo" title="The public demo">
          <EditorialRow>
            <Prose>
              Nothing you do in the demo started from Explore is stored as study data. The demo&rsquo;s interaction events are checked and then
              discarded; none is written to the database.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="cookies" title="Cookies and browser storage">
          <EditorialRow
            note={
              <Sidenote>
                <p>Each cookie is signed, so it cannot be altered, and it is not readable by scripts on the page.</p>
              </Sidenote>
            }
          >
            <Prose>The platform sets only the cookies it needs to work. For participants and visitors:</Prose>
            <ul className={LIST}>
              {VISITOR_COOKIES.map((c) => (
                <li key={c.name}>
                  <span className="font-semibold">{c.name}</span>: {c.purpose}, for at most {duration(c.seconds)}.
                </li>
              ))}
            </ul>
            <Prose>For researchers, curators and administrators only:</Prose>
            <ul className={LIST}>
              {STAFF_COOKIES.map((c) => (
                <li key={c.name}>
                  <span className="font-semibold">{c.name}</span>: {c.purpose}, for at most {duration(c.seconds)}.
                </li>
              ))}
            </ul>
            <Prose>
              Your browser also keeps, on this device only, your display settings and, during a study,
              interaction events until the platform has received them.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="staff" title="Research team accounts">
          <EditorialRow>
            <Prose>
              Staff sign in with an email address and password or, when the team has turned it on, with a Google account. Google then gives the
              platform the account&rsquo;s name, email address and profile picture link. A staff member&rsquo;s name, email address and roles are stored
              so that each person sees only the parts of the platform their role allows, and changes to content and settings are recorded with who
              made them.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}

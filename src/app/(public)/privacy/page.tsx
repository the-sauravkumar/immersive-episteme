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
              identifier and the learning task you were given. It records your answers to the questions and tasks. The display and browser check records your window size, screen density, input
              devices, browser family, graphics support and whether you have asked for reduced motion or high contrast. During the learning task it
              records the stops you enter and leave and for how long, the sources you open, the hints and help you use, and, where the task is a scene you
              move through, your path, where you look and how long you stay near each object, so that the researchers can study how people learn.
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
              During a study, your browser also keeps, on this device only, interaction events until the platform has received them, and the
              number of the last event it sent.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="staff" title="Research team accounts">
          <EditorialRow>
            <Prose>
              Staff sign in with an email address and password or, when the team has turned it on, with a Google account. Google then gives the
              platform the account&rsquo;s name, email address and profile picture link. A staff member&rsquo;s name, email address and roles are stored
              so that each person sees only the parts of the platform their role allows, and changes to content and settings are recorded with who
              made them. Each signed-in session also stores the IP address and browser description it was opened from, and sign-in attempts are
              counted per network address to slow down password guessing.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}

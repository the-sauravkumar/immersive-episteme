/**
 * Privacy (DESIGN.md 11.4): long-form text in the editorial frame. It describes only what the
 * platform's code does (pseudonymous participants, the cookies it sets and their lifetimes, what a
 * demo stores, what the browser keeps). The contacts list (a `<dl>`) and the retention period
 * appear only once the team supplies them; nothing is shown as "to be confirmed" (DESIGN.md 13).
 */
import type { Metadata } from "next";

import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { PageHeader } from "@/components/shell/page-header";
import { DEMO_SESSION_TTL_SECONDS } from "@/server/auth/demo-session";
import { PARTICIPANT_SESSION_TTL_SECONDS } from "@/server/auth/participant-session-token";

export const metadata: Metadata = { title: "Privacy" };

const LIST = "text-reading flex list-disc flex-col gap-2 pl-6 text-ink marker:text-ink-3";

const hours = (seconds: number) => {
  const h = Math.round(seconds / 3600);
  return `${h} ${h === 1 ? "hour" : "hours"}`;
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        eyebrow="Privacy"
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
            <Prose>The platform sets only the cookies it needs to work:</Prose>
            <ul className={LIST}>
              <li>
                <span className="font-semibold">Study session</span>: your pseudonymous identifier and condition during one sitting, for at most{" "}
                {hours(PARTICIPANT_SESSION_TTL_SECONDS)}.
              </li>
              <li>
                <span className="font-semibold">Demo</span>: that you started the public demo, for at most {hours(DEMO_SESSION_TTL_SECONDS)}. It holds
                no personal data.
              </li>
              <li>
                <span className="font-semibold">Staff sign-in</span>: for researchers, curators and administrators only.
              </li>
            </ul>
            <Prose>
              Your browser also keeps, on this device only, your display settings, the graphics level chosen for the museum and, during a study,
              interaction events until the platform has received them.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="staff" title="Research team accounts">
          <EditorialRow>
            <Prose>
              Staff sign in with an email address and password. Their name, email address and roles are stored so that each person sees only the
              parts of the platform their role allows, and changes to content and settings are recorded with who made them.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}

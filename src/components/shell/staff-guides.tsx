import { GuidedSteps } from "./guided-steps";

export interface GuideStudy {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly hasRelease: boolean;
  readonly hasAssessments: boolean;
  readonly parityPassed: boolean;
}

export function StudySetupGuide({ study, className }: { study: GuideStudy | null; className?: string }) {
  const page = study ? `/research/studies/${study.id}` : "/research/studies";
  const started = study !== null && study.status !== "draft";
  return (
    <GuidedSteps
      id="guide-study"
      className={className}
      title="Set up a study"
      intro={study ? <>Following {study.title}. Each step opens the place where it is done.</> : "No study yet. Start with the first step."}
      steps={[
        { title: "Create the study", body: "Give it a title and a short web name. It starts as a draft with a 2D and a 3D learning door.", href: "/research/studies#new", action: "New study", done: study !== null },
        {
          title: "Choose the content release",
          body: "Pick the published content release learners will see, and the traditions it covers. A Curator publishes releases.",
          href: `${page}#protocol`,
          action: "Choose release",
          done: started || (study?.hasRelease ?? false),
        },
        { title: "Add the assessments", body: "Set the tests and questionnaires, in the order every participant takes them.", href: `${page}#battery`, action: "Add assessments", done: started || (study?.hasAssessments ?? false) },
        {
          title: "Check that both doors match",
          body: "The check compares the 2D and 3D doors stage by stage: same words, same sources, same pictures. It must pass before the study can start.",
          href: `${page}#parity`,
          action: "Run the check",
          done: started || (study?.parityPassed ?? false),
        },
        { title: "Start the study", body: "Only the principal investigator can start a study. Once started, the protocol is frozen.", href: `${page}#parity`, action: "Start", done: study?.status === "active" || study?.status === "closed" },
      ]}
    />
  );
}

export function InviteParticipantsGuide({
  study,
  mayMakeCodes,
  mayWatch,
  className,
}: {
  study: { id: string; title: string; status: string } | null;
  mayMakeCodes: boolean;
  mayWatch: boolean;
  className?: string;
}) {
  return (
    <GuidedSteps
      id="guide-invite"
      className={className}
      title="Invite participants"
      intro="The site is invite-only. Participants arrive through a private link that carries an invite code."
      steps={[
        {
          title: "Have a running study",
          body: "Participants can only join a study that has been started. A Researcher sets it up; the principal investigator starts it.",
          href: study ? `/research/studies/${study.id}#parity` : "/research/studies",
          action: "Open the study",
          done: study?.status === "active",
        },
        mayMakeCodes
          ? {
              title: "Make an invite code for the study",
              body: "Choose the study, a last day and how many people may use it. The link is shown only once: copy it straight away.",
              href: "/admin/access#create-invite",
              action: "Make a code",
            }
          : {
              title: "Ask an Admin for an invite code",
              body: `Admins make invite codes. Ask one for a code tied to ${study ? study.title : "your study"}, with a last day and a use limit; they send you the link.`,
            },
        { title: "Share the link privately", body: "Send it by email or message to the people being recruited. Never post it publicly or put it in a shared document." },
        mayWatch
          ? {
              title: "Watch people arrive",
              body: "Each person who joins appears under a study code, never a name. Sessions that need attention are flagged.",
              href: study ? `/research/participants?study=${study.id}` : "/research/participants",
              action: "See participants",
            }
          : { title: "Close the code when recruitment ends", body: "Revoke the code from the list of invite codes so the link stops working." },
      ]}
    />
  );
}

export function ReviewContentGuide({ waiting, returned, className }: { waiting: number; returned: number; className?: string }) {
  return (
    <GuidedSteps
      id="guide-review"
      className={className}
      title="Review content"
      intro="Every item needs a second pair of eyes: nobody approves their own work."
      steps={[
        {
          title: "Open an item that waits for you",
          body: waiting === 0 ? "Nothing waits for your review right now." : `${waiting} item${waiting === 1 ? "" : "s"} written by someone else wait${waiting === 1 ? "s" : ""} for your review.`,
          href: "/cms/review",
          action: "Open the queue",
          done: waiting === 0,
        },
        { title: "Check each quotation", body: "Open every cited source and confirm the page or place and the exact words. Tick each evidence check as you go." },
        {
          title: "Decide",
          body: "Verify it if every check holds. Choose Needs evidence and say what is missing if a source, page or quotation is absent. Reject it if it is wrong. Every decision needs a short reason.",
        },
        {
          title: "Fix what came back to you",
          body: returned === 0 ? "None of your items came back." : `${returned} of your item${returned === 1 ? "" : "s"} came back with a reviewer's note. Add what is missing and submit again.`,
          href: "/cms/review?state=needs_evidence",
          action: "See returned items",
          done: returned === 0,
        },
      ]}
    />
  );
}

export function PublishReleaseGuide({ unverified, refusals, mayPublish, className }: { unverified: number; refusals: number; mayPublish: boolean; className?: string }) {
  return (
    <GuidedSteps
      id="guide-release"
      className={className}
      title="Publish a release"
      intro="A release is a frozen copy of the verified content. Studies show learners exactly that copy."
      steps={[
        {
          title: "Get everything verified",
          body: unverified === 0 ? "Everything waiting for release is verified." : `${unverified} item${unverified === 1 ? " is" : "s are"} not verified yet. Review them, or archive what should not ship.`,
          href: "/cms/review",
          action: "Open the queue",
          done: unverified === 0,
        },
        {
          title: "Clear what blocks the release",
          body: refusals === 0 ? "Nothing blocks a release." : `${refusals} reason${refusals === 1 ? "" : "s"} would stop the release. The Releases page lists each one and what to change.`,
          href: "/cms/datasets#readiness",
          action: "See reasons",
          done: refusals === 0,
        },
        mayPublish
          ? { title: "Publish", body: "Give the release a name such as release-2 and a title, then type the name again to confirm. Publishing cannot be undone.", href: "/cms/datasets#publish", action: "Publish" }
          : { title: "Ask for it to be published", body: "Only a Curator or the principal investigator can publish. Ask one of them once the first two steps are done." },
        { title: "Tell the researchers", body: "A Researcher chooses the new release on their study's page before the study starts. A running study keeps the release it started with." },
      ]}
    />
  );
}

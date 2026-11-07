import { INVITE_ACCESS_TTL_SECONDS } from "@/server/access/invite-cookie";
import { KNOWN_DEVICE_MAX_AGE, STAFF_SESSION_SECONDS } from "@/server/auth/config";
import { DEMO_SESSION_TTL_SECONDS } from "@/server/auth/demo-session";
import { PARTICIPANT_SESSION_TTL_SECONDS } from "@/server/auth/participant-session-token";
import { ENROLMENT_TTL_SECONDS, HISTORY_TTL_SECONDS } from "@/server/study/tokens";

export function duration(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
  if (seconds < 3600) return unit(Math.round(seconds / 60), "minute");
  if (seconds < 2 * 86_400) return unit(Math.round(seconds / 3600), "hour");
  return unit(Math.round(seconds / 86_400), "day");
}

export const VISITOR_COOKIES = [
  { name: "Invite", seconds: INVITE_ACCESS_TTL_SECONDS, purpose: "that this browser entered a valid invite code; it names the code, not you" },
  { name: "Study enrolment", seconds: ENROLMENT_TTL_SECONDS, purpose: "your pseudonymous identifier and the study, between entering the study code and your consent decision" },
  { name: "Study session", seconds: PARTICIPANT_SESSION_TTL_SECONDS, purpose: "your pseudonymous identifier and condition during one sitting" },
  {
    name: "Participation history",
    seconds: HISTORY_TTL_SECONDS,
    purpose: "which studies this browser has enrolled in, as pseudonymous identifiers only, used to recognise a second enrolment in the same study",
  },
  { name: "Demo", seconds: DEMO_SESSION_TTL_SECONDS, purpose: "that you started the public demo; it holds no personal data" },
] as const;

export const STAFF_COOKIES = [
  { name: "Staff sign-in", seconds: STAFF_SESSION_SECONDS, purpose: "the signed-in session, renewed while it is in use" },
  {
    name: "Known device",
    seconds: KNOWN_DEVICE_MAX_AGE,
    purpose: "that this browser has signed in to an account before, as a one-way code of the email address, so that failed attempts from elsewhere do not lock this browser out",
  },
  { name: "Google sign-in", seconds: 300, purpose: "a one-time check that the reply from Google belongs to this sign-in, set only while signing in with Google" },
] as const;

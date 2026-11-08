import { ensure, type Actor, type Q } from "@/server/cms/core";

export type ReturnStatus = "not_started" | "in_progress" | "awaiting_delayed" | "finished" | "ended" | "withdrawn" | "excluded";

export const RETURN_STATUS_LABELS: Readonly<Record<ReturnStatus, string>> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_delayed: "Waiting for the delayed test",
  finished: "Finished",
  ended: "Ended",
  withdrawn: "Withdrawn",
  excluded: "Excluded",
};

export function returnStatus(row: { participantStatus: string; sessionStatus: string | null; withdrawn: boolean; excluded: boolean; awaitingDelayed: boolean }): ReturnStatus {
  if (row.participantStatus === "withdrawn" || row.withdrawn) return "withdrawn";
  if (row.participantStatus === "excluded" || row.excluded) return "excluded";
  if (row.sessionStatus === null) return "not_started";
  if (row.sessionStatus === "completed") return "finished";
  if (row.sessionStatus === "abandoned") return "ended";
  return row.awaitingDelayed ? "awaiting_delayed" : "in_progress";
}

export const canReturn = (status: ReturnStatus) => status === "in_progress" || status === "awaiting_delayed";

export interface ParticipantReturnRow {
  code: string;
  status: ReturnStatus;
  lastActivityAt: string;
}

export async function listParticipantReturns(q: Q, actor: Actor, studyId: string): Promise<ParticipantReturnRow[]> {
  ensure(actor, "admin.users");
  const r = await q.query<{ code: string; participant_status: string; session_status: string | null; withdrawn: boolean | null; excluded: boolean | null; awaiting_delayed: boolean; last_activity: Date }>(
    `SELECT p.code, p.status::text AS participant_status, ss.status::text AS session_status, ss.withdrawn, ss.excluded,
            coalesce(d.completed_at IS NULL AND d.missed_at IS NULL, false) AS awaiting_delayed,
            greatest(p.enrolled_at, ss.started_at, ss.last_activity_at) AS last_activity
       FROM participants p
       LEFT JOIN LATERAL (SELECT id, status, withdrawn, excluded, started_at, last_activity_at FROM study_sessions WHERE participant_id = p.id ORDER BY period DESC LIMIT 1) ss ON true
       LEFT JOIN delayed_test_schedule d ON d.session_id = ss.id
      WHERE p.study_id = $1
      ORDER BY last_activity DESC, p.code`,
    [studyId],
  );
  return r.rows.map((x) => ({
    code: x.code,
    status: returnStatus({ participantStatus: x.participant_status, sessionStatus: x.session_status, withdrawn: x.withdrawn ?? false, excluded: x.excluded ?? false, awaitingDelayed: x.awaiting_delayed }),
    lastActivityAt: x.last_activity.toISOString(),
  }));
}

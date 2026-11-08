const trimmed = (origin: string) => origin.replace(/\/+$/, "");

export function inviteLinks(origin: string, code: string, studySlug: string | null): { site: string; study: string | null } {
  const base = trimmed(origin);
  const invite = encodeURIComponent(code);
  return {
    site: `${base}/?invite=${invite}`,
    study: studySlug ? `${base}/study?code=${encodeURIComponent(studySlug)}&invite=${invite}` : null,
  };
}

export function studyReturnLink(origin: string, studySlug: string, participantCode: string): string {
  return `${trimmed(origin)}/study/return?study=${encodeURIComponent(studySlug)}&code=${encodeURIComponent(participantCode)}`;
}

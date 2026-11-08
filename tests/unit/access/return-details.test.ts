import { describe, expect, it } from "vitest";

import { inviteLinks, studyReturnLink } from "@/lib/access/share-links";
import { canReturn, returnStatus, type ReturnStatus } from "@/server/admin/participants";
import { formatInviteCode, generateInviteCode, hashInviteCode, normaliseInviteCode } from "@/server/access/invite-code";
import { openInviteCode, sealInviteCode } from "@/server/access/invite-seal";

const SECRET = "s".repeat(24) + "0123456789abcdefghij";

describe("invite codes kept sealed at rest", () => {
  const code = normaliseInviteCode(generateInviteCode())!;
  const hash = hashInviteCode(code);

  it("opens only with the same secret and the same code hash, and never stores the code in clear", () => {
    const sealed = sealInviteCode(code, hash, SECRET);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{48}$/);
    expect(sealed).not.toContain(code);
    expect(sealInviteCode(code, hash, SECRET)).not.toBe(sealed);
    expect(openInviteCode(sealed, hash, SECRET)).toBe(code);
    expect(openInviteCode(sealed, hash, `${SECRET}x`)).toBeNull();
    expect(openInviteCode(sealed, hashInviteCode("0".repeat(20)), SECRET)).toBeNull();
    const [v, iv, body] = sealed.split(".");
    const flipped = `${body!.slice(0, -2)}${body!.endsWith("AA") ? "BA" : "AA"}`;
    expect(openInviteCode(`${v}.${iv}.${flipped}`, hash, SECRET)).toBeNull();
    expect(openInviteCode("v2.x.y", hash, SECRET)).toBeNull();
    expect(openInviteCode("garbage", hash, SECRET)).toBeNull();
  });

  it("shows a code in groups of four, as it was handed out", () => {
    expect(formatInviteCode("ABCD0123EFGH4567JKMN")).toBe("ABCD-0123-EFGH-4567-JKMN");
    expect(generateInviteCode()).toMatch(/^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
  });
});

describe("links an administrator shares", () => {
  it("builds the site, study and return links on the deployed origin", () => {
    expect(inviteLinks("https://x.test/", "ABCD-0123", "demo-a")).toEqual({ site: "https://x.test/?invite=ABCD-0123", study: "https://x.test/study?code=demo-a&invite=ABCD-0123" });
    expect(inviteLinks("https://x.test", "ABCD-0123", null).study).toBeNull();
    expect(studyReturnLink("https://x.test/", "demo-a", "P-ABC123")).toBe("https://x.test/study/return?study=demo-a&code=P-ABC123");
  });
});

describe("participant return status", () => {
  const base = { participantStatus: "active", sessionStatus: "in_progress", withdrawn: false, excluded: false, awaitingDelayed: false };

  it("offers a return link only to a participant with an open session", () => {
    expect(returnStatus(base)).toBe("in_progress");
    expect(returnStatus({ ...base, awaitingDelayed: true })).toBe("awaiting_delayed");
    expect(returnStatus({ ...base, sessionStatus: null })).toBe("not_started");
    expect(returnStatus({ ...base, sessionStatus: "completed" })).toBe("finished");
    expect(returnStatus({ ...base, sessionStatus: "abandoned" })).toBe("ended");
    expect(returnStatus({ ...base, participantStatus: "withdrawn" })).toBe("withdrawn");
    expect(returnStatus({ ...base, excluded: true })).toBe("excluded");
    const open: ReturnStatus[] = ["in_progress", "awaiting_delayed"];
    const closed: ReturnStatus[] = ["not_started", "finished", "ended", "withdrawn", "excluded"];
    expect(open.every(canReturn)).toBe(true);
    expect(closed.some(canReturn)).toBe(false);
  });
});

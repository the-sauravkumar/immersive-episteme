/**
 * Guard: a participant assigned to the immersive condition can never load /learn/2d.
 *  1. The access decision for /learn/2d with a live immersive participant cookie is a redirect
 *     to the session hub, even when the same browser also holds a demo cookie or staff session.
 *  2. Every /learn/2d route renders behind that decision: the layout uses LearningGate and every
 *     page wraps its content in LearningPage with condition "2d" (a layout gate alone does not
 *     stop a page's RSC payload; src/components/shell/gates.tsx).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLearningAccess } from "@/server/auth/learning-decision";
import { signParticipantSession } from "@/server/auth/participant-session-token";
import type { StudySessionRecord } from "@/server/auth/study-session-port-types";

const SECRET = "test-secret-test-secret-test-secret-0123456789";
const PARTICIPANT = "0190f0a0-0000-7000-8000-0000000000c1";
const SESSION = "0190f0a0-0000-7000-8000-0000000000c2";

const immersiveSession: StudySessionRecord = {
  sessionId: SESSION,
  participantId: PARTICIPANT,
  condition: "immersive",
  status: "in_progress",
  participantStatus: "active",
  withdrawn: false,
};

describe("/learn/2d condition guard", () => {
  it("redirects an immersive participant to the session hub, whatever else the browser holds", async () => {
    const cookie = await signParticipantSession({ participantId: PARTICIPANT, sessionId: SESSION, condition: "immersive" }, SECRET);
    const decision = await resolveLearningAccess(
      {
        condition: "2d",
        participantCookie: cookie,
        demoCookie: "any-demo-cookie",
        staff: async () => ({ userId: "staff-1", roles: ["admin"] }) as never,
      },
      { secret: SECRET, lookup: { findSession: async () => immersiveSession } },
    );
    expect(decision).toEqual({ allowed: false, reason: "condition_mismatch", redirectTo: "/study/session" });

    const own = await resolveLearningAccess(
      { condition: "immersive", participantCookie: cookie, demoCookie: undefined, staff: async () => null },
      { secret: SECRET, lookup: { findSession: async () => immersiveSession } },
    );
    expect(own.allowed).toBe(true);
  });

  it("puts every /learn/2d layout and page behind the 2D gate", () => {
    const root = join(process.cwd(), "src/app/(learning)/learn/2d");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "page.tsx" || name === "layout.tsx") files.push(p);
      }
    };
    walk(root);
    expect(files.filter((f) => f.endsWith("page.tsx")).length).toBeGreaterThanOrEqual(7);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // The root layout holds the gate; a nested (route-group) layout sits inside it and may only
      // mount the frame, which resolves the learning context through the same guard.
      if (f === join(root, "layout.tsx")) expect(src, f).toContain('<LearningGate condition="2d">');
      else if (f.endsWith("layout.tsx")) expect(src, f).toMatch(/<LearningGate condition="2d">|<Learning2dFrame>/);
      else expect(src, f).toMatch(/<LearningPage condition="2d">[\s\S]*<\/LearningPage>/);
    }
  });
});

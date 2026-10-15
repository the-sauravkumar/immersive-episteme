/**
 * The condition guard on /learn/immersive: a participant assigned to the 2D condition is
 * redirected before the page builds or sends any museum data (layout gate, page gate and the
 * data loader all refuse). Uses the real guard (signed participant token, decision logic) with an
 * in-memory study session; only the request APIs and the data loaders are stubbed.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as EnvModule from "@/lib/env";
import type { StudySessionRecord } from "@/server/auth/study-session-port-types";

const PID = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const SECRET = "immersive-guard-test-secret-0123456789-abcdefghij";

const state = vi.hoisted(() => ({ cookie: "" as string, cookieName: "", payloadCalls: 0, manifestCalls: 0 }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === state.cookieName ? { value: state.cookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/env", async (orig) => {
  const real = await orig<typeof EnvModule>();
  return { ...real, serverEnv: () => ({ ...real.serverEnv(), BETTER_AUTH_SECRET: SECRET }) };
});
vi.mock("@/server/auth/study-session-port", () => ({
  getStudySessionLookup: () => ({
    async findSession(id: string): Promise<StudySessionRecord | null> {
      return id === SID ? { sessionId: SID, participantId: PID, condition: "2d", status: "in_progress", participantStatus: "active", withdrawn: false } : null;
    },
  }),
}));
vi.mock("@/server/auth/demo-gate", () => ({ isPublicDemoEnabled: async () => true }));
vi.mock("@/server/auth/staff", () => ({ getStaffPrincipal: async () => null, requireStaff: async () => null, requirePermission: async () => null }));
vi.mock("@/features/immersive/server/payload", () => ({
  MuseumUnavailableError: class extends Error {},
  buildMuseumPayload: async () => {
    state.payloadCalls++;
    throw new Error("payload must not be built for a refused request");
  },
}));
vi.mock("@/server/spatial/manifests", () => ({
  getManifest: async () => {
    state.manifestCalls++;
    return null;
  },
}));

describe("/learn/immersive condition guard", () => {
  beforeEach(async () => {
    const { signParticipantSession } = await import("@/server/auth/participant-session-token");
    const { PARTICIPANT_COOKIE } = await import("@/server/auth/cookie-names");
    state.cookieName = PARTICIPANT_COOKIE;
    state.cookie = await signParticipantSession({ participantId: PID, sessionId: SID, condition: "2d" }, SECRET);
    state.payloadCalls = 0;
    state.manifestCalls = 0;
  });

  it("redirects a 2D participant from the layout gate and the page gate", async () => {
    const { LearningGate, LearningPage } = await import("@/components/shell/gates");
    await expect(LearningGate({ condition: "immersive", children: null })).rejects.toThrow("REDIRECT:/study/session");
    await expect(LearningPage({ condition: "immersive", children: null })).rejects.toThrow("REDIRECT:/study/session");
  });

  it("never builds the museum data for a 2D participant", async () => {
    const { default: Page } = await import("@/app/(learning)/learn/immersive/page");
    const tree = Page() as ReactElement<{ children: ReactNode }>;
    // <LearningPage condition="immersive"><Suspense><Museum /></Suspense></LearningPage>
    expect((tree.props as { condition?: string }).condition).toBe("immersive");
    const suspense = tree.props.children as ReactElement<{ children: ReactNode }>;
    const museum = suspense.props.children;
    expect(isValidElement(museum)).toBe(true);
    const Museum = (museum as ReactElement).type as () => Promise<unknown>;
    await expect(Museum()).rejects.toThrow("REDIRECT:/study/session");
    expect(state.payloadCalls).toBe(0);
    expect(state.manifestCalls).toBe(0);
    // The first import of the page loads the whole museum client graph (about 5 s on its own).
  }, 30_000);

  it("lets a participant assigned to the immersive condition through the gate", async () => {
    const { signParticipantSession } = await import("@/server/auth/participant-session-token");
    const { resolveLearningAccess } = await import("@/server/auth/learning-decision");
    const token = await signParticipantSession({ participantId: PID, sessionId: SID, condition: "immersive" }, SECRET);
    const d = await resolveLearningAccess(
      { condition: "immersive", participantCookie: token, demoCookie: undefined, staff: async () => null },
      { secret: SECRET, lookup: { findSession: async () => ({ sessionId: SID, participantId: PID, condition: "immersive", status: "in_progress", participantStatus: "active", withdrawn: false }) } },
    );
    expect(d.allowed).toBe(true);
  });
});

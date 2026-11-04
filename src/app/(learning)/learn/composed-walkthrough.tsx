"use client";

import type { WalkEngineFactory } from "@/features/walkthrough/application/walk-engine";
import { WalkRuntime } from "@/features/walkthrough/infrastructure/walk-runtime";
import { WalkthroughPractice, type WalkthroughPracticeProps } from "@/features/walkthrough/ui/walkthrough-practice";
import { WalkthroughSession, type WalkthroughSessionProps } from "@/features/walkthrough/ui/walkthrough-session";

const createWalkEngine: WalkEngineFactory = (host, stations, textiles, events) => new WalkRuntime(host, stations, textiles, events);

export function ComposedWalkthroughSession(props: Omit<WalkthroughSessionProps, "createEngine">) {
  return <WalkthroughSession {...props} createEngine={createWalkEngine} />;
}

export function ComposedWalkthroughPractice(props: Omit<WalkthroughPracticeProps, "createEngine">) {
  return <WalkthroughPractice {...props} createEngine={createWalkEngine} />;
}

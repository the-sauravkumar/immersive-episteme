/**
 * Typed event helpers for every type in EVENT_TYPE_REGISTRY except the interval (timing) events,
 * which only the time accountant (./timing.ts) emits.
 * Metadata types are inferred from EVENT_METADATA_SCHEMAS (strict objects), so an unknown or
 * mistyped metadata key is a compile error, and the same schema validates at runtime.
 *
 * `createEventHelpers(track)` returns one camelCase helper per event code, e.g.
 * `pageEntered`, `roomEntered`, `exhibitSelected`, `relationshipFollowed`, `conceptEncountered`.
 */
import type { z } from "zod";

import {
  EVENT_TYPE_CODES,
  TIMING_EVENT_TYPES,
  type EVENT_METADATA_SCHEMAS,
  type EventTypeCode,
  type TelemetryEvent,
  type TimingEventTypeCode,
} from "@/features/telemetry/contracts";

/** Event types callers may emit directly. Interval events go through the time accountant only. */
export type PublicEventTypeCode = Exclude<EventTypeCode, TimingEventTypeCode>;

export function isTimingEventType(code: string): code is TimingEventTypeCode {
  return (TIMING_EVENT_TYPES as readonly string[]).includes(code);
}
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

export type EventMetadata<T extends EventTypeCode> = z.input<(typeof EVENT_METADATA_SCHEMAS)[T]>;

/** Where the event happened / what it is about. Participant, study and condition are never sent. */
export interface EventContext {
  conceptId?: string;
  category?: KnowledgeCategoryCode;
  traditionId?: string;
  /** Room id (3D) or page/route id (2D). */
  roomOrPageId?: string;
  /** Interaction target: element id, link id, button id. */
  target?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` is the "no required keys" test
type HasRequiredMetadata<T extends EventTypeCode> = {} extends EventMetadata<T> ? false : true;

export type TrackFields<T extends EventTypeCode> = EventContext &
  (HasRequiredMetadata<T> extends true ? { metadata: EventMetadata<T> } : { metadata?: EventMetadata<T> });

export type TrackArgs<T extends EventTypeCode> = HasRequiredMetadata<T> extends true
  ? [fields: TrackFields<T>]
  : [fields?: TrackFields<T>];

/**
 * Enqueue one event. Resolves to the stored event, or null when it failed client-side
 * validation (counted in `stats.invalid` and reported through `onDrop`, never silently lost).
 */
export type TrackFn = <T extends PublicEventTypeCode>(type: T, ...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;

/** Unrestricted variant used internally by the tracker and the time accountant. */
export type RawTrackFn = <T extends EventTypeCode>(type: T, ...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;

type CamelCase<S extends string> = S extends `${infer H}_${infer R}` ? `${H}${Capitalize<CamelCase<R>>}` : S;

export type EventHelperName<T extends EventTypeCode> = CamelCase<T>;

export type EventHelpers = {
  [T in PublicEventTypeCode as CamelCase<T>]: (...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;
};

export function helperName(code: string): string {
  return code.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function createEventHelpers(track: TrackFn): EventHelpers {
  const out: Record<string, (...args: unknown[]) => Promise<TelemetryEvent | null>> = {};
  for (const code of EVENT_TYPE_CODES) {
    if (isTimingEventType(code)) continue;
    out[helperName(code)] = (...args: unknown[]) => (track as (t: string, ...a: unknown[]) => Promise<TelemetryEvent | null>)(code, ...args);
  }
  return out as unknown as EventHelpers;
}

import type { z } from "zod";

import {
  EVENT_TYPE_CODES,
  TIMING_EVENT_TYPES,
  type EVENT_METADATA_SCHEMAS,
  type EventTypeCode,
  type TelemetryEvent,
  type TimingEventTypeCode,
} from "@/features/telemetry/contracts";

type PublicEventTypeCode = Exclude<EventTypeCode, TimingEventTypeCode>;

export function isTimingEventType(code: string): code is TimingEventTypeCode {
  return (TIMING_EVENT_TYPES as readonly string[]).includes(code);
}
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

type EventMetadata<T extends EventTypeCode> = z.input<(typeof EVENT_METADATA_SCHEMAS)[T]>;

interface EventContext {
  conceptId?: string;
  category?: KnowledgeCategoryCode;
  traditionId?: string;
  roomOrPageId?: string;
  target?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` is the "no required keys" test
type HasRequiredMetadata<T extends EventTypeCode> = {} extends EventMetadata<T> ? false : true;

export type TrackFields<T extends EventTypeCode> = EventContext &
  (HasRequiredMetadata<T> extends true ? { metadata: EventMetadata<T> } : { metadata?: EventMetadata<T> });

type TrackArgs<T extends EventTypeCode> = HasRequiredMetadata<T> extends true
  ? [fields: TrackFields<T>]
  : [fields?: TrackFields<T>];

export type TrackFn = <T extends PublicEventTypeCode>(type: T, ...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;

export type RawTrackFn = <T extends EventTypeCode>(type: T, ...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;

type CamelCase<S extends string> = S extends `${infer H}_${infer R}` ? `${H}${Capitalize<CamelCase<R>>}` : S;

export type EventHelpers = {
  [T in PublicEventTypeCode as CamelCase<T>]: (...args: TrackArgs<T>) => Promise<TelemetryEvent | null>;
};

function helperName(code: string): string {
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

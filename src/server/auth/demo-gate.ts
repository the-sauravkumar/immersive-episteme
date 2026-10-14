/**
 * Request-scope public-demo gate (see ./demo-policy.ts). Deduped per request.
 */
import "server-only";

import { cache } from "react";

import { serverEnv } from "@/lib/env";
import { getDb } from "@/server/db/client";

import { publicDemoGate } from "./demo-policy";

export const isPublicDemoEnabled = cache(async (): Promise<boolean> => publicDemoGate(getDb, serverEnv().PUBLIC_DEMO)());

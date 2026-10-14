/**
 * Better Auth HTTP endpoints (/api/auth/*): sign-in, sign-out, get-session, ...
 * All staff sign-in traffic must come through here so rate limiting and origin checks apply.
 */
import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));

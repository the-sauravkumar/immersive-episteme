"use client";
/**
 * Browser-side Better Auth client. Sign-in/out requests go to /api/auth/* so Better Auth's rate
 * limiting and origin (CSRF) checks apply. Never use this for authorisation decisions.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth" });

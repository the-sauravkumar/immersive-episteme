/**
 * Staff authentication tables (Better Auth 1.7, Drizzle adapter) + staff role assignments.
 *
 * Core tables follow the shape emitted by Better Auth's own Drizzle generator
 * (@better-auth/drizzle-adapter generateDrizzleSchema, provider "pg", rateLimit storage
 * "database") with two project deviations:
 *  - timestamptz everywhere (project convention);
 *  - `users.disabled_at` (Better Auth additional field, `input: false`) lets an administrator
 *    lock an account without deleting it; a session-create hook refuses disabled users.
 * Ids stay Better Auth's default random `text` ids, which is what db/schema/_common.ts
 * (`actorId()`) expects for actor columns elsewhere.
 *
 * Better Auth model -> export: user -> users, session -> authSessions,
 * account -> authAccounts, verification -> authVerifications, rateLimit -> authRateLimits.
 * src/server/auth/config.ts passes that mapping to the adapter.
 *
 * Participants are NOT users: they never get a row here (see
 * src/server/auth/participant-session.ts). Roles are many-to-many via `user_roles`.
 */
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { STAFF_ROLES } from "../../src/lib/permissions/roles";

const tsz = () => timestamp({ withTimezone: true });

export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: tsz().notNull().defaultNow(),
  updatedAt: tsz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  /** Set to lock the account. Locked users cannot create sessions. */
  disabledAt: tsz(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text().primaryKey(),
    expiresAt: tsz().notNull(),
    token: text().notNull().unique(),
    createdAt: tsz().notNull().defaultNow(),
    updatedAt: tsz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_sessions_user_id_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: tsz(),
    refreshTokenExpiresAt: tsz(),
    scope: text(),
    /** scrypt hash written by Better Auth for the "credential" provider. */
    password: text(),
    createdAt: tsz().notNull().defaultNow(),
    updatedAt: tsz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("auth_accounts_user_id_idx").on(t.userId)],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: tsz().notNull(),
    createdAt: tsz().notNull().defaultNow(),
    updatedAt: tsz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

/** Better Auth rate-limit counters (`rateLimit.storage = "database"`). */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/**
 * Per-account sign-in throttle (src/server/auth/account-throttle.ts). Keyed by sha256 of the
 * normalised email, so it works whether or not the account exists and stores no address.
 * Independent of the client IP, so rotating (or spoofing) IPs cannot reset it. A successful
 * sign-in deletes the row.
 */
export const authSignInThrottle = pgTable("auth_sign_in_throttle", {
  emailSha256: text().primaryKey(),
  attempts: integer().notNull(),
  windowStartedAt: tsz().notNull(),
  lockedUntil: tsz(),
});

/** Staff roles. Values come from src/lib/permissions/roles.ts (participant/public excluded). */
export const staffRoleEnum = pgEnum("staff_role", STAFF_ROLES);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: staffRoleEnum().notNull(),
    /** Who granted it (null for the CLI bootstrap). Survives the granter's deletion. */
    grantedBy: text().references(() => users.id, { onDelete: "set null" }),
    grantedAt: tsz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), index("user_roles_role_idx").on(t.role)],
);

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles, { relationName: "user_roles_user" }),
  sessions: many(authSessions),
  accounts: many(authAccounts),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id], relationName: "user_roles_user" }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type UserRoleRow = typeof userRoles.$inferSelect;

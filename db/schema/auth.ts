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

export const authRateLimits = pgTable("auth_rate_limits", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

export const authSignInThrottle = pgTable("auth_sign_in_throttle", {
  emailSha256: text().primaryKey(),
  attempts: integer().notNull(),
  windowStartedAt: tsz().notNull(),
  lockedUntil: tsz(),
});

export const staffRoleEnum = pgEnum("staff_role", STAFF_ROLES);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: staffRoleEnum().notNull(),
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

import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Separate identities preserve existing users and every book foreign key. */
export const appAuthIdentitiesTable = pgTable("app_auth_identities", {
  subject: text("subject").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
});
export const appAuthSessionsTable = pgTable("app_auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("app_auth_sessions_expiry_idx").on(table.expiresAt)]);
export const appAuthHandoffsTable = pgTable("app_auth_handoffs", {
  codeHash: text("code_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("app_auth_handoffs_expiry_idx").on(table.expiresAt)]);

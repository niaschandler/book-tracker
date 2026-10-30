import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { booksTable } from "./books";
import { usersTable } from "./users";

export const readingStatusEnum = pgEnum("reading_status", ["want_to_read", "reading", "read"]);
export const readingLogTable = pgTable("reading_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "restrict" }),
  status: readingStatusEnum("status").notNull().default("want_to_read"),
  isOwned: boolean("is_owned").notNull().default(false),
  rating: integer("rating"),
  startedOn: date("started_on", { mode: "string" }),
  finishedOn: date("finished_on", { mode: "string" }),
  notes: text("notes"),
  moodTags: text("mood_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("reading_log_user_book_unique").on(table.userId, table.bookId),
  index("reading_log_user_status_idx").on(table.userId, table.status),
  index("reading_log_book_idx").on(table.bookId),
  check("reading_log_rating_range", sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`),
  check("reading_log_dates_order", sql`${table.startedOn} IS NULL OR ${table.finishedOn} IS NULL OR ${table.finishedOn} >= ${table.startedOn}`),
]);
export const insertReadingLogSchema = createInsertSchema(readingLogTable).omit({ id: true, createdAt: true, updatedAt: true });
export type ReadingLog = typeof readingLogTable.$inferSelect;
export type BookStatus = typeof readingStatusEnum.enumValues[number];

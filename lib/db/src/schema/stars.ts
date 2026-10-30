import { foreignKey, integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { booksTable } from "./books";
import { usersTable } from "./users";
import { readingLogTable } from "./reading-log";

export const starsTable = pgTable("stars", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bookId] }),
  foreignKey({
    name: "stars_reading_log_fk",
    columns: [table.userId, table.bookId],
    foreignColumns: [readingLogTable.userId, readingLogTable.bookId],
  }).onDelete("cascade").onUpdate("cascade"),
]);
export const insertStarSchema = createInsertSchema(starsTable).omit({ createdAt: true });
export type InsertStar = typeof starsTable.$inferInsert;
export type Star = typeof starsTable.$inferSelect;

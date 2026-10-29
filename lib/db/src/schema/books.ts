import { createInsertSchema } from "drizzle-zod";
import {
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const bookStatusEnum = pgEnum("book_status", [
  "want_to_read",
  "owned",
  "read",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const booksTable = pgTable(
  "books",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    author: text("author").notNull(),
    genre: text("genre"),
    pages: integer("pages"),
    rating: integer("rating"),
    status: bookStatusEnum("status").notNull().default("want_to_read"),
    moodTags: text("mood_tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    coverUrl: text("cover_url"),
    openLibraryId: text("open_library_id"),
    publishedYear: integer("published_year"),
    notes: text("notes"),
    startedOn: date("started_on", { mode: "string" }),
    finishedOn: date("finished_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("books_pages_positive", sql`${table.pages} IS NULL OR ${table.pages} > 0`),
    check(
      "books_rating_range",
      sql`${table.rating} IS NULL OR (${table.rating} >= 1 AND ${table.rating} <= 5)`,
    ),
  ],
);

export const starsTable = pgTable(
  "stars",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookId] })],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export const insertBookSchema = createInsertSchema(booksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertStarSchema = createInsertSchema(starsTable).omit({
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
export type InsertStar = z.infer<typeof insertStarSchema>;
export type Star = typeof starsTable.$inferSelect;
export type BookStatus = (typeof bookStatusEnum.enumValues)[number];

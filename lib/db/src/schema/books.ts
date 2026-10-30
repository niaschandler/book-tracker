import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { genresTable } from "./genres";

/** Bibliographic metadata, not a user's private reading record. */
export const booksTable = pgTable("books", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  genreId: integer("genre_id").references(() => genresTable.id, { onDelete: "set null" }),
  pages: integer("pages"),
  publishedYear: integer("published_year"),
  isbn: text("isbn"),
  description: text("description"),
  coverUrl: text("cover_url"),
  openLibraryId: text("open_library_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("books_genre_idx").on(table.genreId),
  check("books_pages_positive", sql`${table.pages} IS NULL OR ${table.pages} > 0`),
  check("books_title_nonblank", sql`length(trim(${table.title})) > 0`),
  check("books_year_range", sql`${table.publishedYear} IS NULL OR ${table.publishedYear} BETWEEN 0 AND 3000`),
]);

export const insertBookSchema = createInsertSchema(booksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBook = typeof booksTable.$inferInsert;
export type Book = typeof booksTable.$inferSelect;

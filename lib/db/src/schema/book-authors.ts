import { index, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { authorsTable } from "./authors";
import { booksTable } from "./books";

export const bookAuthorsTable = pgTable("book_authors", {
  bookId: integer("book_id").notNull().references(() => booksTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => authorsTable.id, { onDelete: "restrict" }),
  position: integer("position").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.bookId, table.authorId] }),
  index("book_authors_author_idx").on(table.authorId),
]);
export const insertBookAuthorSchema = createInsertSchema(bookAuthorsTable);
export type BookAuthor = typeof bookAuthorsTable.$inferSelect;

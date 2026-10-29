import { sql } from "drizzle-orm";
import { check, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const authorsTable = pgTable("authors", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull().unique(),
}, (table) => [check("authors_name_nonblank", sql`length(trim(${table.displayName})) > 0`)]);
export const insertAuthorSchema = createInsertSchema(authorsTable).omit({ id: true });
export type Author = typeof authorsTable.$inferSelect;

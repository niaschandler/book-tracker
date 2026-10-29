import { sql } from "drizzle-orm";
import { check, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const genresTable = pgTable("genres", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
}, (table) => [check("genres_name_nonblank", sql`length(trim(${table.name})) > 0`)]);
export const insertGenreSchema = createInsertSchema(genresTable).omit({ id: true });
export type Genre = typeof genresTable.$inferSelect;

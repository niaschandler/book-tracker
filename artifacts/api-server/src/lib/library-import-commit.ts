import { and, eq } from "drizzle-orm";
import { db, readingLogTable, starsTable, usersTable } from "@workspace/db";
import type { LibraryImportConfirmation } from "@workspace/api-zod";
import { insertLibraryBook, listLibraryBooks } from "./library";
import { previewImport } from "./library-import";

export class StaleImportPreview extends Error {
  constructor() { super("Your library changed. Review a fresh preview before confirming."); }
}

export async function confirmImport(owner: string, data: LibraryImportConfirmation) {
  return db.transaction(async tx => {
    await tx.insert(usersTable).values({ clerkUserId: owner }).onConflictDoNothing();
    // Serialize imports for one reader, including two confirmations of one file.
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.clerkUserId, owner)).for("update");
    const { prepared, preview } = previewImport(data.rows, await listLibraryBooks(user.id, tx), owner);
    if (data.previewToken !== preview.previewToken) throw new StaleImportPreview();
    for (const entry of prepared) {
      const id = await insertLibraryBook(tx, user.id, entry.input, entry.timestamps);
      if (entry.starred) {
        const [log] = await tx.select().from(readingLogTable).where(and(eq(readingLogTable.id, id), eq(readingLogTable.userId, user.id)));
        await tx.insert(starsTable).values({ userId: user.id, bookId: log.bookId });
      }
    }
    return { imported: prepared.length, skipped: preview.invalid + preview.duplicates };
  });
}

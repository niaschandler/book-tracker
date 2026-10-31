/**
 * Owner-controlled identity linking, never automatic matching by email.
 * Run without --apply first; requires direct administrative database access.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool, usersTable, readingLogTable, starsTable, appAuthIdentitiesTable,
  appAuthSessionsTable, appAuthHandoffsTable } from "@workspace/db";

const args = process.argv.slice(2);
const value = (flag: string) => Number(args[args.indexOf(flag) + 1]);
const sourceId = value("--from-user-id"), targetId = value("--to-user-id");
if (!args.includes("--from-user-id") || !args.includes("--to-user-id") ||
  !Number.isSafeInteger(sourceId) || !Number.isSafeInteger(targetId) || sourceId < 1 || targetId < 1 || sourceId === targetId) {
  throw new Error("Usage: link-replit-account.ts --from-user-id NEW_REPLIT_READER_ID --to-user-id OLD_LIBRARY_OWNER_ID [--apply]");
}
try {
  await db.transaction(async tx => {
    const users = await tx.select().from(usersTable).where(inArray(usersTable.id, [sourceId, targetId]))
      .orderBy(usersTable.id).for("update");
    if (users.length !== 2) throw new Error("Both reader rows must exist.");
    const [sourceIdentity] = await tx.select().from(appAuthIdentitiesTable)
      .where(eq(appAuthIdentitiesTable.userId, sourceId)).for("update");
    const [targetIdentity] = await tx.select().from(appAuthIdentitiesTable)
      .where(eq(appAuthIdentitiesTable.userId, targetId)).for("update");
    if (!sourceIdentity || targetIdentity) throw new Error("Source must have a Replit identity; target must not already have one.");
    const [counts] = await tx.select({ count: sql<number>`count(*)::int` }).from(readingLogTable)
      .where(eq(readingLogTable.userId, sourceId));
    const [star] = await tx.select().from(starsTable).where(eq(starsTable.userId, sourceId)).limit(1);
    if (counts.count || star) throw new Error("Source already has books or stars. Refusing to merge two libraries automatically.");
    if (!args.includes("--apply")) {
      console.log("Dry run passed. No records changed. Verify both reader IDs and account ownership before adding --apply.");
      return;
    }
    await tx.update(appAuthIdentitiesTable).set({ userId: targetId })
      .where(and(eq(appAuthIdentitiesTable.subject, sourceIdentity.subject), eq(appAuthIdentitiesTable.userId, sourceId)));
    await tx.delete(appAuthSessionsTable).where(inArray(appAuthSessionsTable.userId, [sourceId, targetId]));
    await tx.delete(appAuthHandoffsTable).where(inArray(appAuthHandoffsTable.userId, [sourceId, targetId]));
    console.log("Identity linked. Both user rows and all books remain intact. Sign in again to access the original library.");
  });
} finally { await pool.end(); }

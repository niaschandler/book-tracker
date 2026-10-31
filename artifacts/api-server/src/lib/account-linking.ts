import { and, eq, inArray, sql } from "drizzle-orm";
import { db, usersTable, readingLogTable, starsTable, appAuthIdentitiesTable,
  appAuthSessionsTable, appAuthHandoffsTable } from "@workspace/db";

/** Administrative operation, only after independently verifying BOTH owners. */
export async function linkGithubReader(sourceId: number, targetId: number, apply = false) {
  if (!Number.isSafeInteger(sourceId) || !Number.isSafeInteger(targetId) ||
      sourceId < 1 || targetId < 1 || sourceId === targetId) throw new Error("Two distinct positive reader IDs are required.");
  return db.transaction(async tx => {
    const users = await tx.select().from(usersTable).where(inArray(usersTable.id, [sourceId, targetId]))
      .orderBy(usersTable.id).for("update");
    if (users.length !== 2) throw new Error("Both reader rows must exist.");
    const [sourceIdentity] = await tx.select().from(appAuthIdentitiesTable)
      .where(eq(appAuthIdentitiesTable.userId, sourceId)).for("update");
    const [targetIdentity] = await tx.select().from(appAuthIdentitiesTable)
      .where(eq(appAuthIdentitiesTable.userId, targetId)).for("update");
    if (!sourceIdentity || !/^github:\d+$/.test(sourceIdentity.subject)) {
      throw new Error("Source must have a verified GitHub sign-in identity.");
    }
    if (targetIdentity?.subject.startsWith("github:")) {
      throw new Error("Target already has a GitHub identity; refusing to merge GitHub accounts.");
    }
    const [counts] = await tx.select({ count: sql<number>`count(*)::int` }).from(readingLogTable)
      .where(eq(readingLogTable.userId, sourceId));
    const [star] = await tx.select().from(starsTable).where(eq(starsTable.userId, sourceId)).limit(1);
    if (counts.count || star) throw new Error("Source already has books or stars. Refusing to merge two libraries automatically.");
    if (!apply) return { applied: false, replacesLegacyIdentity: Boolean(targetIdentity) };
    // One identity per reader: verified GitHub replaces the old Replit identity.
    // Never alter the target reader's ID, reading records, or stars.
    if (targetIdentity) await tx.delete(appAuthIdentitiesTable).where(eq(appAuthIdentitiesTable.subject, targetIdentity.subject));
    await tx.update(appAuthIdentitiesTable).set({ userId: targetId })
      .where(and(eq(appAuthIdentitiesTable.subject, sourceIdentity.subject), eq(appAuthIdentitiesTable.userId, sourceId)));
    await tx.delete(appAuthSessionsTable).where(inArray(appAuthSessionsTable.userId, [sourceId, targetId]));
    await tx.delete(appAuthHandoffsTable).where(inArray(appAuthHandoffsTable.userId, [sourceId, targetId]));
    return { applied: true, replacesLegacyIdentity: Boolean(targetIdentity) };
  });
}

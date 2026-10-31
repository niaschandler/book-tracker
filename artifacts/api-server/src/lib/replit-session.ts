import { and, eq, gt, lt } from "drizzle-orm";
import { db, usersTable, appAuthIdentitiesTable, appAuthSessionsTable, appAuthHandoffsTable } from "@workspace/db";
import { opaqueCode, sessionHash } from "./auth-policy";
import type { GithubReader } from "./github-oauth";

export async function upsertGithubReader(reader: GithubReader) {
  if (!Number.isSafeInteger(reader.id) || reader.id < 1) throw new Error("Verified GitHub identity is missing its numeric ID.");
  // Prefix prevents collisions with the existing Replit subject namespace.
  const subject = `github:${reader.id}`;
  const profile = {
    username: reader.username,
    email: reader.email,
  };
  return db.transaction(async tx => {
    const [identity] = await tx.select().from(appAuthIdentitiesTable).where(eq(appAuthIdentitiesTable.subject, subject));
    if (identity) {
      const [user] = await tx.update(usersTable).set(profile).where(eq(usersTable.id, identity.userId)).returning();
      if (!user) throw new Error("Linked reader no longer exists.");
      return user;
    }
    // The old column is an internal unique key only; no Clerk calls or credentials are used.
    const [user] = await tx.insert(usersTable).values({ clerkUserId: subject, ...profile })
      .onConflictDoUpdate({ target: usersTable.clerkUserId, set: profile }).returning();
    await tx.insert(appAuthIdentitiesTable).values({ subject, userId: user.id }).onConflictDoNothing();
    return user;
  });
}

export async function createHandoff(userId: number, challenge: string) {
  const code = opaqueCode();
  await db.insert(appAuthHandoffsTable).values({
    codeHash: sessionHash(code), userId, challenge, expiresAt: new Date(Date.now() + 120_000),
  });
  return code;
}

export async function exchangeHandoff(code: string, challenge: string) {
  return db.transaction(async tx => {
    const [handoff] = await tx.delete(appAuthHandoffsTable).where(and(
      eq(appAuthHandoffsTable.codeHash, sessionHash(code)), eq(appAuthHandoffsTable.challenge, challenge),
      gt(appAuthHandoffsTable.expiresAt, new Date()),
    )).returning();
    if (!handoff) return null;
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, handoff.userId));
    if (!user) throw new Error("Reader no longer exists.");
    const token = `bt_${opaqueCode()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await tx.insert(appAuthSessionsTable).values({ tokenHash: sessionHash(token), userId: user.id, expiresAt });
    return { token, user: readerProfile(user), expiresAt: expiresAt.toISOString() };
  });
}

export function readerProfile(user: { id: number; username: string | null; email: string | null }) {
  return { id: String(user.id), username: user.username, email: user.email };
}

export async function findReader(token: string) {
  if (!/^bt_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db.select({ user: usersTable }).from(appAuthSessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, appAuthSessionsTable.userId))
    .where(and(eq(appAuthSessionsTable.tokenHash, sessionHash(token)), gt(appAuthSessionsTable.expiresAt, new Date())));
  return row?.user ?? null;
}
export async function revokeSession(token: string) {
  await db.delete(appAuthSessionsTable).where(eq(appAuthSessionsTable.tokenHash, sessionHash(token)));
}
export async function cleanExpiredSessions() {
  await db.delete(appAuthSessionsTable).where(lt(appAuthSessionsTable.expiresAt, new Date()));
  await db.delete(appAuthHandoffsTable).where(lt(appAuthHandoffsTable.expiresAt, new Date()));
}

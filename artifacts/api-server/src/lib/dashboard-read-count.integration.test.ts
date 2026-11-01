import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { authorsTable, booksTable, db, pool, usersTable } from "@workspace/db";
import app from "../app";
import { createHandoff, exchangeHandoff } from "./replit-session";
import { loginChallenge, opaqueCode } from "./auth-policy";

after(async () => { await pool.end(); });

test("dashboard read count includes only books marked read", async () => {
  const suffix = randomUUID();
  const prefix = `Dashboard count ${suffix}`;
  const titles = [`${prefix} Finished`, `${prefix} In Progress`, `${prefix} Want to Read`];
  const author = `${prefix} Author`;
  const [user] = await db.insert(usersTable).values({
    clerkUserId: `dashboard-read-count:${suffix}`,
    username: `dashboard-reader-${suffix}`,
  }).returning();
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const root = `http://127.0.0.1:${address.port}`;
    const verifier = opaqueCode();
    const handoff = await createHandoff(user.id, loginChallenge(verifier));
    const session = await exchangeHandoff(handoff, loginChallenge(verifier));
    assert.ok(session, "test reader should receive an authenticated session");

    const entries = [
      { title: titles[0], status: "read", pages: 320 },
      { title: titles[1], status: "reading", pages: 180 },
      { title: titles[2], status: "want_to_read", pages: 250 },
    ];
    for (const entry of entries) {
      const response = await fetch(`${root}/api/books`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ ...entry, author }),
      });
      assert.equal(response.status, 201, `book entry should be created: ${entry.title}`);
    }

    const dashboardResponse = await fetch(`${root}/api/dashboard/summary`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(dashboardResponse.status, 200);
    const summary = await dashboardResponse.json() as { totalBooks: number; readCount: number };
    assert.equal(summary.totalBooks, 3, "dashboard total includes every library entry");
    assert.equal(summary.readCount, 1, "dashboard read count includes only entries marked read");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
    await db.delete(booksTable).where(inArray(booksTable.title, titles));
    await db.delete(authorsTable).where(eq(authorsTable.displayName, author));
  }
});

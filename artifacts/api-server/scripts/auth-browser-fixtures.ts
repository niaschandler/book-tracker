/** Development-only synthetic readers for one browser verification pass. */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, pool, usersTable, booksTable, appAuthHandoffsTable } from "@workspace/db";
import { opaqueCode, loginChallenge, sessionHash } from "../src/lib/auth-policy";
import { createHandoff } from "../src/lib/replit-session";
import { normalizeBookInput } from "../src/lib/book-validation";
import { createLibraryBook } from "../src/lib/library";

const path = resolve(import.meta.dirname, "../../../generated-artifacts/auth-browser-fixtures.json");
type Fixture = { users: number[]; catalogIds: number[]; bookIds: number[]; titles: string[];
  login?: { code: string; verifier: string }; };
if (process.env.REPLIT_DEPLOYMENT === "1") throw new Error("Browser fixtures must not run in production.");
try {
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(await readFile(path, "utf8")) as Fixture;
    await db.delete(usersTable).where(inArray(usersTable.id, fixture.users));
    await db.delete(booksTable).where(inArray(booksTable.id, fixture.catalogIds));
    await unlink(path);
    console.log("Synthetic browser readers removed.");
  } else if (process.argv.includes("--login")) {
    const index = Number(process.argv[process.argv.indexOf("--login") + 1]);
    if (![0, 1].includes(index)) throw new Error("--login expects 0 or 1.");
    const fixture = JSON.parse(await readFile(path, "utf8")) as Fixture;
    const verifier = opaqueCode();
    const code = await createHandoff(fixture.users[index], loginChallenge(verifier));
    fixture.login = { code, verifier };
    await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    console.log("Fresh one-time browser handoff saved; expires in two minutes.");
  } else {
    const suffix = opaqueCode().slice(0, 8);
    const users = await db.insert(usersTable).values([
      { clerkUserId: `browser-auth-a:${suffix}`, username: "Pages reader A" },
      { clerkUserId: `browser-auth-b:${suffix}`, username: "Pages reader B" },
    ]).returning();
    const titles = [`Private Pages A ${suffix}`, `Private Pages B ${suffix}`];
    const books = [];
    for (let i = 0; i < 2; i++) books.push(await createLibraryBook(users[i].id,
      normalizeBookInput({ title: titles[i], author: "Browser test author", status: "want_to_read" })));
    const fixture: Fixture = { users: users.map(user => user.id), titles, catalogIds: books.map(book => book.catalogBookId), bookIds: books.map(book => book.id) };
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    console.log("Synthetic browser fixtures saved under generated-artifacts.");
  }
} finally { await pool.end(); }

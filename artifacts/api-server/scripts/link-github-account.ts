/**
 * Owner-controlled identity linking, never automatic matching by email.
 * Run without --apply first; requires direct administrative database access.
 */
import { pool } from "@workspace/db";
import { linkGithubReader } from "../src/lib/account-linking";

const args = process.argv.slice(2);
const value = (flag: string) => Number(args[args.indexOf(flag) + 1]);
try {
  if (!args.includes("--from-user-id") || !args.includes("--to-user-id")) {
    throw new Error("Usage: link-github-account.ts --from-user-id NEW_GITHUB_READER_ID --to-user-id OLD_LIBRARY_OWNER_ID [--apply]");
  }
  const result = await linkGithubReader(value("--from-user-id"), value("--to-user-id"), args.includes("--apply"));
  if (result.applied) console.log("GitHub identity linked. Both reader rows and all books remain intact. Sign in again.");
  else console.log("Dry run passed. No changes made. Verify both account owners before adding --apply." +
    (result.replacesLegacyIdentity ? " Applying will replace the old Replit identity with the verified GitHub identity." : ""));
} finally { await pool.end(); }

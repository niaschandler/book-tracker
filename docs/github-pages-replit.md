# Publish using only GitHub and Replit

The website runs on **GitHub Pages**. The API, PostgreSQL database, sessions,
and **Sign in with Replit** run on Replit. No Auth0, external Clerk tenant,
email/password service, or additional database provider is required.

Visitors use or create a Replit account. Marginalia does not store passwords.

## 1. Prepare the Replit backend

Keep the existing PostgreSQL database. The added `app_auth_*` tables hold
identities, hashed sessions, and short-lived login handoffs; the existing
`users`, books, reading records, and stars are not replaced.

Development schema changes are applied to the development database. Replit
Publish manages production schema changes; review its database diff before
publishing. Do not run startup-time SQL migrations against production.

In Replit's **production environment settings**, set:

| Setting | Value |
| --- | --- |
| `AUTH_PUBLIC_ORIGIN` | The actual published Replit origin, such as `https://YOUR-PUBLISHED-HOST`, without `/api` |
| `FRONTEND_URLS` | Your complete GitHub Pages base URL, ending in `/` |

For a repository site the frontend base is normally
`https://YOUR-GITHUB-USERNAME.github.io/book-tracker/`.
Copy the actual address from GitHub's Pages settings rather than guessing if
you have renamed the repository or use a different publishing configuration.
To allow the Replit preview too, append its complete frontend base URL,
separated by a comma. Origins are validated: arbitrary external sites cannot
call the API or receive login handoffs.

`REPL_ID` and `DATABASE_URL` are supplied in the Replit environment. The API
does not need Clerk keys, Auth0 credentials, or a third-party login client ID.
Never add database URLs, session tokens, or secret keys to GitHub variables,
repository files, or browser builds.

Publish the Replit app using its existing managed publishing setup. Its web
preview may still be available on Replit; GitHub Pages will be the public
frontend you share. Do not use the temporary `.replit.dev` preview address as
the production API origin.

The backend deployment must be **publicly reachable** so a browser on GitHub
Pages can call it. Private book routes still require the app's reader session.
Do not put a Replit deployment-protection bypass token into the frontend.

## 2. Configure GitHub

1. Merge the reviewed deployment branch into `main`.
   If `.github/workflows/github-pages.yml` is not present, create it in GitHub's
   **Add file → Create new file** editor and paste the contents of
   [`docs/github-pages-workflow.yml`](github-pages-workflow.yml). The connected
   GitHub app can upload source code but rejects workflow-file writes, so the
   workflow template is included under `docs/` for this manual installation.
2. Open **Settings → Pages → Build and deployment** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add the
   public repository variable **`REPLIT_API_ORIGIN`**. Its value must match
   `AUTH_PUBLIC_ORIGIN`. This is a public URL, not a secret.
4. Open **Actions → Publish book tracker to GitHub Pages → Run workflow**.
5. Open the URL shown by the successful deployment.

The workflow publishes **only** the built frontend. It does not upload the API,
database, backend environment variables, or secrets. It is manual by design;
merging a branch alone does not publish a site.

GitHub builds use hash routes (`/#/dashboard`, `/#/books/123`) so refreshing or
sharing a deep link does not require a server-side Pages rewrite.

## 3. Existing account migration

Old login accounts cannot automatically become Replit accounts. All old user
rows and books remain in the database, but a new Replit sign-in initially has
its own empty library. **Do not recreate or delete the old books.**

The owner must independently verify the reader's old and new account
ownership, identify the two internal `users.id` values, and use:

```sh
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/scripts/link-replit-account.ts \
  --from-user-id NEW_REPLIT_READER_ID --to-user-id OLD_LIBRARY_OWNER_ID
```

This is a dry run. After checking ownership and both IDs, repeat with `--apply`.
The command refuses to merge nonempty libraries or overwrite an existing
Replit identity. It preserves both user rows and all book foreign keys, moves
only the verified Replit identity, and revokes old sessions. Sign in again
after linking. Use only a database administration environment explicitly
authorized for the target database; do not copy secrets into shell history.

Do not link accounts merely because email addresses match.

## How login works

The browser goes to Replit through the backend. The backend verifies the
OIDC signature, state, nonce, and PKCE proof. It returns a **single-use,
two-minute code**, not a session token, to the allowed frontend. The browser
must exchange that code with a separate proof saved before login. Session
tokens are opaque, stored in the current tab's session storage, sent only as
Bearer headers, and stored hashed in PostgreSQL. Sessions expire after seven
days and logout revokes the current token.

API calls do not depend on third-party cookies. The login redirect uses
HttpOnly, Secure, SameSite=Lax cookies only while the API is the top-level
site. Closing the tab clears its browser-stored session. Replit-wide logout
and signing out of this app are separate actions.

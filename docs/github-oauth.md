# Sign in with GitHub

GitHub OAuth replaces Sign in with Replit. The frontend is still hosted on
GitHub Pages, and the API, database, and app sessions remain on Replit.

## Register an OAuth app

Open <https://github.com/settings/applications/new> while signed into your
GitHub account. Create an **OAuth app**, not a personal access token:

| Setting | Value |
| --- | --- |
| Application name | Reading Room |
| Homepage URL | `https://niaschandler.github.io/book-tracker/` |
| Authorization callback URL | `https://book-tracker-niaschandler.replit.app/api/callback` |

Keep wildcard callback matching disabled. The callback goes to the API,
**not** to GitHub Pages. GitHub Pages cannot securely exchange the client secret.

After registering, copy the Client ID and generate a Client Secret. Save
`GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in Replit's secure
configuration flow. Verify both are available to the **production** app before
republishing. Never paste the secret into chat, GitHub repository variables,
source files, or any `VITE_*` setting.

The existing GitHub connector manages the repository; it is not a substitute
for this visitor-login OAuth app. Do not reuse connector tokens.

For preview login, register the exact preview API `/api/callback` URL too, if
your OAuth app supports multiple callback entries, or use a separate preview
OAuth app with development-specific credentials. Production credentials must
continue to use the production callback above. Do not weaken callback matching.

## Existing hosting settings stay the same

Replit production:

```text
AUTH_PUBLIC_ORIGIN=https://book-tracker-niaschandler.replit.app
FRONTEND_URLS=https://niaschandler.github.io/book-tracker/
```

GitHub Actions repository **variable**, not secret:

```text
REPLIT_API_ORIGIN=https://book-tracker-niaschandler.replit.app
```

No OAuth client secret is used in the frontend build. Save production settings,
publish the updated backend, then publish the frontend using the existing
GitHub Pages workflow after the reviewed changes are merged.

Missing OAuth credentials produce a friendly setup message; the app does not
fall back to Replit login or crash its health endpoint.

## Account ownership and existing libraries

All existing users, books, reading records, and stars remain intact. First
GitHub sign-in creates a new user row and an identity keyed by
`github:<GitHub numeric ID>`. Repeated sign-ins use that row even if the GitHub
username changes. A GitHub subject cannot collide with an old Replit subject.
Email is profile information only; matching email addresses never links users.

Previously issued app sessions continue until logout or expiry. New logins
use GitHub only. To reconnect a verified reader's original library:

1. Independently verify ownership of both old and GitHub accounts.
2. Keep the new GitHub library empty. Identify both internal reader IDs.
3. Run the owner-only command in a database administration environment
   explicitly authorized for the target database:

```sh
pnpm --filter @workspace/scripts exec tsx \
  ../artifacts/api-server/scripts/link-github-account.ts \
  --from-user-id NEW_GITHUB_READER_ID --to-user-id OLD_LIBRARY_OWNER_ID
```

This is a dry run. Check its output and both IDs, then repeat with `--apply`.
Applying replaces an existing Replit identity if present, preserves both user
rows and all original book/star foreign keys, and revokes both readers'
sessions and pending handoffs. The reader must sign in with GitHub again.
It refuses nonempty source libraries and targets already linked to GitHub.
Do not automatically merge two nonempty libraries.

## Security

The backend validates random OAuth state and uses PKCE S256. It exchanges the
GitHub authorization code server-side, fetches `/user` to verify the GitHub
identity for every sign-in, and reads only a verified primary email. The sole
requested scope is `user:email`; it does not request repository access.
GitHub access/refresh tokens are never saved or sent to the frontend.

The allowed frontend receives a single-use two-minute handoff code, not a
GitHub token or app session. A separate browser proof is required to exchange
it. App session tokens remain hashed in PostgreSQL and live in the current
tab's session storage; logout revokes the token. API calls work without
third-party cookies.

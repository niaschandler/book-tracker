# Book Tracker

A personal reading library for tracking books read, owned, and wanted, with private accounts, reading insights, a virtual bookshelf, a filtered random picker, Open Library lookup, and CSV export.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/book-tracker run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required environment: `DATABASE_URL` plus the Replit-managed Clerk variables

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/book-tracker` — React/Vite reading library UI
- `artifacts/api-server/src/routes/books.ts` — authenticated book, dashboard, catalog, and export endpoints
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/` — normalized users, books, authors, genres, reading log, and stars
- `docs/database.md` — relationships, constraints, and development migration notes
- `artifacts/book-tracker/src/index.css` — app theme and typography

## Architecture decisions

- Clerk manages credentials and sessions; the local `users` row maps a Clerk account ID to app-owned records.
- Library access starts from the current user's reading log, with one record per user/book. Reading status and ownership are independent.
- Book metadata is separate from private reading data; shared metadata uses copy-on-write so one reader's edits cannot change another reader's library.
- Stars reference the user's reading-log pair and cascade when that private record is removed.
- Reading dates are calendar dates, so the API keeps them as `YYYY-MM-DD` strings.
- Open Library is searched server-side; choosing a result fills a book form but does not save it until the user submits.

## Product

Users can manage a private reading library, track progress and ratings, browse their finished shelf, see reading summaries, pick a next book by genre/length/mood, and export their data.

## User preferences

- The visual direction should feel like a grand library in a prestigious university or an old public library in a big city.
- Build features one at a time.

## Gotchas

- Run OpenAPI codegen after editing the API spec before checking generated client/server types.
- Do not seed shared sample books; each user's library starts private and empty.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

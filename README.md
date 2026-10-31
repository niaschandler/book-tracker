# Reading Room

A real list of books I have read, own, and hope to read. Reading Room is a private reading library built for collecting books, keeping reading notes, and finding the next good read.

## Product vision

I want to keep track of books I have read and books I am interested in reading. I add a book when I find something interesting or buy a new book, and update it when I finish reading.

The experience should feel like walking into a grand library at a prestigious university or an old public library in a big city.

## Features

- Sign in and sign out with Replit. Visitors use or create a Replit account; each signed-in reader sees only their own books and stars.
- Add, view, edit, and delete books, with confirmation before deletion.
- Track author, genre, page count, rating, shelf status, reading dates, mood tags, cover, and notes.
- Star books and view only starred items.
- Search by title or author; filter by status, genre, and starred state; sort by newest, title, rating, or length.
- Search Open Library and bring catalog details and cover images into a book entry.
- Review reading totals, pages read, average rating, genre counts, longest book, fastest dated read, and this month's finished books.
- Browse visual shelves of finished books and books bought but not yet read.
- Pick a random book from Want to Read, optionally filtered by genre, maximum pages, and mood.
- Download the complete library as an Excel spreadsheet and import an existing book list with a validation preview.

## Data and privacy

Replit identities link to the existing `users` table. Shared catalog books have private per-reader reading records, and one shared `stars` junction table represents reader/book stars. Every private query is scoped to the authenticated reader. Sessions are opaque, stored hashed in PostgreSQL, and sent as Bearer headers so the GitHub Pages frontend does not depend on third-party cookies.

Existing libraries from the previous login remain intact. Account linking requires independent owner verification; accounts are never automatically matched by email.

## Technology

- React, Vite, TypeScript, and pnpm workspaces
- Express API with an OpenAPI contract and generated React Query / Zod clients
- PostgreSQL with Drizzle ORM
- Replit OpenID Connect authentication with PKCE
- Open Library Search API and Covers API

## Running in Replit

The web and API services are configured as Replit workflows. To check types:

```bash
pnpm run typecheck
```

After changing `lib/api-spec/openapi.yaml`, regenerate API clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Development uses the workspace PostgreSQL database and Replit authentication. Do not commit environment secrets.

## GitHub Pages + Replit hosting

The frontend can run on the standard GitHub Pages address; the API, database,
and login run on Replit. See [the setup guide](docs/github-pages-replit.md) for
the two backend URL settings, the public GitHub repository variable, manual
publishing workflow, and existing-account linking instructions.

## Original acceptance goals

- User data isolation between accounts.
- Dashboard read counts include only books marked Read.
- Required book fields show a friendly validation message when missing.
- Stars belong to the user who added them.
- Exported records can be opened in spreadsheet software.

The virtual bookshelf, mood picker, and Open Library lookup are implemented as first-version features.

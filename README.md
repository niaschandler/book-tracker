# Book Tracker

A real list of books I have read, own, and hope to read. Book Tracker is a private reading library built for collecting books, keeping reading notes, and finding the next good read.

## Product vision

I want to keep track of books I have read and books I am interested in reading. I add a book when I find something interesting or buy a new book, and update it when I finish reading.

The experience should feel like walking into a grand library at a prestigious university or an old public library in a big city.

## Features

- Sign up, sign in, and sign out with Clerk. Each signed-in account sees only its own books and stars.
- Add, view, edit, and delete books, with confirmation before deletion.
- Track author, genre, page count, rating, shelf status, reading dates, mood tags, cover, and notes.
- Star books and view only starred items.
- Search by title or author; filter by status, genre, and starred state; sort by newest, title, rating, or length.
- Search Open Library and bring catalog details and cover images into a book entry.
- Review reading totals, pages read, average rating, genre counts, longest book, fastest dated read, and this month's finished books.
- Browse a visual bookshelf of finished books.
- Pick a random book from Want to Read, optionally filtered by genre, maximum pages, and mood.
- Download the library as CSV for spreadsheet apps.

## Data and privacy

The app uses a `users` table linked to each Clerk account, a `books` table owned by a user, and one `stars` junction table keyed by user and book. Every book and star query is scoped to the signed-in account. Book records are not seeded with shared demo data.

## Technology

- React, Vite, TypeScript, and pnpm workspaces
- Express API with an OpenAPI contract and generated React Query / Zod clients
- PostgreSQL with Drizzle ORM
- Clerk-managed authentication
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

Development uses the workspace PostgreSQL database and Replit-managed Clerk configuration. Do not commit environment secrets.

## Original acceptance goals

- User data isolation between accounts.
- Dashboard read counts include only books marked Read.
- Required book fields show a friendly validation message when missing.
- Stars belong to the user who added them.
- Exported records can be opened in spreadsheet software.

The virtual bookshelf, mood picker, and Open Library lookup are implemented as first-version features.

-- One-time DEVELOPMENT data migration from the original flat books table.
-- Run manually before using drizzle-kit push on a populated legacy database.
-- Not an application startup hook or a production migration command.
BEGIN;
LOCK TABLE books, stars IN ACCESS EXCLUSIVE MODE;

ALTER TABLE users ADD COLUMN username text, ADD COLUMN email text, ADD COLUMN location text;
CREATE TABLE authors (
  id serial PRIMARY KEY,
  display_name text NOT NULL UNIQUE,
  CONSTRAINT authors_name_nonblank CHECK (length(trim(display_name)) > 0)
);
CREATE TABLE genres (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  CONSTRAINT genres_name_nonblank CHECK (length(trim(name)) > 0)
);
ALTER TABLE books ADD COLUMN genre_id integer REFERENCES genres(id) ON DELETE SET NULL,
  ADD COLUMN isbn text, ADD COLUMN description text;
CREATE INDEX books_genre_idx ON books(genre_id);
ALTER TABLE books ADD CONSTRAINT books_title_nonblank CHECK (length(trim(title)) > 0),
  ADD CONSTRAINT books_year_range CHECK (published_year IS NULL OR published_year BETWEEN 0 AND 3000);
CREATE TABLE book_authors (
  book_id integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  author_id integer NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);
CREATE INDEX book_authors_author_idx ON book_authors(author_id);
CREATE TYPE reading_status AS ENUM ('want_to_read', 'reading', 'read');
CREATE TABLE reading_log (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id integer NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
  status reading_status NOT NULL DEFAULT 'want_to_read',
  is_owned boolean NOT NULL DEFAULT false,
  rating integer,
  started_on date,
  finished_on date,
  notes text,
  mood_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_log_user_book_unique UNIQUE (user_id, book_id),
  CONSTRAINT reading_log_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT reading_log_dates_order CHECK (started_on IS NULL OR finished_on IS NULL OR finished_on >= started_on)
);
CREATE INDEX reading_log_user_status_idx ON reading_log(user_id, status);
CREATE INDEX reading_log_book_idx ON reading_log(book_id);

-- Keep legacy author strings intact; punctuation is not a reliable name delimiter.
INSERT INTO authors(display_name) SELECT DISTINCT trim(author) FROM books;
INSERT INTO genres(name) SELECT DISTINCT trim(genre) FROM books WHERE nullif(trim(genre), '') IS NOT NULL;
INSERT INTO book_authors(book_id, author_id)
  SELECT b.id, a.id FROM books b JOIN authors a ON a.display_name = trim(b.author);
UPDATE books b SET genre_id = g.id FROM genres g WHERE g.name = trim(b.genre);
INSERT INTO reading_log(id, user_id, book_id, status, is_owned, rating, started_on, finished_on, notes, mood_tags, created_at, updated_at)
  SELECT id, user_id, id,
    (CASE WHEN status::text = 'owned' THEN 'want_to_read' ELSE status::text END)::reading_status,
    status::text = 'owned', rating, started_on, finished_on, notes, mood_tags, created_at, updated_at
  FROM books;
SELECT setval(pg_get_serial_sequence('reading_log', 'id'), COALESCE((SELECT max(id) FROM reading_log), 1),
  EXISTS(SELECT 1 FROM reading_log));
ALTER TABLE stars ADD CONSTRAINT stars_reading_log_fk
  FOREIGN KEY (user_id, book_id) REFERENCES reading_log(user_id, book_id) ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF (SELECT count(*) FROM reading_log) <> (SELECT count(*) FROM books)
    OR (SELECT count(*) FROM book_authors) <> (SELECT count(*) FROM books) THEN
    RAISE EXCEPTION 'Backfill incomplete; migration rolled back';
  END IF;
END $$;

-- Personal values have been copied above, with the same IDs and timestamps.
ALTER TABLE books DROP CONSTRAINT books_rating_range;
ALTER TABLE books DROP COLUMN user_id, DROP COLUMN author, DROP COLUMN genre,
  DROP COLUMN rating, DROP COLUMN status, DROP COLUMN mood_tags, DROP COLUMN notes,
  DROP COLUMN started_on, DROP COLUMN finished_on;
DROP TYPE book_status;
COMMIT;

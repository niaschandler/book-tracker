import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, CircleHelp, Compass, RotateCcw, Sparkles } from 'lucide-react';
import {
  useListBooks, usePickNextBook, getListBooksQueryKey, getPickNextBookQueryKey, type PickNextBookParams,
} from '@workspace/api-client-react';
import { ShelfCover } from '@/components/shelf/Bookshelf';
import { pickOptions, validatePickFilters, type PickFilters } from '@/lib/next-pick';

const empty: PickFilters = { genre: '', excludeGenre: '', moodTag: '', maxPages: '' };
const fieldCls = 'w-full rounded-xl border bg-[#1e4435] px-3 py-3 text-sm text-[#f4efdf] outline-none focus:border-[#e0c77f] disabled:opacity-60 placeholder:text-[#afc0b2]';
const labelCls = 'mb-2 block font-mono text-[9px] uppercase tracking-[.15em] text-[#c0cfbf]';

function Field({ label, hint, error, id, children }: { label: string; hint?: ReactNode; error?: string; id: string; children: ReactNode }) {
  return <div><label htmlFor={id} className={labelCls}>{label}</label>{children}
    {error ? <p id={`${id}-msg`} role="alert" data-testid={`error-${id}`} className="mt-2 text-[11px] leading-5 text-[#f2bfa8]">{error}</p>
      : hint ? <p id={`${id}-msg`} className="mt-2 text-[11px] leading-5 text-[#a9bcab]">{hint}</p> : null}
  </div>;
}

function Panel({ icon, eyebrow, title, body, children, testId }: { icon: ReactNode; eyebrow?: string; title: string; body: ReactNode; children?: ReactNode; testId: string }) {
  return <div data-testid={testId} className="max-w-sm text-center" role="status">
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e9e2d3] text-[#62806d]">{icon}</span>
    {eyebrow && <p className="mt-5 font-mono text-[9px] uppercase tracking-[.2em] text-[#a17d50]">{eyebrow}</p>}
    <h3 className="mt-2 font-serif text-3xl text-[#274b3b]">{title}</h3>
    <p className="mt-3 text-sm leading-6 text-[#718075]">{body}</p>{children}
  </div>;
}

export function NextBookPicker() {
  useEffect(() => { document.title = 'Choose a book | Reading Room'; }, []);
  const [filters, setFilters] = useState<PickFilters>(empty);
  const [attempted, setAttempted] = useState(false);
  const [drawn, setDrawn] = useState(false);

  const library = useListBooks(undefined, { query: { queryKey: getListBooksQueryKey() } });
  const opts = useMemo(() => pickOptions(library.data), [library.data]);
  const validation = useMemo(() => validatePickFilters(filters), [filters]);
  const params: PickNextBookParams = validation.ok ? validation.params : {};
  const selection = usePickNextBook(params, { query: { queryKey: getPickNextBookQueryKey(params), enabled: false, retry: false } });
  const drawing = selection.isFetching;

  const set = (k: keyof PickFilters) => (v: string) => { setFilters(f => ({ ...f, [k]: v })); setDrawn(false); };
  const showError = attempted && !validation.ok ? validation : null;

  const choose = (e?: FormEvent) => {
    e?.preventDefault();
    if (drawing) return;
    setAttempted(true);
    if (!validation.ok) { document.getElementById(`pick-${validation.field}`)?.focus(); return; }
    setDrawn(true);
    void selection.refetch();
  };
  const reset = () => { setFilters(empty); setAttempted(false); setDrawn(false); };
  const active = Object.values(filters).some(v => v.trim());
  const book = selection.data?.book;
  const ready = !library.isLoading && !library.isError && opts.count > 0;

  let result: ReactNode;
  if (library.isLoading) result = <div data-testid="status-library-loading" className="flex w-full animate-pulse gap-6"><div className="aspect-[.68] w-40 rounded bg-[#e2ddcf]"/><div className="flex-1 space-y-3"><div className="h-4 w-1/3 rounded bg-[#e2ddcf]"/><div className="h-10 w-3/4 rounded bg-[#e2ddcf]"/><div className="h-4 w-1/2 rounded bg-[#e2ddcf]"/></div></div>;
  else if (library.isError) result = <Panel testId="status-library-error" icon={<CircleHelp size={25}/>} title="The shelves are taking a moment." body="We couldn't open your library just now, so there is nothing to choose from yet."><button type="button" data-testid="button-retry-library" onClick={() => library.refetch()} className="mt-5 rounded-full bg-[#285342] px-5 py-2.5 text-xs font-semibold text-[#faf8f1]">Try again</button></Panel>;
  else if (opts.count === 0) result = <Panel testId="status-empty-want" icon={<BookOpen size={26}/>} eyebrow="An empty Want to read shelf" title="Nothing waiting yet." body="The picker only draws from books marked Want to read. Add one, or move a book to that shelf, and come back."><Link href="/books" data-testid="link-library-empty" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#285342] px-5 py-2.5 text-xs font-semibold text-[#faf8f1] no-underline">Go to my library <ArrowRight size={14}/></Link></Panel>;
  else if (drawing) result = <div data-testid="status-drawing" role="status" aria-live="polite" className="flex w-full flex-col items-center gap-5"><div className="flex items-end gap-1.5" aria-hidden="true">{['#285342','#b8704c','#d0a953','#627f86','#8d4a45'].map((c,i)=><span key={c} style={{ background: c, height: 70 + (i % 3) * 18, animationDelay: `${i * 120}ms` }} className="w-7 animate-pulse rounded-t-sm"/>)}</div><p className="font-serif text-2xl text-[#274b3b]">Turning the pages…</p></div>;
  else if (!drawn) result = <Panel testId="status-idle" icon={<Sparkles size={24}/>} eyebrow="A little serendipity" title="The right book is in there." body={<>{opts.count} {opts.count === 1 ? 'book is' : 'books are'} waiting on your Want to read shelf. Set any boundaries you like, then draw one.</>}/>;
  else if (selection.isError) result = <Panel testId="status-pick-error" icon={<CircleHelp size={25}/>} title="The draw didn't land." body="We couldn't choose a book just now. Your filters are still set."><button type="button" data-testid="button-retry-pick" onClick={() => choose()} className="mt-5 rounded-full bg-[#285342] px-5 py-2.5 text-xs font-semibold text-[#faf8f1]">Try again</button></Panel>;
  else if (selection.data && !book) result = <Panel testId="status-no-match" icon={<Compass size={24}/>} eyebrow="Nothing fits all of that" title="No match on this shelf." body="No Want to read book meets every filter you set. We didn't loosen anything for you; adjust a filter yourself, or clear them all.">{active && <button type="button" data-testid="button-clear-no-match" onClick={reset} className="mt-5 rounded-full border border-[#d8d2c4] px-5 py-2.5 text-xs font-semibold text-[#526a59]">Clear filters</button>}</Panel>;
  else if (book) result = <article data-testid={`card-pick-${book.id}`} className="fade-up grid w-full items-center gap-7 sm:grid-cols-[minmax(140px,210px)_1fr]">
    <ShelfCover book={book} className="mx-auto aspect-[.68] w-full max-w-[210px] rounded-lg shadow-[8px_14px_30px_rgba(45,39,27,.2)]"/>
    <div><p className="font-mono text-[9px] uppercase tracking-[.19em] text-[#a17d50]">Your next chapter</p>
      <h3 data-testid="text-pick-title" className="mt-3 font-serif text-4xl leading-[.95] text-[#274b3b]">{book.title}</h3>
      <p data-testid="text-pick-author" className="mt-3 font-serif text-xl text-[#788477]">{book.authors?.length ? book.authors.join(', ') : book.author}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[#e4ddcf] pt-4 text-xs">
        <div><dt className="font-mono text-[9px] uppercase tracking-[.15em] text-[#8f9a8d]">Genre</dt><dd data-testid="text-pick-genre" className="mt-1 text-[#3f5a4a]">{book.genre || 'Not recorded'}</dd></div>
        <div><dt className="font-mono text-[9px] uppercase tracking-[.15em] text-[#8f9a8d]">Length</dt><dd data-testid="text-pick-pages" className="mt-1 text-[#3f5a4a]">{book.pages ? `${book.pages.toLocaleString()} pages` : 'Not recorded'}</dd></div>
        <div className="col-span-2"><dt className="font-mono text-[9px] uppercase tracking-[.15em] text-[#8f9a8d]">Moods</dt><dd className="mt-1.5 flex flex-wrap gap-1.5">{book.moodTags?.length ? book.moodTags.map(m => <span key={m} className="rounded-full bg-[#e8e1d3] px-3 py-1 text-[10px] text-[#526a59]">{m}</span>) : <span className="text-[#3f5a4a]">None saved</span>}</dd></div>
      </dl>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href={`/books/${book.id}`} data-testid="link-pick-detail" className="inline-flex items-center gap-2 rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#faf8f1] no-underline">Open the book record <ArrowRight size={14}/></Link>
        <button type="button" data-testid="button-pick-again" onClick={() => choose()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#58735f] hover:text-[#285342]"><RotateCcw size={13}/> Draw another</button>
      </div>
      <p className="mt-4 text-[11px] text-[#8f9a8d]">Still on your Want to read shelf. Nothing changes until you decide.</p>
    </div>
  </article>;

  return <div className="grid gap-7 xl:grid-cols-[.85fr_1.15fr]">
    <section className="relative overflow-hidden rounded-[26px] bg-[#294f3e] p-6 text-[#f4efdf] md:p-9">
      <div className="absolute -right-10 -top-8 h-52 w-52 rounded-full border border-[#e3ca8c30]"/><div className="absolute -right-4 -top-2 h-36 w-36 rounded-full border border-[#e3ca8c30]"/>
      <p className="relative font-mono text-[9px] uppercase tracking-[.2em] text-[#d4bd83]">A considered surprise</p>
      <h2 className="relative mt-3 max-w-sm font-serif text-4xl leading-tight">Make room for a story.</h2>
      <p className="relative mt-3 max-w-sm text-sm leading-6 text-[#c6d1c5]">Every filter is optional. Nothing is drawn until you ask.</p>
      <form noValidate onSubmit={choose} className="relative mt-8" aria-busy={drawing}>
        <fieldset disabled={drawing || !ready} className="space-y-5">
          <Field id="pick-genre" label="Stay within a genre">
            <select id="pick-genre" data-testid="select-genre" value={filters.genre} onChange={e => set('genre')(e.target.value)} className={`${fieldCls} border-white/20`}><option value="">Any genre</option>{opts.genres.map(g => <option key={g} value={g}>{g}</option>)}</select>
          </Field>
          <Field id="pick-excludeGenre" label="Try a different genre" error={showError?.field === 'excludeGenre' ? showError.message : undefined}
            hint={<>Skips one genre so you can wander elsewhere. Books with no genre recorded are left out too, since we can't tell they're different.{opts.noGenre > 0 && ` (${opts.noGenre} on your list ${opts.noGenre === 1 ? 'has' : 'have'} no genre.)`}</>}>
            <select id="pick-excludeGenre" data-testid="select-exclude-genre" aria-describedby="pick-excludeGenre-msg" aria-invalid={showError?.field === 'excludeGenre'} value={filters.excludeGenre} onChange={e => set('excludeGenre')(e.target.value)} className={`${fieldCls} ${showError?.field === 'excludeGenre' ? 'border-[#e59c80]' : 'border-white/20'}`}><option value="">Don't skip any</option>{opts.genres.map(g => <option key={g} value={g}>Skip {g}</option>)}</select>
          </Field>
          <Field id="pick-moodTag" label="A mood to match">
            <select id="pick-moodTag" data-testid="select-mood" value={filters.moodTag} onChange={e => set('moodTag')(e.target.value)} className={`${fieldCls} border-white/20`}><option value="">Any feeling</option>{opts.moods.map(m => <option key={m} value={m}>{m}</option>)}</select>
          </Field>
          <Field id="pick-maxPages" label="At most this many pages" error={showError?.field === 'maxPages' ? showError.message : undefined}
            hint="Books without a saved page count are left out while a limit is set.">
            <input id="pick-maxPages" data-testid="input-max-pages" inputMode="numeric" aria-describedby="pick-maxPages-msg" aria-invalid={showError?.field === 'maxPages'} value={filters.maxPages} onChange={e => set('maxPages')(e.target.value)} placeholder="Any length" className={`${fieldCls} ${showError?.field === 'maxPages' ? 'border-[#e59c80]' : 'border-white/20'}`}/>
          </Field>
          <button type="submit" data-testid="button-choose" className="mt-1 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#e0c77f] px-5 py-3.5 text-sm font-semibold text-[#294b39] transition hover:-translate-y-0.5 hover:bg-[#ead696] disabled:translate-y-0 disabled:opacity-60"><Sparkles size={16}/>{drawing ? 'Turning the pages…' : drawn && book ? 'Draw another' : 'Choose my next book'}</button>
          {active && <button type="button" data-testid="button-reset-filters" onClick={reset} className="block w-full text-center text-xs text-[#c6d1c5] hover:text-[#f4efdf]">Clear all filters</button>}
        </fieldset>
      </form>
    </section>
    <section aria-live="polite" className="flex min-h-[430px] items-center justify-center rounded-[26px] border border-[#ded7c8] bg-[#faf8f1] p-6 md:p-10">{result}</section>
  </div>;
}

import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import type { Book } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { spineMetrics, type ShelfGroup } from '@/lib/bookshelf';

const spineTones = [
  { bg: '#2d5a3d', ink: '#f2e3b8' }, { bg: '#b8704c', ink: '#fff4dc' }, { bg: '#d0a953', ink: '#2c3d2f' },
  { bg: '#627f86', ink: '#f6efdc' }, { bg: '#8d4a45', ink: '#f6dfae' }, { bg: '#e3d1a5', ink: '#3a4b3c' },
];

export function ShelfCover({ book, className = '' }: { book: Pick<Book, 'coverUrl' | 'title' | 'author' | 'genre'>; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = !!book.coverUrl && failed !== book.coverUrl;
  return <div className={`relative overflow-hidden bg-[#2d5a3d] ${className}`}>
    {showImg ? <img className="h-full w-full object-cover" src={book.coverUrl!} alt={`Cover of ${book.title}`} onError={() => setFailed(book.coverUrl ?? null)} />
      : <div role="img" aria-label={`${book.title} by ${book.author || 'unknown author'} (no cover image)`} className="flex h-full flex-col justify-between border-[6px] border-double border-[#d7b66d]/50 p-3 text-[#f6ecd2]">
        <span className="font-mono text-[8px] uppercase tracking-[.2em] opacity-75">{book.genre || 'Genre not recorded'}</span>
        <span><span className="block font-serif text-lg font-semibold leading-tight">{book.title}</span><span className="mt-2 block text-[10px] opacity-85">{book.author || 'Author unknown'}</span></span>
      </div>}
  </div>;
}

function Spine({ book, onOpen }: { book: Book; onOpen: (b: Book) => void }) {
  const m = spineMetrics(book);
  const tone = spineTones[m.tone];
  const author = book.authors?.length ? book.authors.join(', ') : book.author;
  return <button type="button" onClick={() => onOpen(book)} data-testid={`button-spine-${book.id}`}
    aria-label={`${book.title} by ${author || 'unknown author'}. Open details`}
    style={{ height: m.height, width: m.width, backgroundColor: tone.bg, color: tone.ink }}
    className="spine group relative shrink-0 rounded-t-[3px] border-l border-white/20 shadow-[inset_-6px_0_8px_rgba(0,0,0,.18),3px_0_6px_rgba(40,28,15,.25)] outline-none transition-transform duration-200 hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:ring-2 focus-visible:ring-[#f2d58e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#7d5638] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0">
    <span aria-hidden="true" className="absolute inset-x-0 top-3 h-px bg-current opacity-40" />
    <span aria-hidden="true" className="absolute inset-x-0 top-[17px] h-px bg-current opacity-25" />
    <span aria-hidden="true" className="absolute inset-x-0 bottom-6 top-6 flex items-center justify-center overflow-hidden">
      <span className="line-clamp-2 max-h-full text-center font-serif text-[12px] font-semibold leading-tight [writing-mode:vertical-rl] rotate-180">{book.title}</span>
    </span>
    {book.starred && <span aria-hidden="true" className="absolute bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current opacity-80" />}
  </button>;
}

export function BookshelfWall({ groups }: { groups: ShelfGroup<Book>[] }) {
  const [active, setActive] = useState<Book | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const openBook = (book: Book) => {
    opener.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setActive(book);
  };
  return <>
    <div className="space-y-10">
      {groups.map((g) => <section key={g.key} aria-labelledby={`shelf-${g.key}`} data-testid={`shelf-${g.key}`}>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id={`shelf-${g.key}`} className="font-serif text-2xl text-[#3a1f14]">{g.label}</h2>
          <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8b9588]">{g.books.length} {g.books.length === 1 ? 'volume' : 'volumes'}</span>
        </div>
        <div className="relative rounded-t-lg bg-[#5e3f28] px-3 pt-6 shadow-[inset_0_10px_22px_rgba(0,0,0,.35)] sm:px-5">
          {g.books.length===0&&<p className="px-2 pb-6 text-sm text-[#f2e3b8]">No bought, unread books yet. Books you own will appear here until you mark them as read.</p>}
          <ul className="flex flex-wrap items-end gap-x-[3px] gap-y-0">
            {g.books.map((b) => <li key={b.id} className="flex items-end border-b-[10px] border-[#a87b4f] pb-0 pt-5"><Spine book={b} onOpen={openBook} /></li>)}
          </ul>
          <div aria-hidden="true" className="-mx-3 h-3 bg-[#7d5638] shadow-[0_10px_18px_rgba(56,38,20,.25)] sm:-mx-5" />
        </div>
      </section>)}
    </div>
    <Dialog open={!!active} onOpenChange={(o) => { if (!o) setActive(null); }}>
      <DialogContent onCloseAutoFocus={event => {
        if (opener.current?.isConnected) {
          event.preventDefault();
          opener.current.focus();
        }
      }} className="w-[calc(100%_-_2rem)] max-w-xl border-[#d0bb92] bg-[#f8f0de] p-6 sm:rounded-2xl motion-reduce:animate-none">
        {active && <div className="flex flex-col gap-5 sm:flex-row">
          <ShelfCover book={active} className="h-[190px] w-[128px] shrink-0 self-center rounded shadow-md sm:self-start" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#a17d50]">{active.status!=='read'?(active.status==='reading'?'Owned · Currently reading':'Owned · Not yet read'):active.finishedOn ? `Finished ${new Date(active.finishedOn).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : 'Finish date not recorded'}</p>
            <DialogTitle className="mt-2 font-serif text-3xl leading-tight text-[#2e1d14]">{active.title}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#788477]">{(active.authors?.length ? active.authors.join(', ') : active.author) || 'Author unknown'}</DialogDescription>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-[#e3dccd] py-3 text-xs">
              <div><dt className="font-mono text-[8px] uppercase tracking-[.15em] text-[#8b9588]">Genre</dt><dd className="mt-1 text-[#3c5747]">{active.genre || 'Not recorded'}</dd></div>
              <div><dt className="font-mono text-[8px] uppercase tracking-[.15em] text-[#8b9588]">Pages</dt><dd className="mt-1 text-[#3c5747]">{active.pages ? active.pages.toLocaleString() : 'Unknown'}</dd></div>
              <div><dt className="font-mono text-[8px] uppercase tracking-[.15em] text-[#8b9588]">Rating</dt><dd className="mt-1 text-[#3c5747]">{active.rating ? `${active.rating} / 5` : 'Not rated'}</dd></div>
            </dl>
            <p className="mt-4 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#5e4232]">{active.notes || 'No notes saved for this book yet.'}</p>
            <div className="mt-5 flex items-center gap-3">
              <Link href={`/books/${active.id}`} data-testid="link-open-book-record" className="inline-flex items-center gap-2 rounded-full bg-[#2d5a3d] px-4 py-2.5 text-xs font-semibold text-[#f8f0de] no-underline hover:bg-[#234a31]">Open book record <ArrowRight size={14} /></Link>
            </div>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

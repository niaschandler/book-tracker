import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import type { Book } from '@workspace/api-client-react';
import { formatDays } from '@/lib/dashboard-chart';

type Props = { eyebrow: string; book: Book | null | undefined; detail: string | null; emptyTitle: string; emptyBody: string; cover: (b: Book) => ReactNode; tone?: 'paper' | 'sand' };

export function RecordBook({ eyebrow, book, detail, emptyTitle, emptyBody, cover, tone = 'sand' }: Props) {
  return <section className={`rounded-2xl border border-[#d6c29c] p-6 ${tone === 'sand' ? 'bg-[#ebe3d3]' : 'bg-[#f8f0de]'}`}>
    <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a17d50]">{eyebrow}</p>
    {book ? <Link href={`/books/${book.id}`} className="group mt-5 flex items-center gap-5 text-[#2e1d14] no-underline">
      {cover(book)}
      <div className="min-w-0"><h3 className="font-serif text-2xl leading-tight group-hover:underline">{book.title}</h3><p className="mt-1 text-xs text-[#758175]">{book.author}</p>
        <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-[#9a7950]">{detail ?? 'Details not recorded'} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5"/></p></div>
    </Link> : <div className="py-5"><p className="font-serif text-2xl">{emptyTitle}</p><p className="mt-2 text-sm text-[#76604f]">{emptyBody}</p></div>}
  </section>;
}

export const longestDetail = (b: Book | null | undefined) => b?.pages ? `${b.pages.toLocaleString()} pages · your longest read` : null;
export const fastestDetail = (days: number | null | undefined) => { const d = formatDays(days); return d ? `${d} · your quickest finish` : null; };

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Feather } from 'lucide-react';
import type { Book } from '@workspace/api-client-react';
import { monthlyCompletions } from '@/lib/dashboard-chart';

type Props = { books: Book[] | undefined; isLoading: boolean; isError: boolean; retry: () => void };

export function ReadingRhythmChart({ books, isLoading, isError, retry }: Props) {
  const [showTable, setShowTable] = useState(false);
  const { buckets, undated } = useMemo(() => monthlyCompletions(books ?? []), [books]);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const current = buckets[buckets.length - 1];

  return <section aria-labelledby="rhythm-title" className="rounded-2xl border border-[#d6c29c] bg-[#f8f0de] p-6 md:p-8">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a17d50]">Finished, month by month</p><h2 id="rhythm-title" className="mt-2 font-serif text-3xl">Your reading rhythm</h2><p className="mt-1 text-xs text-[#76604f]">Last 12 months, by finish date (UTC)</p></div>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8e0cf] text-[#42634f]"><Feather size={19}/></span>
    </div>
    {isLoading ? <div className="h-[190px] animate-pulse rounded-xl bg-[#ebe6da]" aria-label="Loading reading chart"/> :
     isError ? <div className="grid h-[190px] place-items-center rounded-xl border border-dashed border-[#e4c8be] bg-[#fbefeb] text-center"><div><p className="font-serif text-xl text-[#623e32]">The chart could not be drawn.</p><button type="button" onClick={retry} className="mt-3 rounded-full bg-[#2d5a3d] px-4 py-1.5 text-xs text-[#f8f0de]">Try again</button></div></div> :
     total === 0 ? <div className="grid h-[190px] place-items-center rounded-xl border border-dashed border-[#d8d0bf] text-center"><div className="px-6"><p className="font-serif text-2xl">No finished books in the last year.</p><p className="mt-2 text-sm text-[#76604f]">Mark a book as read with a finish date and it will appear here.</p></div></div> :
     <>
      <div className="h-[200px]" role="img" aria-label={`Bar chart of books finished per month. ${buckets.map(b => `${b.longLabel}: ${b.count}`).join('; ')}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e6dfd0" strokeDasharray="2 4"/>
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d6c29c' }} tick={{ fontSize: 10, fill: '#8a9487', fontFamily: 'monospace' }} interval={0}/>
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8a9487' }} width={40}/>
            <Tooltip cursor={{ fill: '#efe8d8' }} contentStyle={{ background: '#fcf6e8', border: '1px solid #d6c29c', borderRadius: 10, fontSize: 12 }}
              labelFormatter={(_, p) => (p?.[0]?.payload as { longLabel?: string } | undefined)?.longLabel ?? ''}
              formatter={(v: number) => [`${v} ${v === 1 ? 'book' : 'books'}`, 'Finished']}/>
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={34}>
              {buckets.map((b, i) => <Cell key={b.key} fill={i === buckets.length - 1 ? '#b8755b' : '#71917e'}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-4 text-xs text-[#76604f]"><strong className="font-semibold text-[#6a3420]">{total} {total === 1 ? 'book' : 'books'}</strong> finished in the last 12 months, {current.count} in {current.longLabel}.</p>
     </>}
    {!isLoading && !isError && undated > 0 && <p className="mt-2 text-[11px] text-[#9a7950]">{undated} finished {undated === 1 ? 'book has' : 'books have'} no valid finish date and {undated === 1 ? 'is' : 'are'} not charted.</p>}
    {!isLoading && !isError && total > 0 && <div className="mt-3">
      <button type="button" aria-expanded={showTable} aria-controls="rhythm-table" onClick={() => setShowTable(s => !s)} className="text-xs font-semibold text-[#6a3420] underline-offset-2 hover:underline">{showTable ? 'Hide data table' : 'Show as table'}</button>
      <table id="rhythm-table" className={showTable ? 'mt-3 w-full text-left text-xs' : 'sr-only'}>
        <caption className="sr-only">Books finished per month, last 12 UTC months</caption>
        <thead><tr className="border-b border-[#d6c29c] font-mono text-[9px] uppercase tracking-[.14em] text-[#7d8b7d]"><th scope="col" className="py-1.5">Month</th><th scope="col" className="py-1.5 text-right">Finished</th></tr></thead>
        <tbody>{buckets.map(b => <tr key={b.key} className="border-b border-[#eee8dc] last:border-0"><td className="py-1.5">{b.longLabel}</td><td className="py-1.5 text-right font-mono">{b.count}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

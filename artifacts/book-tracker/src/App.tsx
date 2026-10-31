import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  useCreateBook, useEnsureCurrentUser, useExportBooks, useGetBook, useGetDashboardSummary,
  useListBooks, usePickNextBook, useSearchCatalog, useUpdateBook,
  getListBooksQueryKey, getGetBookQueryKey, getGetDashboardSummaryQueryKey,
  getPickNextBookQueryKey, getSearchCatalogQueryKey, getExportBooksQueryKey,
  type Book, type BookInput, type BookUpdate, type ListBooksParams, type PickNextBookParams,
  type CatalogBook, type BookStatus,
} from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check,
  CircleHelp, Compass, Download, Feather, Library, LogOut,
  Menu, Plus, Search, SlidersHorizontal, Sparkles, Star, Trash2, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DeleteBookDialog } from '@/components/DeleteBookDialog';
import { StarBookButton } from '@/components/StarBookButton';
import { refreshLibrary } from '@/lib/library-cache';
import { requiredBookErrors } from '@/lib/book-form-validation';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#285342', colorForeground: '#263e34', colorMutedForeground: '#718276',
    colorDanger: '#a7453c', colorBackground: '#fbf8f1', colorInput: '#fffdf8',
    colorInputForeground: '#263e34', colorNeutral: '#d8d2c4',
    fontFamily: "'DM Sans', sans-serif", borderRadius: '0.6rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f1] rounded-[22px] w-[440px] max-w-full overflow-hidden shadow-[0_24px_70px_rgba(26,54,40,.16)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263e34] font-serif text-3xl',
    headerSubtitle: 'text-[#718276]',
    socialButtonsBlockButtonText: 'text-[#263e34] font-medium',
    formFieldLabel: 'text-[#263e34] font-medium',
    footerActionLink: 'text-[#285342] font-semibold',
    footerActionText: 'text-[#718276]',
    dividerText: 'text-[#718276]',
    identityPreviewEditButton: 'text-[#285342]',
    formFieldSuccessText: 'text-[#285342]',
    alertText: 'text-[#8b332c]',
    logoBox: 'mb-3',
    logoImage: 'h-10',
    socialButtonsBlockButton: 'border-[#d8d2c4] bg-[#fffdf8] hover:bg-[#f2eddf]',
    formButtonPrimary: 'bg-[#285342] hover:bg-[#1f4536] text-[#fbf8f1] shadow-none',
    formFieldInput: 'border-[#d8d2c4] bg-[#fffdf8] text-[#263e34]',
    footerAction: 'border-t border-[#e7e1d5]',
    dividerLine: 'bg-[#d8d2c4]',
    alert: 'bg-[#fbefeb] border-[#ead0c9]',
    otpCodeFieldInput: 'border-[#d8d2c4] bg-[#fffdf8] text-[#263e34]',
    formFieldRow: 'gap-1.5',
    main: 'gap-5',
  },
};

const genreTones = ['#d9aa62', '#b9785e', '#698b79', '#7894a3', '#aa8290', '#88945d'];
const statusLabels: Record<BookStatus, string> = { want_to_read: 'Want to read', reading: 'Currently reading', read: 'Read' };
const prettyDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';

function Cover({ book, className = '' }: { book: Pick<Book, 'coverUrl' | 'title' | 'author' | 'genre'>; className?: string }) {
  const colors = genreTones[Math.abs((book.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % genreTones.length];
  return <div className={`book-cover relative overflow-hidden ${className}`} style={{ backgroundColor: colors }}>
    {book.coverUrl ? <img className="h-full w-full object-cover" src={book.coverUrl} alt={`Cover of ${book.title}`} /> : <div className="cover-fallback flex h-full flex-col justify-between p-3 text-[#fff8e8]">
      <span className="font-mono text-[8px] uppercase tracking-[.2em] opacity-75">{book.genre || 'A volume'}</span>
      <div><span className="block font-serif text-[clamp(13px,2vw,20px)] font-semibold leading-[.95]">{book.title}</span><span className="mt-2 block text-[9px] opacity-85">{book.author}</span></div>
      <span className="text-right font-serif text-xl opacity-40">✦</span>
    </div>}
  </div>;
}

function AppShell({ children, section }: { children: ReactNode; section: string }) {
  const [mobileNav, setMobileNav] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const links = [
    { href: '/dashboard', label: 'Reading room', icon: Library },
    { href: '/books', label: 'My library', icon: BookOpen },
    { href: '/starred', label: 'Starred', icon: Star },
    { href: '/shelf', label: 'Finished books', icon: Bookmark },
    { href: '/next', label: 'Choose a book', icon: Compass },
  ];
  return <div className="min-h-[100dvh] bg-[#f2efe5] text-[#263e34]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#1e4939] px-5 pb-6 pt-7 text-[#f4efdf] transition-transform duration-300 md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <Link href="/dashboard" className="mb-11 flex items-center gap-3 no-underline" onClick={() => setMobileNav(false)}>
        <span className="grid h-10 w-10 place-items-center rounded-full border border-[#d7b66d]/60 text-[#e5c781]"><BookOpen size={19}/></span>
        <span><span className="block font-serif text-[21px] leading-none tracking-wide">Marginalia</span><span className="mt-1 block font-mono text-[8px] uppercase tracking-[.22em] text-[#b8c5b5]">Personal reading room</span></span>
      </Link>
      <p className="mb-3 pl-3 font-mono text-[9px] uppercase tracking-[.2em] text-[#9db09f]">Your collection</p>
      <nav className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] no-underline transition-colors ${section === href ? 'bg-[#315b49] text-[#f2d58e]' : 'text-[#dce3d7] hover:bg-[#2a5543]'}`}><Icon size={17} strokeWidth={1.7}/>{label}{section === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e2c379]"/>}</Link>)}
      </nav>
      <div className="mt-auto border-t border-[#ffffff1c] pt-5">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#d6ba7a] font-serif text-sm text-[#244334]">{user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || 'R'}</div>
          <div className="min-w-0"><p data-testid="user-name-display" className="truncate text-xs font-medium">{user?.firstName || 'Reader'}{user?.lastName ? ` ${user.lastName}` : ''}</p><p data-testid="user-email-display" className="truncate text-[10px] text-[#aebfb0]">{user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || 'Signed in'}</p></div>
        </div>
        <button type="button" data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-[#d4dfd4] hover:bg-[#2a5543]"><LogOut size={15}/> Sign out</button>
      </div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-[#14281f]/40 md:hidden"/>}
    <main className="min-h-[100dvh] md:ml-[250px]">
      <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#ded8ca] bg-[#f2efe5]/95 px-5 backdrop-blur md:px-10">
        <button type="button" aria-label="Open menu" onClick={() => setMobileNav(true)} className="mr-3 text-[#365847] md:hidden"><Menu size={22}/></button>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-[#78877a]"><span className="hidden sm:inline">The reading room</span><span className="text-[#c8ad70]">/</span><span>{section.replace('/', '') === 'dashboard' ? 'Overview' : section.replace('/', '').replace('-', ' ')}</span></div>
        <Link href="/books" className="flex items-center gap-2 rounded-full border border-[#d7d0c1] bg-[#faf8f1] px-3.5 py-2 text-xs font-medium text-[#315744] no-underline transition hover:bg-[#e9e3d5]"><Plus size={15}/> <span className="hidden sm:inline">Add a book</span></Link>
      </header>
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">{children}</div>
    </main>
  </div>;
}

function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/dashboard"/>;
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f1eddf] text-[#263e34]">
    <header className="relative z-10 mx-auto flex max-w-[1360px] items-center justify-between px-6 py-6 md:px-12">
      <Link href="/" className="flex items-center gap-3 text-[#234b39] no-underline"><BookOpen size={23}/><span className="font-serif text-xl">Marginalia</span></Link>
      <div className="flex items-center gap-5"><Link href="/sign-in" className="text-xs font-semibold text-[#315744] no-underline">Sign in</Link><Link href="/sign-up" className="rounded-full bg-[#285342] px-5 py-2.5 text-xs font-semibold text-[#f8f2e3] no-underline hover:bg-[#1f4536]">Make it yours</Link></div>
    </header>
    <section className="library-paper relative mx-auto grid min-h-[650px] max-w-[1440px] items-center gap-10 px-6 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-16 md:pb-28 md:pt-10">
      <div className="fade-up relative z-10 max-w-[650px]">
        <div className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.23em] text-[#8e7250]"><span className="h-px w-9 bg-[#b58e55]"/>A home for every story</div>
        <h1 className="font-serif text-[clamp(58px,8vw,112px)] leading-[.82] tracking-[-.055em] text-[#214434]">A life,<br/><em className="font-normal text-[#b06f55]">well read.</em></h1>
        <p className="mt-8 max-w-[410px] text-[15px] leading-7 text-[#5d6b5d]">Keep the books that changed your mind, the ones waiting by your bedside, and the small details you never want to forget.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex items-center gap-3 rounded-full bg-[#285342] px-6 py-3.5 text-sm font-semibold text-[#fbf8ef] no-underline transition hover:-translate-y-0.5 hover:bg-[#1f4536]">Open your reading room <ArrowRight size={16}/></Link><Link href="/sign-in" className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-[#315744] no-underline">I have an account <ArrowUpRight size={15}/></Link></div>
        <div className="mt-12 flex items-center gap-4 border-t border-[#d9d0bd] pt-5 text-xs text-[#758273]"><span className="flex -space-x-2">{['#c48e65','#718a72','#aa8791'].map(c=><i key={c} style={{background:c}} className="h-7 w-7 rounded-full border-2 border-[#f1eddf]"/>)}</span><span>A quiet corner for your reading life.</span></div>
      </div>
      <div className="relative mx-auto flex h-[410px] w-full max-w-[550px] items-end justify-center pb-8 md:h-[520px]">
        <div className="absolute bottom-14 left-[4%] h-[1px] w-[92%] bg-[#7a5635]"/>
        <div className="absolute bottom-0 left-[1%] h-14 w-[98%] rounded-sm border-t-[7px] border-[#7d5638] bg-[#b1875a] shadow-[0_14px_24px_rgba(56,38,20,.16)]"/>
        <div className="absolute left-[8%] top-9 h-[280px] w-[150px] rounded-t-[48%] border-[10px] border-[#284c3b] opacity-90"><div className="absolute inset-4 rounded-t-[48%] border border-[#d8bd7c]/60"/></div>
        <div className="absolute right-[7%] top-2 h-[300px] w-[175px] rounded-t-[48%] border-[10px] border-[#b77a5f] opacity-80"><div className="absolute inset-4 rounded-t-[48%] border border-[#f0d5a0]/70"/></div>
        <div className="absolute left-[22%] top-0 h-[210px] w-[120px] rounded-t-[50%] border-[9px] border-[#637f75] opacity-85"/>
        <div className="relative z-10 flex items-end gap-1.5">
          {[['#b8704c','The art of noticing',146],['#315a49','A field guide to wonder',190],['#d0a953','On keeping a notebook',168],['#627f86','Small histories',205],['#a45f56','The long way home',178],['#e3d1a5','',118]].map(([c,t,h],i)=><div key={String(t)} style={{backgroundColor:String(c),height:Number(h)}} className={`relative w-[43px] rounded-t-sm border-l border-white/20 shadow-[5px_3px_8px_rgba(42,35,24,.18)] md:w-[57px] ${i===2?'-rotate-2':''}`}><span className="absolute inset-x-1 top-4 text-center font-serif text-[10px] leading-tight text-[#fff8e8] [writing-mode:vertical-rl]">{t}</span><span className="absolute bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#f4dfaa]/70"/></div>)}
        </div>
        <div className="absolute bottom-[69px] right-[10%] h-10 w-12 rounded-full bg-[#d2ad63] shadow-inner"/><div className="absolute bottom-[107px] right-[15%] h-[110px] w-1 bg-[#8c6a3d]"/><div className="absolute bottom-[202px] right-[9.5%] h-10 w-10 rounded-full bg-[#dfbe79] shadow-[0_0_30px_#e4cc91]"/>
        <span className="absolute left-[9%] top-0 font-serif text-5xl text-[#bd995d]">“</span><span className="absolute bottom-[84px] right-[2%] rotate-6 font-mono text-[9px] uppercase tracking-[.2em] text-[#896c4e]">est. for readers</span>
      </div>
    </section>
    <section className="mx-auto grid max-w-[1200px] gap-10 px-6 py-20 md:grid-cols-[.7fr_1.3fr] md:px-12 md:py-28">
      <div><span className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a2744e]">A little less forgetful</span><h2 className="mt-4 font-serif text-4xl leading-tight text-[#274b3b]">Your books deserve<br/>more than a list.</h2></div>
      <div className="grid gap-8 sm:grid-cols-3">{[['01','Remember the feeling','Keep a note, a mood, or a line that stayed with you.'],['02','See your reading life','A thoughtful record of what you finished and what you loved.'],['03','Find your next story','Let your shelves surprise you, by mood or by chance.']].map(([num,title,body])=><article key={num} className="border-t border-[#c8bda8] pt-4"><span className="font-mono text-[10px] text-[#ae8353]">{num}</span><h3 className="mt-5 font-serif text-2xl">{title}</h3><p className="mt-3 text-sm leading-6 text-[#667467]">{body}</p></article>)}</div>
    </section>
    <footer className="border-t border-[#d9d0bd] px-6 py-8 text-center font-mono text-[9px] uppercase tracking-[.2em] text-[#7c8879]">A private library, for the stories that stay.</footer>
  </div>;
}

function RouteGate({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div className="min-h-[100dvh] bg-[#f2efe5] p-10"><div className="mx-auto max-w-5xl space-y-5"><div className="h-10 w-48 animate-pulse rounded bg-[#e4dfd2]"/><div className="h-48 animate-pulse rounded-2xl bg-[#e4dfd2]"/></div></div>;
  return isSignedIn ? <>{children}</> : <Redirect to="/"/>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { mutate: ensureCurrentUser } = useEnsureCurrentUser();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) qc.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  useEffect(() => {
    if (isLoaded && isSignedIn && user?.id) ensureCurrentUser();
  }, [ensureCurrentUser, isLoaded, isSignedIn, user?.id]);
  return null;
}

function PageTitle({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 font-mono text-[9px] uppercase tracking-[.2em] text-[#9a7950]">{eyebrow}</p><h1 className="font-serif text-5xl leading-none tracking-[-.03em] text-[#274b3b] md:text-6xl">{title}</h1><p className="mt-3 max-w-xl text-sm text-[#718075]">{sub}</p></div>{action}</div>;
}
function Stat({ label, value, note, color = 'gold' }: { label: string; value: string | number; note: string; color?: string }) {
  return <div className="relative overflow-hidden rounded-2xl border border-[#ded7c8] bg-[#faf8f1] p-5"><span className={`absolute right-0 top-0 h-1 w-20 ${color === 'rust' ? 'bg-[#b8755b]' : color === 'sage' ? 'bg-[#668674]' : 'bg-[#d0ae66]'}`}/><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#7d8b7d]">{label}</p><p className="mt-3 font-serif text-4xl text-[#294b3a]">{value}</p><p className="mt-1 text-[11px] text-[#8b9588]">{note}</p></div>;
}
function ErrorMessage({ retry }: { retry: () => void }) {
  return <div className="rounded-2xl border border-[#e4c8be] bg-[#fbefeb] p-7 text-center"><CircleHelp className="mx-auto text-[#ad6553]" size={25}/><p className="mt-3 font-serif text-2xl text-[#623e32]">The shelves are taking a moment.</p><p className="mt-1 text-sm text-[#7f625a]">We couldn't bring this page in just now.</p><button onClick={retry} className="mt-4 rounded-full bg-[#285342] px-5 py-2 text-xs text-white">Try again</button></div>;
}
function SkeletonGrid() { return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({length:10},(_,i)=><div key={i} className="animate-pulse"><div className="aspect-[.68] rounded-lg bg-[#e2ddcf]"/><div className="mt-3 h-4 w-3/4 rounded bg-[#e2ddcf]"/><div className="mt-2 h-3 w-1/2 rounded bg-[#e2ddcf]"/></div>)}</div>; }

function Dashboard() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const books = useListBooks({ sort: 'newest' }, { query: { queryKey: getListBooksQueryKey({sort:'newest'}) } });
  const data = summary.data;
  return <AppShell section="/dashboard"><PageTitle eyebrow="Welcome to your reading room" title="A life in books." sub="A small portrait of what you've read, what you own, and what is waiting."/>
    {summary.isLoading ? <div className="grid animate-pulse grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(i=><div key={i} className="h-32 rounded-2xl bg-[#e2ddcf]"/>)}</div> : summary.isError ? <ErrorMessage retry={()=>summary.refetch()}/> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="In your library" value={data?.totalBooks ?? 0} note="A growing collection"/><Stat label="Read & remembered" value={data?.readCount ?? 0} note={`${(data?.totalPagesRead ?? 0).toLocaleString()} pages turned`} color="sage"/><Stat label="Still to discover" value={data?.wantToReadCount ?? 0} note="Your future reading" color="rust"/><Stat label="Average rating" value={data?.averageRating ? `${data.averageRating.toFixed(1)} / 5` : '—'} note="From your finished books"/></div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-[#ded7c8] bg-[#faf8f1] p-6 md:p-8"><div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a17d50]">A chapter at a time</p><h2 className="mt-2 font-serif text-3xl">Your reading rhythm</h2></div><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e8e0cf] text-[#42634f]"><Feather size={19}/></span></div>
          <div className="flex h-40 items-end gap-3 border-b border-[#ded8ca] pb-3">{Array.from({length:8},(_,i)=>{const n=data?.monthlyReadCount ? Math.max(8, Math.min(100, ((i+1)*13 + data.monthlyReadCount*7)%86)) : 8;return <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="flex h-[125px] w-full items-end"><div style={{height:`${n}%`}} className={`w-full rounded-t-[4px] transition-all ${i===7?'bg-[#b8755b]':'bg-[#71917e]'}`}/></div><span className="font-mono text-[8px] uppercase text-[#8a9487]">{['J','F','M','A','M','J','J','A'][i]}</span></div>})}</div>
          <p className="mt-4 text-xs text-[#718075]"><strong className="font-semibold text-[#315744]">{data?.monthlyReadCount ?? 0} books</strong> finished this month. Each one leaves a mark.</p>
        </section>
        <section className="rounded-2xl bg-[#284d3d] p-6 text-[#f2ecdc] md:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#d4bd83]">Your shelves, in color</p><h2 className="mt-2 font-serif text-3xl">Genres you wander</h2></div><Sparkles size={19} className="text-[#d7bc78]"/></div>
          {data?.genreBreakdown?.length ? <div className="mt-7 space-y-4">{data.genreBreakdown.slice(0,5).map((g,i)=><div key={g.genre}><div className="mb-1.5 flex justify-between text-xs"><span>{g.genre}</span><span className="font-mono text-[10px] text-[#b7c5b8]">{g.count}</span></div><div className="h-[5px] overflow-hidden rounded-full bg-[#ffffff20]"><div style={{width:`${Math.max(8,g.count/Math.max(...data.genreBreakdown.map(x=>x.count))*100)}%`,background:genreTones[i%genreTones.length]}} className="h-full rounded-full"/></div></div>)}</div> : <p className="mt-7 text-sm text-[#c3d0c3]">Your genre portrait will take shape as your library grows.</p>}
          <Link href="/books" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-[#e7d18f] no-underline">Browse your collection <ArrowRight size={14}/></Link>
        </section>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-[#ded7c8] bg-[#ebe3d3] p-6"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a17d50]">The book that lingered</p><div className="mt-5 flex items-center gap-5">{data?.longestReadBook ? <><Cover book={data.longestReadBook} className="h-[105px] w-[72px] shrink-0 rounded-md shadow-md"/><div><h3 className="font-serif text-2xl leading-tight">{data.longestReadBook.title}</h3><p className="mt-1 text-xs text-[#758175]">{data.longestReadBook.author}</p><p className="mt-4 font-mono text-[10px] text-[#9a7950]">{data.longestReadBook.pages || '—'} pages • your longest read</p></div></> : <div className="py-5"><p className="font-serif text-2xl">Long stories are ahead.</p><p className="mt-2 text-sm text-[#718075]">Finish a book to see it celebrated here.</p></div>}</div></section>
        <section className="rounded-2xl border border-[#ded7c8] bg-[#faf8f1] p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#a17d50]">Recently shelved</p><h2 className="mt-1 font-serif text-2xl">A few new arrivals</h2></div><Link href="/books" className="text-xs font-semibold text-[#315744] no-underline">View library <ArrowRight size={13} className="ml-1 inline"/></Link></div>
          {books.isLoading ? <div className="mt-5 h-24 animate-pulse rounded-xl bg-[#e8e3d7]"/> : books.isError ? <p className="mt-5 text-sm text-[#8b665b]">Recent books are unavailable at the moment.</p> : books.data?.length ? <div className="mt-5 flex gap-4 overflow-x-auto pb-2">{books.data.slice(0,5).map(b=><Link key={b.id} href={`/books/${b.id}`} className="w-[82px] shrink-0 text-[#263e34] no-underline"><Cover book={b} className="aspect-[.68] w-full rounded-md shadow-sm"/><p className="mt-2 line-clamp-1 font-serif text-sm">{b.title}</p><p className="line-clamp-1 text-[10px] text-[#7d897e]">{b.author}</p></Link>)}</div> : <p className="mt-6 text-sm text-[#718075]">Your first book is waiting to be added.</p>}
        </section>
      </div>
    </>}
  </AppShell>;
}

function BookDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Book; onSaved?: () => void }) {
  const qc = useQueryClient();
  const saved = async(book:Book)=>{
    qc.setQueryData(getGetBookQueryKey(book.id),book);
    await refreshLibrary(qc);
    onSaved?.();
    onClose();
  };
  const create = useCreateBook({mutation:{onSuccess:saved}});
  const update = useUpdateBook({mutation:{onSuccess:saved}});
  const [title,setTitle]=useState(''); const [author,setAuthor]=useState(''); const [genre,setGenre]=useState('');
  const [validationAttempted,setValidationAttempted]=useState(false);
  const fieldErrors=validationAttempted?requiredBookErrors(title,author):{title:undefined,author:undefined};
  useEffect(()=>{if(open)setValidationAttempted(false);},[open,initial]);
  const [pages,setPages]=useState(''); const [rating,setRating]=useState(''); const [publishedYear,setPublishedYear]=useState('');
  const [startedOn,setStartedOn]=useState(''); const [finishedOn,setFinishedOn]=useState(''); const [coverUrl,setCoverUrl]=useState('');
  const [openLibraryId,setOpenLibraryId]=useState(''); const [status,setStatus]=useState<BookStatus>('want_to_read');
  const [isOwned,setIsOwned]=useState(false); const [isbn,setIsbn]=useState(''); const [description,setDescription]=useState('');
  const [moods,setMoods]=useState(''); const [notes,setNotes]=useState(''); const [catalogQuery,setCatalogQuery]=useState('');
  const searchParams = useMemo(()=>({q:catalogQuery.trim()}),[catalogQuery]);
  const catalog = useSearchCatalog(searchParams, {query:{queryKey:getSearchCatalogQueryKey(searchParams),enabled:searchParams.q.length >= 2}});
  useEffect(()=>{if(open){setTitle(initial?.title||'');setAuthor(initial?.authors?.join('; ')||initial?.author||'');setGenre(initial?.genre||'');setPages(initial?.pages?.toString()||'');setRating(initial?.rating?.toString()||'');setPublishedYear(initial?.publishedYear?.toString()||'');setStartedOn(initial?.startedOn?.slice(0,10)||'');setFinishedOn(initial?.finishedOn?.slice(0,10)||'');setCoverUrl(initial?.coverUrl||'');setOpenLibraryId(initial?.openLibraryId||'');setStatus(initial?.status||'want_to_read');setIsOwned(initial?.isOwned??false);setIsbn(initial?.isbn||'');setDescription(initial?.description||'');setMoods(initial?.moodTags?.join(', ')||'');setNotes(initial?.notes||'');setCatalogQuery('');}},[open,initial]);
  if (!open) return null;
  const applyCatalog=(b:CatalogBook)=>{setValidationAttempted(false);setTitle(b.title);setAuthor(b.author);setGenre(b.genre||'');setPages(b.pages?.toString()||'');setPublishedYear(b.publishedYear?.toString()||'');setCoverUrl(b.coverUrl||'');setOpenLibraryId(b.key);};
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();
    setValidationAttempted(true);
    const errors=requiredBookErrors(title,author);
    if(errors.title||errors.author){
      e.currentTarget.querySelector<HTMLInputElement>(errors.title?'#book-title':'#book-author')?.focus();
      return;
    }
    if(!e.currentTarget.reportValidity())return;
    const payload: BookInput = {title:title.trim(),author:author.trim(),authors:author.split(';').map(a=>a.trim()).filter(Boolean),genre:genre||null,pages:pages?Number(pages):null,rating:rating?Number(rating):null,status,isOwned,isbn:isbn||null,description:description||null,moodTags:moods.split(',').map(t=>t.trim()).filter(Boolean),notes:notes||null,coverUrl:coverUrl||null,openLibraryId:openLibraryId||null,publishedYear:publishedYear?Number(publishedYear):null,startedOn:startedOn||null,finishedOn:finishedOn||null};
    if(initial) update.mutate({id:initial.id,data:payload as BookUpdate});
    else create.mutate({data:payload});
  };
  const pending=create.isPending||update.isPending;
  const close=()=>{if(pending)return;create.reset();update.reset();onClose();};
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#1b3128]/55 p-3 backdrop-blur-sm" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby="book-form-title" aria-busy={pending} className="my-auto max-h-[94dvh] w-full max-w-[690px] overflow-y-auto rounded-[22px] border border-[#d9d0bd] bg-[#faf8f1] p-5 shadow-2xl md:p-8" onClick={e=>e.stopPropagation()}>
    <div className="flex items-start justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#a17d50]">{initial?'Update your record':'Add to your shelves'}</p><h2 id="book-form-title" className="mt-1 font-serif text-3xl">{initial?'Edit book details':'A new arrival'}</h2></div><button type="button" aria-label="Close book form" disabled={pending} onClick={close} className="rounded-full p-2 text-[#718075] hover:bg-[#eee8db]"><X size={19}/></button></div>
    {!initial&&<div className="mt-5"><label className="mb-2 block text-xs font-semibold text-[#526a59]">Find it in Open Library</label><div className="relative"><Search size={16} className="absolute left-3 top-3 text-[#829084]"/><input value={catalogQuery} onChange={e=>setCatalogQuery(e.target.value)} placeholder="Search by title or author" className="w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf8] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#71917e]" /></div>
      {catalogQuery.trim().length>=2 && <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-[#e2dccf] bg-[#fffdf8]">{catalog.isLoading?<p className="p-3 text-xs text-[#839084]">Looking through the catalog…</p>:catalog.isError?<p className="p-3 text-xs text-[#9a5e4d]">Catalog search is unavailable.</p>:catalog.data?.length?catalog.data.slice(0,5).map((b,i)=><button key={`${b.key}-${i}`} onClick={()=>applyCatalog(b)} className="flex w-full items-center justify-between border-b border-[#eee8dc] px-3 py-2 text-left last:border-0 hover:bg-[#f3eee3]"><span><strong className="block text-xs">{b.title}</strong><small className="text-[10px] text-[#7b897c]">{b.author}{b.publishedYear?` · ${b.publishedYear}`:''}</small></span><Plus size={14} className="text-[#58735f]"/></button>):<p className="p-3 text-xs text-[#839084]">No matching volumes yet. Add the details by hand below.</p>}</div>}
    </div>}
    <form noValidate className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}><fieldset disabled={pending} className="contents">
      <p className="sm:col-span-2 text-xs text-[#718075]">Fields marked * are required.</p>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Title <b className="text-[#b8755b]">*</b></span><input id="book-title" required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)} aria-invalid={!!fieldErrors.title} aria-describedby={fieldErrors.title?'book-title-error':undefined} className={`form-input ${fieldErrors.title?'!border-[#a7453c]':''}`} placeholder="The book's title"/>{fieldErrors.title&&<span id="book-title-error" role="alert" className="mt-1 block text-xs text-[#a7453c]">{fieldErrors.title}</span>}</label>
      <label><span className="mb-1.5 block text-xs font-semibold">Authors <b className="text-[#b8755b]">*</b></span><input id="book-author" required maxLength={2000} value={author} onChange={e=>setAuthor(e.target.value)} aria-invalid={!!fieldErrors.author} aria-describedby={fieldErrors.author?'book-author-error book-author-hint':'book-author-hint'} className={`form-input ${fieldErrors.author?'!border-[#a7453c]':''}`} placeholder="Separate authors with ;"/>{fieldErrors.author&&<span id="book-author-error" role="alert" className="mt-1 block text-xs text-[#a7453c]">{fieldErrors.author}</span>}<span id="book-author-hint" className="mt-1 block text-[10px] text-[#718075]">Use a semicolon between author names.</span></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Genre</span><input value={genre} onChange={e=>setGenre(e.target.value)} className="form-input" placeholder="Literary fiction, history…"/></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Pages</span><input type="number" min="1" value={pages} onChange={e=>setPages(e.target.value)} className="form-input" placeholder="—"/></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Rating</span><select value={rating} onChange={e=>setRating(e.target.value)} className="form-input"><option value="">Not rated</option>{[5,4,3,2,1].map(x=><option key={x} value={x}>{'★'.repeat(x)}{'☆'.repeat(5-x)} · {x}</option>)}</select></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Published year</span><input type="number" min="0" max="3000" value={publishedYear} onChange={e=>setPublishedYear(e.target.value)} className="form-input" placeholder="Optional"/></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Reading status</span><select value={status} onChange={e=>setStatus(e.target.value as BookStatus)} className="form-input">{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className="mb-1.5 block text-xs font-semibold">ISBN</span><input maxLength={32} value={isbn} onChange={e=>setIsbn(e.target.value)} className="form-input" placeholder="Optional; hyphens are fine"/></label>
      <label className="flex items-center gap-3 self-center text-sm text-[#526a59]"><input type="checkbox" data-testid="input-book-owned" checked={isOwned} onChange={e=>setIsOwned(e.target.checked)} className="h-4 w-4 accent-[#285342]"/>I own this book</label>
      <label><span className="mb-1.5 block text-xs font-semibold">Moods <span className="font-normal text-[#849083]">comma separated</span></span><input value={moods} onChange={e=>setMoods(e.target.value)} className="form-input" placeholder="wistful, absorbing"/></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Started on</span><input type="date" max={finishedOn||undefined} value={startedOn} onChange={e=>setStartedOn(e.target.value)} className="form-input"/></label>
      <label><span className="mb-1.5 block text-xs font-semibold">Finished on</span><input type="date" min={startedOn||undefined} value={finishedOn} onChange={e=>setFinishedOn(e.target.value)} className="form-input"/></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Cover image URL <span className="font-normal text-[#849083]">optional</span></span><input type="url" value={coverUrl} onChange={e=>setCoverUrl(e.target.value)} className="form-input" placeholder="https://…"/></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Book description</span><textarea maxLength={10000} rows={2} value={description} onChange={e=>setDescription(e.target.value)} className="form-input resize-y" placeholder="About this book"/></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Notes to your future self</span><textarea maxLength={10000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} className="form-input resize-y" placeholder="What would you like to remember?"/></label>
      {(create.isError||update.isError)&&<p className="sm:col-span-2 text-xs text-[#a7453c]">Could not save this book. Please check the details and try again.</p>}
      <div className="mt-1 flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={close} className="rounded-full px-5 py-2.5 text-xs font-semibold text-[#6b7a6e]">Cancel</button><button disabled={pending} className="rounded-full bg-[#285342] px-6 py-2.5 text-xs font-semibold text-[#fbf8f1] disabled:opacity-50">{pending?'Saving…':initial?'Save changes':'Add to library'}</button></div>
    </fieldset></form>
  </div></div>;
}

function BookCard({book,onEdit,onDelete}:{book:Book;onEdit:(b:Book)=>void;onDelete:(b:Book)=>void}) {
  return <article className="group relative min-w-0">
    <div className="relative"><Link href={`/books/${book.id}`} className="block no-underline"><Cover book={book} className="aspect-[.68] w-full rounded-md shadow-[2px_5px_12px_rgba(55,44,28,.16)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[5px_12px_20px_rgba(55,44,28,.2)]"/></Link>
      <StarBookButton book={book} compact/>
      <div className="absolute bottom-2 left-2 rounded-sm bg-[#f8f3e8e8] px-2 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-[#506958]">{statusLabels[book.status]}{book.isOwned?' · Owned':''}</div>
    </div>
    <div className="mt-3 flex items-start justify-between gap-1"><Link href={`/books/${book.id}`} className="min-w-0 text-[#263e34] no-underline"><h3 className="line-clamp-2 font-serif text-[18px] leading-[1.05]">{book.title}</h3><p className="mt-1.5 truncate text-[11px] text-[#788477]">{book.author}</p></Link><div className="flex gap-2"><button aria-label={`Edit ${book.title}`} onClick={()=>onEdit(book)} className="mt-1 text-[#8e988a] transition hover:text-[#315744] focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"><SlidersHorizontal size={15}/></button><button aria-label={`Remove ${book.title}`} onClick={()=>onDelete(book)} className="mt-1 text-[#a46b5c] transition hover:text-[#a7453c] focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Trash2 size={15}/></button></div></div>
    {book.rating&&<div className="mt-2 text-[10px] tracking-[.1em] text-[#b08443]">{'★'.repeat(book.rating)}<span className="text-[#d9d1c0]">{'☆'.repeat(5-book.rating)}</span></div>}
  </article>;
}

function BooksPage({starredView=false}:{starredView?:boolean}) {
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [genre,setGenre]=useState('all');const [starred,setStarred]=useState(false);const [sort,setSort]=useState<'newest'|'title'|'rating'|'pages'>('newest');
  const [deleting,setDeleting]=useState<Book|null>(null);
  const [ownedOnly,setOwnedOnly]=useState(false);
  const [modal,setModal]=useState(false);const [editing,setEditing]=useState<Book|undefined>();const [message,setMessage]=useState('');
  const params=useMemo<ListBooksParams>(()=>({search:search.trim()||undefined,status:status==='all'?undefined:status as BookStatus,genre:genre==='all'?undefined:genre,starredOnly:starredView||starred||undefined,isOwned:ownedOnly||undefined,sort}),[search,status,genre,starred,starredView,ownedOnly,sort]);
  useEffect(()=>{document.title=starredView?'Starred books | Marginalia':'My library | Marginalia';},[starredView]);
  const query=useListBooks(params,{query:{queryKey:getListBooksQueryKey(params)}});
  const library=useListBooks(undefined,{query:{queryKey:getListBooksQueryKey()}});
  const exportQuery=useExportBooks({query:{queryKey:getExportBooksQueryKey(),enabled:false}});
  const genreOptions=useMemo(()=>Array.from(new Set([...(library.data||[]).map(b=>b.genre),...(genre!=='all'?[genre]:[])].filter(Boolean) as string[])).sort(),[library.data,genre]);
  const hasFilters=Boolean(search.trim()||starred||ownedOnly||status!=='all'||genre!=='all');
  const clearFilters=()=>{setSearch('');setStatus('all');setGenre('all');setStarred(false);setOwnedOnly(false);setSort('newest');};
  const openEdit=(b:Book)=>{setEditing(b);setModal(true);};
  const closeModal=()=>{setModal(false);setEditing(undefined);};
  const deleteBook=(b:Book)=>setDeleting(b);
  const exportCsv=async()=>{const result=await exportQuery.refetch();if(result.data){const fields=Object.keys(result.data[0]||{title:'',author:'',genre:'',pages:'',rating:'',status:'',isOwned:'',isbn:'',description:'',moodTags:'',notes:'',startedOn:'',finishedOn:''});const esc=(v:unknown)=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`;const csv=[fields.join(','),...result.data.map(row=>fields.map(k=>esc((row as unknown as Record<string,unknown>)[k])).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='marginalia-library.csv';a.click();URL.revokeObjectURL(url);setMessage('Your library export is ready.');}};
  return <AppShell section={starredView?'/starred':'/books'}><PageTitle eyebrow={starredView?'Your favorites':'The catalog'} title={starredView?'Starred books.':'My library.'} sub={starredView?'Books you have starred, kept together in one private view. Unstar a book to remove it from this view, not your library.':'Every volume has a place. Search your shelves, sort the story, or add something new.'} action={<button onClick={()=>{setEditing(undefined);setModal(true);}} className="inline-flex items-center gap-2 rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#fbf8f1] hover:bg-[#1f4536]"><Plus size={16}/> Add a book</button>}/>
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#ded7c8] bg-[#faf8f1] p-3 md:flex-row md:items-center">
      <div className="relative min-w-[210px] flex-1"><Search size={16} className="absolute left-3 top-3 text-[#829084]"/><input aria-label="Search books" data-testid="input-book-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title or author…" className="form-input !border-0 !bg-transparent !pl-9"/></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)} className="filter-select"><option value="all">All shelves</option>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Filter by genre" value={genre} onChange={e=>setGenre(e.target.value)} className="filter-select"><option value="all">Every genre</option>{genreOptions.map(g=><option key={g} value={g}>{g}</option>)}</select>
        <select aria-label="Sort books" value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="filter-select"><option value="newest">Newest first</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option><option value="pages">Most pages first</option></select>
        {!starredView&&<button aria-pressed={starred} onClick={()=>setStarred(!starred)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] ${starred?'border-[#d0ae66] bg-[#f4e8c7] text-[#755c2d]':'border-[#ded7c8] text-[#758075]'}`}><Star size={13} fill={starred?'currentColor':'none'}/> Starred only</button>}
        <button disabled={exportQuery.isFetching} onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-full border border-[#ded7c8] px-3 py-2 text-[11px] text-[#526a59] hover:bg-[#eee8dc]"><Download size={13}/>{exportQuery.isFetching?'Preparing…':'Export CSV'}</button>
      </div>
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-xs text-[#526a59]"><input type="checkbox" checked={ownedOnly} onChange={e=>setOwnedOnly(e.target.checked)} className="accent-[#285342]"/>Show only books I own</label>
      {(hasFilters||sort!=='newest')&&<button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#526a59] underline underline-offset-4">Reset search, filters & sort</button>}
    </div>
    {query.isFetching&&!query.isLoading&&<p role="status" className="mb-3 text-xs text-[#718075]">Updating results…</p>}
    {message&&<div className="mb-4 flex items-center justify-between rounded-xl bg-[#e5ecdf] px-4 py-2.5 text-xs text-[#42634f]"><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss message"><X size={14}/></button></div>}
    {query.isLoading?<SkeletonGrid/>:query.isError?<ErrorMessage retry={()=>query.refetch()}/>:query.data?.length?<><p className="mb-5 font-mono text-[9px] uppercase tracking-[.17em] text-[#869084]">{query.data.length} {query.data.length===1?'volume':'volumes'} in view</p><div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{query.data.map(book=><BookCard key={book.id} book={book} onEdit={openEdit} onDelete={deleteBook}/>)}</div></>:<div className="rounded-[24px] border border-dashed border-[#cfc6b4] bg-[#f8f5eb] px-6 py-14 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e9e2d3] text-[#62806d]">{starredView?<Star size={25}/>:<BookOpen size={25}/>}</div>
      <h2 className="mt-5 font-serif text-3xl text-[#315744]">{hasFilters?'No books match these filters.':starredView?'No starred books yet.':'The shelves are waiting.'}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#778477]">{hasFilters?'Try another search or loosen your filters.':starredView?'Tap the star on any book in your library to find it here.':'Begin with the book beside your bed, the one you finished last month, or a story you cannot wait to open.'}</p>
      {starredView&&!hasFilters?<Link href="/books" className="mt-6 inline-flex rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#fbf8f1] no-underline">Browse my library</Link>:<button onClick={()=>{clearFilters();if(!hasFilters){setEditing(undefined);setModal(true);}}} className="mt-6 rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#fbf8f1]">{hasFilters?'Clear filters':'Add your first book'}</button>}
    </div>}
    <DeleteBookDialog book={deleting} onClose={()=>setDeleting(null)} onDeleted={()=>setMessage('Book removed from your library.')}/>
    <BookDialog open={modal} initial={editing} onClose={closeModal} onSaved={()=>setMessage(editing?'Changes saved.':'Book added to your library.')}/>
  </AppShell>;
}

function BookDetail({id}:{id:number}) {
  const qc=useQueryClient();const query=useGetBook(id,{query:{queryKey:getGetBookQueryKey(id),enabled:Number.isFinite(id),retry:false}});const update=useUpdateBook();
  const [editing,setEditing]=useState(false);const [confirmDelete,setConfirmDelete]=useState(false);const [,setLocation]=useLocation();
  const book=query.data;
  const changeStatus=(status:BookStatus)=>{if(!book)return;update.mutate({id,data:{status}},{onSuccess:()=>{qc.invalidateQueries({queryKey:getGetBookQueryKey(id)});qc.invalidateQueries({queryKey:getListBooksQueryKey()});qc.invalidateQueries({queryKey:getGetDashboardSummaryQueryKey()});}});};
  if(query.isLoading)return <AppShell section="/books"><div className="grid animate-pulse gap-8 md:grid-cols-[260px_1fr]"><div className="aspect-[.68] rounded-xl bg-[#e2ddcf]"/><div className="h-64 rounded-xl bg-[#e2ddcf]"/></div></AppShell>;
  if(query.isError&&query.error.status!==404)return <AppShell section="/books"><ErrorMessage retry={()=>query.refetch()}/></AppShell>;
  if(!book||query.isError)return <AppShell section="/books"><div role="status" className="rounded-[24px] border border-dashed border-[#cfc6b4] bg-[#f8f5eb] px-6 py-14 text-center"><h1 className="font-serif text-3xl text-[#315744]">Book not found</h1><p className="mt-3 text-sm text-[#778477]">This book is no longer in your library.</p><Link href="/books" className="mt-6 inline-flex rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#fbf8f1]">Back to your library</Link></div></AppShell>;
  return <AppShell section="/books"><Link href="/books" className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-[#65806b] no-underline"><ArrowLeft size={15}/> Back to your library</Link>
    <div className="grid gap-8 md:grid-cols-[minmax(190px,290px)_1fr] md:gap-14"><div><Cover book={book} className="mx-auto aspect-[.68] w-[min(78%,290px)] rounded-lg shadow-[8px_14px_35px_rgba(45,39,27,.2)] md:mx-0 md:w-full"/><div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start"><StarBookButton book={book}/><button onClick={()=>setEditing(true)} className="rounded-full border border-[#d8d2c4] px-4 py-2 text-xs text-[#526a59]">Edit details</button></div></div>
      <div className="pt-2"><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#a17d50]">{book.genre||'From your collection'} {book.publishedYear?` · ${book.publishedYear}`:''}</p><h1 className="mt-3 max-w-3xl font-serif text-5xl leading-[.95] tracking-[-.035em] text-[#274b3b] md:text-7xl">{book.title}</h1><p className="mt-4 font-serif text-2xl text-[#788477]">{book.author}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">{book.rating&&<span className="tracking-[.14em] text-[#b08443]">{'★'.repeat(book.rating)}<span className="text-[#d9d1c0]">{'☆'.repeat(5-book.rating)}</span></span>}<span className="rounded-full bg-[#e7e1d3] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.12em] text-[#57705d]">{statusLabels[book.status]}</span>{book.pages&&<span className="font-mono text-[10px] text-[#839084]">{book.pages} pages</span>}</div>
        <div className="mt-8 max-w-[760px] border-y border-[#ded7c8] py-5"><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#a17d50]">Where this story sits</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries(statusLabels).map(([value,label])=><button key={value} onClick={()=>changeStatus(value as BookStatus)} className={`rounded-full border px-4 py-2 text-xs transition ${book.status===value?'border-[#315744] bg-[#315744] text-[#f8f2e3]':'border-[#d8d2c4] text-[#526a59] hover:bg-[#e8e3d7]'}`}>{book.status===value&&<Check className="mr-1 inline" size={13}/>} {label}</button>)}</div></div>
        <p className="mt-5 text-sm text-[#526a59]">{book.isOwned?'Owned · In your collection':'Not owned'}{book.isbn?` · ISBN ${book.isbn}`:''}</p>
        {book.description&&<p className="mt-4 max-w-[760px] whitespace-pre-wrap text-sm leading-6 text-[#526a59]">{book.description}</p>}
        <div className="mt-7 grid max-w-[760px] gap-5 sm:grid-cols-2"><div><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#a17d50]">Reading dates</p><p className="mt-2 text-sm text-[#526a59]">{book.startedOn?`Started ${prettyDate(book.startedOn)}`:'No start date recorded'}{book.finishedOn?` · finished ${prettyDate(book.finishedOn)}`:''}</p></div>{book.moodTags?.length>0&&<div><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#a17d50]">The feeling</p><div className="mt-2 flex flex-wrap gap-2">{book.moodTags.map(tag=><span key={tag} className="rounded-full bg-[#e7e1d3] px-3 py-1 text-[11px] text-[#526a59]">{tag}</span>)}</div></div>}</div>
        <div className="mt-8 max-w-[760px] rounded-2xl bg-[#ebe4d6] p-5 md:p-7"><p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#a17d50]">Notes to self</p><p className="mt-3 whitespace-pre-wrap font-serif text-xl leading-relaxed text-[#3b5a47]">{book.notes||'Nothing written down yet. A sentence, a thought, a favorite passage — leave a note for the reader you will be later.'}</p></div>
        <div className="mt-6"><button onClick={()=>setConfirmDelete(true)} className="inline-flex items-center gap-2 text-xs text-[#a35e4d]"><Trash2 size={14}/> Remove from my library</button>{update.isError&&<p className="mt-2 text-xs text-[#a7453c]">That change could not be saved.</p>}</div>
      </div></div>
    <BookDialog open={editing} initial={book} onClose={()=>setEditing(false)}/>
    <DeleteBookDialog book={confirmDelete?book:null} onClose={()=>setConfirmDelete(false)} onDeleted={()=>setLocation('/books')}/>
  </AppShell>;
}

function Shelf() {
  const books=useListBooks({status:'read',sort:'newest'},{query:{queryKey:getListBooksQueryKey({status:'read',sort:'newest'})}});
  const [active,setActive]=useState<Book|null>(null);
  const read=books.data||[];
  return <AppShell section="/shelf"><PageTitle eyebrow="The finished shelf" title="Read & kept." sub="The books that made it all the way through — and stayed with you."/>
    {books.isLoading?<SkeletonGrid/>:books.isError?<ErrorMessage retry={()=>books.refetch()}/>:read.length?<><div className="mb-7 flex items-center gap-3 border-b border-[#d7d0c1] pb-4"><span className="font-serif text-3xl text-[#315744]">{read.length}</span><span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#859084]">finished volumes</span><span className="ml-auto font-mono text-[10px] text-[#8b9588]">{read.reduce((n,b)=>n+(b.pages||0),0).toLocaleString()} pages in all</span></div><div className="relative grid grid-cols-2 gap-x-5 gap-y-10 rounded-[22px] border border-[#d6c7ac] bg-[#e7dcc7] p-5 sm:grid-cols-3 md:p-8 lg:grid-cols-5">{read.map((book,i)=><button key={book.id} onClick={()=>setActive(book)} className={`group text-left ${i%4===1?'mt-3':''}`}><Cover book={book} className="aspect-[.68] w-full rounded-md shadow-[3px_6px_10px_rgba(55,44,28,.2)] transition group-hover:-translate-y-1"/><p className="mt-3 line-clamp-1 font-serif text-lg text-[#344e3e]">{book.title}</p><p className="mt-1 text-[11px] text-[#7d8376]">{book.author}</p>{book.rating&&<span className="mt-1 block text-[10px] tracking-widest text-[#ad8549]">{'★'.repeat(book.rating)}</span>}</button>)}</div><p className="mt-5 text-center font-serif italic text-sm text-[#899080]">A record of where your mind has been.</p></>:<div className="rounded-[24px] border border-dashed border-[#cfc6b4] bg-[#f8f5eb] px-6 py-16 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e9e2d3] text-[#62806d]"><Bookmark size={24}/></div><h2 className="mt-5 font-serif text-3xl">The finished shelf is still open.</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#778477]">When you mark a book as read, it finds its way here. Your reading history deserves a shelf of its own.</p><Link href="/books" className="mt-6 inline-block rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#fbf8f1] no-underline">Visit your library</Link></div>}
    {active&&<div className="fixed inset-0 z-50 grid place-items-center bg-[#1b3128]/55 p-4" onClick={()=>setActive(null)}><div onClick={e=>e.stopPropagation()} className="relative flex w-full max-w-xl gap-5 rounded-2xl bg-[#faf8f1] p-6"><button onClick={()=>setActive(null)} className="absolute right-3 top-3 text-[#788477]"><X size={18}/></button><Cover book={active} className="h-[180px] w-[122px] shrink-0 rounded shadow-md"/><div><p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#a17d50]">A book you finished</p><h2 className="mt-2 font-serif text-3xl">{active.title}</h2><p className="mt-1 text-sm text-[#788477]">{active.author}</p><p className="mt-4 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#526a59]">{active.notes||'No notes saved for this book.'}</p><Link href={`/books/${active.id}`} onClick={()=>setActive(null)} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#315744] no-underline">Open book record <ArrowRight size={14}/></Link></div></div></div>}
  </AppShell>;
}

function NextBook() {
  const [genre,setGenre]=useState('');const [maxPages,setMaxPages]=useState('');const [moodTag,setMoodTag]=useState('');const [pick,setPick]=useState(false);
  const params=useMemo<PickNextBookParams>(()=>({genre:genre||undefined,maxPages:maxPages?Number(maxPages):undefined,moodTag:moodTag||undefined}),[genre,maxPages,moodTag]);
  const selection=usePickNextBook(params,{query:{queryKey:getPickNextBookQueryKey(params),enabled:pick}});
  const book=selection.data?.book;
  const list=useListBooks({}, {query:{queryKey:getListBooksQueryKey()}});
  const genreOptions=Array.from(new Set((list.data||[]).filter(b=>b.status==='want_to_read').map(b=>b.genre).filter(Boolean) as string[])).sort();
  const moods=Array.from(new Set((list.data||[]).filter(b=>b.status==='want_to_read').flatMap(b=>b.moodTags||[]))).sort();
  const choose=()=>{setPick(true);selection.refetch();};
  return <AppShell section="/next"><PageTitle eyebrow="The open question" title="What shall I read?" sub="Let the unread shelf surprise you, or give fate a few gentle boundaries."/>
    <div className="grid gap-7 xl:grid-cols-[.85fr_1.15fr]">
      <section className="relative overflow-hidden rounded-[26px] bg-[#294f3e] p-6 text-[#f4efdf] md:p-9"><div className="absolute -right-10 -top-8 h-52 w-52 rounded-full border border-[#e3ca8c30]"/><div className="absolute -right-4 -top-2 h-36 w-36 rounded-full border border-[#e3ca8c30]"/><p className="relative font-mono text-[9px] uppercase tracking-[.2em] text-[#d4bd83]">A considered surprise</p><h2 className="relative mt-3 max-w-sm font-serif text-4xl leading-tight">Make room for a story.</h2><p className="relative mt-3 max-w-sm text-sm leading-6 text-[#c6d1c5]">Choose a mood, set a page limit, or leave the decision entirely to chance.</p>
        <div className="relative mt-8 space-y-5"><label className="block"><span className="mb-2 block font-mono text-[9px] uppercase tracking-[.15em] text-[#c0cfbf]">Genre, if you like</span><select value={genre} onChange={e=>setGenre(e.target.value)} className="w-full rounded-xl border border-white/20 bg-[#1e4435] px-3 py-3 text-sm text-[#f4efdf] outline-none"><option value="">Surprise me</option>{genreOptions.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
          <label className="block"><span className="mb-2 block font-mono text-[9px] uppercase tracking-[.15em] text-[#c0cfbf]">A comfortable page count</span><input type="number" min="1" value={maxPages} onChange={e=>setMaxPages(e.target.value)} placeholder="Any length" className="w-full rounded-xl border border-white/20 bg-[#1e4435] px-3 py-3 text-sm text-[#f4efdf] outline-none placeholder:text-[#afc0b2]"/></label>
          <label className="block"><span className="mb-2 block font-mono text-[9px] uppercase tracking-[.15em] text-[#c0cfbf]">A mood to match</span><select value={moodTag} onChange={e=>setMoodTag(e.target.value)} className="w-full rounded-xl border border-white/20 bg-[#1e4435] px-3 py-3 text-sm text-[#f4efdf] outline-none"><option value="">Any feeling</option>{moods.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          <button onClick={choose} disabled={selection.isFetching} className="mt-1 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#e0c77f] px-5 py-3.5 text-sm font-semibold text-[#294b39] transition hover:-translate-y-0.5 hover:bg-[#ead696] disabled:opacity-60"><Sparkles size={16}/>{selection.isFetching?'Turning the pages…':'Choose my next book'}</button>
        </div>
      </section>
      <section className="flex min-h-[430px] items-center justify-center rounded-[26px] border border-[#ded7c8] bg-[#faf8f1] p-6 md:p-10">
        {selection.isLoading?<div className="flex w-full animate-pulse gap-6"><div className="aspect-[.68] w-40 rounded bg-[#e2ddcf]"/><div className="h-40 flex-1 rounded bg-[#e2ddcf]"/></div>:selection.isError?<div className="text-center"><CircleHelp size={25} className="mx-auto text-[#b8755b]"/><h3 className="mt-4 font-serif text-3xl">The shelves are quiet.</h3><p className="mt-2 text-sm text-[#718075]">We couldn't find a pick just now.</p><button onClick={()=>selection.refetch()} className="mt-5 rounded-full bg-[#285342] px-5 py-2.5 text-xs text-white">Try again</button></div>:book?<div className="grid w-full items-center gap-7 sm:grid-cols-[minmax(140px,210px)_1fr]"><Cover book={book} className="mx-auto aspect-[.68] w-full max-w-[210px] rounded-lg shadow-[8px_14px_30px_rgba(45,39,27,.2)]"/><div><p className="font-mono text-[9px] uppercase tracking-[.19em] text-[#a17d50]">Your next chapter</p><h3 className="mt-3 font-serif text-4xl leading-[.95] text-[#274b3b]">{book.title}</h3><p className="mt-3 font-serif text-xl text-[#788477]">{book.author}</p><div className="mt-5 flex flex-wrap gap-2">{book.genre&&<span className="rounded-full bg-[#e8e1d3] px-3 py-1.5 text-[10px] text-[#526a59]">{book.genre}</span>}{book.pages&&<span className="rounded-full bg-[#e8e1d3] px-3 py-1.5 text-[10px] text-[#526a59]">{book.pages} pages</span>}{book.moodTags?.map(m=><span key={m} className="rounded-full bg-[#e8e1d3] px-3 py-1.5 text-[10px] text-[#526a59]">{m}</span>)}</div><Link href={`/books/${book.id}`} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#285342] px-5 py-3 text-xs font-semibold text-[#faf8f1] no-underline">Read the book record <ArrowRight size={14}/></Link><button onClick={choose} className="mt-4 block text-xs text-[#758477]">Pick another</button></div></div>:pick?<div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f2e5d2] text-[#b8755b]"><Compass size={23}/></div><h3 className="mt-5 font-serif text-3xl">No match on this shelf.</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#718075]">Try relaxing one of your filters, or add a few more books to your Want to read shelf.</p><button onClick={()=>{setGenre('');setMaxPages('');setMoodTag('');setPick(false);}} className="mt-5 rounded-full border border-[#d8d2c4] px-5 py-2.5 text-xs font-semibold text-[#526a59]">Clear filters</button></div>:<div className="max-w-sm text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e9e2d3] text-[#62806d]"><BookOpen size={26}/></span><p className="mt-5 font-mono text-[9px] uppercase tracking-[.2em] text-[#a17d50]">A little serendipity</p><h3 className="mt-2 font-serif text-3xl">The right book is in there.</h3><p className="mt-3 text-sm leading-6 text-[#718075]">When you're ready, draw one title from your Want to read shelf. The result will appear here.</p></div>}
      </section>
    </div>
  </AppShell>;
}

function SignInPage() { return <div className="library-paper flex min-h-[100dvh] items-center justify-center bg-[#f1eddf] px-4 py-10"><div className="absolute left-8 top-7"><Link href="/" className="flex items-center gap-2 font-serif text-xl text-[#234b39] no-underline"><BookOpen size={20}/> Marginalia</Link></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div>; }
function SignUpPage() { return <div className="library-paper flex min-h-[100dvh] items-center justify-center bg-[#f1eddf] px-4 py-10"><div className="absolute left-8 top-7"><Link href="/" className="flex items-center gap-2 font-serif text-xl text-[#234b39] no-underline"><BookOpen size={20}/> Marginalia</Link></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div>; }
function HomeRedirect(){return <><Show when="signed-in"><Redirect to="/dashboard"/></Show><Show when="signed-out"><HomePage/></Show></>;}
function ProtectedDashboard(){return <RouteGate><Dashboard/></RouteGate>;}
function ProtectedBooks(){return <RouteGate><BooksPage/></RouteGate>;}
function ProtectedStarred(){return <RouteGate><BooksPage starredView/></RouteGate>;}
function ProtectedShelf(){return <RouteGate><Shelf/></RouteGate>;}
function ProtectedNext(){return <RouteGate><NextBook/></RouteGate>;}
function ProtectedDetail(){const {id}=useParams<{id:string}>();return id?<RouteGate><BookDetail id={Number(id)}/></RouteGate>:<Redirect to="/books"/>;}
function NotFoundPage(){return <div className="grid min-h-[100dvh] place-items-center bg-[#f2efe5] p-6 text-center"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#a17d50]">A misplaced volume</p><h1 className="mt-3 font-serif text-5xl text-[#274b3b]">This page isn't on our shelves.</h1><Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#315744] no-underline">Return to the reading room <ArrowRight size={15}/></Link></div></div>;}

function ClerkRoutes(){
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back, reader',subtitle:'Your books are right where you left them.'}},signUp:{start:{title:'Make room for stories',subtitle:'Begin a reading life worth remembering.'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <QueryClientProvider client={queryClient}><TooltipProvider><ClerkQueryClientCacheInvalidator/><Switch>
      <Route path="/" component={HomeRedirect}/>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard" component={ProtectedDashboard}/>
      <Route path="/books" component={ProtectedBooks}/>
      <Route path="/starred" component={ProtectedStarred}/>
      <Route path="/books/:id" component={ProtectedDetail}/>
      <Route path="/shelf" component={ProtectedShelf}/>
      <Route path="/next" component={ProtectedNext}/>
      <Route component={NotFoundPage}/>
    </Switch><Toaster/></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}
function App(){return <WouterRouter base={basePath}><ClerkRoutes/></WouterRouter>;}
export default App;

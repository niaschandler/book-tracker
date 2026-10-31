import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/auth';
import { Download } from 'lucide-react';
import { getExportBooksQueryKey, useExportBooks } from '@workspace/api-client-react';

export function ExportLibraryButton() {
  const { userId } = useAuth();
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const helpId = useId();
  const query = useExportBooks({ query: { queryKey: getExportBooksQueryKey(), enabled: false, retry: false } });
  const download = async () => {
    if (locked.current || !userId) return;
    const owner = userId;
    locked.current = true;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      const [result, exporter] = await Promise.all([query.refetch(), import('@/lib/library-export')]);
      if (result.isError || !result.data) throw new Error('Could not load export data.');
      if (!mounted.current || ownerRef.current !== owner) return;
      const bytes = await exporter.createLibrarySpreadsheet(result.data);
      if (!mounted.current || ownerRef.current !== owner) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exporter.exportFilename();
      document.body.appendChild(anchor);
      try { anchor.click(); } finally {
        anchor.remove();
        // Give the browser time to begin the download before releasing its URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setNotice(`Download started for ${result.data.length} ${result.data.length === 1 ? 'book' : 'books'}. Check your Downloads folder for the Excel file.`);
    } catch {
      if (mounted.current && ownerRef.current === owner) {
        setFailed(true);
        setNotice('We couldn’t download your library. Your books are safe. Please try Export spreadsheet again.');
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <div className="flex max-w-sm flex-col gap-1.5">
    <button type="button" data-testid="button-export-library" disabled={busy}
      aria-busy={busy} aria-describedby={helpId} onClick={download}
      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#ded7c8] px-3 py-2 text-[11px] text-[#526a59] hover:bg-[#eee8dc] disabled:opacity-60">
      <Download size={13} aria-hidden="true"/>{busy ? 'Preparing spreadsheet…' : 'Export spreadsheet'}
    </button>
    <span id={helpId} className="text-[10px] text-[#718075]">Excel (.xlsx) · All your books, regardless of filters</span>
    {notice && <p data-testid={failed ? 'error-export-library' : 'status-export-library'}
      role={failed ? 'alert' : 'status'} className={`text-[11px] leading-5 ${failed ? 'text-[#a44e37]' : 'text-[#526a59]'}`}>{notice}</p>}
  </div>;
}

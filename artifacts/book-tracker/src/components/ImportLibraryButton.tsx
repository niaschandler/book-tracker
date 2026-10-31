import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import {
  usePreviewLibraryImport, useConfirmLibraryImport,
  type LibraryImportPreview, type LibraryImportRow,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { importFields, defaultImportMapping, mappedImportRows, type ImportMapping, type ImportSheet } from '@/lib/library-import';

const buttonClass = 'rounded-full border border-[#d6c29c] px-4 py-2 text-xs text-[#2d5a3d] hover:bg-[#eee8dc] disabled:opacity-50';

export function ImportLibraryButton() {
  const { userId } = useAuth();
  // User-keyed child ensures file data and previews never survive an account change.
  return userId ? <ImportLibraryFlow key={userId} owner={userId}/> : null;
}

function ImportLibraryFlow({ owner }: { owner: string }) {
  const { userId } = useAuth();
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const session = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; session.current++; };
  }, []);
  const locked = useRef(false);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<ImportSheet>();
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [preview, setPreview] = useState<LibraryImportPreview>();
  const [payload, setPayload] = useState<LibraryImportRow[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const previewMutation = usePreviewLibraryImport();
  const confirmMutation = useConfirmLibraryImport();
  const cache = useQueryClient();

  const reset = () => {
    session.current++;
    setSheet(undefined); setMapping({}); setPreview(undefined); setPayload(undefined); setError('');
  };
  const changeOpen = (value: boolean) => {
    if (locked.current) return;
    reset(); setOpen(value);
  };
  const run = async (work: (active: () => boolean) => Promise<void>) => {
    if (locked.current) return;
    const revision = session.current;
    const active = () => mounted.current && revision === session.current && currentOwner.current === owner;
    locked.current = true; setBusy(true); setError('');
    try { await work(active); } catch (cause) {
      if (active()) {
        const data = (cause as { data?: { error?: string } }).data;
        setError(data?.error || (cause instanceof Error ? cause.message : 'Import failed. Please try again.'));
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  return <div className="flex max-w-sm flex-col gap-1.5">
    <button type="button" className={`${buttonClass} inline-flex items-center justify-center gap-1.5`}
      data-testid="button-import-library" onClick={() => changeOpen(true)}><Upload size={13} aria-hidden="true"/>Import spreadsheet</button>
    <span className="text-[10px] text-[#76604f]">Excel (.xlsx) · Review before adding</span>
    {notice && <p role="status" className="text-[11px] text-[#5e4232]">{notice}</p>}
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-3xl bg-[#f8f0de]" aria-busy={busy}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogTitle>Bring your books into Reading Room</DialogTitle>
        <DialogDescription>Choose an Excel (.xlsx) reading list, including a Reading Room export. Nothing is saved until you confirm. Existing books are never overwritten.</DialogDescription>
        <label className="text-sm text-[#2d5a3d]">Reading list spreadsheet
          <input type="file" accept=".xlsx" disabled={busy} data-testid="input-import-file" className="mt-2 block w-full text-xs"
            onChange={event => {
              const file = event.target.files?.[0];
              reset();
              if (!file) return;
              void run(async active => {
                if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Choose an Excel (.xlsx) file.');
                if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
                const { readImportSpreadsheet } = await import('@/lib/library-import');
                const result = await readImportSpreadsheet(await file.arrayBuffer());
                if (active()) { setSheet(result); setMapping(defaultImportMapping(result.headers)); }
              });
            }}/>
        </label>
        {sheet && <>
          <p className="text-xs text-[#5e4232]">{sheet.rows.length} rows found. Match your columns below. Leave fields you don’t have as “Not imported”. Unmapped status defaults to Want to read; ownership and stars default to No. Source Book IDs are not used as local IDs.</p>
          <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Column mappings</legend>
            {importFields.map(([field, label]) => <label key={field} className="text-xs text-[#2d5a3d]">{label}{field === 'title' ? ' (required)' : ''}
              <select aria-label={`Map ${label}`} className="form-input mt-1" value={mapping[field] ?? ''}
                onChange={event => { setMapping(current => ({ ...current, [field]: event.target.value })); setPreview(undefined); setPayload(undefined); setError(''); }}>
                <option value="">Not imported</option>
                {sheet.headers.map((header, index) => <option key={index} value={String(index)}>{header || '(blank heading)'} · Column {index + 1}</option>)}
              </select>
              {mapping[field] !== '' && <span className="mt-1 block truncate text-[10px] text-[#76604f]">Example: {sheet.rows[0]?.cells[Number(mapping[field])] || '(blank)'}</span>}
            </label>)}
          </fieldset>
          <button type="button" className={buttonClass} disabled={busy} data-testid="button-preview-import"
            onClick={() => void run(async active => {
              const rows = mappedImportRows(sheet, mapping);
              setPreview(undefined); setPayload(undefined);
              if (JSON.stringify({ rows }).length > 9_000_000) throw new Error('The mapped text is too large. Split this spreadsheet into smaller files.');
              const result = await previewMutation.mutateAsync({ data: { rows } });
              if (active()) { setPayload(rows); setPreview(result); }
            })}>{busy ? 'Working…' : 'Preview import'}</button>
        </>}
        {preview && <>
          <div role="status" className="rounded-lg border border-[#d6c29c] p-3 text-sm">
            {preview.ready} ready to add · {preview.duplicates} duplicates skipped · {preview.invalid} invalid rows skipped
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-[#d6c29c]" tabIndex={0} aria-label="Import row preview">
            <table className="w-full text-left text-xs"><thead className="bg-[#eee8dc]"><tr><th className="p-2">Row</th><th className="p-2">Title</th><th className="p-2">Result</th></tr></thead>
              <tbody>{preview.rows.map((row, index) => <tr key={index} className="border-t border-[#d6c29c]">
                <td className="p-2">{row.row}</td><td className="p-2">{row.title}</td>
                <td className="p-2">{row.disposition === 'ready' ? 'Ready to add' : row.disposition === 'duplicate' ? 'Duplicate — skipped' : 'Invalid — skipped'}
                  {row.problems.map((problem, i) => <p key={i} className="mt-1 text-[#a44e37]">{problem}</p>)}</td>
              </tr>)}</tbody></table>
          </div>
          <p className="text-xs text-[#5e4232]">Only ready rows will be added. Fix invalid rows in your spreadsheet and choose the file again, or continue without them. Duplicates match ISBN, Open Library ID, or title and authors in your own library and earlier file rows.</p>
          <button type="button" data-testid="button-confirm-import" disabled={busy || !preview.ready}
            className="rounded-full bg-[#2d5a3d] px-5 py-3 text-sm text-white disabled:opacity-50"
            onClick={() => void run(async active => {
              if (!payload) return;
              const result = await confirmMutation.mutateAsync({ data: { rows: payload, previewToken: preview.previewToken } });
              if (!active()) return;
              await cache.invalidateQueries();
              setNotice(`Added ${result.imported} books. Skipped ${result.skipped} duplicate or invalid rows.`);
              reset(); setOpen(false);
            })}>{busy ? 'Working…' : `Confirm: add ${preview.ready} ${preview.ready === 1 ? 'book' : 'books'}`}</button>
        </>}
        {error && <p role="alert" className="text-sm text-[#a44e37]">{error}</p>}
        <button type="button" className={buttonClass} disabled={busy} onClick={() => changeOpen(false)}>Cancel</button>
      </DialogContent>
    </Dialog>
  </div>;
}

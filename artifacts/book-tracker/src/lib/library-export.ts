import ExcelJS from 'exceljs';
import type { BookExport } from '@workspace/api-client-react';

const statusLabels = { want_to_read: 'Want to read', reading: 'Reading', read: 'Read' };
const columns: { header: string; width: number; value: (book: BookExport) => string | number | null }[] = [
  { header: 'Book ID', width: 12, value: b => b.id },
  { header: 'Title', width: 40, value: b => b.title },
  { header: 'Author', width: 30, value: b => b.author },
  { header: 'Authors (JSON)', width: 35, value: b => JSON.stringify(b.authors) },
  { header: 'Genre', width: 22, value: b => b.genre ?? null },
  { header: 'Pages', width: 12, value: b => b.pages ?? null },
  { header: 'Rating (1–5)', width: 15, value: b => b.rating ?? null },
  { header: 'Reading status', width: 18, value: b => statusLabels[b.status] },
  { header: 'Status code', width: 18, value: b => b.status },
  { header: 'Owned', width: 12, value: b => b.isOwned ? 'Yes' : 'No' },
  { header: 'Starred', width: 12, value: b => b.starred ? 'Yes' : 'No' },
  { header: 'ISBN', width: 20, value: b => b.isbn ?? null },
  { header: 'Published year', width: 18, value: b => b.publishedYear ?? null },
  { header: 'Description', width: 50, value: b => b.description ?? null },
  { header: 'Mood tags (JSON)', width: 30, value: b => JSON.stringify(b.moodTags) },
  { header: 'Notes', width: 50, value: b => b.notes ?? null },
  { header: 'Started on', width: 16, value: b => b.startedOn ?? null },
  { header: 'Finished on', width: 16, value: b => b.finishedOn ?? null },
  { header: 'Cover image URL', width: 40, value: b => b.coverUrl ?? null },
  { header: 'Open Library ID', width: 22, value: b => b.openLibraryId ?? null },
  { header: 'Added at (UTC)', width: 28, value: b => b.createdAt },
  { header: 'Updated at (UTC)', width: 28, value: b => b.updatedAt },
];

export function exportFilename(at = new Date()): string {
  return `marginalia-library-${at.toISOString().slice(0, 10)}.xlsx`;
}

/** Literal strings, not formulas, preserve ISBNs and safely handle user-entered text. */
export async function createLibrarySpreadsheet(books: readonly BookExport[], at = new Date()): Promise<Uint8Array> {
  if (books.length > 1_048_575) throw new Error('This library exceeds the Excel row limit.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Marginalia';
  workbook.created = at;
  const sheet = workbook.addWorksheet('Books', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(({ header, width }) => ({ header, width }));
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: columns.length } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF285342' } };
  let longText: ExcelJS.Worksheet | undefined;
  for (const book of books) {
    const row = sheet.addRow(columns.map(column => {
      const value = column.value(book);
      if (typeof value !== 'string' || value.length <= 32767) return value;
      // Excel limits cell text to 32,767 characters. Keep all of longer notes in ordered parts.
      if (!longText) {
        longText = workbook.addWorksheet('Long text', { views: [{ state: 'frozen', ySplit: 1 }] });
        longText.columns = [
          { header: 'Book ID', width: 12 }, { header: 'Field', width: 25 },
          { header: 'Part', width: 10 }, { header: 'Text', width: 80 },
        ];
        longText.getRow(1).font = { bold: true };
      }
      let part = 1;
      for (let start = 0; start < value.length;) {
        let end = Math.min(start + 32000, value.length);
        const last = value.charCodeAt(end - 1);
        if (end < value.length && last >= 0xD800 && last <= 0xDBFF) end--;
        longText.addRow([book.id, column.header, part++, value.slice(start, end)]);
        start = end;
      }
      return `See Long text sheet: Book ID ${book.id}, field ${column.header} (${part - 1} parts).`;
    }));
    row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell(cell => { if (typeof cell.value === 'string') cell.numFmt = '@'; });
  }
  const info = workbook.addWorksheet('Read me');
  info.columns = [{ header: 'About this export', width: 28 }, { header: 'Details', width: 100 }];
  info.addRows([
    ['Exported at (UTC)', at.toISOString()],
    ['Books exported', books.length],
    ['Scope', 'Your complete library, including every status and unstarred books. Search and filters do not limit this export.'],
    ['Using this file', 'Open the Books sheet in Excel, Numbers, LibreOffice, or import this .xlsx file into Google Sheets.'],
    ['Blank cells', 'Optional details that you have not recorded are left blank.'],
    ['Authors and moods', 'JSON list columns preserve individual author names and mood tags exactly. The Author column is the readable combined name.'],
    ['Dates', 'Reading dates are saved as YYYY-MM-DD. Added and updated timestamps retain their original UTC values.'],
    ['Long text', 'If a field exceeds the Excel cell limit, its full text is preserved on Long text. Join its parts in numeric order for that Book ID and field.'],
    ['Safety', 'Saved text is exported as text, never as spreadsheet formulas. Exporting does not change or delete anything in your library.'],
  ]);
  info.getRow(1).font = { bold: true };
  info.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

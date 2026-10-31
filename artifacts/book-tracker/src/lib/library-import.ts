import type ExcelJS from 'exceljs';
import type { LibraryImportRow } from '@workspace/api-client-react';

export const importFields = [
  ['title', 'Title'], ['author', 'Author'], ['authors', 'Authors (JSON)'],
  ['genre', 'Genre'], ['pages', 'Pages'], ['rating', 'Rating (1–5)'],
  ['status', 'Reading status'], ['isOwned', 'Owned'], ['starred', 'Starred'],
  ['isbn', 'ISBN'], ['publishedYear', 'Published year'], ['description', 'Description'],
  ['moodTags', 'Mood tags (JSON)'], ['notes', 'Notes'], ['startedOn', 'Started on'],
  ['finishedOn', 'Finished on'], ['coverUrl', 'Cover image URL'], ['openLibraryId', 'Open Library ID'],
  ['createdAt', 'Added at (UTC)'], ['updatedAt', 'Updated at (UTC)'],
] as const;
export type ImportMapping = Record<string, string>;
export interface ImportSheet {
  headers: string[];
  rows: { row: number; cells: string[] }[];
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Never evaluate formulas, use cached formula results, or follow hyperlinks.
  throw new Error(`Cell ${cell.address} contains a formula or unsupported value. Replace it with plain text.`);
}

export async function readImportSpreadsheet(bytes: ArrayBuffer): Promise<ImportSheet> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('Choose an Excel file smaller than 10 MB.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes); } catch {
    throw new Error('This file could not be read. Choose an unencrypted Excel (.xlsx) spreadsheet.');
  }
  const sheet = workbook.getWorksheet('Books') ?? workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error('The spreadsheet has no books. Put column headings in the first row.');
  if (sheet.columnCount > 100) throw new Error('Use a spreadsheet with no more than 100 columns.');
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => cellText(sheet.getRow(1).getCell(index + 1)).trim());
  const rows: ImportSheet['rows'] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const cells = headers.map((_, index) => cellText(row.getCell(index + 1)));
    if (cells.some(value => value.trim())) rows.push({ row: number, cells });
    if (rows.length > 2000) throw new Error('Import up to 2,000 books at a time. Split this spreadsheet into smaller files.');
  });
  if (!rows.length) throw new Error('The spreadsheet has no book rows.');
  // Restore exported values split across Excel's cell-length limit.
  const longText = workbook.getWorksheet('Long text');
  if (longText) {
    const parts = new Map<string, Map<number, string>>();
    longText.eachRow((row, number) => {
      if (number === 1) return;
      const key = JSON.stringify([cellText(row.getCell(1)), cellText(row.getCell(2))]);
      const part = Number(cellText(row.getCell(3)));
      if (!Number.isInteger(part) || part < 1) throw new Error('Long text sheet has an invalid part number.');
      const group = parts.get(key) ?? new Map<number, string>();
      if (group.has(part)) throw new Error('Long text sheet has duplicate parts.');
      group.set(part, cellText(row.getCell(4)));
      parts.set(key, group);
    });
    const idColumn = headers.indexOf('Book ID');
    for (const row of rows) {
      row.cells = row.cells.map((value, column) => {
        if (!value.startsWith('See Long text sheet: Book ID ')) return value;
        const expected = value.match(/\((\d+) parts\)\.$/);
        const group = parts.get(JSON.stringify([row.cells[idColumn], headers[column]]));
        if (!expected || !group || group.size !== Number(expected[1])) throw new Error(`Row ${row.row}: missing Long text parts.`);
        return Array.from({ length: group.size }, (_, index) => {
          if (!group.has(index + 1)) throw new Error(`Row ${row.row}: missing Long text part ${index + 1}.`);
          return group.get(index + 1)!;
        }).join('');
      });
    }
  }
  if (rows.some(row => row.cells.some(value => value.startsWith('See Long text sheet: Book ID ')))) {
    throw new Error('This export is missing its Long text sheet. Include that sheet to preserve the complete text.');
  }
  return { headers, rows };
}

export function defaultImportMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const [field, label] of importFields) {
    const preferred = field === 'status' && headers.includes('Status code') ? 'Status code' : label;
    const index = headers.findIndex(header => header.toLowerCase() === preferred.toLowerCase());
    mapping[field] = index < 0 ? '' : String(index);
  }
  return mapping;
}

export function mappedImportRows(sheet: ImportSheet, mapping: ImportMapping): LibraryImportRow[] {
  if (mapping.title === '' || mapping.title === undefined || (!mapping.author && !mapping.authors)) {
    throw new Error('Map Title and either Author or Authors (JSON) before previewing.');
  }
  const selected = Object.entries(mapping).filter(([, column]) => column !== '');
  if (new Set(selected.map(([, column]) => column)).size !== selected.length) {
    throw new Error('Each spreadsheet column can be mapped only once.');
  }
  return sheet.rows.map(row => ({
    row: row.row,
    values: Object.fromEntries(selected.map(([field, column]) => [field, row.cells[Number(column)] ?? ''])),
  }));
}

import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import type { BookExport } from '@workspace/api-client-react';
import { ExportBooksResponse } from '../../../../lib/api-zod/src/index';
import { createLibrarySpreadsheet, exportFilename } from './library-export';

const book: BookExport = {
  id: 17, title: 'Café, "雨" 📚', author: 'Alex; Sam',
  authors: ['Alex; Example', 'Sam "Other"'], genre: 'Fantasy', pages: 402,
  rating: 5, status: 'read', isOwned: true, starred: true,
  isbn: '0000123456789', publishedYear: 2020,
  description: 'First line,\nSecond "line"', notes: '=HYPERLINK("https://example.com","text")',
  moodTags: ['cozy, warm', '夜🌙'], startedOn: '2026-10-01', finishedOn: '2026-10-12',
  coverUrl: 'https://example.com/cover.png', openLibraryId: 'OL123M',
  createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-12T12:34:56.000Z',
};
const at = new Date('2026-10-31T15:00:00Z');

async function read(books: BookExport[]) {
  const bytes = await createLibrarySpreadsheet(books, at);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet('Books')!;
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, i) => headers.set(String(cell.value), i));
  const cell = (name: string, row = 2) => sheet.getRow(row).getCell(headers.get(name)!);
  return { workbook, sheet, cell, bytes };
}

test('real XLSX round-trip retains all book fields and literal text safely', async () => {
  const { cell, sheet, bytes } = await read([book]);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  assert.equal(sheet.rowCount, 2);
  assert.equal(cell('Title').value, book.title);
  assert.equal(cell('Author').value, book.author);
  assert.deepEqual(JSON.parse(String(cell('Authors (JSON)').value)), book.authors);
  assert.deepEqual(JSON.parse(String(cell('Mood tags (JSON)').value)), book.moodTags);
  assert.equal(cell('Genre').value, book.genre);
  assert.equal(cell('Description').value, book.description);
  assert.equal(cell('Notes').value, book.notes);
  assert.equal(cell('Notes').type, ExcelJS.ValueType.String);
  assert.equal(cell('ISBN').value, book.isbn);
  assert.equal(cell('ISBN').type, ExcelJS.ValueType.String);
  assert.equal(cell('Pages').value, 402);
  assert.equal(cell('Rating (1–5)').value, 5);
  assert.equal(cell('Published year').value, 2020);
  assert.equal(cell('Book ID').value, 17);
  assert.equal(cell('Reading status').value, 'Read');
  assert.equal(cell('Status code').value, 'read');
  assert.equal(cell('Owned').value, 'Yes');
  assert.equal(cell('Starred').value, 'Yes');
  assert.equal(cell('Started on').value, book.startedOn);
  assert.equal(cell('Finished on').value, book.finishedOn);
  assert.equal(cell('Cover image URL').value, book.coverUrl);
  assert.equal(cell('Open Library ID').value, book.openLibraryId);
  assert.equal(cell('Added at (UTC)').value, book.createdAt);
  assert.equal(cell('Updated at (UTC)').value, book.updatedAt);
});

test('every supplied book is exported regardless of status, ownership, or stars', async () => {
  const rows = [book, { ...book, id: 18, status: 'want_to_read' as const, isOwned: false, starred: false },
    { ...book, id: 19, status: 'reading' as const }];
  const before = structuredClone(rows);
  const { sheet, cell } = await read(rows);
  assert.equal(sheet.rowCount, 4);
  assert.equal(cell('Reading status', 3).value, 'Want to read');
  assert.equal(cell('Reading status', 4).value, 'Reading');
  assert.equal(cell('Starred', 3).value, 'No');
  assert.equal(cell('Owned', 3).value, 'No');
  assert.deepEqual(rows, before);
});

test('empty libraries still get usable column headings and instructions', async () => {
  const { workbook, sheet } = await read([]);
  assert.equal(sheet.rowCount, 1);
  assert.equal(sheet.columnCount, 22);
  assert.equal(sheet.views[0].state, 'frozen');
  assert.ok(sheet.autoFilter);
  assert.ok(workbook.getWorksheet('Read me'));
});

test('missing optional data stays blank rather than becoming zero or undefined', async () => {
  const { cell } = await read([{ ...book, pages: null, rating: null, isbn: null, notes: null, genre: null }]);
  for (const heading of ['Pages', 'Rating (1–5)', 'ISBN', 'Notes', 'Genre']) assert.equal(cell(heading).value, null);
});

test('long notes are preserved completely in ordered continuation rows', async () => {
  const notes = 'a'.repeat(31999) + '📚\n=1+1' + '文'.repeat(40000);
  const { workbook, cell } = await read([{ ...book, notes }]);
  assert.match(String(cell('Notes').value), /See Long text sheet/);
  const sheet = workbook.getWorksheet('Long text')!;
  const parts: string[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    assert.equal(row.getCell(1).value, book.id);
    assert.equal(row.getCell(2).value, 'Notes');
    assert.equal(row.getCell(3).value, parts.length + 1);
    assert.ok(String(row.getCell(4).value).length <= 32767);
    parts.push(String(row.getCell(4).value));
  });
  assert.equal(parts.join(''), notes);
});

test('API contract retains complete export details and real star flags', () => {
  const data = ExportBooksResponse.parse([book]);
  // Express res.json serializes Zod's coerced Date values back to ISO strings.
  assert.deepEqual(JSON.parse(JSON.stringify(data))[0], book);
});

test('export filename is dated and ends in the correct spreadsheet extension', () => {
  assert.equal(exportFilename(at), 'marginalia-library-2026-10-31.xlsx');
});

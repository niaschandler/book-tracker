import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import type { BookExport } from '@workspace/api-client-react';
import { createLibrarySpreadsheet } from './library-export';
import { defaultImportMapping, mappedImportRows, readImportSpreadsheet } from './library-import';

const book: BookExport = {
  id: 42, title: '雨, Books 📚', author: 'Writer, Jr.', authors: ['Writer, Jr.', 'Other writer'],
  genre: 'History', pages: 210, rating: 5, status: 'read', isOwned: true, starred: true,
  isbn: '0000123456789', publishedYear: 2020, description: 'A description',
  notes: '=HYPERLINK("https://example.com", "not a formula")\nPrivate note',
  moodTags: ['cozy, warm', '夜🌙'], startedOn: '2026-01-01', finishedOn: '2026-01-03',
  coverUrl: 'https://example.com/cover.png', openLibraryId: 'OL42M',
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-03T12:00:00.000Z',
};
const arrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
test('export round-trip maps all data without interpreting source IDs or formula-like text', async () => {
  const sheet = await readImportSpreadsheet(arrayBuffer(await createLibrarySpreadsheet([book])));
  const mapping = defaultImportMapping(sheet.headers);
  const [row] = mappedImportRows(sheet, mapping);
  assert.equal(row.row, 2);
  assert.equal(row.values.title, book.title);
  assert.equal(row.values.authors, JSON.stringify(book.authors));
  assert.equal(row.values.moodTags, JSON.stringify(book.moodTags));
  assert.equal(row.values.status, book.status);
  assert.equal(row.values.notes, book.notes);
  assert.equal(row.values.isbn, book.isbn);
  assert.equal(row.values.starred, 'Yes');
  assert.equal(row.values.isOwned, 'Yes');
  assert.equal(row.values.createdAt, book.createdAt);
  assert.equal(row.values.id, undefined);
  assert.equal(row.values.bookId, undefined);
});
test('joins every long text part exactly, including emoji and formula-like strings', async () => {
  const notes = 'a'.repeat(31999) + '📚\n=1+1' + '文'.repeat(40000);
  const sheet = await readImportSpreadsheet(arrayBuffer(await createLibrarySpreadsheet([{ ...book, notes }])));
  assert.equal(mappedImportRows(sheet, defaultImportMapping(sheet.headers))[0].values.notes, notes);
});
test('custom headings can be mapped and missing/duplicate mappings are rejected', () => {
  const sheet = { headers: ['Writer', 'Work'], rows: [{ row: 3, cells: [' A ', ' B '] }] };
  assert.deepEqual(mappedImportRows(sheet, { author: '0', title: '1' }), [
    { row: 3, values: { author: ' A ', title: ' B ' } },
  ]);
  assert.throws(() => mappedImportRows(sheet, { title: '1', author: '' }), /Map Title/);
  assert.throws(() => mappedImportRows(sheet, { title: '1', author: '1' }), /only once/);
});
test('rejects corrupt, empty, actual formula, oversized, and incomplete long text files', async () => {
  await assert.rejects(readImportSpreadsheet(new ArrayBuffer(10 * 1024 * 1024 + 1)), /smaller/);
  await assert.rejects(readImportSpreadsheet(new ArrayBuffer(10)), /could not be read/);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Books');
  sheet.addRow(['Title', 'Author']);
  await assert.rejects(readImportSpreadsheet(arrayBuffer(new Uint8Array(await workbook.xlsx.writeBuffer()))), /no books/);
  sheet.addRow([{ formula: '1+1', result: 2 }, 'Author']);
  await assert.rejects(readImportSpreadsheet(arrayBuffer(new Uint8Array(await workbook.xlsx.writeBuffer()))), /formula/);
  sheet.getCell('A2').value = 'See Long text sheet: Book ID 42, field Title (2 parts).';
  await assert.rejects(readImportSpreadsheet(arrayBuffer(new Uint8Array(await workbook.xlsx.writeBuffer()))), /missing its Long text/);
});

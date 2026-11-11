import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { safeCell, toCSV, toXLSX } from '../src/utils/export.js';

const columns = [
  { header: 'Student', key: 'name' },
  { header: 'Score', key: 'score', format: 'number' },
  { header: 'Percentage', key: 'pct', format: 'percent' },
];

test('CSV has a BOM, CRLF lines, quoted cells and escaped quotes', () => {
  const csv = toCSV(columns, [{ name: 'Asha "AJ" Rao', score: 7, pct: 0.7 }]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿"Student","Score","Percentage"\r\n"Asha ""AJ"" Rao","7","70%"\r\n');
});

test('cells that look like formulas are neutralised', () => {
  for (const evil of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '\tx'])
    assert.ok(safeCell(evil).startsWith("'"), evil);
  assert.equal(safeCell(-5), '-5');
  assert.equal(safeCell(null), '');
  const csv = toCSV([{ header: 'Name', key: 'n' }], [{ n: '=1+1' }]);
  assert.match(csv, /"'=1\+1"/);
});

test('XLSX round-trips sheets, headers and typed values', async () => {
  const buf = await toXLSX([
    { name: 'Results', columns, rows: [{ name: '=cmd', score: 9, pct: 0.9 }] },
    { name: 'Summary', columns: [{ header: 'Field', key: 'k' }], rows: [{ k: 'Average' }] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ['Results', 'Summary'],
  );
  const ws = wb.getWorksheet('Results');
  assert.equal(ws.getCell('A1').value, 'Student');
  assert.equal(ws.getCell('A2').value, "'=cmd");
  assert.equal(ws.getCell('B2').value, 9);
  assert.equal(ws.getCell('C2').numFmt, '0.0%');
  assert.equal(ws.getRow(1).font.bold, true);
});

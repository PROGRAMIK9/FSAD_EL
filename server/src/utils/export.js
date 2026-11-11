import ExcelJS from 'exceljs';

/**
 * Tabular exports shared by every results download.
 *
 * A sheet is `{ name, columns: [{ header, key, width?, format? }], rows: [{ [key]: value }] }`.
 * `format` is one of 'percent' (0–1 fraction), 'datetime', 'number' or 'text'.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const BOM = '\uFEFF';

/** Stops spreadsheet apps from evaluating user-supplied text as a formula. */
export function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
}

const csvValue = (value, format) => {
  if (format === 'percent' && typeof value === 'number') return `${Math.round(value * 1000) / 10}%`;
  return safeCell(value);
};

/** RFC 4180 CSV with a UTF-8 BOM (so Excel reads names correctly) and CRLF line endings. */
export function toCSV(columns, rows) {
  const line = (cells) => cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',');
  const body = [
    line(columns.map((c) => c.header)),
    ...rows.map((r) => line(columns.map((c) => csvValue(r[c.key], c.format)))),
  ];
  return BOM + body.join('\r\n') + '\r\n';
}

const NUM_FMT = { percent: '0.0%', datetime: 'dd mmm yyyy hh:mm', number: '0.##' };

/** Builds an .xlsx workbook buffer: bold tinted header, frozen first row, autofilter. */
export async function toXLSX(sheets, { creator = 'RVCE Academic Hub' } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width || Math.max(10, c.header.length + 2),
      style: NUM_FMT[c.format] ? { numFmt: NUM_FMT[c.format] } : {},
    }));
    for (const row of sheet.rows) {
      const out = {};
      for (const c of sheet.columns) {
        const v = row[c.key];
        out[c.key] =
          v instanceof Date || typeof v === 'number' || v === null || v === undefined
            ? (v ?? null)
            : safeCell(v);
      }
      ws.addRow(out);
    }
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FF0B1220' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3FF' } };
    header.alignment = { vertical: 'middle' };
    header.height = 20;
    if (sheet.columns.length && sheet.rows.length)
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const slug = (s) =>
  String(s || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'export';

/** Sends sheets as a CSV (first sheet only) or XLSX download. */
export async function sendTable(res, format, baseName, sheets) {
  const name = `${slug(baseName)}.${format}`;
  res.attachment(name);
  if (format === 'xlsx') {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(await toXLSX(sheets));
  }
  res.type('text/csv; charset=utf-8');
  return res.send(toCSV(sheets[0].columns, sheets[0].rows));
}

export const EXPORT_FORMATS = ['csv', 'xlsx'];

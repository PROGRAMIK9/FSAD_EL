export function parseCSV(input) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

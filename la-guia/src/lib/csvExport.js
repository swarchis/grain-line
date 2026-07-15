// Shared CSV download mechanism, generalized from techPackExcel.js's
// Blob + object-URL approach — see that file for why this is plain CSV
// rather than the `xlsx` package (known prototype-pollution/ReDoS advisories
// on its last published version).
function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// rows: array of objects. columns: [{ key, label }]. Downloads immediately.
export function exportCSV(filename, columns, rows) {
  const lines = [columns.map(c => c.label)];
  rows.forEach(row => lines.push(columns.map(c => row[c.key])));
  const csv = lines.map(line => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

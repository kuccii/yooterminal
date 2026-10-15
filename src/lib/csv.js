export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function joinList(list) {
  if (!Array.isArray(list)) return '';
  return list
    .map((item) => (item && typeof item === 'object' ? item.name || '' : String(item)))
    .filter(Boolean)
    .join('; ');
}

export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map((column) => csvEscape(column.label)).join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvEscape(column.value(row))).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

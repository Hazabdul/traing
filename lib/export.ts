/**
 * Convert an array of row objects to CSV and trigger a browser download.
 * Handles commas, quotes, and newlines per RFC 4180.
 */
export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) {
    const blob = new Blob(['No data'], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Open a print-friendly window with an HTML table for PDF export via the browser print dialog. */
export function exportToPDF(
  title: string,
  columns: string[],
  rows: (string | number | null)[][],
  filename: string
) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups to export PDF.');
    return;
  }
  const html = `
<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
</style></head><body>
<h1>${title}</h1>
<div class="meta">Generated ${new Date().toLocaleString()}</div>
<table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;
  win.document.write(html);
  win.document.close();
}

/**
 * js/csv.js (ES module)
 * A deliberately minimal CSV parser — handles comma-separated values with
 * a header row, double-quote-wrapped fields, and escaped "" inside quotes.
 * Does not handle every CSV edge case (e.g. embedded newlines inside a
 * quoted field spanning multiple physical lines) — sufficient for the
 * simple flat product/customer import templates this app generates.
 * No external dependency (papaparse etc.) needed for this scope.
 */

/**
 * @param {string} text - raw CSV text (first line = header)
 * @returns {object[]} array of row objects keyed by header column names
 */
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((key, idx) => {
      row[key] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

/**
 * @param {string[]} headers
 * @returns {string} a downloadable CSV template with just the header row
 */
export function csvTemplate(headers) {
  return headers.join(',') + '\n';
}

export function downloadTextFile(filename, text, mimeType = 'text/csv') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

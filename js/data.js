import { fnv1a32 } from './util.js';

/**
 * Fetch a CSV file from the repo (works via file:// in modern browsers) and return raw text.
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function fetchCsvText(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load CSV at ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/**
 * Parse CSV text to rows using a small robust parser supporting quoted fields.
 * @param {string} csv
 * @returns {string[][]}
 */
export function parseCsv(csv) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        // Look ahead for escaped quote
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // ignore CR; handle CRLF by letting \n branch commit row
      } else {
        field += c;
      }
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Normalize and map parsed rows to cards.
 * CSV has columns: hanzi, pinyin, english.
 * @param {string[][]} rows
 */
export function rowsToCards(rows) {
  // Auto-detect header if present by checking if first row contains 'hanzi' literal
  const hasHeader = rows.length > 0 && rows[0].length >= 3 &&
    rows[0][0].toLowerCase().includes('hanzi');
  const dataRows = hasHeader ? rows.slice(1) : rows;

  /** @type {{ id: string, hanzi: string, pinyin: string, english: string }[]} */
  const cards = [];
  for (const r of dataRows) {
    if (!r || r.length < 3) continue;
    const hanzi = (r[0] || '').trim();
    const rawPinyin = (r[1] || '').trim();
    const pinyin = rawPinyin.replace(/\s+/g, ' ');
    const english = (r[2] || '').trim();
    if (!hanzi || !english) continue;
    const id = fnv1a32(`${hanzi}|${pinyin}|${english}`);
    cards.push({ id, hanzi, pinyin, english });
  }
  // de-dupe by id, first occurrence wins
  const seen = new Set();
  const deduped = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    deduped.push(c);
  }
  return deduped;
}

/**
 * Discover available CSV levels by probing known filenames.
 * Directory listing is typically unavailable on static hosts, so we use HEAD requests.
 * @returns {Promise<string[]>} array like ['0','1','2','3','4','5','6'] that exist
 */
export async function discoverAvailableLevels() {
  const candidates = ['0','1','2','3','4','5','6'];
  const found = [];
  await Promise.all(candidates.map(async (lvl) => {
    try {
      const resp = await fetch(`./data/hsk${lvl}.csv`, { method: 'HEAD' });
      if (resp.ok) found.push(lvl);
    } catch {}
  }));
  return found.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}



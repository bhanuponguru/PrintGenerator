/**
 * Convert an array of data points into an RFC4180 CSV string.
 * - Supports one dynamic placeholder by flattening repeated rows to dotted columns
 *   (e.g. products.item, products.qty) and repeating static fields per row.
 * - Flattens one level of static nested objects into dotted headers.
 * - Serializes deeper objects as JSON strings in cells.
 */
function escapeCsvField(field: string): string {
  if (field == null) return '';
  const s = String(field);
  if (s.includes('"')) {
    // double-up quotes
    const doubled = s.replace(/"/g, '""');
    return `"${doubled}"`;
  }
  if (s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s}"`;
  }
  return s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function getDynamicRows(value: unknown): Array<Record<string, unknown>> | null {
  if (!isPlainObject(value)) return null;

  const tableRows = (value as Record<string, unknown>).rows;
  if (Array.isArray(tableRows)) {
    const rows = tableRows.filter(isPlainObject) as Array<Record<string, unknown>>;
    return rows;
  }

  const items = (value as Record<string, unknown>).items;
  if (Array.isArray(items)) {
    if (items.every(isPlainObject)) {
      return items as Array<Record<string, unknown>>;
    }
    return items.map((item) => ({ value: item }));
  }

  const data = (value as Record<string, unknown>).data;
  if (Array.isArray(data)) {
    const rows = data.filter(isPlainObject) as Array<Record<string, unknown>>;
    return rows;
  }

  if (isPlainObject(data) && Array.isArray((data as Record<string, unknown>).items)) {
    const nestedItems = (data as Record<string, unknown>).items as unknown[];
    if (nestedItems.every(isPlainObject)) {
      return nestedItems as Array<Record<string, unknown>>;
    }
    return nestedItems.map((item) => ({ value: item }));
  }

  return null;
}

function toCellString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function dataPointsToCsv(
  dataPoints: Array<Record<string, unknown>>,
  opts?: { idField?: string }
): string {
  const idField = opts?.idField || 'id';

  let dynamicKey: string | null = null;
  const staticHeaderSet = new Set<string>();
  const dynamicHeaderSet = new Set<string>();

  for (const dp of dataPoints) {
    const record = dp || {};
    for (const [k, v] of Object.entries(record)) {
      const rows = getDynamicRows(v);
      if (!dynamicKey && rows) {
        dynamicKey = k;
      }
    }
  }

  for (const dp of dataPoints) {
    const record = dp || {};
    for (const [k, v] of Object.entries(record)) {
      if (k === idField) continue;

      if (dynamicKey && k === dynamicKey) {
        const rows = getDynamicRows(v) || [];
        for (const row of rows) {
          for (const sub of Object.keys(row)) {
            dynamicHeaderSet.add(`${dynamicKey}.${sub}`);
          }
        }
        continue;
      }

      if (isPlainObject(v)) {
        for (const sub of Object.keys(v)) {
          staticHeaderSet.add(`${k}.${sub}`);
        }
      } else {
        staticHeaderSet.add(k);
      }
    }
  }

  const headers = [idField, ...Array.from(staticHeaderSet), ...Array.from(dynamicHeaderSet)];

  const rows: string[] = [];
  rows.push(headers.join(','));

  for (let i = 0; i < dataPoints.length; i++) {
    const dp = dataPoints[i] || {};
    const idValue = (dp as Record<string, unknown>)[idField] ?? String(i + 1);

    const staticValues: Record<string, unknown> = {};
    for (const h of staticHeaderSet) {
      if (h.includes('.')) {
        const [base, sub] = h.split('.', 2);
        const baseVal = (dp as Record<string, unknown>)[base];
        if (isPlainObject(baseVal) && sub in baseVal) {
          staticValues[h] = (baseVal as Record<string, unknown>)[sub];
        } else {
          staticValues[h] = '';
        }
      } else {
        staticValues[h] = (dp as Record<string, unknown>)[h] ?? '';
      }
    }

    const dynamicRows = dynamicKey
      ? (getDynamicRows((dp as Record<string, unknown>)[dynamicKey]) || [])
      : [];
    const rowPayloads = dynamicKey ? (dynamicRows.length > 0 ? dynamicRows : [{}]) : [{}];

    for (const dynamicRow of rowPayloads) {
      const cells: string[] = [];
      for (const h of headers) {
        if (h === idField) {
          cells.push(escapeCsvField(toCellString(idValue)));
          continue;
        }

        if (dynamicKey && h.startsWith(`${dynamicKey}.`)) {
          const sub = h.slice(dynamicKey.length + 1);
          const v = dynamicRow[sub];
          cells.push(escapeCsvField(toCellString(v)));
          continue;
        }

        const v = staticValues[h];
        cells.push(escapeCsvField(toCellString(v)));
      }
      rows.push(cells.join(','));
    }
  }

  return rows.join('\n');
}

export default dataPointsToCsv;

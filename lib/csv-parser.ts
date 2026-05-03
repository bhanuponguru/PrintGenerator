import { collectPlaceholderValidationConfigMap } from './document-generation';
import { DataPoint, PlaceholderValidationConfigMap } from './document-generation';

export interface CsvParseResult {
  dataPoints: DataPoint[];
  warnings: string[];
  error?: string;
}

interface ParseOpts {
  idField?: string;
}

/**
 * Minimal RFC4180-compliant CSV parser supporting quoted fields.
 */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let curField = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          curField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        curField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(curField);
        curField = '';
      } else if (ch === '\r') {
        // ignore carriage return
      } else if (ch === '\n') {
        cur.push(curField);
        rows.push(cur);
        cur = [];
        curField = '';
      } else {
        curField += ch;
      }
    }
  }

  // flush remaining
  if (curField !== '' || cur.length > 0) {
    cur.push(curField);
    rows.push(cur);
  }

  return rows;
}

/**
 * Detect if a placeholder kind is dynamic (multi-row).
 */
function isDynamicKind(kind?: string): boolean {
  return kind === 'list' || kind === 'table' || kind === 'repeat' || kind === 'custom';
}

/**
 * Parse a CSV string into DataPoints for document generation.
 *
 * Rules:
 * - Templates must have at most one dynamic placeholder (list, table, repeat, custom).
 * - Rows are grouped by an id column (default: 'id').
 * - Static placeholder values are taken from the first row of each group.
 * - If static values differ within a group, a warning is emitted and first row wins.
 * - Dynamic placeholder values are aggregated from all rows in the group.
 *
 * @param csv Raw CSV string
 * @param template TipTap/ProseMirror template document
 * @param opts Parse options (idField)
 * @returns Parsed result with dataPoints, warnings, and optional error
 */
export function parseCsvToDataPoints(
  csv: string,
  template: Record<string, unknown>,
  opts: ParseOpts = {}
): CsvParseResult {
  const idField = opts.idField || 'id';
  const warnings: string[] = [];

  // Collect placeholder schema map from template
  const placeholderConfigMap: PlaceholderValidationConfigMap = collectPlaceholderValidationConfigMap(template);
  const keys = Object.keys(placeholderConfigMap || {});

  // Detect dynamic placeholders
  const dynamicKeys = keys.filter((k) => isDynamicKind(placeholderConfigMap[k].schema.kind));
  if (dynamicKeys.length > 1) {
    return {
      dataPoints: [],
      warnings,
      error: 'CSV parsing supports templates with at most one dynamic placeholder',
    };
  }

  const dynamicKey = dynamicKeys[0];

  // Parse CSV rows
  const rows = parseCsvRows(csv.trim());
  if (rows.length === 0) {
    return { dataPoints: [], warnings: ['empty CSV'], error: 'Empty CSV' };
  }

  const header = rows[0].map((h) => (h || '').trim());
  const body = rows.slice(1);

  // Map body rows to objects keyed by header
  const objects: Record<string, string>[] = body.map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = r[i] === undefined ? '' : String(r[i]).trim();
    }
    return obj;
  });

  if (dynamicKey) {
    // GROUP MODE: rows with same id are grouped
    const groups = new Map<string, Record<string, string>[]>();
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!(idField in obj) || obj[idField] === '') {
        return {
          dataPoints: [],
          warnings,
          error: `Missing or empty id column '${idField}' for grouped CSV parsing`,
        };
      }
      const id = obj[idField];
      const arr = groups.get(id) || [];
      arr.push(obj);
      groups.set(id, arr);
    }

    const dataPoints: DataPoint[] = [];

    for (const [id, groupRows] of groups.entries()) {
      const staticResult: Record<string, unknown> = {};

      // Determine which headers are dynamic subfields
      const dynamicHeaders = new Set<string>();
      const cfg = placeholderConfigMap[dynamicKey];
      if (cfg && cfg.schema.kind === 'table') {
        const tableSchema: any = cfg.schema;
        if (Array.isArray(tableSchema.headers)) {
          tableSchema.headers.forEach((h: string) => dynamicHeaders.add(h));
        }
      }

      // Support dotted headers like 'grades.course_id'
      header.forEach((h) => {
        if (h.includes('.')) {
          const [maybeKey, sub] = h.split('.', 2);
          if (maybeKey === dynamicKey) dynamicHeaders.add(sub);
        }
      });

      // Collect static placeholder values (use first row, warn on conflicts)
      for (const k of keys) {
        if (k === dynamicKey) continue;
        if (header.includes(k)) {
          const val = groupRows[0][k];
          staticResult[k] = val;
          // Check for conflicts in static values across grouped rows
          for (let i = 1; i < groupRows.length; i++) {
            if ((groupRows[i][k] || '') !== (val || '')) {
              warnings.push(
                `Group '${id}': conflicting static value for '${k}' ` +
                `(rows have '${groupRows[i][k]}' but using '${val}')`
              );
              break;
            }
          }
        }
      }

      // Build dynamic payload based on schema kind
      const dynamicPayload: any = {};
      if (placeholderConfigMap[dynamicKey]) {
        const kind = placeholderConfigMap[dynamicKey].schema.kind;
        if (kind === 'table') {
          const rowsOut: Record<string, unknown>[] = [];
          for (const r of groupRows) {
            const rowObj: Record<string, unknown> = {};
            for (const h of Object.keys(r)) {
              if (h === idField) continue;
              if (h.includes('.')) {
                const [maybeKey, sub] = h.split('.', 2);
                if (maybeKey === dynamicKey) {
                  if (sub === 'caption') {
                    return {
                      dataPoints: [],
                      warnings,
                      error: `${dynamicKey}.caption is static and cannot be overridden`,
                    };
                  }
                  rowObj[sub] = r[h];
                }
              } else if (dynamicHeaders.has(h)) {
                rowObj[h] = r[h];
              }
            }
            rowsOut.push(rowObj);
          }
          dynamicPayload.rows = rowsOut;
        } else if (kind === 'repeat' || kind === 'list') {
          const items: any[] = [];
          for (const r of groupRows) {
            const item: Record<string, unknown> = {};
            for (const h of Object.keys(r)) {
              if (h === idField || keys.includes(h)) continue;
              if (h.includes('.')) {
                const [maybeKey, sub] = h.split('.', 2);
                if (maybeKey === dynamicKey) {
                  item[sub] = r[h];
                }
              } else {
                item[h] = r[h];
              }
            }
            items.push(item);
          }
          dynamicPayload.items = items;
        } else if (kind === 'custom') {
          const items: any[] = [];
          for (const r of groupRows) {
            const item: Record<string, unknown> = {};
            for (const h of Object.keys(r)) {
              if (h === idField || keys.includes(h)) continue;
              if (h.includes('.')) {
                const [maybeKey, sub] = h.split('.', 2);
                if (maybeKey === dynamicKey) {
                  item[sub] = r[h];
                }
              } else {
                item[h] = r[h];
              }
            }
            items.push(item);
          }
          dynamicPayload.data = items;
        }
      }

      // Compose final datapoint
      const dp: DataPoint = { ...staticResult } as DataPoint;
      dp[dynamicKey] = dynamicPayload;
      dataPoints.push(dp);
    }

    return { dataPoints, warnings };
  }

  // NO DYNAMIC PLACEHOLDER: each row is an independent datapoint
  const dataPoints: DataPoint[] = objects.map((obj) => {
    const dp: DataPoint = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === idField) continue;
      if (k.includes('.')) {
        const parts = k.split('.');
        dp[parts[0]] = dp[parts[0]] || {};
        (dp[parts[0]] as any)[parts[1]] = v;
      } else {
        dp[k] = v;
      }
    }
    return dp;
  });

  return { dataPoints, warnings };
}

export default parseCsvToDataPoints;

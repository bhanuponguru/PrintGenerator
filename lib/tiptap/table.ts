import { Node } from '@tiptap/core';
import { isRecord } from '@/lib/tiptap/utils';
import { TableColumnDataValue, TableRowDataValue } from '@/types/template';

/** TipTap node payload for rendered table components. */
export interface TableComponentNode {
  type: 'tableComponent';
  attrs: {
    value: TableRowDataValue | TableColumnDataValue;
    headers: string[];
    caption?: unknown;
    [key: string]: unknown;
  };
}

/** Validates the table component attrs before insertion or rendering. */
export function validateTableAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'tableComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  // Infer mode from data: if has rows → row_data, if has columns → column_data
  const hasRows = Array.isArray(value.rows);
  const hasColumns = isRecord(value.columns);

  if (!hasRows && !hasColumns) {
    return 'tableComponent.attrs.value must have either rows[] or columns{}';
  }

  if (hasRows && hasColumns) {
    return 'tableComponent.attrs.value cannot have both rows[] and columns{}';
  }

  if (!Array.isArray(attrs.headers) || attrs.headers.some((h) => typeof h !== 'string' || h.trim() === '')) {
    return 'tableComponent.attrs.headers must be an array of non-empty strings';
  }

  if ('caption' in attrs && attrs.caption !== undefined && attrs.caption !== null && !isRecord(attrs.caption) && typeof attrs.caption !== 'string') {
    return 'tableComponent.attrs.caption must be a component object or string when provided';
  }

  if (hasRows) {
    for (let i = 0; i < (value.rows as unknown[]).length; i += 1) {
      if (!isRecord((value.rows as unknown[])[i])) {
        return `tableComponent.attrs.value.rows[${i}] must be an object`;
      }
    }
    return null;
  }

  // hasColumns
  for (const [columnName, columnData] of Object.entries(value.columns as Record<string, unknown>)) {
    if (!columnName.trim()) {
      return 'tableComponent.attrs.value.columns cannot contain empty column names';
    }
    if (!isRecord(columnData)) {
      return `tableComponent.attrs.value.columns['${columnName}'] must be an object`;
    }
  }

  return null;
}

/** Creates a typed table component node from the editor form payload. */
export function createTableComponent(
  data: TableRowDataValue | TableColumnDataValue,
  attrs: Record<string, unknown> = {}
): TableComponentNode {
  const mergedAttrs = {
    ...attrs,
    headers: Array.isArray(attrs.headers) ? attrs.headers : [],
    value: data,
  };

  const validationError = validateTableAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'tableComponent',
    attrs: mergedAttrs,
  };
}

export const TableComponent = Node.create({
  name: 'tableComponent',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: { rows: [] } },
      headers: { default: [] },
      caption: { default: undefined },
    };
  },

  parseHTML() {
    return [{ tag: 'table[data-component="table"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateTableAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'table', title: err }, '[invalid table component]'];
    }

    const headers = attrs.headers as string[];
    const value = attrs.value as Record<string, unknown>;
    const caption = value.caption;

    const captionNode = caption
      ? ['caption', {}, typeof caption === 'string' ? caption : JSON.stringify(caption)]
      : null;

    if (Array.isArray(value.rows)) {
      const rows = value.rows as Array<Record<string, unknown>>;
      const thead = ['thead', {}, ['tr', {}, ...headers.map((h) => ['th', {}, h])]];
      const tbody = [
        'tbody',
        {},
        ...rows.map((row) => ['tr', {}, ...headers.map((h) => ['td', {}, String(row[h] ?? '')])]),
      ];

      return ['table', { 'data-component': 'table' }, ...(captionNode ? [captionNode] : []), thead, tbody];
    }

    const columns = isRecord(value.columns) ? value.columns as Record<string, Record<string, unknown>> : {};
    const columnNames = Object.keys(columns);

    const thead = ['thead', {}, ['tr', {}, ['th', {}, ''], ...columnNames.map((name) => ['th', {}, name])]];
    const tbody = [
      'tbody',
      {},
      ...headers.map((rowHeader) => {
        const row = columnNames.map((columnName) => ['td', {}, String(columns[columnName]?.[rowHeader] ?? '')]);
        return ['tr', {}, ['th', {}, rowHeader], ...row];
      }),
    ];

    return ['table', { 'data-component': 'table' }, ...(captionNode ? [captionNode] : []), thead, tbody];
  },
});

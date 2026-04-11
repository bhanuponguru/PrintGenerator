import { Node } from '@tiptap/core';
import { isRecord } from '@/lib/tiptap/utils';
import { TableColumnDataValue, TableRowDataValue } from '@/types/template';

export interface TableComponentNode {
  type: 'tableComponent';
  attrs: {
    value: TableRowDataValue | TableColumnDataValue;
    headers: string[];
    caption?: unknown;
    in_placeholder: boolean;
    [key: string]: unknown;
  };
}

export function validateTableAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'tableComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (value.mode !== 'row_data' && value.mode !== 'column_data') {
    return "tableComponent.attrs.value.mode must be 'row_data' or 'column_data'";
  }

  if (!Array.isArray(attrs.headers) || attrs.headers.some((h) => typeof h !== 'string' || h.trim() === '')) {
    return 'tableComponent.attrs.headers must be an array of non-empty strings';
  }

  if ('in_placeholder' in attrs && typeof attrs.in_placeholder !== 'boolean') {
    return 'tableComponent.attrs.in_placeholder must be a boolean';
  }

  if ('caption' in attrs && attrs.caption !== undefined && attrs.caption !== null && !isRecord(attrs.caption) && typeof attrs.caption !== 'string') {
    return 'tableComponent.attrs.caption must be a component object or string when provided';
  }

  if (value.mode === 'row_data') {
    if (!Array.isArray(value.rows)) {
      return 'tableComponent.attrs.value.rows must be an array for row_data mode';
    }
    for (let i = 0; i < value.rows.length; i += 1) {
      if (!isRecord(value.rows[i])) {
        return `tableComponent.attrs.value.rows[${i}] must be an object`;
      }
    }
    return null;
  }

  if (!isRecord(value.columns)) {
    return 'tableComponent.attrs.value.columns must be an object for column_data mode';
  }

  for (const [columnName, columnData] of Object.entries(value.columns)) {
    if (!columnName.trim()) {
      return 'tableComponent.attrs.value.columns cannot contain empty column names';
    }
    if (!isRecord(columnData)) {
      return `tableComponent.attrs.value.columns['${columnName}'] must be an object`;
    }
  }

  return null;
}

export function createTableComponent(
  data: TableRowDataValue | TableColumnDataValue,
  attrs: Record<string, unknown> = {}
): TableComponentNode {
  const mergedAttrs = {
    ...attrs,
    headers: Array.isArray(attrs.headers) ? attrs.headers : [],
    value: data,
    in_placeholder: typeof data.in_placeholder === 'boolean' ? data.in_placeholder : false,
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
      value: { default: { mode: 'row_data', rows: [], in_placeholder: false } },
      headers: { default: [] },
      caption: { default: undefined },
      in_placeholder: { default: false },
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

    if (value.mode === 'row_data') {
      const rows = value.rows as Array<Record<string, unknown>>;
      const thead = ['thead', {}, ['tr', {}, ...headers.map((h) => ['th', {}, h])]];
      const tbody = [
        'tbody',
        {},
        ...rows.map((row) => ['tr', {}, ...headers.map((h) => ['td', {}, String(row[h] ?? '')])]),
      ];

      return ['table', { 'data-component': 'table' }, ...(captionNode ? [captionNode] : []), thead, tbody];
    }

    const columns = value.columns as Record<string, Record<string, unknown>>;
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

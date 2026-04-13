import { mergeAttributes, Node } from '@tiptap/core';
import { ComponentTypeSchema, ContainerTypeSchema, CustomLayoutNode, CustomPlaceholderItemSchema, CustomTypeSchema, ListStyle, ListTypeSchema, RepeatTypeSchema, TableMode, TableTypeSchema, TokenLibraryItemSchema } from '@/types/template';

export interface PlaceholderNodeAttrs {
  key: string;
  kind?: string;
  schema: ComponentTypeSchema;
  value: unknown;
  optional?: boolean;
}

type DOMSpec = [string, ...any[]];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeListStyle(style: unknown): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function normalizeCustomLayoutNodes(value: unknown): CustomLayoutNode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const nodes: CustomLayoutNode[] = [];
  for (const node of value) {
    if (!isRecord(node) || typeof node.kind !== 'string') continue;
    if (node.kind === 'text') {
      nodes.push({ kind: 'text', value: typeof node.value === 'string' ? node.value : '' });
      continue;
    }
    if (node.kind === 'token' && typeof node.token_id === 'string' && node.token_id.trim() !== '') {
      nodes.push({
        kind: 'token',
        token_id: node.token_id.trim(),
        prefix: typeof node.prefix === 'string' ? node.prefix : undefined,
        suffix: typeof node.suffix === 'string' ? node.suffix : undefined,
      });
      continue;
    }
    if (node.kind === 'newline') {
      nodes.push({ kind: 'newline' });
    }
  }
  return nodes.length > 0 ? nodes : undefined;
}

function normalizeCustomPlaceholderItem(value: unknown): CustomPlaceholderItemSchema | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '' || typeof value.kind !== 'string') {
    return undefined;
  }

  const itemKind = value.kind as ComponentTypeSchema['kind'];
  const normalized: CustomPlaceholderItemSchema = {
    kind: itemKind,
    id: value.id.trim(),
    ...(typeof value.label === 'string' && value.label.trim() !== '' ? { label: value.label.trim() } : {}),
    ...(isRecord(value.token_registry)
      ? { token_registry: Object.fromEntries(Object.entries(value.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)])) }
      : {}),
    ...(isRecord(value.token_labels)
      ? { token_labels: Object.fromEntries(Object.entries(value.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)])) }
      : {}),
    ...(typeof value.layout_template === 'string' && value.layout_template.trim() !== '' ? { layout_template: value.layout_template } : {}),
    ...(normalizeCustomLayoutNodes(value.layout_nodes) ? { layout_nodes: normalizeCustomLayoutNodes(value.layout_nodes) } : {}),
  };

  return normalized;
}

function normalizeTokenLibraryItem(value: unknown): TokenLibraryItemSchema | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '' || typeof value.kind !== 'string') {
    return undefined;
  }

  const kind = value.kind as ComponentTypeSchema['kind'];
  const normalized: TokenLibraryItemSchema = {
    id: value.id.trim(),
    kind,
    ...(typeof value.label === 'string' && value.label.trim() !== '' ? { label: value.label.trim() } : {}),
    ...(isRecord(value.token_registry)
      ? { token_registry: Object.fromEntries(Object.entries(value.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)])) }
      : {}),
    ...(isRecord(value.token_labels)
      ? { token_labels: Object.fromEntries(Object.entries(value.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)])) }
      : {}),
    ...(typeof value.layout_template === 'string' && value.layout_template.trim() !== '' ? { layout_template: value.layout_template } : {}),
    ...(normalizeCustomLayoutNodes(value.layout_nodes) ? { layout_nodes: normalizeCustomLayoutNodes(value.layout_nodes) } : {}),
  };

  if (kind === 'list') {
    normalized.item_type = isRecord(value.item_type) ? normalizeTypeSchema(value.item_type) : { kind: 'string' };
    normalized.style = normalizeListStyle(value.style);
  }

  if (kind === 'table') {
    normalized.mode = value.mode === 'column_data' ? 'column_data' : 'row_data';
    normalized.headers = Array.isArray(value.headers)
      ? value.headers.filter((header): header is string => typeof header === 'string' && header.trim() !== '')
      : undefined;
    normalized.dynamic_headers = typeof value.dynamic_headers === 'boolean' ? value.dynamic_headers : undefined;
  }

  return normalized;
}

function normalizeTypeSchema(rawSchema: unknown): ComponentTypeSchema {
  if (!isRecord(rawSchema) || typeof rawSchema.kind !== 'string') {
    return { kind: 'string' };
  }

  const schema = rawSchema as ComponentTypeSchema;

  switch (schema.kind) {
    case 'string':
    case 'integer':
    case 'image':
    case 'hyperlink':
    case 'page_break':
      return { kind: schema.kind } as ComponentTypeSchema;
    case 'repeat': {
      const repeatSchema = schema as RepeatTypeSchema;
      return {
        kind: 'repeat',
        item_type: normalizeTypeSchema(repeatSchema.item_type),
        min_items: typeof repeatSchema.min_items === 'number' ? repeatSchema.min_items : undefined,
        max_items: typeof repeatSchema.max_items === 'number' ? repeatSchema.max_items : undefined,
        base_variable: typeof repeatSchema.base_variable === 'string' ? repeatSchema.base_variable : 'item',
        layout_template: typeof repeatSchema.layout_template === 'string' ? repeatSchema.layout_template : undefined,
      };
    }
    case 'custom': {
      const customSchema = schema as CustomTypeSchema;
      const items = Array.isArray(customSchema.items)
        ? customSchema.items.map((item) => normalizeCustomPlaceholderItem(item)).filter((item): item is CustomPlaceholderItemSchema => !!item)
        : undefined;
      const tokenLibrary = Array.isArray(customSchema.token_library)
        ? customSchema.token_library
            .map((item) => normalizeTokenLibraryItem(item))
            .filter((item): item is TokenLibraryItemSchema => !!item)
        : undefined;
      return {
        kind: 'custom',
        base_variable: typeof customSchema.base_variable === 'string' && customSchema.base_variable.trim() !== ''
          ? customSchema.base_variable.trim()
          : 'item',
        value_type: normalizeTypeSchema(customSchema.value_type),
        layout_template: typeof customSchema.layout_template === 'string' ? customSchema.layout_template : '{{item}}',
        ...(items ? { items } : {}),
        ...(tokenLibrary ? { token_library: tokenLibrary } : {}),
        ...(normalizeCustomLayoutNodes(customSchema.layout_nodes) ? { layout_nodes: normalizeCustomLayoutNodes(customSchema.layout_nodes) } : {}),
        repeat: customSchema.repeat === true,
        token_registry: isRecord(customSchema.token_registry)
          ? Object.fromEntries(Object.entries(customSchema.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)]))
          : undefined,
        token_labels: isRecord(customSchema.token_labels)
          ? Object.fromEntries(Object.entries(customSchema.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)]))
          : undefined,
      };
    }
    case 'list': {
      const listSchema = schema as ListTypeSchema;
      return {
        kind: 'list',
        item_type: normalizeTypeSchema(listSchema.item_type),
        style: normalizeListStyle(listSchema.style),
        min_items: typeof listSchema.min_items === 'number' ? listSchema.min_items : undefined,
        max_items: typeof listSchema.max_items === 'number' ? listSchema.max_items : undefined,
      };
    }
    case 'container': {
      const containerSchema = schema as ContainerTypeSchema;
      const mode = containerSchema.mode === 'repeat' ? 'repeat' : 'tuple';
      return {
        kind: 'container',
        mode,
        component_types: Array.isArray(containerSchema.component_types)
          ? containerSchema.component_types.map((item) => normalizeTypeSchema(item))
          : undefined,
        item_type: containerSchema.item_type ? normalizeTypeSchema(containerSchema.item_type) : undefined,
        min_items: typeof containerSchema.min_items === 'number' ? containerSchema.min_items : undefined,
        max_items: typeof containerSchema.max_items === 'number' ? containerSchema.max_items : undefined,
      };
    }
    case 'page':
    case 'header':
    case 'footer': {
      const compositeSchema = schema as ContainerTypeSchema;
      return {
        kind: compositeSchema.kind,
        component_types: Array.isArray(compositeSchema.component_types)
          ? compositeSchema.component_types.map((item) => normalizeTypeSchema(item))
          : [],
      } as ComponentTypeSchema;
    }
    case 'table': {
      const tableSchema = schema as TableTypeSchema;
      return {
        kind: 'table',
        mode: tableSchema.mode === 'column_data' ? 'column_data' : tableSchema.mode === 'row_data' ? 'row_data' : 'row_data',
        headers: Array.isArray(tableSchema.headers)
          ? tableSchema.headers.filter((h) => typeof h === 'string' && h.trim() !== '')
          : undefined,
        dynamic_headers: typeof tableSchema.dynamic_headers === 'boolean' ? tableSchema.dynamic_headers : undefined,
        column_types: isRecord(tableSchema.column_types)
          ? Object.fromEntries(Object.entries(tableSchema.column_types).map(([k, v]) => [k, normalizeTypeSchema(v)]))
          : undefined,
        row_types: isRecord(tableSchema.row_types)
          ? Object.fromEntries(Object.entries(tableSchema.row_types).map(([k, v]) => [k, normalizeTypeSchema(v)]))
          : undefined,
        caption: tableSchema.caption ? normalizeTypeSchema(tableSchema.caption) : undefined,
      };
    }
    default:
      return { kind: 'string' };
  }
}

function inferTableHeaders(tableValue: Record<string, unknown>, mode: TableMode): string[] {
  if (mode === 'row_data') {
    if (!Array.isArray(tableValue.rows)) return [];
    const set = new Set<string>();
    for (const row of tableValue.rows) {
      if (!isRecord(row)) continue;
      Object.keys(row).forEach((key) => set.add(key));
    }
    return Array.from(set);
  }

  if (!isRecord(tableValue.columns)) return [];
  const set = new Set<string>();
  for (const col of Object.values(tableValue.columns)) {
    if (!isRecord(col)) continue;
    Object.keys(col).forEach((key) => set.add(key));
  }
  return Array.from(set);
}

function renderCollection(items: unknown[], itemType: ComponentTypeSchema): DOMSpec[] {
  return items.map((item) => ['div', {}, renderValueBySchema(itemType, item)]);
}

function resolveCustomItemValue(value: unknown, itemId: string, index: number): unknown {
  if (Array.isArray(value)) {
    return value[index];
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (Array.isArray(value.items)) {
    return value.items[index];
  }

  if (isRecord(value.data) && itemId in value.data) {
    return value.data[itemId];
  }

  if (itemId in value) {
    return value[itemId];
  }

  return undefined;
}

function renderCustomItem(item: CustomPlaceholderItemSchema, value: unknown, index: number): DOMSpec {
  const itemBase = item.kind === 'custom' ? (typeof item.id === 'string' ? item.id : 'item') : 'item';
  const itemValue = isRecord(value) && !Array.isArray(value) ? value : { value };

  const tokenRegistry = isRecord(item.token_registry)
    ? item.token_registry
    : { value: normalizeTypeSchema({ kind: item.kind === 'custom' ? 'string' : item.kind }) };

  const layout = typeof item.layout_template === 'string' && item.layout_template.trim() !== ''
    ? item.layout_template
    : Object.keys(tokenRegistry).length > 0
      ? Object.entries(tokenRegistry).map(([tokenId]) => `{{${itemBase}.${tokenId}}}`).join(' ')
      : `{{${itemBase}.value}}`;

  const rendered = renderTemplateString(layout, itemBase, itemValue);
  return ['div', { 'data-custom-item': item.id, 'data-custom-item-index': String(index) }, rendered];
}

function renderCustomLayoutNodes(nodes: CustomLayoutNode[] | undefined, items: CustomPlaceholderItemSchema[], value: unknown): DOMSpec[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return items.map((item, index) => renderCustomItem(item, resolveCustomItemValue(value, item.id, index), index));
  }

  return nodes.map((node, nodeIndex) => {
    if (node.kind === 'text') {
      return ['span', { 'data-custom-layout-node': String(nodeIndex) }, node.value];
    }

    if (node.kind === 'newline') {
      return ['br'];
    }

    const itemIndex = items.findIndex((item) => item.id === node.token_id);
    if (itemIndex === -1) {
      return ['span', { 'data-custom-layout-node': String(nodeIndex) }, ''];
    }

    const item = items[itemIndex];
    return renderCustomItem(item, resolveCustomItemValue(value, item.id, itemIndex), itemIndex);
  });
}

function getByPath(value: unknown, path: string): unknown {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function renderTemplateString(template: string, baseVariable: string, value: unknown): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*?)\s*\}\}/g, (_, token: string) => {
    if (token === baseVariable) {
      if (value === null || value === undefined) return '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    const prefix = `${baseVariable}.`;
    if (token.startsWith(prefix)) {
      const projected = getByPath(value, token.slice(prefix.length));
      if (projected === null || projected === undefined) return '';
      return typeof projected === 'object' ? JSON.stringify(projected) : String(projected);
    }

    return '';
  });
}

function renderValueBySchema(schema: ComponentTypeSchema, value: unknown): DOMSpec {
  switch (schema.kind) {
    case 'string':
    case 'integer':
      return ['span', {}, value === undefined || value === null ? '' : String(value)];

    case 'image': {
      if (!isRecord(value)) return ['span', {}, '[invalid image value]'];
      const src = typeof value.src === 'string' ? value.src : '';
      const alt = typeof value.alt === 'string' ? value.alt : '';
      return ['figure', {}, ['img', { src, alt, style: 'max-width:100%;height:auto;' }]];
    }

    case 'hyperlink': {
      if (!isRecord(value)) return ['span', {}, '[invalid hyperlink value]'];
      const href = typeof value.url === 'string' ? value.url : '';
      const alias = typeof value.alias === 'string' ? value.alias : '';
      return ['a', { href, target: '_blank', rel: 'noopener noreferrer' }, alias];
    }

    case 'repeat': {
      const repeatValue = isRecord(value) ? value : {};
      const items = Array.isArray(repeatValue.items) ? repeatValue.items : Array.isArray(value) ? value : [];
      if (typeof schema.layout_template === 'string' && schema.layout_template.trim() !== '') {
        const baseVariable = schema.base_variable || 'item';
        return [
          'div',
          { 'data-repeat': 'true' },
          ...items.map((item) => ['div', { 'data-repeat-item': 'true' }, renderTemplateString(schema.layout_template!, baseVariable, item)]),
        ];
      }
      const child = renderCollection(items, schema.item_type);
      return ['div', { 'data-repeat': 'true' }, ...child];
    }

    case 'custom': {
      const baseVariable = schema.base_variable || 'item';
      const layout = schema.layout_template || '{{item}}';

      if (Array.isArray(schema.items) && schema.items.length > 0) {
        const items = Array.isArray(value)
          ? value
          : isRecord(value) && Array.isArray(value.items)
            ? value.items
            : Array.isArray(isRecord(value) ? value.data : undefined)
              ? (value as Record<string, unknown>).data as unknown[]
              : [];

        return [
          'div',
          { 'data-custom': 'true', 'data-custom-items': 'true' },
          ...renderCustomLayoutNodes(schema.layout_nodes, schema.items, items),
        ];
      }

      if (schema.repeat) {
        const items = Array.isArray(value)
          ? value
          : isRecord(value) && Array.isArray(value.items)
            ? value.items
            : [];
        return [
          'div',
          { 'data-custom': 'true', 'data-custom-repeat': 'true' },
          ...items.map((item) => ['div', { 'data-custom-item': 'true' }, renderTemplateString(layout, baseVariable, item)]),
        ];
      }

      const dataValue = isRecord(value) && 'data' in value ? value.data : value;
      return ['div', { 'data-custom': 'true' }, renderTemplateString(layout, baseVariable, dataValue)];
    }

    case 'list': {
      const listValue = isRecord(value) ? value : {};
      const items = Array.isArray(listValue.items) ? listValue.items : Array.isArray(value) ? value : [];
      const style = normalizeListStyle(listValue.style ?? schema.style ?? 'bulleted');
      const itemType = schema.item_type;

      if (style === 'plain') {
        return ['div', { 'data-list-style': 'plain' }, ...items.map((item) => ['div', {}, renderValueBySchema(itemType, item)])];
      }

      const listTag = style === 'numbered' ? 'ol' : 'ul';
      return [listTag, { 'data-list-style': style }, ...items.map((item) => ['li', {}, renderValueBySchema(itemType, item)])];
    }

    case 'container': {
      const containerValue = isRecord(value) ? value : {};
      const components = Array.isArray(containerValue.components) ? containerValue.components : [];
      const mode = schema.mode === 'repeat' ? 'repeat' : 'tuple';

      if (mode === 'repeat') {
        const itemType = schema.item_type || { kind: 'string' };
        return ['div', { 'data-component': 'container', 'data-mode': 'repeat' }, ...renderCollection(components, itemType)];
      }

      const componentTypes = Array.isArray(schema.component_types) ? schema.component_types : [];
      return [
        'div',
        { 'data-component': 'container', 'data-mode': 'tuple' },
        ...components.map((component, index) => ['div', {}, renderValueBySchema(componentTypes[index] || { kind: 'string' }, component)]),
      ];
    }

    case 'table': {
      const tableValue = isRecord(value) ? value : {};
      const mode: TableMode = schema.mode || (Array.isArray(tableValue.rows) ? 'row_data' : 'column_data');
      const headers = schema.headers && schema.headers.length > 0 ? schema.headers : inferTableHeaders(tableValue, mode);

      const captionNode = tableValue.caption !== undefined
        ? ['caption', {}, typeof tableValue.caption === 'string' ? tableValue.caption : JSON.stringify(tableValue.caption)]
        : null;

      if (mode === 'row_data') {
        const rows = Array.isArray(tableValue.rows) ? tableValue.rows : [];
        return [
          'table',
          {},
          ...(captionNode ? [captionNode] : []),
          ['thead', {}, ['tr', {}, ...headers.map((h) => ['th', {}, h])]],
          ['tbody', {}, ...rows.map((row) => {
            const rowObj = isRecord(row) ? row : {};
            return ['tr', {}, ...headers.map((h) => ['td', {}, String(rowObj[h] ?? '')])];
          })],
        ];
      }

      const columns = isRecord(tableValue.columns) ? tableValue.columns : {};
      const columnNames = Object.keys(columns);
      return [
        'table',
        {},
        ...(captionNode ? [captionNode] : []),
        ['thead', {}, ['tr', {}, ['th', {}, ''], ...columnNames.map((name) => ['th', {}, name])]],
        ['tbody', {}, ...headers.map((rowHeader) => [
          'tr',
          {},
          ['th', {}, rowHeader],
          ...columnNames.map((name) => {
            const col = isRecord(columns[name]) ? columns[name] : {};
            return ['td', {}, String(col[rowHeader] ?? '')];
          }),
        ])],
      ];
    }

    default:
      return ['span', {}, value === undefined || value === null ? '' : String(value)];
  }
}

export function validatePlaceholderAttrs(attrs: Record<string, unknown>): string | null {
  if (typeof attrs.key !== 'string' || attrs.key.trim() === '') {
    return 'placeholder.attrs.key must be a non-empty string';
  }

  if (!isRecord(attrs.schema) || typeof attrs.schema.kind !== 'string') {
    return 'placeholder.attrs.schema must be a valid schema object';
  }

  return null;
}

export function deriveSchemaFromChildren(kind: string, attrs: Record<string, unknown>, _children: unknown): ComponentTypeSchema {
  if (isRecord(attrs.schema) && typeof attrs.schema.kind === 'string') {
    const normalized = normalizeTypeSchema(attrs.schema);
    if (!(normalized.kind === 'string' && kind && kind !== 'string')) {
      return normalized;
    }
  }

  if (kind === 'list' || kind === 'repeat') {
    const itemKind = typeof attrs.item_kind === 'string' ? attrs.item_kind : 'string';
    const base = {
      kind,
      item_type: normalizeTypeSchema({ kind: itemKind }),
    } as ComponentTypeSchema;

    if (kind === 'list') {
      return {
        ...(base as ListTypeSchema),
        style: normalizeListStyle(attrs.style),
      };
    }

    return base;
  }

  if (kind === 'custom') {
    const tokenLibrary = Array.isArray(attrs.token_library)
      ? attrs.token_library
          .map((item) => normalizeTokenLibraryItem(item))
          .filter((item): item is TokenLibraryItemSchema => !!item)
      : undefined;

    return {
      kind: 'custom',
      base_variable: typeof attrs.base_variable === 'string' && attrs.base_variable.trim() !== ''
        ? attrs.base_variable.trim()
        : 'item',
      value_type: isRecord(attrs.value_type) ? normalizeTypeSchema(attrs.value_type) : { kind: 'string' },
      layout_template: typeof attrs.layout_template === 'string' && attrs.layout_template.trim() !== ''
        ? attrs.layout_template
        : '{{item}}',
      repeat: attrs.repeat === true,
      token_registry: isRecord(attrs.token_registry)
        ? Object.fromEntries(Object.entries(attrs.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)]))
        : undefined,
      token_labels: isRecord(attrs.token_labels)
        ? Object.fromEntries(Object.entries(attrs.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)]))
        : undefined,
      ...(tokenLibrary ? { token_library: tokenLibrary } : {}),
      layout_nodes: normalizeCustomLayoutNodes(attrs.layout_nodes),
    };
  }

  if (kind === 'container') {
    const componentKinds = Array.isArray(attrs.component_kinds) ? attrs.component_kinds : [];
    return {
      kind: 'container',
      mode: 'tuple',
      component_types: componentKinds.map((componentKind) => normalizeTypeSchema({ kind: String(componentKind) })),
    };
  }

  if (kind === 'table') {
    const mode = attrs.mode === 'column_data' || attrs.mode === 'row_data' ? attrs.mode : 'row_data';
    const headers = Array.isArray(attrs.headers)
      ? attrs.headers.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
      : undefined;
    const rawTypeMap = mode === 'row_data' ? attrs.column_types : attrs.row_types;
    const typeMap = isRecord(rawTypeMap)
      ? Object.fromEntries(Object.entries(rawTypeMap).map(([k, v]) => [k, normalizeTypeSchema(v)]))
      : undefined;

    return {
      kind: 'table',
      mode,
      headers,
      dynamic_headers: !headers || headers.length === 0,
      ...(mode === 'row_data' ? { column_types: typeMap } : { row_types: typeMap }),
      ...(attrs.caption !== undefined ? { caption: normalizeTypeSchema(attrs.caption) } : {}),
    };
  }

  if (kind === 'page_break') {
    return { kind: 'page_break' };
  }

  if (kind === 'image' || kind === 'hyperlink' || kind === 'integer' || kind === 'string') {
    return { kind: kind as ComponentTypeSchema['kind'] };
  }

  return { kind: (kind || 'string') as ComponentTypeSchema['kind'] };
}

export function substitutePlaceholderValue(attrs: PlaceholderNodeAttrs, nextValue: unknown): PlaceholderNodeAttrs {
  return { ...attrs, value: nextValue };
}

export function createPlaceholderNode(attrs: PlaceholderNodeAttrs) {
  const validationError = validatePlaceholderAttrs(attrs as unknown as Record<string, unknown>);
  if (validationError) throw new Error(validationError);

  return {
    type: 'placeholder',
    attrs: {
      ...attrs,
      kind: attrs.schema.kind,
      schema: normalizeTypeSchema(attrs.schema),
    },
  };
}

export const Placeholder = Node.create({
  name: 'placeholder',
  group: 'inline',
  inline: true,
  content: 'inline*',
  atom: false,
  selectable: false,

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-key') || '',
        renderHTML: (attributes) =>
          typeof attributes.key === 'string' && attributes.key.trim() !== ''
            ? { 'data-key': attributes.key }
            : {},
      },
      kind: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-kind') || '',
        renderHTML: (attributes) =>
          typeof attributes.kind === 'string' && attributes.kind.trim() !== ''
            ? { 'data-kind': attributes.kind }
            : {},
      },
      schema: {
        default: { kind: 'string' },
        parseHTML: (element) => {
          const raw = element.getAttribute('data-schema');
          if (!raw) return { kind: 'string' };
          try {
            return normalizeTypeSchema(JSON.parse(raw));
          } catch {
            return { kind: 'string' };
          }
        },
        renderHTML: (attributes) => ({ 'data-schema': JSON.stringify(normalizeTypeSchema(attributes.schema)) }),
      },
      item_kind: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-item-kind');
          return raw || undefined;
        },
        renderHTML: (attributes) =>
          typeof attributes.item_kind === 'string' ? { 'data-item-kind': attributes.item_kind } : {},
      },
      component_kinds: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-component-kinds');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          Array.isArray(attributes.component_kinds)
            ? { 'data-component-kinds': JSON.stringify(attributes.component_kinds) }
            : {},
      },
      style: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-style') || undefined,
        renderHTML: (attributes) =>
          typeof attributes.style === 'string' ? { 'data-style': attributes.style } : {},
      },
      mode: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-mode') || undefined,
        renderHTML: (attributes) =>
          typeof attributes.mode === 'string' ? { 'data-mode': attributes.mode } : {},
      },
      headers: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-headers');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          Array.isArray(attributes.headers) ? { 'data-headers': JSON.stringify(attributes.headers) } : {},
      },
      column_types: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-column-types');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          isRecord(attributes.column_types)
            ? { 'data-column-types': JSON.stringify(attributes.column_types) }
            : {},
      },
      row_types: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-row-types');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          isRecord(attributes.row_types)
            ? { 'data-row-types': JSON.stringify(attributes.row_types) }
            : {},
      },
      caption: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-caption');
          if (!raw) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
        renderHTML: (attributes) =>
          attributes.caption !== undefined ? { 'data-caption': JSON.stringify(attributes.caption) } : {},
      },
      base_variable: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-base-variable') || undefined,
        renderHTML: (attributes) =>
          typeof attributes.base_variable === 'string' ? { 'data-base-variable': attributes.base_variable } : {},
      },
      value_type: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-value-type');
          if (!raw) return undefined;
          try {
            return normalizeTypeSchema(JSON.parse(raw));
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          isRecord(attributes.value_type)
            ? { 'data-value-type': JSON.stringify(normalizeTypeSchema(attributes.value_type)) }
            : {},
      },
      layout_template: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-layout-template') || undefined,
        renderHTML: (attributes) =>
          typeof attributes.layout_template === 'string' ? { 'data-layout-template': attributes.layout_template } : {},
      },
      token_registry: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-token-registry');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          isRecord(attributes.token_registry)
            ? { 'data-token-registry': JSON.stringify(attributes.token_registry) }
            : {},
      },
      token_labels: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-token-labels');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return isRecord(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          isRecord(attributes.token_labels)
            ? { 'data-token-labels': JSON.stringify(attributes.token_labels) }
            : {},
      },
      layout_nodes: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-layout-nodes');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) =>
          Array.isArray(attributes.layout_nodes)
            ? { 'data-layout-nodes': JSON.stringify(attributes.layout_nodes) }
            : {},
      },
      repeat: {
        default: undefined,
        parseHTML: (element) => element.getAttribute('data-repeat') === 'true',
        renderHTML: (attributes) =>
          attributes.repeat === true ? { 'data-repeat': 'true' } : {},
      },
      value: {
        default: '',
        parseHTML: (element) => {
          const raw = element.getAttribute('data-value');
          if (!raw) return '';
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        },
        renderHTML: (attributes) => ({ 'data-value': JSON.stringify(attributes.value ?? '') }),
      },
      optional: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-optional') === 'true',
        renderHTML: (attributes) => attributes.optional ? { 'data-optional': 'true' } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-placeholder]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = (node.attrs || {}) as Record<string, unknown>;
    const validationError = validatePlaceholderAttrs(attrs);
    if (validationError) {
      return ['span', { 'data-component-error': 'placeholder', title: validationError }, '[invalid placeholder]'];
    }

    const schema = deriveSchemaFromChildren(typeof attrs.kind === 'string' ? attrs.kind : 'string', attrs, node.content);

    if (schema.kind === 'string' || schema.kind === 'integer') {
      return ['span', mergeAttributes(HTMLAttributes, { 'data-placeholder': 'true' }), 0];
    }

    return renderValueBySchema(schema, attrs.value);
  },
});
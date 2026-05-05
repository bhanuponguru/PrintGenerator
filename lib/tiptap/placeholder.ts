import { mergeAttributes, Node } from '@tiptap/core';
import { ComponentTypeSchema, ContainerTypeSchema, CustomLayoutNode, CustomPlaceholderItemSchema, CustomTypeSchema, ListStyle, ListTypeSchema, RepeatTypeSchema, TableMode, TableTypeSchema, TokenLibraryItemSchema } from '@/types/template';

export interface PlaceholderNodeAttrs {
  key: string;
  kind?: string;
  schema: ComponentTypeSchema;
  value: unknown;
  optional?: boolean;
  color?: string | null;
  backgroundColor?: string | null;
  textAlign?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  textDecoration?: string | null;
  striped?: boolean;
  column_styles?: Record<string, any>;
}

export interface PlaceholderStyles {
  color?: string | null;
  backgroundColor?: string | null;
  textAlign?: string | null;
  fontWeight?: string | null;
  fontStyle?: string | null;
  textDecoration?: string | null;
  striped?: boolean;
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
    ...(Array.isArray(value.dynamic_fields)
      ? { dynamic_fields: value.dynamic_fields.filter((field): field is string => typeof field === 'string' && field.trim() !== '') }
      : {}),
    ...(isRecord(value.static_values)
      ? { static_values: Object.fromEntries(Object.entries(value.static_values)) }
      : {}),
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
    normalized.caption = typeof value.caption === 'string' && value.caption.trim() !== '' ? value.caption.trim() : undefined;
  }

  return normalized;
}

function tokenLibraryItemToSchema(item: TokenLibraryItemSchema): ComponentTypeSchema {
  if (item.kind === 'list') {
    return {
      kind: 'list',
      item_type: item.item_type ? normalizeTypeSchema(item.item_type) : { kind: 'string' },
      style: normalizeListStyle(item.style),
    };
  }

  if (item.kind === 'table') {
    return {
      kind: 'table',
      mode: item.mode === 'column_data' ? 'column_data' : 'row_data',
      headers: Array.isArray(item.headers) ? item.headers : undefined,
      dynamic_headers: typeof item.dynamic_headers === 'boolean' ? item.dynamic_headers : undefined,
      column_types: isRecord(item.column_types)
        ? Object.fromEntries(Object.entries(item.column_types).map(([k, v]) => [k, normalizeTypeSchema(v)]))
        : undefined,
      row_types: isRecord(item.row_types)
        ? Object.fromEntries(Object.entries(item.row_types).map(([k, v]) => [k, normalizeTypeSchema(v)]))
        : undefined,
      caption: typeof item.caption === 'string' && item.caption.trim() !== '' ? item.caption.trim() : undefined,
      ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
      ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
    };
  }

  if (item.kind === 'image') {
    return {
      kind: 'image',
      ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
      ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
    } as ComponentTypeSchema;
  }

  if (item.kind === 'hyperlink') {
    return {
      kind: 'hyperlink',
      ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
      ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
    } as ComponentTypeSchema;
  }

  return normalizeTypeSchema({ kind: item.kind });
}

function normalizeTypeSchema(rawSchema: unknown): ComponentTypeSchema {
  if (!isRecord(rawSchema) || typeof rawSchema.kind !== 'string') {
    return { kind: 'string' };
  }

  const schema = rawSchema as any as ComponentTypeSchema;

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
      const compositeSchema = schema as any;
      return {
        kind: compositeSchema.kind,
        component_types: Array.isArray(compositeSchema.component_types)
          ? compositeSchema.component_types.map((item: any) => normalizeTypeSchema(item))
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
        caption: typeof tableSchema.caption === 'string' && tableSchema.caption.trim() !== '' ? tableSchema.caption.trim() : undefined,
        column_styles: isRecord(tableSchema.column_styles) ? tableSchema.column_styles : undefined,
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

  const rendered = renderTemplateBySchema(layout, itemBase, itemValue, tokenRegistry);
  return ['div', { 'data-custom-item': item.id, 'data-custom-item-index': String(index) }, ...rendered];
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

    // Backward-compatible fallback for legacy templates that used bare token IDs.
    if (!token.includes('.') && isRecord(value) && token in value) {
      const projected = value[token];
      if (projected === null || projected === undefined) return '';
      return typeof projected === 'object' ? JSON.stringify(projected) : String(projected);
    }

    return '';
  });
}

function renderTemplateBySchema(
  template: string,
  baseVariable: string,
  value: unknown,
  tokenSchemaMap?: Record<string, ComponentTypeSchema>
): Array<string | DOMSpec> {
  const segments: Array<string | DOMSpec> = [];
  const tokenRe = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(template)) !== null) {
    const [raw, token] = match;
    if (match.index > lastIndex) {
      segments.push(template.slice(lastIndex, match.index));
    }

    let projected: unknown;
    let tokenSchema: ComponentTypeSchema | undefined;
    const prefix = `${baseVariable}.`;

    if (token === baseVariable) {
      projected = value;
    } else if (token.startsWith(prefix)) {
      const tokenPath = token.slice(prefix.length);
      projected = getByPath(value, tokenPath);
      const tokenId = tokenPath.split('.')[0] || '';
      tokenSchema = tokenSchemaMap?.[tokenId];
    } else if (!token.includes('.') && isRecord(value) && token in value) {
      projected = value[token];
      tokenSchema = tokenSchemaMap?.[token];
    }

    if (projected !== undefined && projected !== null) {
      if (tokenSchema) {
        if ((tokenSchema.kind === 'string' || tokenSchema.kind === 'integer')
          && (typeof projected === 'string' || typeof projected === 'number' || typeof projected === 'boolean')) {
          segments.push(String(projected));
        } else {
          segments.push(renderValueBySchema(tokenSchema, projected));
        }
      } else if (typeof projected === 'string' || typeof projected === 'number' || typeof projected === 'boolean') {
        segments.push(String(projected));
      }
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < template.length) {
    segments.push(template.slice(lastIndex));
  }

  return segments.length > 0 ? segments : [''];
}

function buildStyle(styles: PlaceholderStyles): Record<string, string> {
  const style: Record<string, string> = {};
  if (styles.color) style.color = styles.color;
  if (styles.backgroundColor) style['background-color'] = styles.backgroundColor;
  if (styles.textAlign) style['text-align'] = styles.textAlign;
  if (styles.fontWeight) style['font-weight'] = styles.fontWeight;
  if (styles.fontStyle) style['font-style'] = styles.fontStyle;
  if (styles.textDecoration) style['text-decoration'] = styles.textDecoration;
  
  const styleString = Object.entries(style).map(([k, v]) => `${k}: ${v}`).join('; ');
  return styleString ? { style: styleString } : {};
}

export function renderValueBySchema(schema: ComponentTypeSchema, value: unknown, styles: PlaceholderStyles = {}): DOMSpec {
  const baseStyle = buildStyle(styles);
  
  switch (schema.kind) {
    case 'string':
    case 'integer':
      return ['span', { ...baseStyle }, value === undefined || value === null ? '' : String(value)];

    case 'image': {
      if (!isRecord(value)) return ['span', { ...baseStyle }, '[invalid image value]'];
      const src = typeof value.src === 'string' ? value.src : '';
      const alt = typeof value.alt === 'string' ? value.alt : '';
      const align = styles.textAlign || 'left';
      let imgStyle = 'max-width:100%;height:auto;display:block;';
      if (align === 'center') imgStyle += 'margin-left:auto;margin-right:auto;';
      else if (align === 'right') imgStyle += 'margin-left:auto;margin-right:0;';
      else imgStyle += 'margin-left:0;margin-right:auto;';

      return ['figure', { ...baseStyle, style: `${baseStyle.style || ''};display:block;margin:0;` }, ['img', { src, alt, style: imgStyle }]];
    }

    case 'hyperlink': {
      if (!isRecord(value)) return ['span', { ...baseStyle }, '[invalid hyperlink value]'];
      const href = typeof value.url === 'string' ? value.url : '';
      const alias = typeof value.alias === 'string' ? value.alias : '';
      return ['a', { ...baseStyle, href, target: '_blank', rel: 'noopener noreferrer' }, alias];
    }

    case 'repeat': {
      const repeatValue = isRecord(value) ? value : {};
      const items = Array.isArray(repeatValue.items) ? repeatValue.items : Array.isArray(value) ? value : [];
      if (typeof schema.layout_template === 'string' && schema.layout_template.trim() !== '') {
        const baseVariable = schema.base_variable || 'item';
        return [
          'div',
          { ...baseStyle, 'data-repeat': 'true' },
          ...items.map((item) => ['div', { 'data-repeat-item': 'true' }, renderTemplateString(schema.layout_template!, baseVariable, item)]),
        ];
      }
      const child = renderCollection(items, schema.item_type);
      return ['div', { ...baseStyle, 'data-repeat': 'true' }, ...child];
    }

    case 'custom': {
      const baseVariable = schema.base_variable || 'item';
      const layout = schema.layout_template || '{{item}}';
      const tokenSchemaMap = Array.isArray(schema.token_library)
        ? Object.fromEntries(schema.token_library.map((item) => [item.id, tokenLibraryItemToSchema(item)]))
        : isRecord(schema.token_registry)
          ? Object.fromEntries(Object.entries(schema.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)]))
          : undefined;

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
          { ...baseStyle, 'data-custom': 'true', 'data-custom-items': 'true' },
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
          { ...baseStyle, 'data-custom': 'true', 'data-custom-repeat': 'true' },
          ...items.map((item) => ['div', { 'data-custom-item': 'true' }, ...renderTemplateBySchema(layout, baseVariable, item, tokenSchemaMap)]),
        ];
      }

      const dataValue = isRecord(value) && 'data' in value ? value.data : value;
      return ['div', { ...baseStyle, 'data-custom': 'true' }, ...renderTemplateBySchema(layout, baseVariable, dataValue, tokenSchemaMap)];
    }

    case 'list': {
      const listValue = isRecord(value) ? value : {};
      const items = Array.isArray(listValue.items) ? listValue.items : Array.isArray(value) ? value : [];
      const style = normalizeListStyle(listValue.style ?? schema.style ?? 'bulleted');
      const itemType = schema.item_type;

      if (style === 'plain') {
        return ['div', { ...baseStyle, 'data-list-style': 'plain' }, ...items.map((item) => ['div', {}, renderValueBySchema(itemType, item)])];
      }

      const listTag = style === 'numbered' ? 'ol' : 'ul';
      return [listTag, { ...baseStyle, 'data-list-style': style }, ...items.map((item) => ['li', {}, renderValueBySchema(itemType, item)])];
    }

    case 'container': {
      const containerValue = isRecord(value) ? value : {};
      const components = Array.isArray(containerValue.components) ? containerValue.components : [];
      const mode = schema.mode === 'repeat' ? 'repeat' : 'tuple';

      if (mode === 'repeat') {
        const itemType = schema.item_type || { kind: 'string' };
        return ['div', { ...baseStyle, 'data-component': 'container', 'data-mode': 'repeat' }, ...renderCollection(components, itemType)];
      }

      const componentTypes = Array.isArray(schema.component_types) ? schema.component_types : [];
      return [
        'div',
        { ...baseStyle, 'data-component': 'container', 'data-mode': 'tuple' },
        ...components.map((component, index) => ['div', {}, renderValueBySchema(componentTypes[index] || { kind: 'string' }, component)]),
      ];
    }

    case 'table': {
      const tableValue = isRecord(value) ? value : {};
      const mode: TableMode = schema.mode || (Array.isArray(tableValue.rows) ? 'row_data' : 'column_data');
      const headers = schema.headers && schema.headers.length > 0 ? schema.headers : inferTableHeaders(tableValue, mode);

      const colStyles = (schema as TableTypeSchema).column_styles || {};
      const getColStyle = (name: string) => {
        const s = colStyles[name];
        if (!s) return {};
        const pieces: Record<string, string> = {};
        if (s.align) pieces['text-align'] = s.align;
        if (s.color) pieces.color = s.color;
        if (s.backgroundColor) pieces['background-color'] = s.backgroundColor;
        const str = Object.entries(pieces).map(([k, v]) => `${k}:${v}`).join(';');
        return str ? { style: str } : {};
      };

      const captionNode = typeof schema.caption === 'string' && schema.caption.trim() !== ''
        ? ['caption', {}, schema.caption]
        : null;

      if (mode === 'row_data') {
        const rows = Array.isArray(tableValue.rows) ? tableValue.rows : [];
        return [
          'table',
          { ...baseStyle, className: styles.striped ? 'pg-table-striped' : '' },
          ...(captionNode ? [captionNode] : []),
          ['thead', {}, ['tr', {}, ...headers.map((h) => ['th', getColStyle(h), h])]],
          ['tbody', {}, ...rows.map((row) => {
            const rowObj = isRecord(row) ? row : {};
            return ['tr', {}, ...headers.map((h) => ['td', getColStyle(h), String(rowObj[h] ?? '')])];
          })],
        ];
      }

      const columns = isRecord(tableValue.columns) ? tableValue.columns : {};
      const columnNames = Object.keys(columns);
      return [
        'table',
        { ...baseStyle, className: styles.striped ? 'pg-table-striped' : '' },
        ...(captionNode ? [captionNode] : []),
        ['thead', {}, ['tr', {}, ['th', {}, ''], ...columnNames.map((name) => ['th', getColStyle(name), name])]],
        ['tbody', {}, ...headers.map((rowHeader) => [
          'tr',
          {},
          ['th', {}, rowHeader],
          ...columnNames.map((name) => {
            const col = isRecord(columns[name]) ? columns[name] : {};
            return ['td', getColStyle(name), String(col[rowHeader] ?? '')];
          }),
        ])],
      ];
    }

    default:
      return ['span', { ...baseStyle }, value === undefined || value === null ? '' : String(value)];
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
      ...(typeof attrs.caption === 'string' && attrs.caption.trim() !== '' ? { caption: attrs.caption.trim() } : {}),
      ...(isRecord(attrs.column_styles) ? { column_styles: attrs.column_styles as any } : {}),
    } as ComponentTypeSchema;
  }

  if (kind === 'page_break') {
    return { kind: 'page_break' };
  }

  if (kind === 'image' || kind === 'hyperlink' || kind === 'integer' || kind === 'string') {
    return { kind: kind as ComponentTypeSchema['kind'] } as ComponentTypeSchema;
  }

  return { kind: (kind || 'string') as ComponentTypeSchema['kind'] } as ComponentTypeSchema;
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
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || null,
        renderHTML: (attributes) => attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
      },
      textAlign: {
        default: null,
        parseHTML: (element) => element.style.textAlign || null,
        renderHTML: (attributes) => attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
      },
      fontWeight: {
        default: null,
        parseHTML: (element) => element.style.fontWeight || null,
        renderHTML: (attributes) => attributes.fontWeight ? { style: `font-weight: ${attributes.fontWeight}` } : {},
      },
      fontStyle: {
        default: null,
        parseHTML: (element) => element.style.fontStyle || null,
        renderHTML: (attributes) => attributes.fontStyle ? { style: `font-style: ${attributes.fontStyle}` } : {},
      },
      textDecoration: {
        default: null,
        parseHTML: (element) => element.style.textDecoration || null,
        renderHTML: (attributes) => attributes.textDecoration ? { style: `text-decoration: ${attributes.textDecoration}` } : {},
      },
      striped: {
        default: false,
        parseHTML: (element) => element.classList.contains('pg-table-striped'),
        renderHTML: (attributes) => attributes.striped ? { class: 'pg-table-striped' } : {},
      },
      column_styles: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-column-styles');
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => (attributes.column_styles ? { 'data-column-styles': JSON.stringify(attributes.column_styles) } : {}),
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

    const styles: PlaceholderStyles = {
      color: attrs.color as string,
      backgroundColor: attrs.backgroundColor as string,
      textAlign: attrs.textAlign as string,
      fontWeight: attrs.fontWeight as string,
      fontStyle: attrs.fontStyle as string,
      textDecoration: attrs.textDecoration as string,
      striped: !!attrs.striped,
    };

    if (schema.kind === 'table' && attrs.column_styles) {
      (schema as TableTypeSchema).column_styles = attrs.column_styles as any;
    }

    if (schema.kind === 'string' || schema.kind === 'integer') {
      const baseStyle = buildStyle(styles);
      return ['span', mergeAttributes(HTMLAttributes, { 'data-placeholder': 'true', ...baseStyle }), 0];
    }

    return renderValueBySchema(schema, attrs.value, styles);
  },
});
import { mergeAttributes, Node } from '@tiptap/core';
import { ComponentTypeSchema, ContainerTypeSchema, ListTypeSchema } from '@/types/template';

/**
 * Placeholder attrs carry the data binding and the structural hints required
 * to derive a schema without storing redundant computed metadata.
 */
export interface PlaceholderNodeAttrs {
  key: string;
  kind: string; // 'string', 'integer', 'image', 'hyperlink', 'list', 'container', 'table'
  value: unknown;
  // Template-specific rendering properties
  style?: 'bulleted' | 'numbered' | 'plain'; // For lists
  item_kind?: 'string' | 'integer' | 'image' | 'hyperlink'; // For lists
  mode?: 'row_data' | 'column_data'; // For tables
  headers?: string[]; // For tables
  component_kinds?: Array<'string' | 'integer' | 'image' | 'hyperlink'>; // For containers
  // Row mode: type per column header.
  column_types?: Record<string, ComponentTypeSchema>;
  // Column mode: type per row header.
  row_types?: Record<string, ComponentTypeSchema>;
  caption?: ComponentTypeSchema; // For tables
  option?: Record<string, unknown>; // For images
}

/** Lightweight DOM tuple representation used by TipTap renderHTML hooks. */
type DOMSpec = [string, ...any[]];

/** Returns true when a value is a plain object and not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Escapes user content before embedding it into generated HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normalizes list styles to the small set supported by the renderer. */
function normalizeListStyle(style: unknown): 'bulleted' | 'numbered' | 'plain' {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

/**
 * Renders a placeholder value according to the derived schema for the node.
 * Composite schemas recurse into their child values.
 */
function renderValueBySchema(
  schema: ComponentTypeSchema,
  value: unknown,
  nodeAttrs?: Partial<PlaceholderNodeAttrs>
): DOMSpec {
  switch (schema.kind) {
    case 'string':
    case 'integer':
      return ['span', {}, value === undefined || value === null ? '' : String(value)];

    case 'image': {
      if (!isRecord(value)) {
        return ['span', {}, '[invalid image value]'];
      }
      const src = typeof value.src === 'string' ? value.src : '';
      const alt = typeof value.alt === 'string' ? value.alt : '';
      return ['figure', {}, ['img', { src, alt, style: 'max-width:100%;height:auto;' }]];
    }

    case 'hyperlink': {
      if (!isRecord(value)) {
        return ['span', {}, '[invalid hyperlink value]'];
      }
      const href = typeof value.url === 'string' ? value.url : '';
      const alias = typeof value.alias === 'string' ? value.alias : '';
      return ['a', { href, target: '_blank', rel: 'noopener noreferrer' }, alias];
    }

    case 'list': {
      const listValue = isRecord(value) ? value : {};
      const items = Array.isArray(listValue.items) ? listValue.items : [];
      const style = normalizeListStyle(nodeAttrs?.style ?? 'bulleted');
      const itemType = (schema as ListTypeSchema).item_type;

      if (style === 'plain') {
        return [
          'div',
          { 'data-list-style': 'plain' },
          ...items.map((item) => ['div', {}, renderValueBySchema(itemType, item, nodeAttrs)]),
        ];
      }

      const listTag = style === 'numbered' ? 'ol' : 'ul';
      return [
        listTag,
        { 'data-list-style': style },
        ...items.map((item) => ['li', {}, renderValueBySchema(itemType, item, nodeAttrs)]),
      ];
    }

    case 'container': {
      const containerValue = isRecord(value) ? value : {};
      const components = Array.isArray(containerValue.components) ? containerValue.components : [];
      const componentTypes = (schema as ContainerTypeSchema).component_types;
      return [
        'div',
        { 'data-component': 'container' },
        ...components.map((component, index) => {
          const componentSchema = componentTypes[index] || { kind: 'string' };
          return ['div', {}, renderValueBySchema(componentSchema, component, nodeAttrs)];
        }),
      ];
    }

    case 'table': {
      const tableValue = isRecord(value) ? value : {};
      const caption = tableValue.caption !== undefined
        ? ['caption', {}, typeof tableValue.caption === 'string' ? tableValue.caption : escapeHtml(JSON.stringify(tableValue.caption))]
        : null;

      const mode = nodeAttrs?.mode || 'row_data';
      const headers = nodeAttrs?.headers || [];

      if (mode === 'row_data') {
        const rows = Array.isArray(tableValue.rows) ? tableValue.rows : [];
        return [
          'table',
          {},
          ...(caption ? [caption] : []),
          ['thead', {}, ['tr', {}, ...headers.map((h: string) => ['th', {}, h])]],
          [
            'tbody',
            {},
            ...rows.map((row) => {
              const rowObj = isRecord(row) ? row : {};
              return ['tr', {}, ...headers.map((h: string) => ['td', {}, String(rowObj[h] ?? '')])];
            }),
          ],
        ];
      }

      const columns = isRecord(tableValue.columns) ? tableValue.columns : {};
      const columnNames = Object.keys(columns);
      return [
        'table',
        {},
        ...(caption ? [caption] : []),
        ['thead', {}, ['tr', {}, ['th', {}, ''], ...columnNames.map((name) => ['th', {}, name])]],
        [
          'tbody',
          {},
          ...headers.map((rowHeader: string) => [
            'tr',
            {},
            ['th', {}, rowHeader],
            ...columnNames.map((name) => {
              const col = isRecord(columns[name]) ? columns[name] : {};
              return ['td', {}, String(col[rowHeader] ?? '')];
            }),
          ]),
        ],
      ];
    }

    default:
      return ['span', {}, value === undefined || value === null ? '' : String(value)];
  }
}

/** Validates the minimum placeholder attrs required by the editor and API. */
export function validatePlaceholderAttrs(attrs: Record<string, unknown>): string | null {
  if (typeof attrs.key !== 'string' || attrs.key.trim() === '') {
    return 'placeholder.attrs.key must be a non-empty string';
  }

  if (typeof attrs.kind !== 'string' || attrs.kind.trim() === '') {
    return 'placeholder.attrs.kind must be a non-empty string';
  }

  return null;
}

/**
 * Derives a ComponentTypeSchema from a placeholder node's attributes and children.
 * Used to determine the schema for a placeholder based on its kind and structure.
 * @param kind The placeholder kind ('string', 'integer', 'image', 'hyperlink', 'list', 'container', 'table')
 * @param attrs The placeholder attributes (style, mode, headers, children, etc.)
 * @param children The placeholder's child nodes
 * @returns The derived ComponentTypeSchema
 */
/**
 * Derives the placeholder schema from the declared kind and supporting attrs.
 * This is the single source of truth for typed placeholders.
 */
export function deriveSchemaFromChildren(kind: string, attrs: Record<string, unknown>, children: unknown): ComponentTypeSchema {
  // Primitive types
  if (kind === 'string' || kind === 'integer' || kind === 'image' || kind === 'hyperlink') {
    return { kind: kind as any };
  }

  // List: derive item_type from explicit item_kind input
  if (kind === 'list') {
    const itemKind = typeof attrs.item_kind === 'string' ? attrs.item_kind : '';
    if (!itemKind) {
      return { kind: 'list' } as any;
    }

    return { kind: 'list', item_type: { kind: itemKind as any } };
  }

  // Table
  if (kind === 'table') {
    return { kind: 'table' };
  }

  // Container: collect all child schemas
  if (kind === 'container') {
    const componentKinds = Array.isArray(attrs.component_kinds) ? attrs.component_kinds : [];
    const componentSchemas = componentKinds.map((componentKind) => ({ kind: componentKind } as ComponentTypeSchema));

    return {
      kind: 'container',
      component_types: componentSchemas,
    };
  }

  // Default
  return { kind: 'string' };
}

/** Returns a copy of placeholder attrs with a new runtime value applied. */
export function substitutePlaceholderValue(
  attrs: PlaceholderNodeAttrs,
  nextValue: unknown
): PlaceholderNodeAttrs {
  return {
    ...attrs,
    value: nextValue,
  };
}

/** Creates a raw placeholder node payload ready for insertion into TipTap. */
export function createPlaceholderNode(attrs: PlaceholderNodeAttrs) {
  const validationError = validatePlaceholderAttrs(attrs as unknown as Record<string, unknown>);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'placeholder',
    attrs,
  };
}

/**
 * Custom Tiptap node used for fillable values.
 * The `key` attribute stores the placeholder key in templates,
 * while node content holds the visible text.
 */
/** TipTap node definition that renders placeholders into HTML output. */
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
      item_kind: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-item-kind');
          return raw === 'string' || raw === 'integer' || raw === 'image' || raw === 'hyperlink' ? raw : undefined;
        },
        renderHTML: (attributes) => {
          const itemKind = attributes.item_kind;
          return itemKind === 'string' || itemKind === 'integer' || itemKind === 'image' || itemKind === 'hyperlink'
            ? { 'data-item-kind': itemKind }
            : {};
        },
      },
      component_kinds: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-component-kinds');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
              ? parsed.filter((item) => item === 'string' || item === 'integer' || item === 'image' || item === 'hyperlink')
              : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          const kinds = attributes.component_kinds;
          return Array.isArray(kinds) && kinds.length > 0
            ? { 'data-component-kinds': JSON.stringify(kinds) }
            : {};
        },
      },
      style: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-style');
          return raw === 'numbered' || raw === 'plain' || raw === 'bulleted' ? raw : undefined;
        },
        renderHTML: (attributes) => {
          const style = attributes.style;
          return style === 'numbered' || style === 'plain' || style === 'bulleted'
            ? { 'data-style': style }
            : {};
        },
      },
      mode: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-mode');
          return raw === 'column_data' || raw === 'row_data' ? raw : undefined;
        },
        renderHTML: (attributes) => {
          const mode = attributes.mode;
          return mode === 'column_data' || mode === 'row_data' ? { 'data-mode': mode } : {};
        },
      },
      headers: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-headers');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter((h) => typeof h === 'string') : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          const headers = attributes.headers;
          return Array.isArray(headers) ? { 'data-headers': JSON.stringify(headers) } : {};
        },
      },
      column_types: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-column-types');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          const types = attributes.column_types;
          return types && typeof types === 'object' && !Array.isArray(types)
            ? { 'data-column-types': JSON.stringify(types) }
            : {};
        },
      },
      row_types: {
        default: undefined,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-row-types');
          if (!raw) return undefined;
          try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        },
        renderHTML: (attributes) => {
          const types = attributes.row_types;
          return types && typeof types === 'object' && !Array.isArray(types)
            ? { 'data-row-types': JSON.stringify(types) }
            : {};
        },
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-placeholder]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = (node.attrs || {}) as Record<string, unknown>;
    const validationError = validatePlaceholderAttrs(attrs);
    if (validationError) {
      return ['span', { 'data-component-error': 'placeholder', title: validationError }, '[invalid placeholder]'];
    }

    const kind = typeof attrs.kind === 'string' ? attrs.kind : 'string';
    const schema = deriveSchemaFromChildren(kind, attrs, node.content);

    if (schema.kind === 'string' || schema.kind === 'integer') {
      return ['span', mergeAttributes(HTMLAttributes, { 'data-placeholder': 'true' }), 0];
    }

    return renderValueBySchema(schema, attrs.value, attrs);
  },
});

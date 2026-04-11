import { mergeAttributes, Node } from '@tiptap/core';
import { ComponentTypeSchema } from '@/types/template';

export interface PlaceholderNodeAttrs {
  key: string;
  value: unknown;
  value_schema: ComponentTypeSchema;
  in_placeholder: boolean;
}

type DOMSpec = [string, ...any[]];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeListStyle(style: unknown): 'bulleted' | 'numbered' | 'plain' {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function renderValueBySchema(schema: ComponentTypeSchema, value: unknown): DOMSpec {
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
      const style = normalizeListStyle(listValue.style ?? schema.style);

      if (style === 'plain') {
        return [
          'div',
          { 'data-list-style': 'plain' },
          ...items.map((item) => ['div', {}, renderValueBySchema(schema.item_type, item)]),
        ];
      }

      const listTag = style === 'numbered' ? 'ol' : 'ul';
      return [
        listTag,
        { 'data-list-style': style },
        ...items.map((item) => ['li', {}, renderValueBySchema(schema.item_type, item)]),
      ];
    }

    case 'container': {
      const containerValue = isRecord(value) ? value : {};
      const components = Array.isArray(containerValue.components) ? containerValue.components : [];
      return [
        'div',
        { 'data-component': 'container' },
        ...components.map((component, index) => {
          const componentSchema = schema.component_types[index] || { kind: 'string', in_placeholder: true };
          return ['div', {}, renderValueBySchema(componentSchema as ComponentTypeSchema, component)];
        }),
      ];
    }

    case 'table': {
      const tableValue = isRecord(value) ? value : {};
      const caption = tableValue.caption !== undefined
        ? ['caption', {}, typeof tableValue.caption === 'string' ? tableValue.caption : escapeHtml(JSON.stringify(tableValue.caption))]
        : null;

      if (schema.mode === 'row_data') {
        const rows = Array.isArray(tableValue.rows) ? tableValue.rows : [];
        return [
          'table',
          {},
          ...(caption ? [caption] : []),
          ['thead', {}, ['tr', {}, ...schema.headers.map((h) => ['th', {}, h])]],
          [
            'tbody',
            {},
            ...rows.map((row) => {
              const rowObj = isRecord(row) ? row : {};
              return ['tr', {}, ...schema.headers.map((h) => ['td', {}, String(rowObj[h] ?? '')])];
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
          ...schema.headers.map((rowHeader) => [
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

export function validatePlaceholderAttrs(attrs: Record<string, unknown>): string | null {
  if (typeof attrs.key !== 'string' || attrs.key.trim() === '') {
    return 'placeholder.attrs.key must be a non-empty string';
  }

  if (!isRecord(attrs.value_schema) || typeof attrs.value_schema.kind !== 'string') {
    return 'placeholder.attrs.value_schema must be a valid component schema object';
  }

  if ('in_placeholder' in attrs && typeof attrs.in_placeholder !== 'boolean') {
    return 'placeholder.attrs.in_placeholder must be a boolean';
  }

  return null;
}

export function substitutePlaceholderValue(
  attrs: PlaceholderNodeAttrs,
  nextValue: unknown
): PlaceholderNodeAttrs {
  return {
    ...attrs,
    value: nextValue,
  };
}

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
      value_schema: {
        default: { kind: 'string', in_placeholder: true },
        parseHTML: (element) => {
          const raw = element.getAttribute('data-value-schema');
          if (!raw) return { kind: 'string', in_placeholder: true };
          try {
            return JSON.parse(raw);
          } catch {
            return { kind: 'string', in_placeholder: true };
          }
        },
        renderHTML: (attributes) => ({ 'data-value-schema': JSON.stringify(attributes.value_schema) }),
      },
      in_placeholder: {
        default: true,
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

    const schema = attrs.value_schema as ComponentTypeSchema;
    if (schema.kind === 'string' || schema.kind === 'integer') {
      return ['span', mergeAttributes(HTMLAttributes, { 'data-placeholder': 'true' }), 0];
    }

    return renderValueBySchema(schema, attrs.value);
  },
});

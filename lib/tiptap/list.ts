import { Node } from '@tiptap/core';
import { ListStyle, ListValue } from '@/types/template';

function normalizeListStyle(style: unknown): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

export interface ListComponentNode {
  type: 'listComponent';
  attrs: {
    value: ListValue;
    in_placeholder: boolean;
    [key: string]: unknown;
  };
}

export function validateListAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'listComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;
  if (!Array.isArray(value.items)) {
    return 'listComponent.attrs.value.items must be an array';
  }
  if ('style' in value && value.style !== undefined && value.style !== null && !['bulleted', 'numbered', 'plain'].includes(String(value.style))) {
    return 'listComponent.attrs.value.style must be bulleted, numbered, or plain';
  }
  if ('in_placeholder' in attrs && typeof attrs.in_placeholder !== 'boolean') {
    return 'listComponent.attrs.in_placeholder must be a boolean';
  }
  return null;
}

export function createListComponent(
  data: ListValue,
  attrs: Record<string, unknown> = {}
): ListComponentNode {
  const dataRecord = data as unknown as Record<string, unknown>;
  const mergedAttrs = {
    ...attrs,
    value: {
      ...data,
      items: Array.isArray(data.items) ? data.items : [],
      style: normalizeListStyle(dataRecord.style),
    },
    in_placeholder: typeof data.in_placeholder === 'boolean' ? data.in_placeholder : false,
  };

  const validationError = validateListAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'listComponent',
    attrs: mergedAttrs,
  };
}

export const ListComponent = Node.create({
  name: 'listComponent',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: { items: [], style: 'bulleted', in_placeholder: false } },
      in_placeholder: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component="list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateListAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'list', title: err }, '[invalid list component]'];
    }

    const value = attrs.value as Record<string, unknown>;
    const style = normalizeListStyle(value.style);
    const items = (value.items as unknown[]).map((item) => ['li', {}, typeof item === 'string' ? item : JSON.stringify(item)]);

    if (style === 'numbered') {
      return ['div', { 'data-component': 'list', 'data-list-style': 'numbered' }, ['ol', {}, ...items]];
    }

    if (style === 'plain') {
      return [
        'div',
        { 'data-component': 'list', 'data-list-style': 'plain' },
        ...((value.items as unknown[]).map((item) => ['div', {}, typeof item === 'string' ? item : JSON.stringify(item)])),
      ];
    }

    return ['div', { 'data-component': 'list', 'data-list-style': 'bulleted' }, ['ul', {}, ...items]];
  },
});

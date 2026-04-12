import { Node } from '@tiptap/core';
import { ListStyle, ListValue } from '@/types/template';

/** Normalizes list styles so rendering only branches on supported values. */
function normalizeListStyle(style: unknown): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

/** TipTap node payload for rendered list components. */
export interface ListComponentNode {
  type: 'listComponent';
  attrs: {
    value: ListValue;
    [key: string]: unknown;
  };
}

/** Validates the list component attrs before insertion or rendering. */
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
  return null;
}

/** Creates a typed list component node from the editor form payload. */
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
      value: { default: { items: [], style: 'bulleted' } },
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

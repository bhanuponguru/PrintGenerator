import { Node } from '@tiptap/core';
import { renderValueBySchema } from '@/lib/tiptap/placeholder';
import { HeaderValue } from '@/types/template';

export interface HeaderComponentNode {
  type: 'headerComponent';
  attrs: {
    value: HeaderValue;
    component_types?: unknown[];
    [key: string]: unknown;
  };
}

export function validateHeaderAttrs(attrs: Record<string, unknown>): string | null {
  // Now functioning primarily as an editable block component.
  // Validation is permissive unless explicitly bound to a strict component schema length.
  return null;
}

export function createHeaderComponent(
  data: HeaderValue,
  attrs: Record<string, unknown> = {}
): HeaderComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: {
      ...data,
      components: Array.isArray(data.components) ? data.components : [],
    },
  };

  const validationError = validateHeaderAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'headerComponent',
    attrs: mergedAttrs as HeaderComponentNode['attrs'],
  };
}

export const HeaderComponent = Node.create({
  name: 'headerComponent',
  group: 'block',
  content: 'block+',
  selectable: true,

  addAttributes() {
    return {
      value: { default: { components: [] } },
      component_types: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'header[data-component="header"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const err = validateHeaderAttrs(HTMLAttributes as Record<string, unknown>);
    if (err) {
      return ['span', { 'data-component-error': 'header', title: err }, '[invalid header component]'];
    }
    // '0' tells TipTap/ProseMirror to render the node's rich-text content here.
    return ['header', { 'data-component': 'header' }, 0];
  },
});

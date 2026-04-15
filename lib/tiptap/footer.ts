import { Node } from '@tiptap/core';
import { renderValueBySchema } from '@/lib/tiptap/placeholder';
import { FooterValue } from '@/types/template';

export interface FooterComponentNode {
  type: 'footerComponent';
  attrs: {
    value: FooterValue;
    component_types?: unknown[];
    [key: string]: unknown;
  };
}

export function validateFooterAttrs(attrs: Record<string, unknown>): string | null {
  // Now functioning primarily as an editable block component.
  return null;
}

export function createFooterComponent(
  data: FooterValue,
  attrs: Record<string, unknown> = {}
): FooterComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: {
      ...data,
      components: Array.isArray(data.components) ? data.components : [],
    },
  };

  const validationError = validateFooterAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'footerComponent',
    attrs: mergedAttrs as FooterComponentNode['attrs'],
  };
}

export const FooterComponent = Node.create({
  name: 'footerComponent',
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
    return [{ tag: 'footer[data-component="footer"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const err = validateFooterAttrs(HTMLAttributes as Record<string, unknown>);
    if (err) {
      return ['span', { 'data-component-error': 'footer', title: err }, '[invalid footer component]'];
    }
    // '0' tells TipTap/ProseMirror to render the node's rich-text content here.
    return ['footer', { 'data-component': 'footer' }, 0];
  },
});

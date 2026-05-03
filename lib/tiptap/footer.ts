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
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'footerComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (!Array.isArray(value.components)) {
    return 'footerComponent.attrs.value.components must be an array';
  }

  if ('component_types' in attrs && !Array.isArray(attrs.component_types)) {
    return 'footerComponent.attrs.component_types must be an array when provided';
  }

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

    const attrs = HTMLAttributes as Record<string, unknown>;
    const value = attrs.value as Record<string, unknown>;
    const componentTypes = Array.isArray(attrs.component_types) ? attrs.component_types : [];
    const components = Array.isArray(value.components) ? value.components : [];

    if (components.length > 0) {
      const rendered = components.map((component, index) => [
        'div',
        {},
        renderValueBySchema((componentTypes[index] as any) || { kind: 'string' }, component),
      ]);
      return ['footer', { 'data-component': 'footer' }, ...rendered];
    }

    // '0' tells TipTap/ProseMirror to render the node's rich-text content here.
    return ['footer', { 'data-component': 'footer' }, 0];
  },
});

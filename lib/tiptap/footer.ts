import { Node } from '@tiptap/core';
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
  atom: true,

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
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateFooterAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'footer', title: err }, '[invalid footer component]'];
    }

    const value = attrs.value as Record<string, unknown>;
    const components = (value.components as unknown[]).map((component) => ['div', {}, typeof component === 'string' ? component : JSON.stringify(component)]);
    
    return ['footer', { 'data-component': 'footer' }, ...components];
  },
});

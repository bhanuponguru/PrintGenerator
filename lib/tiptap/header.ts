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
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'headerComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (!Array.isArray(value.components)) {
    return 'headerComponent.attrs.value.components must be an array';
  }

  if ('component_types' in attrs && !Array.isArray(attrs.component_types)) {
    return 'headerComponent.attrs.component_types must be an array when provided';
  }

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
      return ['header', { 'data-component': 'header' }, ...rendered];
    }

    // '0' tells TipTap/ProseMirror to render the node's rich-text content here.
    return ['header', { 'data-component': 'header' }, 0];
  },
});

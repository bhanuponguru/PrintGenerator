import { Node } from '@tiptap/core';
import { ContainerValue } from '@/types/template';

export interface ContainerComponentNode {
  type: 'containerComponent';
  attrs: {
    value: ContainerValue;
    in_placeholder: boolean;
    component_types?: unknown[];
    [key: string]: unknown;
  };
}

export function validateContainerAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'containerComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (!Array.isArray(value.components)) {
    return 'containerComponent.attrs.value.components must be an array';
  }
  if ('component_types' in attrs && !Array.isArray(attrs.component_types)) {
    return 'containerComponent.attrs.component_types must be an array when provided';
  }
  if ('in_placeholder' in attrs && typeof attrs.in_placeholder !== 'boolean') {
    return 'containerComponent.attrs.in_placeholder must be a boolean';
  }
  return null;
}

export function createContainerComponent(
  data: ContainerValue,
  attrs: Record<string, unknown> = {}
): ContainerComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: {
      ...data,
      components: Array.isArray(data.components) ? data.components : [],
    },
    in_placeholder: typeof data.in_placeholder === 'boolean' ? data.in_placeholder : false,
  };

  const validationError = validateContainerAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'containerComponent',
    attrs: mergedAttrs,
  };
}

export const ContainerComponent = Node.create({
  name: 'containerComponent',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: { components: [], in_placeholder: false } },
      component_types: { default: [] },
      in_placeholder: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component="container"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateContainerAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'container', title: err }, '[invalid container component]'];
    }

    const value = attrs.value as Record<string, unknown>;
    const components = (value.components as unknown[]).map((component) => ['div', {}, typeof component === 'string' ? component : JSON.stringify(component)]);
    return ['div', { 'data-component': 'container' }, ...components];
  },
});

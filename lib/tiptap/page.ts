import { Node } from '@tiptap/core';
import { PageValue } from '@/types/template';

/** TipTap node payload for rendered page components. */
export interface PageComponentNode {
  type: 'pageComponent';
  attrs: {
    value: PageValue;
    component_types?: unknown[];
    pageNumber: number;
    orientation: 'portrait' | 'landscape';
    size: string;
    customWidth?: string;
    customHeight?: string;
    [key: string]: unknown;
  };
}

export function validatePageAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'pageComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (!Array.isArray(value.components)) {
    return 'pageComponent.attrs.value.components must be an array';
  }
  if ('component_types' in attrs && !Array.isArray(attrs.component_types)) {
    return 'pageComponent.attrs.component_types must be an array when provided';
  }
  return null;
}

export function createPageComponent(
  data: PageValue,
  attrs: Record<string, unknown> = {}
): PageComponentNode {
  const mergedAttrs = {
    pageNumber: 1,
    orientation: 'portrait',
    size: 'A4',
    ...attrs,
    value: {
      ...data,
      components: Array.isArray(data.components) ? data.components : [],
    },
  };

  const validationError = validatePageAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'pageComponent',
    attrs: mergedAttrs as PageComponentNode['attrs'],
  };
}

export const PageComponent = Node.create({
  name: 'pageComponent',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: { components: [] } },
      component_types: { default: [] },
      pageNumber: { default: 1 },
      orientation: { default: 'portrait' },
      size: { default: 'A4' },
      customWidth: { default: null },
      customHeight: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component="page"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validatePageAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'page', title: err }, '[invalid page component]'];
    }

    const value = attrs.value as Record<string, unknown>;
    const components = (value.components as unknown[]).map((component) => ['div', {}, typeof component === 'string' ? component : JSON.stringify(component)]);
    
    return ['div', { 
      'data-component': 'page',
      'data-page-number': attrs.pageNumber,
      'data-orientation': attrs.orientation,
      'data-size': attrs.size,
      style: `page-break-after: always;`
    }, ...components];
  },
});

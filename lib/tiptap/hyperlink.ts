import { mergeAttributes, Node } from '@tiptap/core';
import { isAbsoluteUrl } from '@/lib/tiptap/utils';
import { HyperlinkValue } from '@/types/template';

/** TipTap node payload for rendered hyperlink components. */
export interface HyperlinkComponentNode {
  type: 'hyperlinkComponent';
  attrs: {
    value: HyperlinkValue;
    [key: string]: unknown;
  };
}

/** Validates the hyperlink component attrs before insertion or rendering. */
export function validateHyperlinkAttrs(attrs: Record<string, unknown>): string | null {
  if (!attrs.value || typeof attrs.value !== 'object' || Array.isArray(attrs.value)) {
    return 'hyperlinkComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (typeof value.alias !== 'string' || value.alias.trim() === '') {
    return 'hyperlinkComponent.attrs.value.alias must be a non-empty string';
  }
  if (typeof value.url !== 'string' || value.url.trim() === '') {
    return 'hyperlinkComponent.attrs.value.url must be a non-empty string';
  }
  if (!isAbsoluteUrl(value.url)) {
    return 'hyperlinkComponent.attrs.value.url must be an absolute URL';
  }
  return null;
}

/** Creates a typed hyperlink component node from the editor form payload. */
export function createHyperlinkComponent(
  data: HyperlinkValue,
  attrs: Record<string, unknown> = {}
): HyperlinkComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: data,
  };

  const validationError = validateHyperlinkAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'hyperlinkComponent',
    attrs: mergedAttrs,
  };
}

export const HyperlinkComponent = Node.create({
  name: 'hyperlinkComponent',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      value: { default: { alias: '', url: '' } },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-component="hyperlink"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateHyperlinkAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'hyperlink', title: err }, '[invalid hyperlink component]'];
    }

    const value = attrs.value as Record<string, unknown>;

    return [
      'a',
      mergeAttributes(
        {
          'data-component': 'hyperlink',
          href: value.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        attrs
      ),
      String(value.alias),
    ];
  },
});

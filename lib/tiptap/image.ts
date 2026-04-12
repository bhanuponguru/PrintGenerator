import { mergeAttributes, Node } from '@tiptap/core';
import { isRecord } from '@/lib/tiptap/utils';
import { ImageValue } from '@/types/template';

/** TipTap node payload for rendered image components. */
export interface ImageComponentNode {
  type: 'imageComponent';
  attrs: {
    value: ImageValue;
    width?: string | number;
    height?: string | number;
    [key: string]: unknown;
  };
}

/** Validates the image component attrs before insertion or rendering. */
export function validateImageAttrs(attrs: Record<string, unknown>): string | null {
  if (!isRecord(attrs.value)) {
    return 'imageComponent.attrs.value must be an object';
  }

  const value = attrs.value as Record<string, unknown>;

  if (typeof value.src !== 'string' || value.src.trim() === '') {
    return 'imageComponent.attrs.value.src must be a non-empty string';
  }
  if (typeof value.alt !== 'string') {
    return 'imageComponent.attrs.value.alt must be a string';
  }
  if ('option' in value && value.option !== undefined && !isRecord(value.option)) {
    return 'imageComponent.attrs.value.option must be an object when provided';
  }
  return null;
}

/** Creates a typed image component node from the editor form payload. */
export function createImageComponent(
  data: ImageValue,
  attrs: Record<string, unknown> = {}
): ImageComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: data,
  };

  const validationError = validateImageAttrs(mergedAttrs);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    type: 'imageComponent',
    attrs: mergedAttrs,
  };
}

export const ImageComponent = Node.create({
  name: 'imageComponent',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      value: { default: { src: '', alt: '' } },
      width: { default: undefined },
      height: { default: undefined },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-component="image"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const err = validateImageAttrs(attrs);

    if (err) {
      return ['span', { 'data-component-error': 'image', title: err }, '[invalid image component]'];
    }

    const value = attrs.value as Record<string, unknown>;

    return [
      'img',
      mergeAttributes(
        {
          'data-component': 'image',
          src: value.src,
          alt: value.alt,
          style: 'max-width:100%;height:auto;',
        },
        attrs
      ),
    ];
  },
});

import { mergeAttributes, Node } from '@tiptap/core';
import { isRecord } from '@/lib/tiptap/utils';
import { ImageValue } from '@/types/template';

export interface ImageComponentNode {
  type: 'imageComponent';
  attrs: {
    value: ImageValue;
    in_placeholder: boolean;
    width?: string | number;
    height?: string | number;
    [key: string]: unknown;
  };
}

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
  if ('in_placeholder' in attrs && typeof attrs.in_placeholder !== 'boolean') {
    return 'imageComponent.attrs.in_placeholder must be a boolean';
  }
  if ('option' in value && value.option !== undefined && !isRecord(value.option)) {
    return 'imageComponent.attrs.value.option must be an object when provided';
  }
  return null;
}

export function createImageComponent(
  data: ImageValue,
  attrs: Record<string, unknown> = {}
): ImageComponentNode {
  const mergedAttrs = {
    ...attrs,
    value: data,
    in_placeholder: typeof data.in_placeholder === 'boolean' ? data.in_placeholder : false,
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
      value: { default: { src: '', alt: '', in_placeholder: false } },
      in_placeholder: { default: false },
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

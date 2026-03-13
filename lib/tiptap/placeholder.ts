import { mergeAttributes, Node } from '@tiptap/core';

/**
 * Custom Tiptap node used for fillable values.
 * The `key` attribute stores the placeholder key in templates,
 * while node content holds the visible text.
 */
export const Placeholder = Node.create({
  name: 'placeholder',
  group: 'inline',
  inline: true,
  content: 'inline*',
  atom: false,
  selectable: false,

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-key') || '',
        renderHTML: (attributes) => {
          const key = typeof attributes.key === 'string' ? attributes.key : '';
          return key ? { 'data-key': key } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-placeholder]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-placeholder': 'true' }), 0];
  },
});

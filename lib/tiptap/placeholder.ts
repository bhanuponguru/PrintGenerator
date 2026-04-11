import { mergeAttributes, Node } from '@tiptap/core';
import { PlaceholderKeyTypeMap } from '@/types/template';

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
      keys: {
        default: {},
        parseHTML: (element) => {
          const raw = element.getAttribute('data-keys');
          if (!raw) {
            return {};
          }
          try {
            const parsed = JSON.parse(raw) as PlaceholderKeyTypeMap;
            return parsed && typeof parsed === 'object' ? parsed : {};
          } catch {
            return {};
          }
        },
        renderHTML: (attributes) => {
          const keys = attributes.keys as PlaceholderKeyTypeMap | undefined;
          if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
            return {};
          }

          return {
            'data-keys': JSON.stringify(keys),
          };
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

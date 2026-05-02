import { Node } from '@tiptap/core';

export const PageBreakComponent = Node.create({
  name: 'pageBreakComponent',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-component="page-break"]' }];
  },

  renderHTML() {
    return ['div', {
      'data-component': 'page-break',
      style: 'display: block; page-break-after: always; break-after: page;',
    }];
  },

  addCommands() {
    return {
      setPageBreak: () => ({ state, chain }: any) => {
        const { selection } = state;
        const { $from } = selection;

        // Walk up to depth 1 (the direct child of doc) to find the top-level block position.
        // depth 0 = doc, depth 1 = top-level block (paragraph, heading, etc.)
        const topDepth = Math.min($from.depth, 1);
        const afterTopLevel = $from.after(topDepth > 0 ? topDepth : 0);

        return chain()
          .insertContentAt(afterTopLevel, { type: this.name })
          .focus(afterTopLevel + 1)
          .run();
      },
    } as any;
  },
});

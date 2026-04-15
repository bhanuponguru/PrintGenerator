import { Node, CommandProps } from '@tiptap/core';

export const PageBreakComponent = Node.create({
  name: 'pageBreakComponent',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-component="page-break"]' }];
  },

  renderHTML() {
    return ['div', {
      'data-component': 'page-break',
      style: 'display: block; page-break-after: always; break-after: page; height: 0; overflow: hidden;',
    }];
  },

  addCommands() {
    return {
      setPageBreak: () => ({ chain }: CommandProps) => {
        return chain().insertContent({ type: this.name }).run();
      },
    } as any;
  },
});

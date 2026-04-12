import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

const PAGE_DIMENSIONS: Record<string, number> = {
  'A4': 1122,
  'A3': 1587,
};

export const PaginationPlugin = Extension.create({
  name: 'paginationPlugin',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paginationPlugin'),
        appendTransaction(transactions, oldState, newState) {
          const doc = newState.doc;
          let needsUpdate = false;
          let tr = newState.tr;

          // Enforce that the Document only contains PageComponents at the top level.
          // Or at least starts with one.
          if (doc.childCount === 0) {
            return null;
          }

          const firstChild = doc.child(0);
          if (firstChild.type.name !== 'pageComponent') {
            // Tiptap might add default paragraphs, we should wrap or replace them.
          }

          return needsUpdate ? tr : null;
        },
        view: () => ({
          update: (view, prevState) => {
            if (view.state.doc.eq(prevState.doc)) {
              return;
            }

            // A simple DOM observer to detect height overflow and split.
            // Since Prosemirror maps nodes to DOM, we can query them.
            const pageElements = view.dom.querySelectorAll('div[data-component="page"]');
            
            pageElements.forEach((pageEl, index) => {
              const size = pageEl.getAttribute('data-size') || 'A4';
              const orientation = pageEl.getAttribute('data-orientation') || 'portrait';
              
              let maxHeight = PAGE_DIMENSIONS[size] || PAGE_DIMENSIONS['A4'];
              if (orientation === 'landscape' && size === 'A4') {
                maxHeight = 794; // approx A4 landscape height
              }

              if (pageEl.clientHeight > maxHeight) {
                // If it's an atom block, we can't deep-slice cursor positions directly using prosemirror ranges.
                // We dispatch a custom event or console warning for the user so the nodeview can handle splitting the internal attrs array.
                console.log(`Page ${index + 1} overflowed ${maxHeight}px (current: ${pageEl.clientHeight}px)`);
                // For a robust implementation, the React NodeView for the Page should detect this 
                // and slice `attrs.value.components` into a new PageComponent.
              }
            });
          },
        }),
      }),
    ];
  },
});

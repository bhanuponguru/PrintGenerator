import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

// A4 at 96 dpi = 794px wide, 1122px tall. We track height.
const A4_HEIGHT_PX = 1122;

const RULER_CLASS = 'pg-page-ruler';

function injectRulers(container: HTMLElement, editorDom: HTMLElement) {
  // Remove stale rulers
  container.querySelectorAll(`.${RULER_CLASS}`).forEach((el) => el.remove());

  const docHeight = editorDom.scrollHeight;
  const numRulers = Math.floor(docHeight / A4_HEIGHT_PX);

  // We need the offset of the editor relative to the container to position rulers correctly
  const containerRect = container.getBoundingClientRect();
  const editorRect = editorDom.getBoundingClientRect();
  const editorOffsetTop = editorRect.top - containerRect.top + container.scrollTop;

  for (let i = 1; i <= numRulers; i++) {
    const ruler = document.createElement('div');
    ruler.className = RULER_CLASS;
    ruler.setAttribute('aria-hidden', 'true');
    ruler.style.cssText = [
      'position: absolute',
      `top: ${editorOffsetTop + i * A4_HEIGHT_PX}px`,
      'left: 0',
      'right: 0',
      'height: 0',
      'pointer-events: none',
      'z-index: 4',
    ].join(';');

    const line = document.createElement('div');
    line.className = `${RULER_CLASS}__line`;
    ruler.appendChild(line);

    const label = document.createElement('span');
    label.className = `${RULER_CLASS}__label`;
    label.textContent = `— Page ${i + 1} —`;
    ruler.appendChild(label);

    container.appendChild(ruler);
  }
}

export const PaginationPlugin = Extension.create({
  name: 'paginationPlugin',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paginationPlugin'),

        view: (editorView) => {
          // The scrollable container wrapping the editor canvas
          const container = editorView.dom.parentElement;

          const update = () => {
            if (!container) return;
            injectRulers(container, editorView.dom);
          };

          // Initial render
          requestAnimationFrame(update);

          return {
            update: (_view, prevState) => {
              // Re-draw rulers whenever the document changes (content may have grown)
              if (!_view.state.doc.eq(prevState.doc)) {
                requestAnimationFrame(update);
              }
            },
            destroy: () => {
              container?.querySelectorAll(`.${RULER_CLASS}`).forEach((el) => el.remove());
            },
          };
        },
      }),
    ];
  },
});


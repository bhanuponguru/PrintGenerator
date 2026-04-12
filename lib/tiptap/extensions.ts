import { ContainerComponent, createContainerComponent, validateContainerAttrs } from '@/lib/tiptap/container';
import { HyperlinkComponent, createHyperlinkComponent, validateHyperlinkAttrs } from '@/lib/tiptap/hyperlink';
import { ImageComponent, createImageComponent, validateImageAttrs } from '@/lib/tiptap/image';
import { ListComponent, createListComponent, validateListAttrs } from '@/lib/tiptap/list';
import { createPlaceholderNode, substitutePlaceholderValue, validatePlaceholderAttrs, deriveSchemaFromChildren } from '@/lib/tiptap/placeholder';
import { TableComponent, createTableComponent, validateTableAttrs } from '@/lib/tiptap/table';
import { getComponentTypeExpectation } from '@/lib/tiptap/component-type';

/** Convenience list of the custom TipTap extensions required by the editor. */
export const ComponentExtensions = [
  ImageComponent,
  HyperlinkComponent,
  ListComponent,
  ContainerComponent,
  TableComponent,
];

export {
  createImageComponent,
  createHyperlinkComponent,
  createListComponent,
  createContainerComponent,
  createTableComponent,
  createPlaceholderNode,
  substitutePlaceholderValue,
  getComponentTypeExpectation,
  validateImageAttrs,
  validateHyperlinkAttrs,
  validateListAttrs,
  validateContainerAttrs,
  validateTableAttrs,
  validatePlaceholderAttrs,
  deriveSchemaFromChildren,
};

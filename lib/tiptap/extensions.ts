import { ContainerComponent, createContainerComponent, validateContainerAttrs } from '@/lib/tiptap/container';
import { HyperlinkComponent, createHyperlinkComponent, validateHyperlinkAttrs } from '@/lib/tiptap/hyperlink';
import { ImageComponent, createImageComponent, validateImageAttrs } from '@/lib/tiptap/image';
import { ListComponent, createListComponent, validateListAttrs } from '@/lib/tiptap/list';
import { createPlaceholderNode, substitutePlaceholderValue, validatePlaceholderAttrs, deriveSchemaFromChildren } from '@/lib/tiptap/placeholder';
import { TableComponent, createTableComponent, validateTableAttrs } from '@/lib/tiptap/table';
import { PageComponent, createPageComponent, validatePageAttrs } from '@/lib/tiptap/page';
import { HeaderComponent, createHeaderComponent, validateHeaderAttrs } from '@/lib/tiptap/header';
import { FooterComponent, createFooterComponent, validateFooterAttrs } from '@/lib/tiptap/footer';
import { PageBreakComponent } from '@/lib/tiptap/page-break';
import { getComponentTypeExpectation } from '@/lib/tiptap/component-type';

/** Convenience list of the custom TipTap extensions required by the editor. */
export const ComponentExtensions = [
  ImageComponent,
  HyperlinkComponent,
  ListComponent,
  ContainerComponent,
  TableComponent,
  PageComponent,
  HeaderComponent,
  FooterComponent,
  PageBreakComponent,
];

export {
  createImageComponent,
  createHyperlinkComponent,
  createListComponent,
  createContainerComponent,
  createTableComponent,
  createPageComponent,
  createHeaderComponent,
  createFooterComponent,
  createPlaceholderNode,
  substitutePlaceholderValue,
  getComponentTypeExpectation,
  validateImageAttrs,
  validateHyperlinkAttrs,
  validateListAttrs,
  validateContainerAttrs,
  validateTableAttrs,
  validatePlaceholderAttrs,
  validatePageAttrs,
  validateHeaderAttrs,
  validateFooterAttrs,
  deriveSchemaFromChildren,
};

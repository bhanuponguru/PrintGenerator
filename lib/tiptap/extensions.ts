import { ContainerComponent, createContainerComponent, validateContainerAttrs } from '@/lib/tiptap/container';
import { HyperlinkComponent, createHyperlinkComponent } from '@/lib/tiptap/hyperlink';
import { ImageComponent, createImageComponent } from '@/lib/tiptap/image';
import { TableComponent, createTableComponent } from '@/lib/tiptap/table';
import { ListComponent, createListComponent, validateListAttrs } from '@/lib/tiptap/list';
import { createPlaceholderNode, substitutePlaceholderValue, validatePlaceholderAttrs, deriveSchemaFromChildren } from '@/lib/tiptap/placeholder';
import { PageComponent, createPageComponent, validatePageAttrs } from '@/lib/tiptap/page';
import { HeaderComponent, createHeaderComponent, validateHeaderAttrs } from '@/lib/tiptap/header';
import { FooterComponent, createFooterComponent, validateFooterAttrs } from '@/lib/tiptap/footer';
import { PageBreakComponent } from '@/lib/tiptap/page-break';
import { getComponentTypeExpectation } from '@/lib/tiptap/component-type';

/** Convenience list of the custom TipTap extensions required by the editor. */
export const ComponentExtensions = [
  ImageComponent,
  HyperlinkComponent,
  TableComponent,
  ListComponent,
  ContainerComponent,
  PageComponent,
  HeaderComponent,
  FooterComponent,
  PageBreakComponent,
];

export {
  createImageComponent,
  createHyperlinkComponent,
  createTableComponent,
  createListComponent,
  createContainerComponent,
  createPageComponent,
  createHeaderComponent,
  createFooterComponent,
  createPlaceholderNode,
  substitutePlaceholderValue,
  getComponentTypeExpectation,
  validateListAttrs,
  validateContainerAttrs,
  validatePlaceholderAttrs,
  validatePageAttrs,
  validateHeaderAttrs,
  validateFooterAttrs,
  deriveSchemaFromChildren,
};

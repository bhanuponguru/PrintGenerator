import { ComponentTypeSchema } from '@/types/template';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const DEFAULT_STRING_TYPE: ComponentTypeSchema = {
  kind: 'string',
  in_placeholder: false,
};

export function getComponentTypeExpectation(node: unknown): ComponentTypeSchema {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return DEFAULT_STRING_TYPE;
  }

  const attrs = isRecord(node.attrs) ? node.attrs : {};

  switch (node.type) {
    case 'imageComponent':
      return { kind: 'image', in_placeholder: Boolean(attrs.in_placeholder) };
    case 'hyperlinkComponent':
      return { kind: 'hyperlink', in_placeholder: Boolean(attrs.in_placeholder) };
    case 'listComponent': {
      const value = isRecord(attrs.value) ? attrs.value : {};
      const items = Array.isArray(value.items) ? value.items : [];
      const itemType = items.length > 0 ? getComponentTypeExpectation(items[0]) : DEFAULT_STRING_TYPE;
      return {
        kind: 'list',
        in_placeholder: Boolean(attrs.in_placeholder),
        style: value.style === 'numbered' || value.style === 'plain' ? value.style : 'bulleted',
        item_type: itemType,
      };
    }
    case 'containerComponent': {
      const value = isRecord(attrs.value) ? attrs.value : {};
      const components = Array.isArray(value.components) ? value.components : [];
      return {
        kind: 'container',
        in_placeholder: Boolean(attrs.in_placeholder),
        component_types: components.map((component) => getComponentTypeExpectation(component)),
      };
    }
    case 'tableComponent': {
      const value = isRecord(attrs.value) ? attrs.value : {};
      return {
        kind: 'table',
        in_placeholder: Boolean(attrs.in_placeholder),
        mode: value.mode === 'column_data' ? 'column_data' : 'row_data',
        headers: Array.isArray(attrs.headers) ? attrs.headers.filter((h): h is string => typeof h === 'string') : [],
      };
    }
    case 'placeholder': {
      if (isRecord(attrs.value_schema) && typeof attrs.value_schema.kind === 'string') {
        return attrs.value_schema as unknown as ComponentTypeSchema;
      }
      return {
        kind: 'string',
        in_placeholder: true,
      };
    }
    default:
      return DEFAULT_STRING_TYPE;
  }
}

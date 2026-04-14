import { ComponentTypeSchema } from '@/types/template';
import { deriveSchemaFromChildren } from '@/lib/tiptap/placeholder';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const DEFAULT_STRING_TYPE: ComponentTypeSchema = {
  kind: 'string',
};

export function getComponentTypeExpectation(node: unknown): ComponentTypeSchema {
  if (!isRecord(node) || typeof node.type !== 'string') {
    return DEFAULT_STRING_TYPE;
  }

  const attrs = isRecord(node.attrs) ? node.attrs : {};

  switch (node.type) {
    case 'imageComponent':
      return { kind: 'image' };
    case 'hyperlinkComponent':
      return { kind: 'hyperlink' };
    case 'listComponent': {
      const value = isRecord(attrs.value) ? attrs.value : {};
      const items = Array.isArray(value.items) ? value.items : [];
      const itemType = items.length > 0 ? getComponentTypeExpectation(items[0]) : DEFAULT_STRING_TYPE;
      return {
        kind: 'list',
        item_type: itemType,
      };
    }
    case 'containerComponent': {
      const value = isRecord(attrs.value) ? attrs.value : {};
      const components = Array.isArray(value.components) ? value.components : [];
      return {
        kind: 'container',
        component_types: components.map((component) => getComponentTypeExpectation(component)),
      };
    }
    case 'tableComponent': {
      return {
        kind: 'table',
      };
    }
    case 'placeholder': {
      const kind = isRecord(attrs.schema) && typeof attrs.schema.kind === 'string'
        ? attrs.schema.kind
        : (typeof attrs.kind === 'string' ? attrs.kind : 'string');
      return deriveSchemaFromChildren(kind, attrs, node && isRecord(node) ? node.content : undefined);
    }
    default:
      return DEFAULT_STRING_TYPE;
  }
}

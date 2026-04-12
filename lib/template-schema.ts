import { ComponentTypeSchema } from '@/types/template';
import {
  validateContainerAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
  deriveSchemaFromChildren,
} from '@/lib/tiptap/extensions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const PLACEHOLDER_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateComponentTypeSchema(schema: unknown, path: string): string | null {
  if (!isRecord(schema)) {
    return `${path} must be an object`;
  }

  if (typeof schema.kind !== 'string' || schema.kind.trim() === '') {
    return `${path}.kind must be a non-empty string`;
  }

  const typed = schema as Record<string, unknown> & { kind: string };

  switch (typed.kind) {
    case 'string':
    case 'integer':
    case 'image':
    case 'hyperlink':
      return null;

    case 'list': {
      if (!('item_type' in typed)) {
        return `${path}.item_type is required`;
      }
      return validateComponentTypeSchema(typed.item_type, `${path}.item_type`);
    }

    case 'container': {
      const componentTypes = typed.component_types;
      if (!Array.isArray(componentTypes)) {
        return `${path}.component_types must be an array`;
      }

      for (let i = 0; i < componentTypes.length; i += 1) {
        const childError = validateComponentTypeSchema(componentTypes[i], `${path}.component_types[${i}]`);
        if (childError) {
          return childError;
        }
      }

      return null;
    }

    case 'table': {
      const caption = typed.caption;
      if (caption !== undefined) {
        const captionError = validateComponentTypeSchema(caption, `${path}.caption`);
        if (captionError) {
          return captionError;
        }
      }

      return null;
    }

    default:
      return `${path}.kind '${typed.kind}' is unsupported`;
  }
}

function walk(node: unknown, visit: (n: Record<string, unknown>) => string | null): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const err = walk(item, visit);
      if (err) {
        return err;
      }
    }
    return null;
  }

  if (!isRecord(node)) {
    return null;
  }

  const currentErr = visit(node);
  if (currentErr) {
    return currentErr;
  }

  if ('attrs' in node) {
    const attrsErr = walk(node.attrs, visit);
    if (attrsErr) {
      return attrsErr;
    }
  }

  if ('content' in node) {
    const contentErr = walk(node.content, visit);
    if (contentErr) {
      return contentErr;
    }
  }

  return null;
}

export function validateTemplatePlaceholderSchemas(template: Record<string, unknown>): { valid: true } | { valid: false; error: string } {
  const err = walk(template, (node) => {
    if (typeof node.type === 'string') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};

      if (node.type === 'imageComponent') {
        return validateImageAttrs(attrs);
      }

      if (node.type === 'hyperlinkComponent') {
        return validateHyperlinkAttrs(attrs);
      }

      if (node.type === 'listComponent') {
        return validateListAttrs(attrs);
      }

      if (node.type === 'containerComponent') {
        return validateContainerAttrs(attrs);
      }

      if (node.type === 'tableComponent') {
        return validateTableAttrs(attrs);
      }
    }

    if (node.type !== 'placeholder') {
      return null;
    }

    const attrs = isRecord(node.attrs) ? node.attrs : null;
    if (!attrs) {
      return 'Placeholder attrs must be an object';
    }

    const placeholderError = validatePlaceholderAttrs(attrs);
    if (placeholderError) {
      return placeholderError;
    }

    if (!PLACEHOLDER_KEY_RE.test(String(attrs.key))) {
      return `Placeholder key '${String(attrs.key)}' is invalid`;
    }

    const kind = typeof attrs.kind === 'string' ? attrs.kind : 'string';
    if (kind === 'list') {
      if (typeof attrs.item_kind !== 'string' || attrs.item_kind.trim() === '') {
        return `Placeholder key '${String(attrs.key)}' item_kind is required`;
      }
    }

    if (kind === 'container') {
      if (!Array.isArray(attrs.component_kinds) || attrs.component_kinds.length === 0) {
        return `Placeholder key '${String(attrs.key)}' component_kinds is required`;
      }

      if (attrs.component_kinds.some((componentKind) => typeof componentKind !== 'string' || componentKind.trim() === '')) {
        return `Placeholder key '${String(attrs.key)}' component_kinds must contain non-empty strings`;
      }
    }

    // Derive the schema from the node structure
    const derivedSchema = deriveSchemaFromChildren(kind, attrs, node.content);
    const schemaError = validateComponentTypeSchema(derivedSchema, `Placeholder key '${String(attrs.key)}' type`);
    if (schemaError) {
      return schemaError;
    }

    const schema = derivedSchema as unknown as Record<string, unknown>;
    if (schema.kind === 'list' && attrs.style !== undefined) {
      const style = attrs.style;
      if (style !== 'bulleted' && style !== 'numbered' && style !== 'plain') {
        return `Placeholder key '${String(attrs.key)}' style must be 'bulleted', 'numbered', or 'plain'`;
      }
    }

    if (schema.kind === 'table') {
      if (attrs.mode !== 'row_data' && attrs.mode !== 'column_data') {
        return `Placeholder key '${String(attrs.key)}' mode must be 'row_data' or 'column_data'`;
      }

      if (!Array.isArray(attrs.headers) || attrs.headers.some((h) => typeof h !== 'string' || h.trim() === '')) {
        return `Placeholder key '${String(attrs.key)}' headers must contain non-empty strings`;
      }

      const typeMapAttr = attrs.mode === 'row_data' ? attrs.column_types : attrs.row_types;
      if (typeMapAttr !== undefined) {
        if (!isRecord(typeMapAttr)) {
          return `Placeholder key '${String(attrs.key)}' ${attrs.mode === 'row_data' ? 'column_types' : 'row_types'} must be an object`;
        }

        for (const [header, typeSchema] of Object.entries(typeMapAttr)) {
          if (typeof header !== 'string' || header.trim() === '') {
            return `Placeholder key '${String(attrs.key)}' type map keys must be non-empty strings`;
          }

          const childError = validateComponentTypeSchema(
            typeSchema,
            `Placeholder key '${String(attrs.key)}' ${attrs.mode === 'row_data' ? 'column_types' : 'row_types'}.${header}`
          );
          if (childError) {
            return childError;
          }
        }
      }
    }

    return null;
  });

  if (err) {
    return { valid: false, error: err };
  }

  return { valid: true };
}

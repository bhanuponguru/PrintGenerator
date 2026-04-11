import { ComponentTypeSchema } from '@/types/template';
import {
  validateContainerAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
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

  if (typeof schema.in_placeholder !== 'boolean') {
    return `${path}.in_placeholder must be a boolean`;
  }

  const typed = schema as Record<string, unknown> & { kind: string; in_placeholder: boolean };

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
      const style = typed.style;
      if (style !== undefined && style !== 'bulleted' && style !== 'numbered' && style !== 'plain') {
        return `${path}.style must be 'bulleted', 'numbered', or 'plain'`;
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
      const mode = typed.mode;
      if (mode !== 'row_data' && mode !== 'column_data') {
        return `${path}.mode must be 'row_data' or 'column_data'`;
      }

      const headers = typed.headers;
      if (!Array.isArray(headers)) {
        return `${path}.headers must be an array`;
      }

      if (headers.some((header) => typeof header !== 'string' || header.trim() === '')) {
        return `${path}.headers must contain non-empty strings`;
      }

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

    const schemaError = validateComponentTypeSchema(attrs.value_schema, `Placeholder key '${String(attrs.key)}' type`);
    if (schemaError) {
      return schemaError;
    }

    return null;
  });

  if (err) {
    return { valid: false, error: err };
  }

  return { valid: true };
}

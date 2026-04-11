import { ComponentTypeSchema } from '@/types/template';

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

  const typed = schema as ComponentTypeSchema;

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
      return validateComponentTypeSchema((typed as any).item_type, `${path}.item_type`);
    }

    case 'container': {
      const componentTypes = (typed as any).component_types;
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
      const mode = (typed as any).mode;
      if (mode !== 'row_data' && mode !== 'column_data') {
        return `${path}.mode must be 'row_data' or 'column_data'`;
      }

      const headers = (typed as any).headers;
      if (!Array.isArray(headers)) {
        return `${path}.headers must be an array`;
      }

      if (headers.some((header) => typeof header !== 'string' || header.trim() === '')) {
        return `${path}.headers must contain non-empty strings`;
      }

      const caption = (typed as any).caption;
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
    if (node.type !== 'placeholder') {
      return null;
    }

    const attrs = isRecord(node.attrs) ? node.attrs : null;
    if (!attrs) {
      return 'Placeholder attrs must be an object';
    }

    if ('key' in attrs) {
      return "Placeholder 'key' is unsupported. Use 'keys' map";
    }

    const keys = attrs.keys;
    if (!isRecord(keys)) {
      return "Placeholder attrs.keys must be an object map of key name to key type";
    }

    const entries = Object.entries(keys);
    if (entries.length === 0) {
      return 'Placeholder attrs.keys cannot be empty';
    }

    for (const [keyName, keyType] of entries) {
      if (!PLACEHOLDER_KEY_RE.test(keyName)) {
        return `Placeholder key '${keyName}' is invalid`;
      }

      const schemaError = validateComponentTypeSchema(keyType, `Placeholder key '${keyName}' type`);
      if (schemaError) {
        return schemaError;
      }
    }

    return null;
  });

  if (err) {
    return { valid: false, error: err };
  }

  return { valid: true };
}

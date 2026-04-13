import { ComponentTypeSchema } from '@/types/template';
import {
  validateContainerAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
  validatePageAttrs,
  validateHeaderAttrs,
  validateFooterAttrs,
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

    case 'repeat': {
      if (!('item_type' in typed)) {
        return `${path}.item_type is required`;
      }
      return validateComponentTypeSchema(typed.item_type, `${path}.item_type`);
    }

    case 'custom': {
      if (typeof typed.base_variable !== 'string' || typed.base_variable.trim() === '') {
        return `${path}.base_variable is required`;
      }
      if (typeof typed.layout_template !== 'string' || typed.layout_template.trim() === '') {
        return `${path}.layout_template is required`;
      }
      if (!('value_type' in typed)) {
        return `${path}.value_type is required`;
      }
      const valueTypeError = validateComponentTypeSchema(typed.value_type, `${path}.value_type`);
      if (valueTypeError) {
        return valueTypeError;
      }

      if (typed.token_registry !== undefined) {
        if (!isRecord(typed.token_registry)) {
          return `${path}.token_registry must be an object`;
        }
        for (const [tokenId, tokenSchema] of Object.entries(typed.token_registry)) {
          if (!PLACEHOLDER_KEY_RE.test(tokenId)) {
            return `${path}.token_registry key '${tokenId}' is invalid`;
          }
          const tokenSchemaError = validateComponentTypeSchema(tokenSchema, `${path}.token_registry.${tokenId}`);
          if (tokenSchemaError) {
            return tokenSchemaError;
          }
        }
      }

      if (typed.layout_nodes !== undefined) {
        if (!Array.isArray(typed.layout_nodes)) {
          return `${path}.layout_nodes must be an array`;
        }
        const allowedTokenIds = isRecord(typed.token_registry) ? new Set(Object.keys(typed.token_registry)) : new Set<string>();
        for (let i = 0; i < typed.layout_nodes.length; i += 1) {
          const node = typed.layout_nodes[i];
          if (!isRecord(node) || typeof node.kind !== 'string') {
            return `${path}.layout_nodes[${i}] must be an object with kind`;
          }
          if (node.kind === 'text') {
            if (typeof node.value !== 'string') {
              return `${path}.layout_nodes[${i}].value must be a string`;
            }
            continue;
          }
          if (node.kind === 'newline') {
            continue;
          }
          if (node.kind === 'token') {
            if (typeof node.token_id !== 'string' || node.token_id.trim() === '') {
              return `${path}.layout_nodes[${i}].token_id must be a non-empty string`;
            }
            if (allowedTokenIds.size > 0 && !allowedTokenIds.has(node.token_id)) {
              return `${path}.layout_nodes[${i}].token_id '${node.token_id}' is not defined in token_registry`;
            }
            continue;
          }
          return `${path}.layout_nodes[${i}].kind '${node.kind}' is unsupported`;
        }
      }

      return null;
    }

    case 'page_break':
      return null;

    case 'page':
    case 'header':
    case 'footer':
    case 'container': {
      const mode = typed.kind === 'container' && typed.mode === 'repeat' ? 'repeat' : 'tuple';

      if (mode === 'repeat') {
        if (!('item_type' in typed)) {
          return `${path}.item_type is required when mode=repeat`;
        }
        return validateComponentTypeSchema(typed.item_type, `${path}.item_type`);
      }

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

      const mode = typed.mode;
      if (mode !== undefined && mode !== 'row_data' && mode !== 'column_data') {
        return `${path}.mode must be row_data or column_data when provided`;
      }

      if (typed.headers !== undefined) {
        if (!Array.isArray(typed.headers) || typed.headers.some((h) => typeof h !== 'string' || h.trim() === '')) {
          return `${path}.headers must be an array of non-empty strings`;
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

export function validateTemplateStructure(template: Record<string, unknown>): { valid: true } | { valid: false; error: string } {
  if (template.type !== 'doc') {
    return { valid: false, error: 'Template root must be a document type' };
  }
  const content = template.content;
  if (!Array.isArray(content)) {
    return { valid: false, error: 'Template must have content array' };
  }

  if (content.length === 0) {
    return { valid: false, error: 'Template must contain at least one pageComponent' };
  }

  // template=list of pages rule: all top-level blocks MUST be pageComponent
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (!isRecord(node) || node.type !== 'pageComponent') {
      return { valid: false, error: `Invalid template structure: Top-level elements must be 'pageComponent', found '${isRecord(node) ? node.type : 'unknown'}'` };
    }
    const attrs = isRecord(node.attrs) ? node.attrs : {};
    if (i === 0 && attrs.pageNumber !== 1) {
      return { valid: false, error: 'The first page must start with pageNumber 1.' };
    }
  }

  return { valid: true };
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

      if (node.type === 'pageComponent') {
        return validatePageAttrs(attrs);
      }

      if (node.type === 'headerComponent') {
        return validateHeaderAttrs(attrs);
      }

      if (node.type === 'footerComponent') {
        return validateFooterAttrs(attrs);
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

    const kind = typeof attrs.kind === 'string'
      ? attrs.kind
      : (isRecord(attrs.schema) && typeof attrs.schema.kind === 'string' ? String(attrs.schema.kind) : 'string');

    // Derive the schema from the node structure
    const derivedSchema = deriveSchemaFromChildren(kind, attrs, node.content);
    const schemaError = validateComponentTypeSchema(derivedSchema, `Placeholder key '${String(attrs.key)}' type`);
    if (schemaError) {
      return schemaError;
    }

    const schema = derivedSchema as unknown as Record<string, unknown>;
    if (schema.kind === 'list' && schema.style !== undefined) {
      const style = schema.style;
      if (style !== 'bulleted' && style !== 'numbered' && style !== 'plain') {
        return `Placeholder key '${String(attrs.key)}' style must be 'bulleted', 'numbered', or 'plain'`;
      }
    }

    if (schema.kind === 'table') {
      if (schema.mode !== undefined && schema.mode !== 'row_data' && schema.mode !== 'column_data') {
        return `Placeholder key '${String(attrs.key)}' mode must be 'row_data' or 'column_data'`;
      }

      if (schema.headers !== undefined && (!Array.isArray(schema.headers) || schema.headers.some((h) => typeof h !== 'string' || h.trim() === ''))) {
        return `Placeholder key '${String(attrs.key)}' headers must contain non-empty strings`;
      }

      const typeMapAttr = schema.mode === 'row_data' ? schema.column_types : schema.row_types;
      if (typeMapAttr !== undefined) {
        if (!isRecord(typeMapAttr)) {
          return `Placeholder key '${String(attrs.key)}' ${schema.mode === 'row_data' ? 'column_types' : 'row_types'} must be an object`;
        }

        for (const [header, typeSchema] of Object.entries(typeMapAttr)) {
          if (typeof header !== 'string' || header.trim() === '') {
            return `Placeholder key '${String(attrs.key)}' type map keys must be non-empty strings`;
          }

          const childError = validateComponentTypeSchema(
            typeSchema,
            `Placeholder key '${String(attrs.key)}' ${schema.mode === 'row_data' ? 'column_types' : 'row_types'}.${header}`
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

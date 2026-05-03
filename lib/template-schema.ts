import { ComponentTypeSchema } from '@/types/template';
import {
  validateContainerAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validatePageAttrs,
  validateHeaderAttrs,
  validateFooterAttrs,
  deriveSchemaFromChildren,
} from '@/lib/tiptap/extensions';
import { validateImageAttrs } from '@/lib/tiptap/image';
import { validateHyperlinkAttrs } from '@/lib/tiptap/hyperlink';
import { validateTableAttrs } from '@/lib/tiptap/table';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const PLACEHOLDER_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function extractTemplateTokens(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g) || [];
  return matches.map((match) => match.replace(/[{}]/g, '').trim());
}

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

      if (typed.items !== undefined) {
        if (!Array.isArray(typed.items)) {
          return `${path}.items must be an array`;
        }
        const itemIds = new Set<string>();
        for (let i = 0; i < typed.items.length; i += 1) {
          const item = typed.items[i];
          if (!isRecord(item)) {
            return `${path}.items[${i}] must be an object`;
          }
          if (typeof item.id !== 'string' || item.id.trim() === '') {
            return `${path}.items[${i}].id is required`;
          }
          if (itemIds.has(item.id)) {
            return `${path}.items[${i}].id '${item.id}' is duplicated`;
          }
          itemIds.add(item.id);
          if (typeof item.kind !== 'string' || item.kind.trim() === '') {
            return `${path}.items[${i}].kind is required`;
          }
          if (item.layout_template !== undefined && (typeof item.layout_template !== 'string' || item.layout_template.trim() === '')) {
            return `${path}.items[${i}].layout_template must be a non-empty string when provided`;
          }
          if (item.token_registry !== undefined) {
            if (!isRecord(item.token_registry)) {
              return `${path}.items[${i}].token_registry must be an object`;
            }
            for (const [tokenId, tokenSchema] of Object.entries(item.token_registry)) {
              if (!PLACEHOLDER_KEY_RE.test(tokenId)) {
                return `${path}.items[${i}].token_registry key '${tokenId}' is invalid`;
              }
              const tokenSchemaError = validateComponentTypeSchema(tokenSchema, `${path}.items[${i}].token_registry.${tokenId}`);
              if (tokenSchemaError) {
                return tokenSchemaError;
              }
            }
          }
          if (item.layout_nodes !== undefined) {
            if (!Array.isArray(item.layout_nodes)) {
              return `${path}.items[${i}].layout_nodes must be an array`;
            }
            for (let nodeIndex = 0; nodeIndex < item.layout_nodes.length; nodeIndex += 1) {
              const node = item.layout_nodes[nodeIndex];
              if (!isRecord(node) || typeof node.kind !== 'string') {
                return `${path}.items[${i}].layout_nodes[${nodeIndex}] must be an object with kind`;
              }
            }
          }
        }
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

      const tokenLibraryIds = new Set<string>();
      if (typed.token_library !== undefined) {
        if (!Array.isArray(typed.token_library)) {
          return `${path}.token_library must be an array`;
        }

        for (let i = 0; i < typed.token_library.length; i += 1) {
          const token = typed.token_library[i];
          if (!isRecord(token)) {
            return `${path}.token_library[${i}] must be an object`;
          }
          if (typeof token.id !== 'string' || token.id.trim() === '') {
            return `${path}.token_library[${i}].id is required`;
          }
          if (!PLACEHOLDER_KEY_RE.test(token.id)) {
            return `${path}.token_library[${i}].id '${token.id}' is invalid`;
          }
          if (tokenLibraryIds.has(token.id)) {
            return `${path}.token_library[${i}].id '${token.id}' is duplicated`;
          }
          tokenLibraryIds.add(token.id);

          if (typeof token.kind !== 'string' || token.kind.trim() === '') {
            return `${path}.token_library[${i}].kind is required`;
          }

          if (token.dynamic_fields !== undefined) {
            if (!Array.isArray(token.dynamic_fields)) {
              return `${path}.token_library[${i}].dynamic_fields must be an array`;
            }
            for (const field of token.dynamic_fields) {
              if (typeof field !== 'string' || field.trim() === '') {
                return `${path}.token_library[${i}].dynamic_fields must contain non-empty strings`;
              }
            }
          }

          if (token.static_values !== undefined && !isRecord(token.static_values)) {
            return `${path}.token_library[${i}].static_values must be an object`;
          }

          if (token.kind === 'list') {
            if (token.item_type !== undefined) {
              const itemTypeError = validateComponentTypeSchema(token.item_type, `${path}.token_library[${i}].item_type`);
              if (itemTypeError) {
                return itemTypeError;
              }
            }
          }

          if (token.kind === 'table') {
            if (token.caption !== undefined) {
              if (typeof token.caption !== 'string' || token.caption.trim() === '') {
                return `${path}.token_library[${i}].caption must be a non-empty string`;
              }
            }

            if (token.column_types !== undefined) {
              if (!isRecord(token.column_types)) {
                return `${path}.token_library[${i}].column_types must be an object`;
              }
              for (const [columnName, columnType] of Object.entries(token.column_types)) {
                const columnTypeError = validateComponentTypeSchema(columnType, `${path}.token_library[${i}].column_types.${columnName}`);
                if (columnTypeError) {
                  return columnTypeError;
                }
              }
            }

            if (token.row_types !== undefined) {
              if (!isRecord(token.row_types)) {
                return `${path}.token_library[${i}].row_types must be an object`;
              }
              for (const [rowName, rowType] of Object.entries(token.row_types)) {
                const rowTypeError = validateComponentTypeSchema(rowType, `${path}.token_library[${i}].row_types.${rowName}`);
                if (rowTypeError) {
                  return rowTypeError;
                }
              }
            }
          }

          if (token.kind === 'image') {
            const allowedFields = new Set(['src', 'alt']);
            if (token.dynamic_fields !== undefined) {
              for (const field of token.dynamic_fields) {
                if (!allowedFields.has(field)) {
                  return `${path}.token_library[${i}].dynamic_fields['${field}'] is not supported for image tokens`;
                }
              }
            }
          }

          if (token.kind === 'hyperlink') {
            const allowedFields = new Set(['alias', 'url']);
            if (token.dynamic_fields !== undefined) {
              for (const field of token.dynamic_fields) {
                if (!allowedFields.has(field)) {
                  return `${path}.token_library[${i}].dynamic_fields['${field}'] is not supported for hyperlink tokens`;
                }
              }
            }
          }
        }
      }

      const baseVariable = typed.base_variable.trim();
      const templateTokens = extractTemplateTokens(typed.layout_template);
      const registryIds = isRecord(typed.token_registry) ? new Set(Object.keys(typed.token_registry)) : new Set<string>();
      const knownTokenIds = tokenLibraryIds.size > 0 ? tokenLibraryIds : registryIds;
      for (const tokenRef of templateTokens) {
        if (tokenRef === baseVariable) {
          continue;
        }

        if (!tokenRef.startsWith(`${baseVariable}.`)) {
          return `${path}.layout_template token reference '${tokenRef}' must use '{{${baseVariable}.tokenId}}' format`;
        }

        const tokenId = tokenRef.slice(`${baseVariable}.`.length).split('.')[0] || '';
        if (knownTokenIds.size > 0 && !knownTokenIds.has(tokenId)) {
          return `${path}.layout_template references unknown token '${tokenId}'`;
        }
      }

      if (typed.layout_nodes !== undefined) {
        if (!Array.isArray(typed.layout_nodes)) {
          return `${path}.layout_nodes must be an array`;
        }
        const allowedTokenIds = isRecord(typed.token_registry)
          ? new Set(Object.keys(typed.token_registry))
          : tokenLibraryIds.size > 0
            ? tokenLibraryIds
          : Array.isArray(typed.items)
            ? new Set(typed.items.filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === 'string').map((item) => String(item.id)))
            : new Set<string>();
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
        if (typeof caption !== 'string' || caption.trim() === '') {
          return `${path}.caption must be a non-empty string`;
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
  const DYNAMIC_KINDS = new Set(['list', 'table', 'repeat', 'custom']);
  const dynamicKeys: string[] = [];

  const err = walk(template, (node) => {
    if (typeof node.type === 'string') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};

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

      if (node.type === 'imageComponent') {
        return validateImageAttrs(attrs);
      }

      if (node.type === 'hyperlinkComponent') {
        return validateHyperlinkAttrs(attrs);
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

    // Track dynamic placeholder keys for the at-most-one rule
    if (DYNAMIC_KINDS.has(kind)) {
      const key = String(attrs.key);
      if (!dynamicKeys.includes(key)) {
        dynamicKeys.push(key);
      }
    }

    // Validate explicit schema payloads when provided; fall back to derived schema for legacy attrs.
    const explicitSchema = isRecord(attrs.schema) ? attrs.schema : null;
    const derivedSchema = deriveSchemaFromChildren(kind, attrs, node.content);
    const schemaToValidate = explicitSchema || derivedSchema;
    const schemaError = validateComponentTypeSchema(schemaToValidate, `Placeholder key '${String(attrs.key)}' type`);
    if (schemaError) {
      return schemaError;
    }

    const schema = schemaToValidate as unknown as Record<string, unknown>;
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

  // Enforce single dynamic placeholder rule
  if (dynamicKeys.length > 1) {
    return {
      valid: false,
      error: `Template must have at most one dynamic placeholder (list, table, repeat, custom). Found ${dynamicKeys.length}: ${dynamicKeys.join(', ')}`,
    };
  }

  return { valid: true };
}

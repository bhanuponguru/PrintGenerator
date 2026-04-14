import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import puppeteer, { Browser } from 'puppeteer';
import { Placeholder } from '@/lib/tiptap/placeholder';
import {
  ComponentExtensions,
  deriveSchemaFromChildren,
} from '@/lib/tiptap/extensions';
import {
  ComponentTypeSchema,
  ComponentValue,
  ContainerTypeSchema,
  CustomTypeSchema,
  CustomPlaceholderItemSchema,
  HyperlinkTypeSchema,
  HyperlinkValue,
  ImageTypeSchema,
  ImageValue,
  IntegerTypeSchema,
  ListTypeSchema,
  ListValue,
  PlaceholderKeyTypeMap,
  ListStyle,
  RepeatTypeSchema,
  RepeatValue,
  StringTypeSchema,
  TableColumnDataValue,
  TableMode,
  TableRowDataValue,
  TableTypeSchema,
  TokenLibraryItemSchema,
} from '@/types/template';

/** User-supplied data keyed by placeholder names. */
export type DataPoint = Record<string, unknown>;

/** Result of validating and normalizing a data point against a schema map. */
export interface DataPointValidationResult {
  normalizedDataPoint: DataPoint;
  missing: string[];
  invalid: string[];
}

/**
 * Rich validation config used when a placeholder needs style/mode/header hints
 * in addition to the structural schema itself.
 */
export interface PlaceholderValidationConfig {
  schema: ComponentTypeSchema;
  style?: ListStyle;
  mode?: TableMode;
  headers?: string[];
  column_types?: Record<string, ComponentTypeSchema>;
  row_types?: Record<string, ComponentTypeSchema>;
  optional?: boolean;
}

export type PlaceholderValidationConfigMap = Record<string, PlaceholderValidationConfig>;

let browserInstance: Browser | null = null;

const DOCUMENT_CSS = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #111111;
    padding: 28px;
  }
  h1, h2, h3, h4, h5, h6 {
    margin: 0 0 10px;
    line-height: 1.25;
  }
  p {
    margin: 0 0 8px;
  }
  ul, ol {
    margin: 0 0 8px 20px;
    padding: 0;
  }
  li {
    margin: 0 0 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 12px;
    table-layout: fixed;
  }
  caption {
    caption-side: top;
    text-align: left;
    font-weight: 600;
    margin-bottom: 6px;
  }
  th, td {
    border: 1px solid #b9b9b9;
    padding: 6px 8px;
    vertical-align: top;
    word-break: break-word;
  }
  th {
    background: #f2f2f2;
    font-weight: 600;
  }
  span[data-placeholder='true'] {
    font-weight: 600;
  }
`;

/**
 * Deeply clones a given value using JSON serialization.
 * Useful for copying template objects to ensure no mutations on the original.
 * @param value The value to be recursively cloned.
 * @returns A completely independent clone of the original value.
 */
/** Deep-clones template JSON so document application stays immutable. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function defaultStringSchema(): StringTypeSchema {
  return {
    kind: 'string',
  };
}

function normalizeListStyle(style: unknown): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function normalizeTypeSchema(rawSchema: unknown): ComponentTypeSchema {
  if (!isRecord(rawSchema) || typeof rawSchema.kind !== 'string') {
    return defaultStringSchema();
  }

  const schema = rawSchema as unknown as ComponentTypeSchema;

  switch (schema.kind) {
    case 'string':
    case 'integer':
    case 'image':
    case 'hyperlink':
      return schema;
    case 'repeat': {
      const repeatSchema = schema as RepeatTypeSchema;
      return {
        kind: repeatSchema.kind,
        item_type: normalizeTypeSchema(repeatSchema.item_type),
        min_items: typeof repeatSchema.min_items === 'number' ? repeatSchema.min_items : undefined,
        max_items: typeof repeatSchema.max_items === 'number' ? repeatSchema.max_items : undefined,
        base_variable: typeof repeatSchema.base_variable === 'string' ? repeatSchema.base_variable : undefined,
        layout_template: typeof repeatSchema.layout_template === 'string' ? repeatSchema.layout_template : undefined,
      };
    }
    case 'custom': {
      const customSchema = schema as CustomTypeSchema;
      const items = Array.isArray(customSchema.items)
        ? customSchema.items.map((item) => normalizeCustomItemSchema(item)).filter((item): item is CustomPlaceholderItemSchema => !!item)
        : undefined;
      const tokenLibrary = Array.isArray(customSchema.token_library)
        ? customSchema.token_library.map((item) => normalizeTokenLibraryItem(item)).filter((item): item is TokenLibraryItemSchema => !!item)
        : undefined;
      return {
        kind: 'custom',
        base_variable: typeof customSchema.base_variable === 'string' && customSchema.base_variable.trim() !== ''
          ? customSchema.base_variable.trim()
          : 'item',
        value_type: normalizeTypeSchema(customSchema.value_type),
        ...(items ? { items } : {}),
        ...(tokenLibrary ? { token_library: tokenLibrary } : {}),
        layout_template: typeof customSchema.layout_template === 'string' ? customSchema.layout_template : '{{item}}',
        repeat: customSchema.repeat === true,
        token_registry: normalizeSchemaMap(customSchema.token_registry),
        token_labels: isRecord(customSchema.token_labels)
          ? Object.fromEntries(Object.entries(customSchema.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)]))
          : undefined,
        layout_nodes: Array.isArray(customSchema.layout_nodes) ? customSchema.layout_nodes : undefined,
      };
    }
    case 'list': {
      const listSchema = schema as ListTypeSchema;
      return {
        kind: listSchema.kind,
        item_type: normalizeTypeSchema(listSchema.item_type),
        style: normalizeListStyle(listSchema.style),
        min_items: typeof listSchema.min_items === 'number' ? listSchema.min_items : undefined,
        max_items: typeof listSchema.max_items === 'number' ? listSchema.max_items : undefined,
      };
    }
    case 'page':
    case 'header':
    case 'footer':
    case 'container': {
      const containerSchema = schema as ContainerTypeSchema;
      return {
        kind: containerSchema.kind,
        mode: containerSchema.mode === 'repeat' ? 'repeat' : 'tuple',
        component_types: Array.isArray(containerSchema.component_types)
          ? containerSchema.component_types.map((item) => normalizeTypeSchema(item))
          : undefined,
        item_type: containerSchema.item_type ? normalizeTypeSchema(containerSchema.item_type) : undefined,
        min_items: typeof containerSchema.min_items === 'number' ? containerSchema.min_items : undefined,
        max_items: typeof containerSchema.max_items === 'number' ? containerSchema.max_items : undefined,
      };
    }
    case 'table': {
      const tableSchema = schema as TableTypeSchema;
      return {
        kind: tableSchema.kind,
        mode: tableSchema.mode,
        headers: tableSchema.headers,
        dynamic_headers: tableSchema.dynamic_headers,
        column_types: normalizeSchemaMap(tableSchema.column_types),
        row_types: normalizeSchemaMap(tableSchema.row_types),
        caption: typeof tableSchema.caption === 'string' && tableSchema.caption.trim() !== '' ? tableSchema.caption.trim() : undefined,
        ...(Array.isArray((schema as Record<string, unknown>).dynamic_fields)
          ? { dynamic_fields: ((schema as Record<string, unknown>).dynamic_fields as unknown[]).filter((field): field is string => typeof field === 'string') }
          : {}),
        ...(isRecord((schema as Record<string, unknown>).static_values)
          ? { static_values: (schema as Record<string, unknown>).static_values as Record<string, unknown> }
          : {}),
      };
    }
    default:
      return defaultStringSchema();
  }
}

function getPlaceholderKeyAndSchema(typedNode: Record<string, unknown>): { key: string; schema: ComponentTypeSchema } | null {
  const attrs = (typedNode.attrs as Record<string, unknown> | undefined) || {};
  const key = typeof attrs.key === 'string' ? attrs.key.trim() : '';
  if (!key) {
    return null;
  }

  const kind = typeof attrs.kind === 'string'
    ? attrs.kind
    : (isRecord(attrs.schema) && typeof attrs.schema.kind === 'string' ? attrs.schema.kind : 'string');
  const schema = deriveSchemaFromChildren(kind, attrs, typedNode.content);
  return { key, schema };
}

function normalizeSchemaMap(value: unknown): Record<string, ComponentTypeSchema> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const output: Record<string, ComponentTypeSchema> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k !== 'string' || k.trim() === '') continue;
    output[k] = normalizeTypeSchema(v);
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function normalizeCustomItemSchema(rawItem: unknown): CustomPlaceholderItemSchema | undefined {
  if (!isRecord(rawItem) || typeof rawItem.id !== 'string' || rawItem.id.trim() === '' || typeof rawItem.kind !== 'string') {
    return undefined;
  }

  return {
    id: rawItem.id.trim(),
    kind: rawItem.kind as CustomPlaceholderItemSchema['kind'],
    ...(typeof rawItem.label === 'string' && rawItem.label.trim() !== '' ? { label: rawItem.label.trim() } : {}),
    ...(isRecord(rawItem.token_registry)
      ? { token_registry: Object.fromEntries(Object.entries(rawItem.token_registry).map(([k, v]) => [k, normalizeTypeSchema(v)])) }
      : {}),
    ...(isRecord(rawItem.token_labels)
      ? { token_labels: Object.fromEntries(Object.entries(rawItem.token_labels).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)])) }
      : {}),
    ...(typeof rawItem.layout_template === 'string' ? { layout_template: rawItem.layout_template } : {}),
    ...(Array.isArray(rawItem.layout_nodes) ? { layout_nodes: rawItem.layout_nodes } : {}),
  };
}

function normalizeTokenLibraryItem(rawItem: unknown): TokenLibraryItemSchema | undefined {
  if (!isRecord(rawItem) || typeof rawItem.id !== 'string' || rawItem.id.trim() === '' || typeof rawItem.kind !== 'string') {
    return undefined;
  }

  const kind = rawItem.kind as ComponentTypeSchema['kind'];
  const normalized: TokenLibraryItemSchema = {
    id: rawItem.id.trim(),
    kind,
    ...(typeof rawItem.label === 'string' && rawItem.label.trim() !== '' ? { label: rawItem.label.trim() } : {}),
    ...(Array.isArray(rawItem.dynamic_fields)
      ? { dynamic_fields: rawItem.dynamic_fields.filter((field): field is string => typeof field === 'string' && field.trim() !== '') }
      : {}),
    ...(isRecord(rawItem.static_values)
      ? { static_values: Object.fromEntries(Object.entries(rawItem.static_values)) }
      : {}),
  };

  if (kind === 'list') {
    normalized.item_type = isRecord(rawItem.item_type) ? normalizeTypeSchema(rawItem.item_type) : defaultStringSchema();
    normalized.style = normalizeListStyle(rawItem.style);
  }

  if (kind === 'table') {
    normalized.mode = rawItem.mode === 'column_data' ? 'column_data' : 'row_data';
    normalized.headers = Array.isArray(rawItem.headers)
      ? rawItem.headers.filter((header): header is string => typeof header === 'string' && header.trim() !== '')
      : undefined;
    normalized.dynamic_headers = typeof rawItem.dynamic_headers === 'boolean' ? rawItem.dynamic_headers : undefined;
    normalized.column_types = normalizeSchemaMap(rawItem.column_types);
    normalized.row_types = normalizeSchemaMap(rawItem.row_types);
    normalized.caption = typeof rawItem.caption === 'string' && rawItem.caption.trim() !== '' ? rawItem.caption.trim() : undefined;
  }

  return normalized;
}

function replaceTextTokens(value: string, dataPoint: DataPoint): string {
  return value.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    const raw = dataPoint[key];
    if (raw === undefined || raw === null) {
      return '';
    }
    return String(raw);
  });
}

/**
 * Extracts and cleans the placeholder key string from a node's attributes.
 * @param attrs The attributes object from a document node, containing the key property.
 * @returns The trimmed string key, or an empty string if it's not a valid string.
 */
function getPlaceholderKey(attrs: Record<string, unknown>): string {
  return typeof attrs.key === 'string' ? attrs.key.trim() : '';
}

/**
 * Recursively scans a document node (or array of nodes) and replaces placeholder types
 * with their corresponding values from the provided data point.
 * @param node A document node, attribute map, or an array of nodes.
 * @param dataPoint An object containing properties to map against placeholder keys.
 * @param derivedSchemaMap A map of placeholder key -> derived ComponentTypeSchema.
 * @returns A cloned node with placeholders replaced with actual text instances.
 */
function replacePlaceholdersInNode(node: unknown, dataPoint: DataPoint, derivedSchemaMap: Record<string, ComponentTypeSchema>): unknown {
  // Gracefully traverse mapping combinations mapped into standard nested list configurations
  if (Array.isArray(node)) {
    return node.map((item) => replacePlaceholdersInNode(item, dataPoint, derivedSchemaMap));
  }

  // Escape traversal quickly if primitive types or completely uninitialized states arise
  if (!node || typeof node !== 'object') {
    return node;
  }

  // Coerce variable properties guaranteeing indexing flexibility without TypeScript complaints
  const typedNode = node as Record<string, unknown>;
  
  // Clone element structure immutably to prevent parent layout collision
  const clonedNode: Record<string, unknown> = { ...typedNode };

  // Core execution trigger isolating placeholder definitions mapped heavily previously
  if (clonedNode.type === 'placeholder') {
    const attrs = (clonedNode.attrs as Record<string, unknown> | undefined) || {};
    const key = getPlaceholderKey(attrs);

    if (key) {
      const replacement = dataPoint[key];
      const selectedValue = replacement === undefined ? attrs.value : replacement;
      const schema = derivedSchemaMap[key];

      clonedNode.attrs = {
        ...attrs,
        key,
        value: selectedValue,
      };

      if (Array.isArray(clonedNode.content)) {
        clonedNode.content = clonedNode.content.map((child) => {
          if (isRecord(child) && child.type === 'text' && typeof child.text === 'string') {
            let nextText = replaceTextTokens(child.text, dataPoint);
            // If the text node precisely matches the placeholder key string, treat it as a token.
            // This fixes cases where the editor inserts the key as plain text without braces.
            if (nextText === key && dataPoint[key] !== undefined) {
              nextText = String(dataPoint[key]);
            }
            return {
              ...child,
              text: nextText,
            };
          }
          return child;
        });
      }

      if (schema && (!clonedNode.content || (Array.isArray(clonedNode.content) && clonedNode.content.length === 0))
        && (schema.kind === 'string' || schema.kind === 'integer')) {
        const replacementText = selectedValue === undefined || selectedValue === null ? '' : String(selectedValue);
        clonedNode.content = [{ type: 'text', text: replacementText }];
      }
    }
  }

  // Actively dive inward sequentially substituting nested child structures recursively
  if (clonedNode.attrs) {
    clonedNode.attrs = replacePlaceholdersInNode(clonedNode.attrs, dataPoint, derivedSchemaMap);
  }

  if (clonedNode.content) {
    clonedNode.content = replacePlaceholdersInNode(clonedNode.content, dataPoint, derivedSchemaMap);
  }

  return clonedNode;
}

/**
 * Applies a given data point structure against a template's JSON representation
 * to populate all matching placeholders and prepare it for rendering.
 * @param templateJson The original template configuration object.
 * @param dataPoint The values to substitute into the template's placeholders.
 * @returns A fully cloned and populated template map.
 */
/** Applies a data point to template JSON without mutating the original input. */
export function applyTemplateDataPoint(templateJson: Record<string, unknown>, dataPoint: DataPoint) {
  const clonedTemplate = deepClone(templateJson);
  const derivedSchemaMap = collectPlaceholderDerivedSchemaMap(templateJson);
  return replacePlaceholdersInNode(clonedTemplate, dataPoint, derivedSchemaMap) as Record<string, unknown>;
}

/** Builds a placeholder key -> schema map from the template structure. */
export function collectPlaceholderKeyTypeMap(templateJson: Record<string, unknown>): PlaceholderKeyTypeMap {
  return collectPlaceholderDerivedSchemaMap(templateJson);
}

/** Builds a richer key -> config map used by the data validator and modal UI. */
export function collectPlaceholderValidationConfigMap(templateJson: Record<string, unknown>): PlaceholderValidationConfigMap {
  const configMap: PlaceholderValidationConfigMap = {};
  const derivedSchemaMap = collectPlaceholderDerivedSchemaMap(templateJson);

  walkTemplate(templateJson, (typedNode) => {
    if (typedNode.type !== 'placeholder') {
      return;
    }

    const attrs = (typedNode.attrs as Record<string, unknown> | undefined) || {};
    const key = getPlaceholderKey(attrs);
    if (!key) {
      return;
    }

    const schema = derivedSchemaMap[key] || { kind: 'string' };

    const style = schema.kind === 'list' ? normalizeListStyle(schema.style) : undefined;
    const mode = schema.kind === 'table' && (schema.mode === 'row_data' || schema.mode === 'column_data')
      ? schema.mode
      : undefined;
    const headers = schema.kind === 'table' && Array.isArray(schema.headers)
      ? schema.headers.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
      : undefined;

    configMap[key] = {
      schema,
      style,
      mode,
      headers,
      column_types: schema.kind === 'table' ? normalizeSchemaMap(schema.column_types) : undefined,
      row_types: schema.kind === 'table' ? normalizeSchemaMap(schema.row_types) : undefined,
      optional: attrs.optional === true,
    };
  });

  return configMap;
}

function walkTemplate(node: unknown, visit: (typedNode: Record<string, unknown>) => void) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkTemplate(child, visit);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  visit(node);

  if (node.attrs) {
    walkTemplate(node.attrs, visit);
  }

  if (node.content) {
    walkTemplate(node.content, visit);
  }
}

/**
 * Recursively traverses a node object to identify all unique placeholder keys
 * and their schemas, derived from each placeholder's structural attrs.
 * @param templateJson The template JSON to scan.
 * @returns A map of placeholder key -> ComponentTypeSchema.
 */
function collectPlaceholderDerivedSchemaMap(templateJson: Record<string, unknown>): Record<string, ComponentTypeSchema> {
  const schemaMap: Record<string, ComponentTypeSchema> = {};

  walkTemplate(templateJson, (typedNode) => {
    if (typedNode.type !== 'placeholder') {
      return;
    }

    const entry = getPlaceholderKeyAndSchema(typedNode);
    if (entry) {
      schemaMap[entry.key] = entry.schema;
    }
  });

  return schemaMap;
}

/**
 * Inspects a template JSON definition and retrieves a sorted list of all
 * required placeholder keys necessary to successfully populate it.
 * @param templateJson The JSON of the template to be evaluated.
 * @returns An array of string keys representing missing placeholder targets.
 */
/** Returns all placeholder keys that must be supplied before rendering. */
export function collectRequiredPlaceholderKeys(templateJson: Record<string, unknown>): string[] {
  return Object.keys(collectPlaceholderKeyTypeMap(templateJson)).sort();
}

/**
 * Compares an array of required keys with a provided dataset and identifies
 * which required substitutions are unfulfilled by the data points.
 * @param dataPoint The submitted parameter values meant to cover all placeholders.
 * @param requiredKeys A list of exact placeholder strings expected by a document.
 * @returns An array representing all placeholder keys lacking defined value mappings.
 */
/** Returns the subset of required keys absent from a given data point. */
export function findMissingPlaceholderKeys(dataPoint: DataPoint, requiredKeys: string[]): string[] {
  return requiredKeys.filter((key) => !(key in dataPoint) || dataPoint[key] === undefined || dataPoint[key] === null);
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return Math.trunc(numeric);
    }
  }

  return null;
}

function validateAndNormalizeValue(
  value: unknown,
  schema: ComponentTypeSchema,
  path: string,
  config?: PlaceholderValidationConfig
): { ok: true; value: ComponentValue } | { ok: false; error: string } {
  switch (schema.kind) {
    case 'string': {
      if (value === undefined || value === null) {
        return { ok: false, error: `${path} must be a string` };
      }
      return { ok: true, value: String(value) };
    }

    case 'integer': {
      const parsed = parseInteger(value);
      if (parsed === null) {
        return { ok: false, error: `${path} must be convertible to integer` };
      }
      return { ok: true, value: parsed };
    }

    case 'image': {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be an image object` };
      }

      const dynamicFieldsRaw = (schema as Record<string, unknown>).dynamic_fields;
      const dynamicFields = new Set(
        Array.isArray(dynamicFieldsRaw)
          ? dynamicFieldsRaw.filter((field): field is string => typeof field === 'string')
          : ['src', 'alt']
      );
      const staticValues = isRecord((schema as Record<string, unknown>).static_values)
        ? ((schema as Record<string, unknown>).static_values as Record<string, unknown>)
        : {};

      const src = dynamicFields.has('src')
        ? value.src
        : staticValues.src;
      const alt = dynamicFields.has('alt')
        ? value.alt
        : (staticValues.alt ?? '');

      if (dynamicFields.has('src') && (typeof src !== 'string' || src.trim() === '')) {
        return { ok: false, error: `${path}.src must be a non-empty string` };
      }
      if (!dynamicFields.has('src') && typeof value.src === 'string' && value.src !== src) {
        return { ok: false, error: `${path}.src is static and cannot be overridden` };
      }

      if (typeof src !== 'string' || src.trim() === '') {
        return { ok: false, error: `${path}.src must be a non-empty string` };
      }
      if (typeof alt !== 'string') {
        return { ok: false, error: `${path}.alt must be a string` };
      }
      if (!dynamicFields.has('alt') && typeof value.alt === 'string' && value.alt !== alt) {
        return { ok: false, error: `${path}.alt is static and cannot be overridden` };
      }

      const normalized: ImageValue = {
        src,
        alt,
        ...(typeof value.source === 'string' ? { source: value.source as ImageValue['source'] } : {}),
        ...(typeof value.mime_type === 'string' ? { mime_type: value.mime_type } : {}),
        ...(typeof value.file_name === 'string' ? { file_name: value.file_name } : {}),
      };

      return { ok: true, value: normalized };
    }

    case 'hyperlink': {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be a hyperlink object` };
      }

      const dynamicFieldsRaw = (schema as Record<string, unknown>).dynamic_fields;
      const dynamicFields = new Set(
        Array.isArray(dynamicFieldsRaw)
          ? dynamicFieldsRaw.filter((field): field is string => typeof field === 'string')
          : ['alias', 'url']
      );
      const staticValues = isRecord((schema as Record<string, unknown>).static_values)
        ? ((schema as Record<string, unknown>).static_values as Record<string, unknown>)
        : {};

      const alias = dynamicFields.has('alias') ? value.alias : staticValues.alias;
      const url = dynamicFields.has('url') ? value.url : staticValues.url;

      if (typeof alias !== 'string' || alias.trim() === '') {
        return { ok: false, error: `${path}.alias must be a non-empty string` };
      }
      if (!dynamicFields.has('alias') && typeof value.alias === 'string' && value.alias !== alias) {
        return { ok: false, error: `${path}.alias is static and cannot be overridden` };
      }
      if (typeof url !== 'string' || url.trim() === '') {
        return { ok: false, error: `${path}.url must be a non-empty string` };
      }
      if (!dynamicFields.has('url') && typeof value.url === 'string' && value.url !== url) {
        return { ok: false, error: `${path}.url is static and cannot be overridden` };
      }
      try {
        const parsedUrl = new URL(url);
        if (!parsedUrl.protocol || !parsedUrl.hostname) {
          return { ok: false, error: `${path}.url must be an absolute URL` };
        }
      } catch {
        return { ok: false, error: `${path}.url must be an absolute URL` };
      }

      const normalized: HyperlinkValue = {
        alias,
        url,
      };

      return { ok: true, value: normalized };
    }

    case 'repeat': {
      const rawItems = Array.isArray(value)
        ? value
        : isRecord(value) && Array.isArray(value.items)
          ? value.items
          : undefined;
      if (!Array.isArray(rawItems)) {
        return { ok: false, error: `${path} must be an array or an object with items[]` };
      }

      if (typeof schema.min_items === 'number' && rawItems.length < schema.min_items) {
        return { ok: false, error: `${path} requires at least ${schema.min_items} item(s)` };
      }
      if (typeof schema.max_items === 'number' && rawItems.length > schema.max_items) {
        return { ok: false, error: `${path} allows at most ${schema.max_items} item(s)` };
      }

      const normalizedItems: ComponentValue[] = [];
      for (let i = 0; i < rawItems.length; i += 1) {
        const itemResult = validateAndNormalizeValue(rawItems[i], schema.item_type, `${path}[${i}]`);
        if (!itemResult.ok) return itemResult;
        normalizedItems.push(itemResult.value);
      }

      const normalized: RepeatValue = { items: normalizedItems };
      return { ok: true, value: normalized };
    }

    case 'custom': {
      const customSchema = schema as CustomTypeSchema;
      const valueType = normalizeTypeSchema(customSchema.value_type);
      const tokenRegistry = normalizeSchemaMap(customSchema.token_registry);
      const tokenLibrary = Array.isArray(customSchema.token_library)
        ? customSchema.token_library.map((item) => normalizeTokenLibraryItem(item)).filter((item): item is TokenLibraryItemSchema => !!item)
        : [];
      const items = Array.isArray(customSchema.items)
        ? customSchema.items.map((item) => normalizeCustomItemSchema(item)).filter((item): item is CustomPlaceholderItemSchema => !!item)
        : [];

      const tokenLibraryToSchema = (item: TokenLibraryItemSchema): ComponentTypeSchema => {
        if (item.kind === 'list') {
          return {
            kind: 'list',
            item_type: item.item_type ? normalizeTypeSchema(item.item_type) : defaultStringSchema(),
            style: normalizeListStyle(item.style),
          };
        }

        if (item.kind === 'image') {
          return {
            kind: 'image',
            ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
            ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
          } as ComponentTypeSchema;
        }

        if (item.kind === 'hyperlink') {
          return {
            kind: 'hyperlink',
            ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
            ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
          } as ComponentTypeSchema;
        }

        if (item.kind === 'table') {
          return {
            kind: 'table',
            mode: item.mode === 'column_data' ? 'column_data' : 'row_data',
            headers: item.headers,
            dynamic_headers: item.dynamic_headers,
            column_types: normalizeSchemaMap(item.column_types),
            row_types: normalizeSchemaMap(item.row_types),
            caption: item.caption ? normalizeTypeSchema(item.caption) : undefined,
            ...(Array.isArray(item.dynamic_fields) ? { dynamic_fields: item.dynamic_fields } : {}),
            ...(isRecord(item.static_values) ? { static_values: item.static_values } : {}),
          };
        }

        return normalizeTypeSchema({ kind: item.kind });
      };

      const effectiveTokenRegistry = tokenLibrary.length > 0
        ? Object.fromEntries(tokenLibrary.map((item) => [item.id, tokenLibraryToSchema(item)]))
        : tokenRegistry;

      const normalizeItemSchema = (itemSchema: CustomPlaceholderItemSchema): ComponentTypeSchema => {
        if (itemSchema.kind === 'custom' || itemSchema.token_registry) {
          return {
            kind: 'custom',
            base_variable: itemSchema.id,
            value_type: normalizeTypeSchema((itemSchema as CustomPlaceholderItemSchema & { value_type?: ComponentTypeSchema }).value_type || valueType),
            layout_template: itemSchema.layout_template || '{{item}}',
            repeat: false,
            token_registry: normalizeSchemaMap(itemSchema.token_registry),
            token_labels: itemSchema.token_labels,
            layout_nodes: itemSchema.layout_nodes,
          };
        }

        return normalizeTypeSchema({ kind: itemSchema.kind });
      };

      const validateTokenObject = (candidate: unknown, tokenPath: string) => {
        if (!isRecord(candidate)) {
          return { ok: false as const, error: `${tokenPath} must be an object keyed by token ids` };
        }

        if (!effectiveTokenRegistry || Object.keys(effectiveTokenRegistry).length === 0) {
          const nestedValidation = validateAndNormalizeValue(candidate, valueType, tokenPath);
          if (!nestedValidation.ok) return nestedValidation;
          return { ok: true as const, value: nestedValidation.value };
        }

        const normalizedTokenData: Record<string, ComponentValue> = {};
        for (const [tokenId, tokenSchema] of Object.entries(effectiveTokenRegistry)) {
          if (!(tokenId in candidate)) {
            return { ok: false as const, error: `${tokenPath}.${tokenId} is required by custom token schema` };
          }
          const tokenValidation = validateAndNormalizeValue(candidate[tokenId], tokenSchema, `${tokenPath}.${tokenId}`);
          if (!tokenValidation.ok) return tokenValidation;
          normalizedTokenData[tokenId] = tokenValidation.value;
        }

        return { ok: true as const, value: normalizedTokenData };
      };

      if (customSchema.repeat) {
        const rawItems = Array.isArray(value)
          ? value
          : isRecord(value) && Array.isArray(value.items)
            ? value.items
            : undefined;

        if (!Array.isArray(rawItems)) {
          return { ok: false, error: `${path} must be an array or {items:[]}` };
        }

        const normalizedItems: ComponentValue[] = [];
        for (let i = 0; i < rawItems.length; i += 1) {
          const itemResult = validateTokenObject(rawItems[i], `${path}[${i}]`);
          if (!itemResult.ok) return itemResult;
          normalizedItems.push(itemResult.value);
        }

        return { ok: true, value: { data: { items: normalizedItems } } };
      }

      if (items.length > 0) {
        const rawItems = Array.isArray(value)
          ? value
          : isRecord(value) && Array.isArray(value.items)
            ? value.items
            : isRecord(value) && Array.isArray(value.data)
              ? value.data
              : undefined;

        if (!Array.isArray(rawItems)) {
          return { ok: false, error: `${path} must be an array or {items:[]}` };
        }

        const normalizedItems: ComponentValue[] = [];
        for (let i = 0; i < items.length; i += 1) {
          const itemSchema = normalizeItemSchema(items[i]);
          const itemValue = rawItems[i];
          const itemResult = validateAndNormalizeValue(itemValue, itemSchema, `${path}.items[${i}]`);
          if (!itemResult.ok) return itemResult;
          normalizedItems.push(itemResult.value);
        }

        return { ok: true, value: { items: normalizedItems } };
      }

      const candidate = isRecord(value) && 'data' in value ? value.data : value;
      const nestedValidation = validateTokenObject(candidate, `${path}.data`);
      if (!nestedValidation.ok) return nestedValidation;
      return { ok: true, value: { data: nestedValidation.value } };
    }

    case 'list': {
      const rawValue = isRecord(value) ? value : {};
      const rawItems = Array.isArray(value) ? value : Array.isArray(rawValue.items) ? rawValue.items : undefined;
      if (!Array.isArray(rawItems)) {
        return { ok: false, error: `${path} must be an array or a list object with items[]` };
      }

      if (typeof schema.min_items === 'number' && rawItems.length < schema.min_items) {
        return { ok: false, error: `${path} requires at least ${schema.min_items} item(s)` };
      }
      if (typeof schema.max_items === 'number' && rawItems.length > schema.max_items) {
        return { ok: false, error: `${path} allows at most ${schema.max_items} item(s)` };
      }

      const normalizedItems: ComponentValue[] = [];
      for (let i = 0; i < rawItems.length; i += 1) {
        const itemResult = validateAndNormalizeValue(rawItems[i], schema.item_type, `${path}[${i}]`);
        if (!itemResult.ok) {
          return itemResult;
        }
        normalizedItems.push(itemResult.value);
      }

      const style = isRecord(value) && typeof rawValue.style === 'string'
        ? normalizeListStyle(rawValue.style)
        : undefined;

      const normalized: ListValue = {
        items: normalizedItems,
        ...(style ? { style } : {}),
      };

      return { ok: true, value: normalized };
    }

    case 'page':
    case 'header':
    case 'footer':
    case 'container': {
      if (!isRecord(value) || !Array.isArray(value.components)) {
        return { ok: false, error: `${path} must be a ${schema.kind} object with components[]` };
      }

      const mode = (schema as ContainerTypeSchema).mode === 'repeat' ? 'repeat' : 'tuple';
      const normalizedComponents: ComponentValue[] = [];

      if (mode === 'repeat') {
        const itemSchema = (schema as ContainerTypeSchema).item_type || { kind: 'string' };
        for (let i = 0; i < value.components.length; i += 1) {
          const itemResult = validateAndNormalizeValue(value.components[i], itemSchema, `${path}.components[${i}]`);
          if (!itemResult.ok) return itemResult;
          normalizedComponents.push(itemResult.value);
        }
      } else {
        const componentTypes = Array.isArray((schema as ContainerTypeSchema).component_types)
          ? (schema as ContainerTypeSchema).component_types!
          : [];

        if (value.components.length !== componentTypes.length) {
          return {
            ok: false,
            error: `${path}.components length must be ${componentTypes.length}`,
          };
        }

        for (let i = 0; i < componentTypes.length; i += 1) {
          const itemResult = validateAndNormalizeValue(value.components[i], componentTypes[i], `${path}.components[${i}]`);
          if (!itemResult.ok) return itemResult;
          normalizedComponents.push(itemResult.value);
        }
      }

      return {
        ok: true,
        value: {
          components: normalizedComponents,
        },
      };
    }

    case 'table': {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be a table object` };
      }

      // Determine mode from config or schema first, then fall back to payload shape.
      const configuredMode = config?.mode;
      const schemaMode = schema.mode;
      const hasRows = Array.isArray(value.rows);
      const hasColumns = isRecord(value.columns);

      const effectiveMode = configuredMode || schemaMode;

      if (effectiveMode === 'row_data' && !hasRows) {
        return { ok: false, error: `${path}.rows must be an array` };
      }

      if (effectiveMode === 'column_data' && !hasColumns) {
        return { ok: false, error: `${path}.columns must be an object` };
      }

      if (!hasRows && !hasColumns) {
        return { ok: false, error: `${path} must have either rows[] or columns{}` };
      }

      if (hasRows && hasColumns) {
        return { ok: false, error: `${path} cannot have both rows[] and columns{}` };
      }

      if (value.caption !== undefined) {
        return { ok: false, error: `${path}.caption is static and cannot be overridden` };
      }

      if (hasRows) {
        const rows = value.rows as unknown[];
        const schemaHeaders = Array.isArray(schema.headers) ? schema.headers : [];
        const headers = config?.headers && config.headers.length > 0
          ? config.headers
          : schemaHeaders.length > 0
            ? schemaHeaders
            : [];
        const inferredHeaders = headers.length > 0
          ? headers
          : Array.from(new Set(rows.flatMap((row) => (isRecord(row) ? Object.keys(row) : []))));
        const columnTypes = config?.column_types || schema.column_types || {};
        const dynamicFields = new Set(
          Array.isArray((schema as Record<string, unknown>).dynamic_fields)
            ? ((schema as Record<string, unknown>).dynamic_fields as unknown[]).filter((field): field is string => typeof field === 'string')
            : inferredHeaders
        );
        const staticValues = isRecord((schema as Record<string, unknown>).static_values)
          ? ((schema as Record<string, unknown>).static_values as Record<string, unknown>)
          : {};
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          if (!isRecord(row)) {
            return { ok: false, error: `${path}.rows[${i}] must be an object` };
          }

          for (const header of inferredHeaders) {
            if (!(header in row)) {
              return { ok: false, error: `${path}.rows[${i}] missing header '${header}'` };
            }
            if (!dynamicFields.has(header)) {
              const staticValue = staticValues[header] ?? '';
              if (row[header] !== staticValue) {
                return { ok: false, error: `${path}.rows[${i}].${header} is static and cannot be overridden` };
              }
            }
          }
        }

        const normalizedRows: Array<Record<string, unknown>> = rows.map((row) => {
          const rowObj = isRecord(row) ? { ...row } : {};
          for (const header of inferredHeaders) {
            if (!dynamicFields.has(header)) {
              rowObj[header] = staticValues[header] ?? '';
            }
          }
          for (const [header, headerSchema] of Object.entries(columnTypes)) {
            if (!(header in rowObj)) continue;
            const cellValidation = validateAndNormalizeValue(rowObj[header], headerSchema, `${path}.${header}`);
            if (cellValidation.ok) {
              rowObj[header] = cellValidation.value;
            }
          }
          return rowObj;
        });

        const normalized: TableRowDataValue = {
          rows: normalizedRows,
        };

        return { ok: true, value: normalized };
      }

      // has columns
      const columns = value.columns as Record<string, unknown>;
      const schemaHeaders = Array.isArray(schema.headers) ? schema.headers : [];
      const headers = config?.headers && config.headers.length > 0
        ? config.headers
        : schemaHeaders;
      const inferredHeaders = headers.length > 0
        ? headers
        : Array.from(new Set(Object.values(columns).flatMap((col) => (isRecord(col) ? Object.keys(col) : []))));
      const rowTypes = config?.row_types || schema.row_types || {};
      const dynamicFields = new Set(
        Array.isArray((schema as Record<string, unknown>).dynamic_fields)
          ? ((schema as Record<string, unknown>).dynamic_fields as unknown[]).filter((field): field is string => typeof field === 'string')
          : inferredHeaders
      );
      const staticValues = isRecord((schema as Record<string, unknown>).static_values)
        ? ((schema as Record<string, unknown>).static_values as Record<string, unknown>)
        : {};
      for (const colName of Object.keys(columns)) {
        const col = columns[colName];
        if (!isRecord(col)) {
          return { ok: false, error: `${path}.columns['${colName}'] must be an object` };
        }

        for (const rowHeader of inferredHeaders) {
          if (!(rowHeader in col)) {
            return { ok: false, error: `${path}.columns['${colName}'] missing row header '${rowHeader}'` };
          }
        }
      }

      const normalizedColumns: Record<string, Record<string, unknown>> = {};
      for (const [colName, col] of Object.entries(columns)) {
        const colObj = isRecord(col) ? { ...col } : {};
        for (const rowHeader of inferredHeaders) {
          if (!dynamicFields.has(rowHeader)) {
            const staticValue = staticValues[rowHeader] ?? '';
            if (colObj[rowHeader] !== staticValue) {
              return { ok: false, error: `${path}.columns['${colName}'].${rowHeader} is static and cannot be overridden` };
            }
          }
        }
        for (const [rowHeader, rowSchema] of Object.entries(rowTypes)) {
          if (!(rowHeader in colObj)) continue;
          const cellValidation = validateAndNormalizeValue(colObj[rowHeader], rowSchema, `${path}.${colName}.${rowHeader}`);
          if (cellValidation.ok) {
            colObj[rowHeader] = cellValidation.value;
          }
        }
        for (const rowHeader of inferredHeaders) {
          if (!dynamicFields.has(rowHeader)) {
            colObj[rowHeader] = staticValues[rowHeader] ?? '';
          }
        }
        normalizedColumns[colName] = colObj;
      }

      const normalized: TableColumnDataValue = {
        columns: normalizedColumns,
      };

      return { ok: true, value: normalized };
    }

    default:
      return { ok: false, error: `${path} has unsupported schema kind` };
  }
}

/** Validates and normalizes a data point using the simple key -> schema map. */
export function validateDataPointAgainstKeyTypeMap(
  dataPoint: DataPoint,
  keyTypeMap: PlaceholderKeyTypeMap
): DataPointValidationResult {
  const normalizedDataPoint: DataPoint = { ...dataPoint };
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, rawSchema] of Object.entries(keyTypeMap)) {
    const schema = normalizeTypeSchema(rawSchema);
    const value = dataPoint[key];

    if (value === undefined || value === null) {
      missing.push(key);
      continue;
    }

    const validation = validateAndNormalizeValue(value, schema, key);
    if (!validation.ok) {
      invalid.push(validation.error);
      continue;
    }

    normalizedDataPoint[key] = validation.value;
  }

  return {
    normalizedDataPoint,
    missing,
    invalid,
  };
}

/** Validates and normalizes a data point using the richer validation config map. */
export function validateDataPointAgainstPlaceholderConfigMap(
  dataPoint: DataPoint,
  configMap: PlaceholderValidationConfigMap
): DataPointValidationResult {
  const normalizedDataPoint: DataPoint = { ...dataPoint };
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, config] of Object.entries(configMap)) {
    const value = dataPoint[key];
    if (value === undefined || value === null) {
      if (config.optional) continue;
      missing.push(key);
      continue;
    }

    const validation = validateAndNormalizeValue(value, config.schema, key, config);
    if (!validation.ok) {
      invalid.push(validation.error);
      continue;
    }

    normalizedDataPoint[key] = validation.value;
  }

  return { normalizedDataPoint, missing, invalid };
}

/**
 * Transforms a populated Tiptap-compatible JSON document object into fully realized
 * and styled standard HTML markup using the required StarterKit and Placeholder plugins.
 * @param documentJson The Tiptap/Prosemirror compatible document outline.
 * @returns A raw un-wrapper HTML string representation of the document formatting block.
 */
/** Renders a TipTap document JSON blob into standalone HTML. */
export function renderDocumentHtml(documentJson: Record<string, unknown>): string {
  return generateHTML(documentJson, [StarterKit, Placeholder, ...ComponentExtensions]);
}

/**
 * Wraps generated document HTML content with an appropriate skeletal structure
 * including necessary root styling constraints, and meta properties.
 * @param contentHtml The core document representation content to append to body.
 * @returns A complete HTML page string ready for final rendering layout.
 */
function buildHtmlDocument(contentHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${DOCUMENT_CSS}</style>
  </head>
  <body>
    ${contentHtml}
  </body>
</html>`;
}

/**
 * Reuses or initializes a new headless Puppeteer browser instance dynamically
 * designed to assist in output formatting tasks (like PDF generation).
 * @returns A stable, resolved reference to the active puppeteer browser instance.
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return browserInstance;
}

/**
 * Creates an A4 formatted PDF file as a Uint8Array buffer dynamically instantiated
 * from provided valid HTML string content via headless browser automation.
 * @param html The stringified complete markup tree layout definition for printing.
 * @returns A byte array constituting the rendered ready-to-save PDF file structure.
 */
export async function createPdfFromDocumentHtml(html: string): Promise<Uint8Array> {
  // Reuse our headless singleton avoiding excessive expensive heavy spawn jobs continuously
  const browser = await getBrowser();
  
  // Allocate a brand new isolated viewer tab completely untethered from concurrent request loads
  const page = await browser.newPage();

  try {
    // Inject our dynamically built complete Document AST straight down to layout 
    // waiting exclusively until background asynchronous fonts/images fully finalize 
    await page.setContent(buildHtmlDocument(html), {
      waitUntil: 'networkidle0',
    });

    // Execute standard headless PDF conversion rendering utilizing basic paper profiles
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true, // Guarantees explicit background CSS styling triggers correctly
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm',
      },
    });

    // Extract raw memory array ensuring format agnostic client transferability safely 
    return new Uint8Array(pdfBuffer);
  } finally {
    // Mandate isolated resource deallocation avoiding catastrophic browser memory leakage
    await page.close();
  }
}

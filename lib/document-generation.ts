import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import puppeteer, { Browser } from 'puppeteer';
import { Placeholder } from '@/lib/tiptap/placeholder';
import {
  ComponentExtensions,
} from '@/lib/tiptap/extensions';
import {
  ComponentTypeSchema,
  ComponentValue,
  ContainerTypeSchema,
  HyperlinkTypeSchema,
  HyperlinkValue,
  ImageTypeSchema,
  ImageValue,
  IntegerTypeSchema,
  ListTypeSchema,
  ListValue,
  PlaceholderKeyTypeMap,
  ListStyle,
  StringTypeSchema,
  TableColumnDataValue,
  TableMode,
  TableRowDataValue,
  TableTypeSchema,
} from '@/types/template';

export type DataPoint = Record<string, unknown>;

export interface DataPointValidationResult {
  normalizedDataPoint: DataPoint;
  missing: string[];
  invalid: string[];
}

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
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function defaultStringSchema(inPlaceholder = true): StringTypeSchema {
  return {
    kind: 'string',
    in_placeholder: inPlaceholder,
  };
}

function normalizeListStyle(style: unknown): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function normalizeTypeSchema(rawSchema: unknown, inPlaceholder = true): ComponentTypeSchema {
  if (!isRecord(rawSchema) || typeof rawSchema.kind !== 'string') {
    return defaultStringSchema(inPlaceholder);
  }

  const schema = {
    ...rawSchema,
    in_placeholder: typeof rawSchema.in_placeholder === 'boolean' ? rawSchema.in_placeholder : inPlaceholder,
  } as ComponentTypeSchema;

  switch (schema.kind) {
    case 'string':
    case 'integer':
    case 'image':
    case 'hyperlink':
      return schema;
    case 'list': {
      const listSchema = schema as ListTypeSchema;
      return {
        ...listSchema,
        style: normalizeListStyle(listSchema.style),
        item_type: normalizeTypeSchema(listSchema.item_type, true),
      };
    }
    case 'container': {
      const containerSchema = schema as ContainerTypeSchema;
      return {
        ...containerSchema,
        component_types: Array.isArray(containerSchema.component_types)
          ? containerSchema.component_types.map((item) => normalizeTypeSchema(item, true))
          : [],
      };
    }
    case 'table': {
      const tableSchema = schema as TableTypeSchema;
      return {
        ...tableSchema,
        mode: tableSchema.mode === 'column_data' ? 'column_data' : 'row_data',
        headers: Array.isArray(tableSchema.headers)
          ? tableSchema.headers.filter((header) => typeof header === 'string' && header.trim() !== '')
          : [],
        caption: tableSchema.caption ? normalizeTypeSchema(tableSchema.caption, true) : undefined,
      };
    }
    default:
      return defaultStringSchema(inPlaceholder);
  }
}

function getPlaceholderKeyAndSchema(attrs: Record<string, unknown>): { key: string; schema: ComponentTypeSchema } | null {
  const key = typeof attrs.key === 'string' ? attrs.key.trim() : '';
  if (!key) {
    return null;
  }

  const schema = normalizeTypeSchema(attrs.value_schema, true);
  return { key, schema };
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
 * @returns A cloned node with placeholders replaced with actual text instances.
 */
function replacePlaceholdersInNode(node: unknown, dataPoint: DataPoint): unknown {
  // Gracefully traverse mapping combinations mapped into standard nested list configurations
  if (Array.isArray(node)) {
    return node.map((item) => replacePlaceholdersInNode(item, dataPoint));
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
    const keyAndSchema = getPlaceholderKeyAndSchema(attrs);

    if (keyAndSchema) {
      const replacement = dataPoint[keyAndSchema.key];
      const selectedValue = replacement === undefined ? attrs.value : replacement;

      clonedNode.attrs = {
        ...attrs,
        key: keyAndSchema.key,
        value_schema: keyAndSchema.schema,
        value: selectedValue,
      };

      if (Array.isArray(clonedNode.content)) {
        clonedNode.content = clonedNode.content.map((child) => {
          if (isRecord(child) && child.type === 'text' && typeof child.text === 'string') {
            return {
              ...child,
              text: replaceTextTokens(child.text, dataPoint),
            };
          }
          return child;
        });
      }

      if ((!clonedNode.content || (Array.isArray(clonedNode.content) && clonedNode.content.length === 0))
        && (keyAndSchema.schema.kind === 'string' || keyAndSchema.schema.kind === 'integer')) {
        const replacementText = selectedValue === undefined || selectedValue === null ? '' : String(selectedValue);
        clonedNode.content = [{ type: 'text', text: replacementText }];
      }
    }
  }

  // Actively dive inward sequentially substituting nested child structures recursively
  if (clonedNode.attrs) {
    clonedNode.attrs = replacePlaceholdersInNode(clonedNode.attrs, dataPoint);
  }

  if (clonedNode.content) {
    clonedNode.content = replacePlaceholdersInNode(clonedNode.content, dataPoint);
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
export function applyTemplateDataPoint(templateJson: Record<string, unknown>, dataPoint: DataPoint) {
  const clonedTemplate = deepClone(templateJson);
  return replacePlaceholdersInNode(clonedTemplate, dataPoint) as Record<string, unknown>;
}

export function collectPlaceholderKeyTypeMap(templateJson: Record<string, unknown>): PlaceholderKeyTypeMap {
  const keyTypeMap: PlaceholderKeyTypeMap = {};

  walkTemplate(templateJson, (typedNode) => {
    if (typedNode.type !== 'placeholder') {
      return;
    }

    const attrs = (typedNode.attrs as Record<string, unknown> | undefined) || {};
    const entry = getPlaceholderKeyAndSchema(attrs);
    if (entry) {
      keyTypeMap[entry.key] = entry.schema;
    }
  });

  return keyTypeMap;
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
 * Recursively traverses a node object to identify all unique placeholder keys.
 * Populates a given Set with the keys found.
 * @param node The node to analyze for 'placeholder' type definitions.
 * @param keys A Set object used to aggregate the discovered placeholder keys.
 */
function collectPlaceholderKeys(node: unknown, keys: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectPlaceholderKeys(item, keys);
    }
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  const typedNode = node as Record<string, unknown>;

  if (typedNode.type === 'placeholder') {
    const attrs = (typedNode.attrs as Record<string, unknown> | undefined) || {};
    const key = getPlaceholderKey(attrs);
    if (key) {
      keys.add(key);
    }
  }

  if (typedNode.attrs) {
    collectPlaceholderKeys(typedNode.attrs, keys);
  }

  if (typedNode.content) {
    collectPlaceholderKeys(typedNode.content, keys);
  }
}

/**
 * Inspects a template JSON definition and retrieves a sorted list of all
 * required placeholder keys necessary to successfully populate it.
 * @param templateJson The JSON of the template to be evaluated.
 * @returns An array of string keys representing missing placeholder targets.
 */
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
  path: string
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
      if (typeof value.src !== 'string' || value.src.trim() === '') {
        return { ok: false, error: `${path}.src must be a non-empty string` };
      }
      if (typeof value.alt !== 'string') {
        return { ok: false, error: `${path}.alt must be a string` };
      }

      const normalized: ImageValue = {
        in_placeholder: typeof value.in_placeholder === 'boolean' ? value.in_placeholder : schema.in_placeholder,
        src: value.src,
        alt: value.alt,
        option: isRecord(value.option) ? value.option : undefined,
      };

      return { ok: true, value: normalized };
    }

    case 'hyperlink': {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be a hyperlink object` };
      }
      if (typeof value.alias !== 'string' || value.alias.trim() === '') {
        return { ok: false, error: `${path}.alias must be a non-empty string` };
      }
      if (typeof value.url !== 'string' || value.url.trim() === '') {
        return { ok: false, error: `${path}.url must be a non-empty string` };
      }
      try {
        const parsedUrl = new URL(value.url);
        if (!parsedUrl.protocol || !parsedUrl.hostname) {
          return { ok: false, error: `${path}.url must be an absolute URL` };
        }
      } catch {
        return { ok: false, error: `${path}.url must be an absolute URL` };
      }

      const normalized: HyperlinkValue = {
        in_placeholder: typeof value.in_placeholder === 'boolean' ? value.in_placeholder : schema.in_placeholder,
        alias: value.alias,
        url: value.url,
      };

      return { ok: true, value: normalized };
    }

    case 'list': {
      const rawValue = isRecord(value) ? value : {};
      const rawItems = Array.isArray(value) ? value : Array.isArray(rawValue.items) ? rawValue.items : undefined;
      if (!Array.isArray(rawItems)) {
        return { ok: false, error: `${path} must be an array or a list object with items[]` };
      }

      const normalizedItems: ComponentValue[] = [];
      for (let i = 0; i < rawItems.length; i += 1) {
        const itemResult = validateAndNormalizeValue(rawItems[i], schema.item_type, `${path}[${i}]`);
        if (!itemResult.ok) {
          return itemResult;
        }
        normalizedItems.push(itemResult.value);
      }

      const style = isRecord(value) ? normalizeListStyle(rawValue.style) : normalizeListStyle(schema.style);

      const normalized: ListValue = {
        in_placeholder: isRecord(value) && typeof rawValue.in_placeholder === 'boolean' ? rawValue.in_placeholder : schema.in_placeholder,
        items: normalizedItems,
        style,
      };

      return { ok: true, value: normalized };
    }

    case 'container': {
      if (!isRecord(value) || !Array.isArray(value.components)) {
        return { ok: false, error: `${path} must be a container object with components[]` };
      }

      if (value.components.length !== schema.component_types.length) {
        return {
          ok: false,
          error: `${path}.components length must be ${schema.component_types.length}`,
        };
      }

      const normalizedComponents: ComponentValue[] = [];
      for (let i = 0; i < schema.component_types.length; i += 1) {
        const itemResult = validateAndNormalizeValue(
          value.components[i],
          schema.component_types[i],
          `${path}.components[${i}]`
        );
        if (!itemResult.ok) {
          return itemResult;
        }
        normalizedComponents.push(itemResult.value);
      }

      return {
        ok: true,
        value: {
          in_placeholder: typeof value.in_placeholder === 'boolean' ? value.in_placeholder : schema.in_placeholder,
          components: normalizedComponents,
        },
      };
    }

    case 'table': {
      if (!isRecord(value)) {
        return { ok: false, error: `${path} must be a table object` };
      }

      if (schema.mode === 'row_data') {
        if (!Array.isArray(value.rows)) {
          return { ok: false, error: `${path}.rows must be an array` };
        }

        for (let i = 0; i < value.rows.length; i += 1) {
          const row = value.rows[i];
          if (!isRecord(row)) {
            return { ok: false, error: `${path}.rows[${i}] must be an object` };
          }
          for (const header of schema.headers) {
            if (!(header in row)) {
              return { ok: false, error: `${path}.rows[${i}] missing header '${header}'` };
            }
          }
        }

        let captionValue: ComponentValue | undefined;
        if (schema.caption && value.caption !== undefined) {
          const captionResult = validateAndNormalizeValue(value.caption, schema.caption, `${path}.caption`);
          if (!captionResult.ok) {
            return captionResult;
          }
          captionValue = captionResult.value;
        }

        const normalized: TableRowDataValue = {
          in_placeholder: typeof value.in_placeholder === 'boolean' ? value.in_placeholder : schema.in_placeholder,
          mode: 'row_data',
          caption: captionValue,
          rows: value.rows,
        };

        return { ok: true, value: normalized };
      }

      if (!isRecord(value.columns)) {
        return { ok: false, error: `${path}.columns must be an object` };
      }

      for (const [columnName, columnData] of Object.entries(value.columns)) {
        if (!columnName.trim()) {
          return { ok: false, error: `${path}.columns has an empty column name` };
        }
        if (!isRecord(columnData)) {
          return { ok: false, error: `${path}.columns['${columnName}'] must be an object` };
        }
        for (const rowHeader of schema.headers) {
          if (!(rowHeader in columnData)) {
            return {
              ok: false,
              error: `${path}.columns['${columnName}'] missing row header '${rowHeader}'`,
            };
          }
        }
      }

      let captionValue: ComponentValue | undefined;
      if (schema.caption && value.caption !== undefined) {
        const captionResult = validateAndNormalizeValue(value.caption, schema.caption, `${path}.caption`);
        if (!captionResult.ok) {
          return captionResult;
        }
        captionValue = captionResult.value;
      }

      const normalized: TableColumnDataValue = {
        in_placeholder: typeof value.in_placeholder === 'boolean' ? value.in_placeholder : schema.in_placeholder,
        mode: 'column_data',
        caption: captionValue,
        columns: value.columns as Record<string, Record<string, unknown>>,
      };

      return { ok: true, value: normalized };
    }

    default:
      return { ok: false, error: `${path} has unsupported schema kind` };
  }
}

export function validateDataPointAgainstKeyTypeMap(
  dataPoint: DataPoint,
  keyTypeMap: PlaceholderKeyTypeMap
): DataPointValidationResult {
  const normalizedDataPoint: DataPoint = { ...dataPoint };
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const [key, rawSchema] of Object.entries(keyTypeMap)) {
    const schema = normalizeTypeSchema(rawSchema, true);
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

/**
 * Transforms a populated Tiptap-compatible JSON document object into fully realized
 * and styled standard HTML markup using the required StarterKit and Placeholder plugins.
 * @param documentJson The Tiptap/Prosemirror compatible document outline.
 * @returns A raw un-wrapper HTML string representation of the document formatting block.
 */
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

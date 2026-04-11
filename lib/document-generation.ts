import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import puppeteer, { Browser } from 'puppeteer';
import { Placeholder } from '@/lib/tiptap/placeholder';

export type DataPoint = Record<string, unknown>;

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
    // Extract the raw substitution target mapped by string label
    const placeholderKey = getPlaceholderKey(attrs);

    if (placeholderKey) {
      // Probe provided injection variables attempting to replace the label
      const replacement = dataPoint[placeholderKey];
      
      // Coerce any missing map links cleanly into blank text to maintain layout consistency
      const replacementText = replacement === undefined || replacement === null ? '' : String(replacement);

      // Re-hydrate the original tracker mappings purely to retain DOM context natively
      clonedNode.attrs = {
        ...attrs,
        key: placeholderKey,
      };

      // Completely overwrite the nested DOM inner-text strictly containing the valid mapped output
      clonedNode.content = [{ type: 'text', text: replacementText }];
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
  const keys = new Set<string>();
  collectPlaceholderKeys(templateJson, keys);
  return Array.from(keys).sort();
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

/**
 * Transforms a populated Tiptap-compatible JSON document object into fully realized
 * and styled standard HTML markup using the required StarterKit and Placeholder plugins.
 * @param documentJson The Tiptap/Prosemirror compatible document outline.
 * @returns A raw un-wrapper HTML string representation of the document formatting block.
 */
export function renderDocumentHtml(documentJson: Record<string, unknown>): string {
  return generateHTML(documentJson, [StarterKit, Placeholder]);
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

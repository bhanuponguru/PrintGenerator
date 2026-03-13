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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getPlaceholderKey(attrs: Record<string, unknown>): string {
  return typeof attrs.key === 'string' ? attrs.key.trim() : '';
}

function replacePlaceholdersInNode(node: unknown, dataPoint: DataPoint): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => replacePlaceholdersInNode(item, dataPoint));
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const typedNode = node as Record<string, unknown>;
  const clonedNode: Record<string, unknown> = { ...typedNode };

  if (clonedNode.type === 'placeholder') {
    const attrs = (clonedNode.attrs as Record<string, unknown> | undefined) || {};
    const placeholderKey = getPlaceholderKey(attrs);

    if (placeholderKey) {
      const replacement = dataPoint[placeholderKey];
      const replacementText = replacement === undefined || replacement === null ? '' : String(replacement);

      clonedNode.attrs = {
        ...attrs,
        key: placeholderKey,
      };

      clonedNode.content = [{ type: 'text', text: replacementText }];
    }
  }

  if (clonedNode.attrs) {
    clonedNode.attrs = replacePlaceholdersInNode(clonedNode.attrs, dataPoint);
  }

  if (clonedNode.content) {
    clonedNode.content = replacePlaceholdersInNode(clonedNode.content, dataPoint);
  }

  return clonedNode;
}

export function applyTemplateDataPoint(templateJson: Record<string, unknown>, dataPoint: DataPoint) {
  const clonedTemplate = deepClone(templateJson);
  return replacePlaceholdersInNode(clonedTemplate, dataPoint) as Record<string, unknown>;
}

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

export function collectRequiredPlaceholderKeys(templateJson: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  collectPlaceholderKeys(templateJson, keys);
  return Array.from(keys).sort();
}

export function findMissingPlaceholderKeys(dataPoint: DataPoint, requiredKeys: string[]): string[] {
  return requiredKeys.filter((key) => !(key in dataPoint) || dataPoint[key] === undefined || dataPoint[key] === null);
}

export function renderDocumentHtml(documentJson: Record<string, unknown>): string {
  return generateHTML(documentJson, [StarterKit, Placeholder]);
}

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

export async function createPdfFromDocumentHtml(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(buildHtmlDocument(html), {
      waitUntil: 'networkidle0',
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '12mm',
        left: '12mm',
      },
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    await page.close();
  }
}

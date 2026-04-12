import { describe, it, expect } from 'vitest';
import {
  applyTemplateDataPoint,
  collectPlaceholderKeyTypeMap,
  renderDocumentHtml,
  validateDataPointAgainstKeyTypeMap,
} from '@/lib/document-generation';
import { createImageComponent, createTableComponent } from '@/lib/tiptap/extensions';

describe('document-generation typed placeholders', () => {
  it('collects placeholder key type map from multiple placeholders', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'age',
                kind: 'integer',
              },
              content: [{ type: 'text', text: 'Age {{age}}' }],
            },
            {
              type: 'placeholder',
              attrs: {
                key: 'site',
                kind: 'hyperlink',
              },
              content: [{ type: 'text', text: 'Site' }],
            },
          ],
        },
      ],
    };

    const map = collectPlaceholderKeyTypeMap(template);

    expect(Object.keys(map).sort()).toEqual(['age', 'site']);
    expect(map.age.kind).toBe('integer');
    expect(map.site.kind).toBe('hyperlink');
  });

  it('coerces integer values when possible', () => {
    const result = validateDataPointAgainstKeyTypeMap(
      { quantity: '42.9' },
      {
        quantity: { kind: 'integer' },
      }
    );

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.normalizedDataPoint.quantity).toBe(42);
  });

  it('rejects non-absolute hyperlink urls', () => {
    const result = validateDataPointAgainstKeyTypeMap(
      {
        profile: {
          alias: 'Profile',
          url: '/relative/path',
        },
      },
      {
        profile: { kind: 'hyperlink' },
      }
    );

    expect(result.missing).toEqual([]);
    expect(result.invalid.length).toBe(1);
    expect(result.invalid[0]).toContain('absolute URL');
  });

  it('validates list and container shapes', () => {
    const result = validateDataPointAgainstKeyTypeMap(
      {
        blocks: {
          items: [
            {
              components: [
                'Title',
                {
                  alias: 'Open',
                  url: 'https://example.com',
                },
              ],
            },
          ],
        },
      },
      {
        blocks: {
          kind: 'list',
          item_type: {
            kind: 'container',
            component_types: [
              { kind: 'string' },
              { kind: 'hyperlink' },
            ],
          },
        },
      }
    );

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('validates table row_data values against fixed headers', () => {
    const result = validateDataPointAgainstKeyTypeMap(
      {
        report: {
          rows: [
            { Item: 'A', Qty: 2 },
            { Item: 'B' },
          ],
        },
      },
      {
        report: {
          kind: 'table',
          caption: { kind: 'string' },
        },
      }
    );

    expect(result.invalid.length).toBe(0);
  });

  it('replaces multi-key tokens inside placeholder content', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'name',
                kind: 'string',
              },
              content: [{ type: 'text', text: 'Hello {{name}}' }],
            },
          ],
        },
      ],
    };

    const filled = applyTemplateDataPoint(template, { name: 'Ada' });
    const html = renderDocumentHtml(filled);

    expect(html).toContain('Hello Ada');
  });

  it('renders image placeholder values into html', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'logo',
                kind: 'image',
              },
            },
          ],
        },
      ],
    };

    const filled = applyTemplateDataPoint(template, {
      logo: {
        src: 'https://example.com/logo.png',
        alt: 'Company logo',
      },
    });

    const html = renderDocumentHtml(filled);

    expect(html).toContain('<img');
    expect(html).toContain('logo.png');
  });

  it('renders imageComponent tiptap node', () => {
    const doc = {
      type: 'doc',
      content: [
        createImageComponent(
          {
            src: 'https://example.com/pic.png',
            alt: 'Picture',
          },
          { width: '120', height: '80' }
        ),
      ],
    };

    const html = renderDocumentHtml(doc);
    expect(html).toContain('<img');
    expect(html).toContain('pic.png');
  });

  it('renders tableComponent tiptap node in row_data mode', () => {
    const doc = {
      type: 'doc',
      content: [
        createTableComponent(
          {
            rows: [
              { Item: 'Pen', Qty: 2 },
              { Item: 'Book', Qty: 1 },
            ],
            caption: 'Inventory',
          },
          { headers: ['Item', 'Qty'] }
        ),
      ],
    };

    const html = renderDocumentHtml(doc);
    expect(html).toContain('<table');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('<td>Pen</td>');
    expect(html).toContain('<caption>Inventory</caption>');
  });
});

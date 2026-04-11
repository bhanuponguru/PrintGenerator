import { describe, it, expect } from 'vitest';
import {
  applyTemplateDataPoint,
  collectPlaceholderKeyTypeMap,
  renderDocumentHtml,
  validateDataPointAgainstKeyTypeMap,
} from '@/lib/document-generation';

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
                keys: {
                  age: { kind: 'integer', in_placeholder: true },
                  site: { kind: 'hyperlink', in_placeholder: true },
                },
              },
              content: [{ type: 'text', text: 'Age {{age}}' }],
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
        quantity: { kind: 'integer', in_placeholder: true },
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
          in_placeholder: true,
          alias: 'Profile',
          url: '/relative/path',
        },
      },
      {
        profile: { kind: 'hyperlink', in_placeholder: true },
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
          in_placeholder: true,
          items: [
            {
              in_placeholder: true,
              components: [
                'Title',
                {
                  in_placeholder: true,
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
          in_placeholder: true,
          item_type: {
            kind: 'container',
            in_placeholder: true,
            component_types: [
              { kind: 'string', in_placeholder: true },
              { kind: 'hyperlink', in_placeholder: true },
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
          in_placeholder: true,
          mode: 'row_data',
          rows: [
            { Item: 'A', Qty: 2 },
            { Item: 'B' },
          ],
        },
      },
      {
        report: {
          kind: 'table',
          in_placeholder: true,
          mode: 'row_data',
          headers: ['Item', 'Qty'],
          caption: { kind: 'string', in_placeholder: true },
        },
      }
    );

    expect(result.invalid.length).toBe(1);
    expect(result.invalid[0]).toContain("missing header 'Qty'");
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
                keys: {
                  first: { kind: 'string', in_placeholder: true },
                  last: { kind: 'string', in_placeholder: true },
                },
              },
              content: [{ type: 'text', text: 'Hello {{first}} {{last}}' }],
            },
          ],
        },
      ],
    };

    const filled = applyTemplateDataPoint(template, { first: 'Ada', last: 'Lovelace' });
    const html = renderDocumentHtml(filled);

    expect(html).toContain('Hello Ada Lovelace');
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
                keys: {
                  logo: { kind: 'image', in_placeholder: true },
                },
              },
            },
          ],
        },
      ],
    };

    const filled = applyTemplateDataPoint(template, {
      logo: {
        in_placeholder: true,
        src: 'https://example.com/logo.png',
        alt: 'Company logo',
      },
    });

    const html = renderDocumentHtml(filled);

    expect(html).toContain('<img');
    expect(html).toContain('logo.png');
  });
});

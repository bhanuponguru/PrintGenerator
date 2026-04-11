import { describe, expect, it } from 'vitest';
import {
  applyTemplateDataPoint,
  collectPlaceholderKeyTypeMap,
  renderDocumentHtml,
  validateDataPointAgainstKeyTypeMap,
} from '@/lib/document-generation';

function buildListPlaceholderTemplate(key: string, style: 'bulleted' | 'numbered' | 'plain', itemType: 'string' | 'integer' = 'string') {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'placeholder',
            attrs: {
              key,
              value_schema: {
                kind: 'list',
                in_placeholder: true,
                style,
                item_type: { kind: itemType, in_placeholder: true },
              },
            },
          },
        ],
      },
    ],
  };
}

describe('template filling pipeline for list placeholders', () => {
  it('renders a bulleted list from raw array data', () => {
    const template = buildListPlaceholderTemplate('students', 'bulleted');
    const validation = validateDataPointAgainstKeyTypeMap(
      { students: ['Ada', 'Grace', 'Linus'] },
      {
        students: {
          kind: 'list',
          in_placeholder: true,
          style: 'bulleted',
          item_type: { kind: 'string', in_placeholder: true },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);
    expect(validation.normalizedDataPoint.students).toEqual({
      in_placeholder: true,
      style: 'bulleted',
      items: ['Ada', 'Grace', 'Linus'],
    });

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<ul data-list-style="bulleted">');
    expect(html).toContain('<li><span>Ada</span></li>');
    expect(html).toContain('<li><span>Linus</span></li>');
  });

  it('renders a numbered list from raw array data', () => {
    const template = buildListPlaceholderTemplate('instructors', 'numbered');
    const validation = validateDataPointAgainstKeyTypeMap(
      { instructors: ['X', 'Y', 'Z'] },
      {
        instructors: {
          kind: 'list',
          in_placeholder: true,
          style: 'numbered',
          item_type: { kind: 'string', in_placeholder: true },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<ol data-list-style="numbered">');
    expect(html).toContain('<li><span>X</span></li>');
    expect(html).toContain('<li><span>Z</span></li>');
  });

  it('renders a plain list as block items without list markers', () => {
    const template = buildListPlaceholderTemplate('agenda', 'plain');
    const validation = validateDataPointAgainstKeyTypeMap(
      { agenda: ['Draft', 'Review', 'Publish'] },
      {
        agenda: {
          kind: 'list',
          in_placeholder: true,
          style: 'plain',
          item_type: { kind: 'string', in_placeholder: true },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<div data-list-style="plain">');
    expect(html).toContain('<div><span>Draft</span></div>');
    expect(html).toContain('<div><span>Publish</span></div>');
    expect(html).not.toContain('<ul data-list-style');
    expect(html).not.toContain('<ol data-list-style');
  });

  it('preserves an empty list without crashing the renderer', () => {
    const template = buildListPlaceholderTemplate('students', 'bulleted');
    const validation = validateDataPointAgainstKeyTypeMap(
      { students: [] },
      {
        students: {
          kind: 'list',
          in_placeholder: true,
          style: 'bulleted',
          item_type: { kind: 'string', in_placeholder: true },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<ul data-list-style="bulleted"></ul>');
  });

  it('coerces list item values according to the item schema', () => {
    const template = buildListPlaceholderTemplate('scores', 'numbered', 'integer');
    const validation = validateDataPointAgainstKeyTypeMap(
      { scores: ['1', '2.9', 3] },
      {
        scores: {
          kind: 'list',
          in_placeholder: true,
          style: 'numbered',
          item_type: { kind: 'integer', in_placeholder: true },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);
    expect(validation.normalizedDataPoint.scores).toEqual({
      in_placeholder: true,
      style: 'numbered',
      items: [1, 2, 3],
    });

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<ol data-list-style="numbered">');
    expect(html).toContain('<li><span>1</span></li>');
    expect(html).toContain('<li><span>2</span></li>');
    expect(html).toContain('<li><span>3</span></li>');
  });
});

describe('template filling pipeline equivalence coverage', () => {
  it('collects typed placeholder schemas for all major kinds', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'placeholder',
          attrs: { key: 'name', value_schema: { kind: 'string', in_placeholder: true } },
        },
        {
          type: 'placeholder',
          attrs: { key: 'count', value_schema: { kind: 'integer', in_placeholder: true } },
        },
        {
          type: 'placeholder',
          attrs: { key: 'logo', value_schema: { kind: 'image', in_placeholder: true } },
        },
        {
          type: 'placeholder',
          attrs: { key: 'site', value_schema: { kind: 'hyperlink', in_placeholder: true } },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'students',
            value_schema: {
              kind: 'list',
              in_placeholder: true,
              style: 'bulleted',
              item_type: { kind: 'string', in_placeholder: true },
            },
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'pair',
            value_schema: {
              kind: 'container',
              in_placeholder: true,
              component_types: [
                { kind: 'string', in_placeholder: true },
                { kind: 'hyperlink', in_placeholder: true },
              ],
            },
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'report',
            value_schema: {
              kind: 'table',
              in_placeholder: true,
              mode: 'row_data',
              headers: ['Item', 'Qty'],
            },
          },
        },
      ],
    };

    const map = collectPlaceholderKeyTypeMap(template);
    expect(Object.keys(map).sort()).toEqual(['count', 'logo', 'name', 'pair', 'report', 'site', 'students']);
    expect(map.name.kind).toBe('string');
    expect(map.count.kind).toBe('integer');
    expect(map.logo.kind).toBe('image');
    expect(map.site.kind).toBe('hyperlink');
    expect(map.students.kind).toBe('list');
    expect(map.pair.kind).toBe('container');
    expect(map.report.kind).toBe('table');
  });

  it('returns missing and invalid keys in one validation pass', () => {
    const keyTypeMap = {
      name: { kind: 'string', in_placeholder: true },
      count: { kind: 'integer', in_placeholder: true },
      site: { kind: 'hyperlink', in_placeholder: true },
    };

    const result = validateDataPointAgainstKeyTypeMap(
      {
        name: 'Ada',
        site: { alias: 'Docs', url: '/relative', in_placeholder: true },
      },
      keyTypeMap
    );

    expect(result.missing).toEqual(['count']);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]).toContain('absolute URL');
  });

  it('fills and renders primitive placeholders with token replacement', () => {
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
                value_schema: { kind: 'string', in_placeholder: true },
              },
              content: [{ type: 'text', text: 'Hello {{name}}' }],
            },
            { type: 'text', text: ' | ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'count',
                value_schema: { kind: 'integer', in_placeholder: true },
              },
            },
          ],
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      { name: 'Ada', count: '7.8' },
      {
        name: { kind: 'string', in_placeholder: true },
        count: { kind: 'integer', in_placeholder: true },
      }
    );

    expect(validation.invalid).toEqual([]);
    expect(validation.missing).toEqual([]);

    const filled = applyTemplateDataPoint(template, validation.normalizedDataPoint);
    const html = renderDocumentHtml(filled);
    expect(html).toContain('Hello Ada');
    expect(html).toContain('data-placeholder="true">7</span>');
  });

  it('fills and renders image and hyperlink placeholders', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'placeholder',
          attrs: {
            key: 'logo',
            value_schema: { kind: 'image', in_placeholder: true },
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'docs',
            value_schema: { kind: 'hyperlink', in_placeholder: true },
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        logo: { src: 'https://example.com/logo.png', alt: 'Logo', in_placeholder: true },
        docs: { alias: 'Docs', url: 'https://example.com/docs', in_placeholder: true },
      },
      {
        logo: { kind: 'image', in_placeholder: true },
        docs: { kind: 'hyperlink', in_placeholder: true },
      }
    );

    expect(validation.invalid).toEqual([]);
    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<img');
    expect(html).toContain('logo.png');
    expect(html).toContain('href="https://example.com/docs"');
  });

  it('fills and renders container placeholders with nested typed values', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'placeholder',
          attrs: {
            key: 'pair',
            value_schema: {
              kind: 'container',
              in_placeholder: true,
              component_types: [
                { kind: 'string', in_placeholder: true },
                { kind: 'hyperlink', in_placeholder: true },
              ],
            },
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        pair: {
          in_placeholder: true,
          components: ['Open docs', { alias: 'Docs', url: 'https://example.com/docs', in_placeholder: true }],
        },
      },
      {
        pair: {
          kind: 'container',
          in_placeholder: true,
          component_types: [
            { kind: 'string', in_placeholder: true },
            { kind: 'hyperlink', in_placeholder: true },
          ],
        },
      }
    );

    expect(validation.invalid).toEqual([]);
    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('Open docs');
    expect(html).toContain('<a href="https://example.com/docs"');
  });

  it('fills and renders row_data and column_data table placeholders', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'placeholder',
          attrs: {
            key: 'rowTable',
            value_schema: {
              kind: 'table',
              in_placeholder: true,
              mode: 'row_data',
              headers: ['Item', 'Qty'],
            },
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'colTable',
            value_schema: {
              kind: 'table',
              in_placeholder: true,
              mode: 'column_data',
              headers: ['Q1', 'Q2'],
            },
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        rowTable: {
          mode: 'row_data',
          in_placeholder: true,
          rows: [
            { Item: 'Pen', Qty: 2 },
            { Item: 'Notebook', Qty: 1 },
          ],
        },
        colTable: {
          mode: 'column_data',
          in_placeholder: true,
          columns: {
            Sales: { Q1: 10, Q2: 12 },
            Profit: { Q1: 3, Q2: 4 },
          },
        },
      },
      {
        rowTable: {
          kind: 'table',
          in_placeholder: true,
          mode: 'row_data',
          headers: ['Item', 'Qty'],
        },
        colTable: {
          kind: 'table',
          in_placeholder: true,
          mode: 'column_data',
          headers: ['Q1', 'Q2'],
        },
      }
    );

    expect(validation.invalid).toEqual([]);
    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('<td>Notebook</td>');
    expect(html).toContain('<th>Sales</th>');
    expect(html).toContain('<th>Q1</th>');
  });

  it('rejects table values with missing required headers', () => {
    const result = validateDataPointAgainstKeyTypeMap(
      {
        rowTable: {
          mode: 'row_data',
          in_placeholder: true,
          rows: [{ Item: 'Pen' }],
        },
      },
      {
        rowTable: {
          kind: 'table',
          in_placeholder: true,
          mode: 'row_data',
          headers: ['Item', 'Qty'],
        },
      }
    );

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]).toContain("missing header 'Qty'");
  });

  it('renders listComponent nodes by explicit style in direct component mode', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'listComponent',
          attrs: {
            in_placeholder: false,
            value: { in_placeholder: false, style: 'numbered', items: ['A', 'B'] },
          },
        },
        {
          type: 'listComponent',
          attrs: {
            in_placeholder: false,
            value: { in_placeholder: false, style: 'plain', items: ['X', 'Y'] },
          },
        },
      ],
    };

    const html = renderDocumentHtml(doc);
    expect(html).toContain('data-component="list" data-list-style="numbered"');
    expect(html).toContain('data-component="list" data-list-style="plain"');
  });
});

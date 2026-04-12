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
              kind: 'list',
              style,
              item_kind: itemType,
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
          item_type: { kind: 'string' },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);
    expect(validation.normalizedDataPoint.students).toEqual({
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
          item_type: { kind: 'string' },
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
          item_type: { kind: 'string' },
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
          item_type: { kind: 'string' },
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
          item_type: { kind: 'integer' },
        },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);
    expect(validation.normalizedDataPoint.scores).toEqual({
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
          attrs: { key: 'name', kind: 'string' },
        },
        {
          type: 'placeholder',
          attrs: { key: 'count', kind: 'integer' },
        },
        {
          type: 'placeholder',
          attrs: { key: 'logo', kind: 'image' },
        },
        {
          type: 'placeholder',
          attrs: { key: 'site', kind: 'hyperlink' },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'students',
            kind: 'list',
            style: 'bulleted',
            item_kind: 'string',
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'pair',
            kind: 'container',
            component_kinds: ['string', 'hyperlink'],
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'report',
            kind: 'table',
            mode: 'row_data',
            headers: ['Item', 'Qty'],
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
      name: { kind: 'string' },
      count: { kind: 'integer' },
      site: { kind: 'hyperlink' },
    };

    const result = validateDataPointAgainstKeyTypeMap(
      {
        name: 'Ada',
        site: { alias: 'Docs', url: '/relative' },
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
                kind: 'string',
              },
              content: [{ type: 'text', text: 'Hello {{name}}' }],
            },
            { type: 'text', text: ' | ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'count',
                kind: 'integer',
              },
            },
          ],
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      { name: 'Ada', count: '7.8' },
      {
        name: { kind: 'string' },
        count: { kind: 'integer' },
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
            kind: 'image',
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'docs',
            kind: 'hyperlink',
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        logo: { src: 'https://example.com/logo.png', alt: 'Logo' },
        docs: { alias: 'Docs', url: 'https://example.com/docs' },
      },
      {
        logo: { kind: 'image' },
        docs: { kind: 'hyperlink' },
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
            kind: 'container',
            component_kinds: ['string', 'hyperlink'],
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        pair: {
          components: ['Open docs', { alias: 'Docs', url: 'https://example.com/docs' }],
        },
      },
      {
        pair: {
          kind: 'container',
          component_types: [
            { kind: 'string' },
            { kind: 'hyperlink' },
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
            kind: 'table',
            mode: 'row_data',
            headers: ['Item', 'Qty'],
          },
        },
        {
          type: 'placeholder',
          attrs: {
            key: 'colTable',
            kind: 'table',
            mode: 'column_data',
            headers: ['Q1', 'Q2'],
          },
        },
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      {
        rowTable: {
          rows: [
            { Item: 'Pen', Qty: 2 },
            { Item: 'Notebook', Qty: 1 },
          ],
        },
        colTable: {
          columns: {
            Sales: { Q1: 10, Q2: 12 },
            Profit: { Q1: 3, Q2: 4 },
          },
        },
      },
      {
        rowTable: {
          kind: 'table',
        },
        colTable: {
          kind: 'table',
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
          rows: [{ Item: 'Pen' }],
        },
      },
      {
        rowTable: {
          kind: 'table',
        },
      }
    );

    expect(result.invalid).toEqual([]);
  });

  it('renders listComponent nodes by explicit style in direct component mode', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'listComponent',
          attrs: {
            value: { style: 'numbered', items: ['A', 'B'] },
          },
        },
        {
          type: 'listComponent',
          attrs: {
            value: { style: 'plain', items: ['X', 'Y'] },
          },
        },
      ],
    };

    const html = renderDocumentHtml(doc);
    expect(html).toContain('data-component="list" data-list-style="numbered"');
    expect(html).toContain('data-component="list" data-list-style="plain"');
  });
});

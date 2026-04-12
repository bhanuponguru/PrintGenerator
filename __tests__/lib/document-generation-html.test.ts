import { describe, expect, it } from 'vitest';
import { applyTemplateDataPoint, renderDocumentHtml, validateDataPointAgainstKeyTypeMap } from '@/lib/document-generation';
import {
  createContainerComponent,
  createImageComponent,
  createHyperlinkComponent,
  createListComponent,
  createTableComponent,
} from '@/lib/tiptap/extensions';

describe('document generation HTML coverage', () => {
  it('renders a mixed template with all component classes', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'name',
                kind: 'string',
              },
              content: [{ type: 'text', text: '{{name}}' }],
            },
          ],
        },
        createImageComponent(
          {
            src: 'https://example.com/logo.png',
            alt: 'Company logo',
          },
          { width: '200', height: '120' }
        ),
        createHyperlinkComponent(
          {
            alias: 'Docs',
            url: 'https://example.com/docs',
          },
          { title: 'Documentation' }
        ),
        createListComponent(
          {
            items: ['First', 'Second'],
          },
          { 'data-role': 'bullets' }
        ),
        createContainerComponent(
          {
            components: ['Intro', 'Body', 'Footer'],
          },
          {
            component_types: [
              { kind: 'string' },
              { kind: 'string' },
              { kind: 'string' },
            ],
          }
        ),
        createTableComponent({
          rows: [
            { Item: 'Pen', Qty: 2 },
            { Item: 'Notebook', Qty: 1 },
          ],
          caption: 'Inventory',
        }, {
          headers: ['Item', 'Qty'],
        }),
        createTableComponent({
          columns: {
            Sales: { Q1: 10, Q2: 12 },
            Profit: { Q1: 3, Q2: 4 },
          },
          caption: 'Quarterly',
        }, {
          headers: ['Q1', 'Q2'],
        }),
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      { name: 'Ada', count: '42.8' },
      {
        name: { kind: 'string' },
        count: { kind: 'integer' },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));

    expect(html).toContain('data-placeholder="true">Ada</span>');
    expect(html).toContain('<img');
    expect(html).toContain('logo.png');
    expect(html).toContain('width="200"');
    expect(html).toContain('height="120"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('Intro');
    expect(html).toContain('<table');
    expect(html).toContain('<caption>Inventory</caption>');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('Notebook');
    expect(html).toContain('<caption>Quarterly</caption>');
    expect(html).toContain('<th></th>');
    expect(html).toContain('Sales');
  });

  it('renders an empty list and empty row_data table without breaking layout', () => {
    const template = {
      type: 'doc',
      content: [
        createListComponent({
          items: [],
        }),
        createTableComponent({
          rows: [],
          caption: 'Empty rows',
        }, {
          headers: ['A', 'B'],
        }),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('<ul></ul>');
    expect(html).toContain('<caption>Empty rows</caption>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<th>B</th>');
  });

  it('renders a column_data table with zero dynamic columns as a valid empty matrix', () => {
    const template = {
      type: 'doc',
      content: [
        createTableComponent({
          columns: {},
          caption: 'Empty matrix',
        }, {
          headers: ['Q1', 'Q2'],
        }),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('<caption>Empty matrix</caption>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('undefined');
  });

  it('preserves sequential container content order', () => {
    const template = {
      type: 'doc',
      content: [
        createContainerComponent(
          {
            components: ['First block', 'Second block', 'Third block'],
          },
          {
            component_types: [
              { kind: 'string' },
              { kind: 'string' },
              { kind: 'string' },
            ],
          }
        ),
      ],
    };

    const html = renderDocumentHtml(template);
    const firstIndex = html.indexOf('First block');
    const secondIndex = html.indexOf('Second block');
    const thirdIndex = html.indexOf('Third block');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  it('does not mutate the original template when applying placeholder data', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'title',
                kind: 'string',
              },
              content: [{ type: 'text', text: 'Hello {{title}}' }],
            },
          ],
        },
      ],
    };

    const original = JSON.parse(JSON.stringify(template));
    const rendered = applyTemplateDataPoint(template, { title: 'Ada' });

    expect(template).toEqual(original);
    expect(rendered).not.toEqual(template);
    expect(renderDocumentHtml(rendered)).toContain('Hello Ada');
  });
});

import { describe, expect, it } from 'vitest';
import { validateImageAttrs } from '@/lib/tiptap/image';
import { createImageComponent } from '@/lib/tiptap/image';
import { validateHyperlinkAttrs } from '@/lib/tiptap/hyperlink';
import { createHyperlinkComponent } from '@/lib/tiptap/hyperlink';
import { validateListAttrs } from '@/lib/tiptap/list';
import { createListComponent } from '@/lib/tiptap/list';
import { validateContainerAttrs } from '@/lib/tiptap/container';
import { createContainerComponent } from '@/lib/tiptap/container';
import { validateTableAttrs } from '@/lib/tiptap/table';
import { createTableComponent } from '@/lib/tiptap/table';
import { validateTemplatePlaceholderSchemas } from '@/lib/template-schema';

describe('TipTap component validators (destructive)', () => {
  it('rejects image with missing src', () => {
    const err = validateImageAttrs({ value: { alt: 'x' } });
    expect(err).toContain('src');
  });

  it('rejects image with invalid option shape', () => {
    const err = validateImageAttrs({
      value: { src: 'https://a.com/x.png', alt: 'x', option: 'bad' },
    });
    expect(err).toContain('option');
  });

  it('rejects hyperlink with relative url', () => {
    const err = validateHyperlinkAttrs({
      value: { alias: 'Docs', url: '/docs' },
    });
    expect(err).toContain('absolute URL');
  });

  it('rejects hyperlink with empty alias', () => {
    const err = validateHyperlinkAttrs({
      value: { alias: '', url: 'https://a.com' },
    });
    expect(err).toContain('alias');
  });

  it('rejects list with non-array items', () => {
    const err = validateListAttrs({ value: { items: 'bad' } });
    expect(err).toContain('items');
  });

  it('rejects container with non-array components', () => {
    const err = validateContainerAttrs({ value: { components: {} } });
    expect(err).toContain('components');
  });

  it('rejects container with non-array component_types', () => {
    const err = validateContainerAttrs({
      value: { components: [] },
      component_types: {},
    });
    expect(err).toContain('component_types');
  });

  it('rejects table without rows/columns payload', () => {
    const err = validateTableAttrs({
      value: { mode: 'unknown' },
      headers: ['H1'],
    });
    expect(err).toContain('either rows[] or columns{}');
  });

  it('rejects table with empty headers', () => {
    const err = validateTableAttrs({
      value: { rows: [] },
      headers: ['H1', ''],
    });
    expect(err).toContain('headers');
  });

  it('rejects row_data table with non-array rows', () => {
    const err = validateTableAttrs({
      value: { rows: {} },
      headers: ['H1'],
    });
    expect(err).toContain('either rows[] or columns{}');
  });

  it('rejects column_data table with non-object columns', () => {
    const err = validateTableAttrs({
      value: { columns: [] },
      headers: ['R1'],
    });
    expect(err).toContain('either rows[] or columns{}');
  });

  it('rejects column_data table with empty column names', () => {
    const err = validateTableAttrs({
      value: { columns: { '': { R1: 'x' } } },
      headers: ['R1'],
    });
    expect(err).toContain('empty column names');
  });

  it('template schema rejects invalid imageComponent attrs', () => {
    const result = validateTemplatePlaceholderSchemas({
      type: 'doc',
      content: [
        {
          type: 'imageComponent',
          attrs: { value: { src: '', alt: 'x' } },
        },
      ],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('imageComponent');
    }
  });

  it('template schema rejects invalid tableComponent attrs', () => {
    const result = validateTemplatePlaceholderSchemas({
      type: 'doc',
      content: [
        {
          type: 'tableComponent',
          attrs: {
            value: { mode: 'row_data', rows: [123] },
            headers: ['H1'],
          },
        },
      ],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('tableComponent');
    }
  });

  it('creates an image component node from schema-shaped data and attrs', () => {
    const node = createImageComponent(
      {
        src: 'https://example.com/logo.png',
        alt: 'Logo',
      },
      { width: '120', height: '80' }
    );

    expect(node.type).toBe('imageComponent');
    expect(node.attrs.value.src).toBe('https://example.com/logo.png');
    expect(node.attrs.value.alt).toBe('Logo');
    expect(node.attrs.width).toBe('120');
    expect(node.attrs.height).toBe('80');
  });

  it('creates a hyperlink component node from schema-shaped data and attrs', () => {
    const node = createHyperlinkComponent(
      {
        alias: 'Docs',
        url: 'https://example.com/docs',
      },
      { title: 'Documentation' }
    );

    expect(node.type).toBe('hyperlinkComponent');
    expect(node.attrs.value.alias).toBe('Docs');
    expect(node.attrs.value.url).toBe('https://example.com/docs');
    expect(node.attrs.title).toBe('Documentation');
  });

  it('creates a list component node from schema-shaped data', () => {
    const node = createListComponent({
      items: ['A', 'B'],
    });

    expect(node.type).toBe('listComponent');
    expect(node.attrs.value.items).toEqual(['A', 'B']);
  });

  it('creates a container component node from schema-shaped data', () => {
    const node = createContainerComponent(
      {
        components: ['First', 'Second'],
      },
      {
        component_types: [
          { kind: 'string' },
          { kind: 'string' },
        ],
      }
    );

    expect(node.type).toBe('containerComponent');
    expect(node.attrs.value.components).toEqual(['First', 'Second']);
    expect(node.attrs.component_types).toHaveLength(2);
  });

  it('creates a table component node from row data schema', () => {
    const node = createTableComponent({
      rows: [{ Item: 'Pen', Qty: 2 }],
      caption: 'Inventory',
    }, {
      headers: ['Item', 'Qty'],
    });

    expect(node.type).toBe('tableComponent');
    expect(node.attrs.headers).toEqual(['Item', 'Qty']);
  });
});

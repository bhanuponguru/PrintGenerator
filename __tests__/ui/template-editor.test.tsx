import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateEditor from '@/app/components/TemplateEditor';

function findPlaceholderByKey(node: unknown, key: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;

  const typed = node as Record<string, unknown>;
  if (typed.type === 'placeholder') {
    const attrs = (typed.attrs || {}) as Record<string, unknown>;
    if (attrs.key === key) {
      return typed;
    }
  }

  const content = typed.content;
  if (Array.isArray(content)) {
    for (const child of content) {
      const match = findPlaceholderByKey(child, key);
      if (match) return match;
    }
  }

  return null;
}

function getInsertRowSelect(label: string): HTMLSelectElement {
  const labelNode = screen.getByText(label);
  const row = labelNode.closest('.pg-insert-row');
  if (!row) {
    throw new Error(`Unable to locate insert row for label: ${label}`);
  }
  const select = row.querySelector('select');
  if (!select) {
    throw new Error(`Unable to locate select for label: ${label}`);
  }
  return select as HTMLSelectElement;
}

describe('TemplateEditor custom visual composer', () => {
  it('serializes reusable tokens into custom layout_template on insert', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'customer_card');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    await user.type(screen.getByPlaceholderText('token_id'), 'name');
    await user.type(screen.getByPlaceholderText('Display label'), 'Name');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    await user.type(screen.getByPlaceholderText('token_id'), 'url');
    await user.type(screen.getByPlaceholderText('Display label'), 'URL');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    await user.click(screen.getByRole('button', { name: 'Two-token pattern' }));
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'customer_card');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;

    expect(schema.kind).toBe('custom');
    expect(schema.base_variable).toBe('item');
    expect(schema.layout_template).toBe('Name: {{item.name}}\nURL: {{item.url}}');
    expect(Object.keys(schema.token_registry as Record<string, unknown>)).toEqual(['name', 'url']);
  });

  it('builds custom layout from reusable token buttons and text segments', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'custom_visual');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    await user.type(screen.getByPlaceholderText('token_id'), 'name');
    await user.type(screen.getByPlaceholderText('Display label'), 'Name');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    await user.type(screen.getByPlaceholderText('token_id'), 'url');
    await user.type(screen.getByPlaceholderText('Display label'), 'URL');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    await user.click(screen.getByRole('button', { name: '+ Text' }));
    const textInputs = screen.getAllByPlaceholderText('Text');
    await user.type(textInputs[textInputs.length - 1], 'END');

    await user.click(screen.getByRole('button', { name: '{{item.url}}' }));
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'custom_visual');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const layout = String(schema.layout_template || '');

    expect(schema.kind).toBe('custom');
    expect(layout).toContain('END');
    expect(layout).toContain('{{item.url}}');
  });

  it('builds repeat layout_template from visual field chips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'line_items');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'repeat');

    await user.clear(screen.getByPlaceholderText('item'));
    await user.type(screen.getByPlaceholderText('item'), 'row');

    await user.type(screen.getByPlaceholderText('field_name'), 'description');
    await user.click(screen.getByRole('button', { name: '+ Field' }));
    await user.type(screen.getByPlaceholderText('field_name'), 'qty');
    await user.click(screen.getByRole('button', { name: '+ Field' }));

    await user.click(screen.getByRole('button', { name: '{{row.description}}' }));
    await user.click(screen.getByRole('button', { name: '{{row.qty}}' }));

    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'line_items');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;

    expect(schema.kind).toBe('repeat');
    expect(schema.base_variable).toBe('row');
    expect(schema.layout_template).toContain('{{row.description}}');
    expect(schema.layout_template).toContain('{{row.qty}}');
  });

  it('builds table schema headers from visual header chips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'invoice_table');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'table');

    await user.type(screen.getByPlaceholderText('header_name'), 'item');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    await user.type(screen.getByPlaceholderText('header_name'), 'qty');
    await user.click(screen.getByRole('button', { name: '+ Header' }));

    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'invoice_table');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const headers = schema.headers as string[];

    expect(schema.kind).toBe('table');
    expect(headers).toContain('item');
    expect(headers).toContain('qty');
  });
});

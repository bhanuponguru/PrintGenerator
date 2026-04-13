import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

function getItemCard(itemId: string): HTMLElement {
  const node = screen.getByText(itemId);
  const card = node.closest('.pg-custom-item-card');
  if (!card) {
    throw new Error(`Unable to locate item card for item: ${itemId}`);
  }
  return card as HTMLElement;
}

function getItemSelectButton(itemId: string): HTMLButtonElement {
  const card = getItemCard(itemId);
  const button = card.querySelector('.pg-custom-item-select');
  if (!button) {
    throw new Error(`Unable to locate select button for item: ${itemId}`);
  }
  return button as HTMLButtonElement;
}

function getButtonComposerSelect(buttonName: string): HTMLSelectElement {
  const button = screen.getByRole('button', { name: buttonName });
  const composer = button.closest('.pg-layout-composer-actions');
  if (!composer) {
    throw new Error(`Unable to locate composer for button: ${buttonName}`);
  }
  const select = composer.querySelector('select');
  if (!select) {
    throw new Error(`Unable to locate select for button: ${buttonName}`);
  }
  return select as HTMLSelectElement;
}

describe('TemplateEditor custom visual composer', () => {
  it('serializes token set libraries into custom placeholder schemas on insert', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'customer_card');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    await user.type(screen.getByPlaceholderText('token_set_id'), 'hero');
    await user.type(screen.getByPlaceholderText('Token set label'), 'Hero');
    await user.click(screen.getByRole('button', { name: '+ Token Set' }));

    await user.type(screen.getByPlaceholderText('token_set_id'), 'details');
    await user.type(screen.getByPlaceholderText('Token set label'), 'Details');
    await user.click(screen.getByRole('button', { name: '+ Token Set' }));

    await user.click(getItemSelectButton('hero'));
    const heroTemplate = screen.getByLabelText('Token set template') as HTMLTextAreaElement;
    await user.clear(heroTemplate);
    await user.type(heroTemplate, 'Hero: {{hero.value}}');

    await user.click(getItemSelectButton('details'));
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLTextAreaElement;
    await user.clear(customTemplate);
    const placeholderTokenSets = within(screen.getByRole('group', { name: 'Custom placeholder token sets' }));
    await user.click(placeholderTokenSets.getByRole('button', { name: '{{hero}}' }));
    await user.type(customTemplate, '\n');
    await user.click(placeholderTokenSets.getByRole('button', { name: '{{details}}' }));
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'customer_card');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const items = Array.isArray(schema.items) ? (schema.items as Array<Record<string, unknown>>) : [];

    expect(schema.kind).toBe('custom');
    expect(items.map((item) => item.id)).toEqual(['hero', 'details']);
    expect(Object.keys((items[0].token_registry || {}) as Record<string, unknown>)).toEqual(['value']);
    expect(String(items[0].layout_template || '')).toContain('Hero:');
    expect(String(items[0].layout_template || '')).toContain('hero.value');
    expect(items[1].kind).toBe('custom');
    expect(Object.keys((items[1].token_registry || {}) as Record<string, unknown>).length).toBeGreaterThan(0);
    expect(String(schema.layout_template || '')).toContain('{{hero}}');
    expect(String(schema.layout_template || '')).toContain('{{details}}');
  });

  it('builds custom item layouts from reusable token buttons and text segments', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'custom_visual');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    await user.type(screen.getByPlaceholderText('token_set_id'), 'card');
    await user.type(screen.getByPlaceholderText('Token set label'), 'Card');
    await user.click(screen.getByRole('button', { name: '+ Token Set' }));

    await user.click(getItemSelectButton('card'));

    const templateArea = screen.getByLabelText('Token set template') as HTMLTextAreaElement;
    await user.clear(templateArea);
    await user.type(templateArea, 'Card: ');

    await user.click(screen.getAllByRole('button', { name: '{{card.value}}' })[0] as HTMLButtonElement);
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLTextAreaElement;
    await user.clear(customTemplate);
    await user.type(customTemplate, '{{card}}');
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'custom_visual');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const item = Array.isArray(schema.items) ? (schema.items as Array<Record<string, unknown>>)[0] : undefined;

    expect(schema.kind).toBe('custom');
    expect(item?.id).toBe('card');
    expect(String(item?.layout_template || '')).toContain('{{card.value}}');
  });

  it('edits custom item templates directly in the inspector', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'custom_template');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    await user.type(screen.getByPlaceholderText('token_set_id'), 'badge');
    await user.type(screen.getByPlaceholderText('Token set label'), 'Badge');
    await user.click(screen.getByRole('button', { name: '+ Token Set' }));

    await user.click(getItemSelectButton('badge'));
    const templateArea = screen.getByLabelText('Token set template') as HTMLTextAreaElement;
    await user.clear(templateArea);
    await user.type(templateArea, 'Badge: ');
    const templateTokens = within(screen.getByRole('group', { name: 'badge template tokens' }));
    await user.click(templateTokens.getByRole('button', { name: '{{badge.value}}' }));
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLTextAreaElement;
    await user.clear(customTemplate);
    await user.type(customTemplate, '{{badge}}');
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'custom_template');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const item = Array.isArray(schema.items) ? (schema.items as Array<Record<string, unknown>>)[0] : undefined;

    expect(schema.kind).toBe('custom');
    expect(item?.id).toBe('badge');
    expect(String(item?.layout_template || '')).toContain('Badge:');
    expect(String(item?.layout_template || '')).toContain('{{badge.value}}');
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

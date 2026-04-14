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

    // Get the token creation section
    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    
    // Create first token within the form context
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    
    if (tokenIdInputs.length > 0) await user.type(tokenIdInputs[0], 'hero');
    if (tokenLabelInputs.length > 0) await user.type(tokenLabelInputs[0], 'Hero');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    // Create second token (now inputs are cleared, so refetch)
    const tokenIdInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    
    if (tokenIdInputs2.length > 0) await user.type(tokenIdInputs2[0], 'details');
    if (tokenLabelInputs2.length > 0) await user.type(tokenLabelInputs2[0], 'Details');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    // Set custom placeholder template
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getAllByRole('button')[0]); // Click first token reference button
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getAllByRole('button')[1]); // Click second token reference button
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'customer_card');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const tokenLibrary = Array.isArray(schema.token_library) ? (schema.token_library as Array<Record<string, unknown>>) : [];

    expect(schema.kind).toBe('custom');
    expect(tokenLibrary.map((token) => token.id)).toEqual(['hero', 'details']);
    expect(String(schema.layout_template || '')).toContain('{{token.hero}}');
    expect(String(schema.layout_template || '')).toContain('{{token.details}}');
  });

  it('builds custom item layouts from reusable token buttons and text segments', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'custom_visual');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    // Create a token
    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    
    if (tokenIdInputs.length > 0) await user.type(tokenIdInputs[0], 'card');
    if (tokenLabelInputs.length > 0) await user.type(tokenLabelInputs[0], 'Card');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    // Set custom placeholder template
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getByRole('button', { name: '{{token.card}}' }));
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'custom_visual');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const tokenLibrary = Array.isArray(schema.token_library) ? (schema.token_library as Array<Record<string, unknown>>) : [];

    expect(schema.kind).toBe('custom');
    expect(tokenLibrary[0]?.id).toBe('card');
    expect(String(schema.layout_template || '')).toContain('{{token.card}}');
  });

  it('edits custom item templates directly in the inspector', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'custom_template');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    // Create a token
    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    
    if (tokenIdInputs.length > 0) await user.type(tokenIdInputs[0], 'badge');
    if (tokenLabelInputs.length > 0) await user.type(tokenLabelInputs[0], 'Badge');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    // Set custom placeholder template
    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getByRole('button', { name: '{{token.badge}}' }));
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const node = findPlaceholderByKey(latestDoc, 'custom_template');
    expect(node).toBeTruthy();

    const attrs = (node?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    const tokenLibrary = Array.isArray(schema.token_library) ? (schema.token_library as Array<Record<string, unknown>>) : [];

    expect(schema.kind).toBe('custom');
    expect(tokenLibrary[0]?.id).toBe('badge');
    expect(tokenLibrary[0]?.label).toBe('Badge');
    expect(tokenLibrary[0]?.kind).toBe('string');
    expect(String(schema.layout_template || '')).toContain('{{token.badge}}');
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
    await user.type(screen.getByPlaceholderText('Quarterly summary'), 'Quarterly summary');

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
    expect(schema.caption).toBe('Quarterly summary');
  });

  it('shows a readable summary for table tokens in the token library', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'summary_table');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');

    await user.type(tokenIdInputs[0], 'scores');
    await user.type(tokenLabelInputs[0], 'Scores');
    await user.selectOptions(within(tokenCreationForm).getAllByRole('combobox')[0], 'table');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Table · row_data · Column_1, Column_2 · caption: none'))).length).toBeGreaterThan(0);

    const selectedToken = screen.getByDisplayValue('Scores').closest('.pg-custom-detail') as HTMLElement;
    const tokenScope = within(selectedToken);
    await user.type(tokenScope.getByPlaceholderText('Quarterly summary'), 'Quarterly summary');
    expect(tokenScope.getByDisplayValue('Quarterly summary')).toBeTruthy();
    await user.type(tokenScope.getByPlaceholderText('header_name'), 'Column_3');
    await user.click(tokenScope.getByRole('button', { name: '+ Header' }));

    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Table · row_data · Column_1, Column_2, Column_3 · caption: Quarterly summary'))).length).toBeGreaterThan(0);
  });
});

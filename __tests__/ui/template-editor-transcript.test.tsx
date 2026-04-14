import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateEditor from '@/app/components/TemplateEditor';
import { findPlaceholderByKey, getInsertRowSelect } from '@/__tests__/ui/ui-test-utils';

describe('TemplateEditor transcript workflow', () => {
  it('builds a repeating semester placeholder with a semester table', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'semesters');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');

    await user.type(tokenIdInputs[0], 'semester_number');
    await user.type(tokenLabelInputs[0], 'Semester Number');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const tokenIdInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    await user.selectOptions(within(tokenCreationForm).getAllByRole('combobox')[0], 'table');
    await user.type(tokenIdInputs2[0], 'grades');
    await user.type(tokenLabelInputs2[0], 'Grades');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const repeatToggle = screen.getAllByRole('combobox').find((select) =>
      Array.from((select as HTMLSelectElement).options).some((option) => option.textContent === 'repeat over items')
    ) as HTMLSelectElement;
    await user.selectOptions(repeatToggle, 'true');

    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');

    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getByRole('button', { name: '{{token.semester_number}}' }));
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getByRole('button', { name: '{{token.grades}}' }));

    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const semestersNode = findPlaceholderByKey(latestDoc, 'semesters');

    expect(semestersNode).toBeTruthy();
    const schema = (semestersNode?.attrs as Record<string, unknown>).schema as Record<string, unknown>;
    expect(schema.kind).toBe('custom');
    expect(schema.repeat).toBe(true);
    expect(schema.base_variable).toBe('token');
    expect(String(schema.layout_template || '')).toContain('{{token.semester_number}}');
    expect(String(schema.layout_template || '')).toContain('{{token.grades}}');
  });
});
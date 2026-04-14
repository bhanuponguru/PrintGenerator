import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateEditor from '@/app/components/TemplateEditor';
import { findPlaceholderByKey, getInsertRowSelect } from '@/__tests__/ui/ui-test-utils';

describe('TemplateEditor no-due workflow', () => {
  it('builds the no-due starter structure with header/footer and student details placeholder', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert header component'));
    await user.click(screen.getByTitle('Insert footer component'));

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'student_details');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'custom');

    const tokenCreationForm = screen.getByRole('group', { name: 'Token library' });
    const tokenIdInputs = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs = within(tokenCreationForm).queryAllByPlaceholderText('Token label');

    await user.type(tokenIdInputs[0], 'name');
    await user.type(tokenLabelInputs[0], 'Name');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const tokenIdInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs2 = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    await user.type(tokenIdInputs2[0], 'roll_no');
    await user.type(tokenLabelInputs2[0], 'Roll No');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const tokenIdInputs3 = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs3 = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    await user.type(tokenIdInputs3[0], 'department');
    await user.type(tokenLabelInputs3[0], 'Department');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');

    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getByRole('button', { name: '{{token.name}}' }));
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getByRole('button', { name: '{{token.roll_no}}' }));
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getByRole('button', { name: '{{token.department}}' }));

    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const studentNode = findPlaceholderByKey(latestDoc, 'student_details');
    expect(studentNode).toBeTruthy();

    const headerComponent = (latestDoc.content as Array<Record<string, unknown>>).find((node) => node.type === 'headerComponent');
    const footerComponent = (latestDoc.content as Array<Record<string, unknown>>).find((node) => node.type === 'footerComponent');

    expect(headerComponent).toBeTruthy();
    expect(footerComponent).toBeTruthy();

    const schema = (studentNode?.attrs as Record<string, unknown>).schema as Record<string, unknown>;
    expect(schema.kind).toBe('custom');
    expect(String(schema.layout_template || '')).toContain('{{token.name}}');
    expect(String(schema.layout_template || '')).toContain('{{token.roll_no}}');
    expect(String(schema.layout_template || '')).toContain('{{token.department}}');
  });
});
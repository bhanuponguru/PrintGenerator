import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateEditor from '@/app/components/TemplateEditor';
import { findPlaceholderByKey, getInsertRowSelect } from '@/__tests__/ui/ui-test-utils';

describe('TemplateEditor grade-card workflow', () => {
  it('builds a grade card with student details and a grades table', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<TemplateEditor onChange={onChange} />);

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
    await user.type(tokenIdInputs2[0], 'student_id');
    await user.type(tokenLabelInputs2[0], 'Student ID');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const tokenIdInputs3 = within(tokenCreationForm).queryAllByPlaceholderText('token_id');
    const tokenLabelInputs3 = within(tokenCreationForm).queryAllByPlaceholderText('Token label');
    await user.type(tokenIdInputs3[0], 'program');
    await user.type(tokenLabelInputs3[0], 'Program');
    await user.click(screen.getByRole('button', { name: '+ Token' }));

    const customTemplate = screen.getByLabelText('Custom placeholder template') as HTMLElement;
    await user.click(customTemplate);
    await user.keyboard('{Control>}a{/Control}{Backspace}');

    const tokenRefs = within(screen.getByRole('group', { name: 'Token references' }));
    await user.click(tokenRefs.getByRole('button', { name: '{{token.name}}' }));
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getByRole('button', { name: '{{token.student_id}}' }));
    await user.type(customTemplate, '\n');
    await user.click(tokenRefs.getByRole('button', { name: '{{token.program}}' }));

    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'grades');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'table');
    await user.type(screen.getByPlaceholderText('header_name'), 'course');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    await user.type(screen.getByPlaceholderText('header_name'), 'course_id');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    await user.type(screen.getByPlaceholderText('header_name'), 'grade');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    await user.type(screen.getByPlaceholderText('Quarterly summary'), 'Semester 1 Courses');
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const latestDoc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const studentNode = findPlaceholderByKey(latestDoc, 'student_details');
    const gradesNode = findPlaceholderByKey(latestDoc, 'grades');

    expect(studentNode).toBeTruthy();
    expect(gradesNode).toBeTruthy();

    const gradesSchema = (gradesNode?.attrs as Record<string, unknown>).schema as Record<string, unknown>;
    expect(gradesSchema.kind).toBe('table');
    expect(gradesSchema.caption).toBe('Semester 1 Courses');
    expect(gradesSchema.headers).toEqual(expect.arrayContaining(['course', 'course_id', 'grade']));
  });
});
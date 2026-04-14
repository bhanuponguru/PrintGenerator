import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';
import { buildGradeCardFlowTemplate } from '@/__tests__/ui/ui-flow-fixtures';

describe('GenerateModal grade-card workflow', () => {
  it('renders student details and grades table inputs with a static caption', async () => {
    const user = userEvent.setup();

    render(
      <GenerateModal
        template={buildGradeCardFlowTemplate() as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const firstDataPoint = screen.getByText('Data Point 1').closest('.pg-layout-composer') as HTMLElement;
    const studentDetailsRow = within(firstDataPoint).getByText('student_details').closest('.pg-insert-row') as HTMLElement;
    const studentScope = within(studentDetailsRow);

    await user.clear(studentScope.getByPlaceholderText('name'));
    await user.type(studentScope.getByPlaceholderText('name'), 'Ada Lovelace');
    await user.clear(studentScope.getByPlaceholderText('student_id'));
    await user.type(studentScope.getByPlaceholderText('student_id'), 'S-001');
    await user.clear(studentScope.getByPlaceholderText('program'));
    await user.type(studentScope.getByPlaceholderText('program'), 'BSc CS');

    const gradesRow = screen.getAllByText('grades')[0].closest('.pg-insert-row') as HTMLElement;
    const gradesScope = within(gradesRow);
    expect(gradesScope.getByText('Semester 1 Courses')).toBeTruthy();

    const gradeInputs = gradesScope
      .getAllByRole('textbox')
      .filter((input) => (input as HTMLInputElement).tagName === 'INPUT') as HTMLInputElement[];
    await user.clear(gradeInputs[0]);
    await user.type(gradeInputs[0], 'Algorithms');
    await user.clear(gradeInputs[1]);
    await user.type(gradeInputs[1], 'CS401');
    await user.clear(gradeInputs[2]);
    await user.type(gradeInputs[2], 'A');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonPreview = screen.getByLabelText('JSON Preview');

    expect(jsonPreview.textContent).toContain('Ada Lovelace');
    expect(jsonPreview.textContent).toContain('Algorithms');
    expect(jsonPreview.textContent).toContain('CS401');
    expect(jsonPreview.textContent).toContain('A');
    expect(jsonPreview.textContent).not.toContain('Semester 1 Courses');
  });
});
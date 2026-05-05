import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';
import { buildGradeCardFlowTemplate } from '@/__tests__/ui/ui-flow-fixtures';

/**
 * Helper: find the <td> cell in the data-entry table that corresponds to a given
 * placeholder key by matching the column header text.
 */
function findPlaceholderCell(key: string): HTMLElement {
  const table = document.querySelector('.pg-data-entry-table') as HTMLTableElement;
  const headers = Array.from(table.querySelectorAll('thead th'));
  const colIndex = headers.findIndex((th) => th.textContent === key);
  const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement;
  return firstRow.cells[colIndex] as HTMLElement;
}

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

    // In the tabular layout, find the student_details cell
    const studentDetailsCell = findPlaceholderCell('student_details');
    const studentScope = within(studentDetailsCell);

    await user.clear(studentScope.getByPlaceholderText('name'));
    await user.type(studentScope.getByPlaceholderText('name'), 'Ada Lovelace');
    await user.clear(studentScope.getByPlaceholderText('student_id'));
    await user.type(studentScope.getByPlaceholderText('student_id'), 'S-001');
    await user.clear(studentScope.getByPlaceholderText('program'));
    await user.type(studentScope.getByPlaceholderText('program'), 'BSc CS');

    // Find the grades cell
    const gradesCell = findPlaceholderCell('grades');
    const gradesScope = within(gradesCell);
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

    await user.click(screen.getByRole('button', { name: 'CSV Preview' }));
    const csvPreview = screen.getByLabelText('CSV Preview');

    expect(csvPreview.textContent).toContain('Ada Lovelace');
    expect(csvPreview.textContent).toContain('Algorithms');
    expect(csvPreview.textContent).toContain('CS401');
    expect(csvPreview.textContent).toContain('A');
    expect(csvPreview.textContent).not.toContain('Semester 1 Courses');
  });
});
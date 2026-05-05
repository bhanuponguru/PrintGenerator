import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';
import { buildNoDueFlowTemplate } from '@/__tests__/ui/ui-flow-fixtures';

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

describe('GenerateModal no-due workflow', () => {
  it('renders student details token fields for the no-due form', async () => {
    const user = userEvent.setup();

    render(
      <GenerateModal
        template={buildNoDueFlowTemplate() as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    // In the tabular layout, find the student_details cell
    const detailsCell = findPlaceholderCell('student_details');
    const detailsScope = within(detailsCell);

    await user.clear(detailsScope.getByPlaceholderText('name'));
    await user.type(detailsScope.getByPlaceholderText('name'), 'Ada Lovelace');
    await user.clear(detailsScope.getByPlaceholderText('roll_no'));
    await user.type(detailsScope.getByPlaceholderText('roll_no'), '2026-01');
    await user.clear(detailsScope.getByPlaceholderText('department'));
    await user.type(detailsScope.getByPlaceholderText('department'), 'CSE');

    await user.click(screen.getByRole('button', { name: 'CSV Preview' }));

    const csvPreview = screen.getByLabelText('CSV Preview');
    expect(csvPreview.textContent).toContain('Ada Lovelace');
    expect(csvPreview.textContent).toContain('2026-01');
    expect(csvPreview.textContent).toContain('CSE');
  });
});
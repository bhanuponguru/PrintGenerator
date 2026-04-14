import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';
import { buildNoDueFlowTemplate } from '@/__tests__/ui/ui-flow-fixtures';

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

    const detailsRow = screen.getAllByText('student_details')[0].closest('.pg-insert-row') as HTMLElement;
    const detailsScope = within(detailsRow);

    await user.clear(detailsScope.getByPlaceholderText('name'));
    await user.type(detailsScope.getByPlaceholderText('name'), 'Ada Lovelace');
    await user.clear(detailsScope.getByPlaceholderText('roll_no'));
    await user.type(detailsScope.getByPlaceholderText('roll_no'), '2026-01');
    await user.clear(detailsScope.getByPlaceholderText('department'));
    await user.type(detailsScope.getByPlaceholderText('department'), 'CSE');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));

    const jsonPreview = screen.getByLabelText('JSON Preview');
    expect(jsonPreview.textContent).toContain('Ada Lovelace');
    expect(jsonPreview.textContent).toContain('2026-01');
    expect(jsonPreview.textContent).toContain('CSE');
  });
});
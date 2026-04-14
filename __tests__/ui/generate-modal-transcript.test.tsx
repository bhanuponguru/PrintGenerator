import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';
import { buildTranscriptFlowTemplate } from '@/__tests__/ui/ui-flow-fixtures';

describe('GenerateModal transcript workflow', () => {
  it('renders repeating semester blocks with nested grade tables', async () => {
    const user = userEvent.setup();

    render(
      <GenerateModal
        template={buildTranscriptFlowTemplate() as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const semestersRow = screen.getAllByText('semesters')[0].closest('.pg-insert-row') as HTMLElement;
    const semestersScope = within(semestersRow);

    await user.click(semestersScope.getByRole('button', { name: '+ Item' }));

    const semesterInputs = semestersScope.getAllByPlaceholderText('semester_number') as HTMLInputElement[];
    await user.clear(semesterInputs[0]);
    await user.type(semesterInputs[0], '1');
    await user.clear(semesterInputs[1]);
    await user.type(semesterInputs[1], '2');

    const gradeTableInputs = semestersScope.getAllByRole('textbox').filter((input) => (input as HTMLInputElement).placeholder !== 'semester_number') as HTMLInputElement[];
    expect(gradeTableInputs.length).toBeGreaterThan(0);
    await user.clear(gradeTableInputs[0]);
    await user.type(gradeTableInputs[0], 'Programming 1');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonPreview = screen.getByLabelText('JSON Preview');

    expect(jsonPreview.textContent).toContain('1');
    expect(jsonPreview.textContent).toContain('2');
    expect(jsonPreview.textContent).toContain('Programming 1');
  });
});
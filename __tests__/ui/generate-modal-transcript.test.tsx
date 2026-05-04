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

    // The transcript template has a single dynamic placeholder (semesters) with repeat: true.
    // In the tabular layout, this uses merged sub-rows. Each item has tokens: semester_number, grades.
    // There are 2 initial data points. Add a new row (repeat item) for the first data point.
    await user.click(screen.getAllByRole('button', { name: '+ Row' })[0]);

    // There should now be 2 sub-rows. Each row has a semester_number input.
    const semesterInputs = screen.getAllByPlaceholderText('semester_number') as HTMLInputElement[];
    expect(semesterInputs.length).toBeGreaterThanOrEqual(2);
    await user.clear(semesterInputs[0]);
    await user.type(semesterInputs[0], '1');
    await user.clear(semesterInputs[1]);
    await user.type(semesterInputs[1], '2');

    // The grades token is a table rendered via renderSchemaEditor. Find textbox inputs
    // in grade columns that aren't semester_number inputs.
    const allTextboxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    const gradeTableInputs = allTextboxes.filter(
      (input) => input.placeholder !== 'semester_number' && input.placeholder !== 'Item 1' && input.placeholder !== 'Item 2'
    );
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
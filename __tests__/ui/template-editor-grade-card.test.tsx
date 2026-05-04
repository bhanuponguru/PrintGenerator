import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateEditor from '@/app/components/TemplateEditor';
import { findPlaceholderByKey, getInsertRowSelect } from '@/__tests__/ui/ui-test-utils';

import { describe, expect, it, vi } from 'vitest';
describe('TemplateEditor grade-card workflow', () => {
  it('creates a grades table placeholder with course, code, and grade headers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    
    render(<TemplateEditor onChange={onChange} />);

    await user.click(screen.getByTitle('Insert typed placeholder'));
    await user.type(screen.getByPlaceholderText('recipient_name'), 'grades');
    await user.selectOptions(getInsertRowSelect('Schema kind'), 'table');

    // Type headers directly without explicit wait - matching template-editor.test pattern
    await user.type(screen.getByPlaceholderText('header_name'), 'course');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    
    await user.type(screen.getByPlaceholderText('header_name'), 'code');
    await user.click(screen.getByRole('button', { name: '+ Header' }));
    
    await user.type(screen.getByPlaceholderText('header_name'), 'grade');
    await user.click(screen.getByRole('button', { name: '+ Header' }));

    await user.type(screen.getByPlaceholderText('Quarterly summary'), 'Semester 1 Grades');
    await user.click(screen.getByRole('button', { name: 'Insert Placeholder' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 });

    const doc = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const gradesNode = findPlaceholderByKey(doc, 'grades');
    
    expect(gradesNode).toBeTruthy();
    const attrs = (gradesNode?.attrs || {}) as Record<string, unknown>;
    const schema = attrs.schema as Record<string, unknown>;
    
    expect(schema.kind).toBe('table');
    expect(schema.caption).toBe('Semester 1 Grades');
    const headers = schema.headers as string[];
    expect(headers).toContain('course');
    expect(headers).toContain('code');
    expect(headers).toContain('grade');
  });
});

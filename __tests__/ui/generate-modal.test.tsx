import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerateModal from '@/app/components/GenerateModal';

function buildTemplate() {
  return {
    _id: 'template-1',
    name: 'Token Template',
    version: '1.0.0',
    created_on: '2026-01-01T00:00:00.000Z',
    updated_on: '2026-01-01T00:00:00.000Z',
    template: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'profile',
                kind: 'custom',
                schema: {
                  kind: 'custom',
                  base_variable: 'item',
                  value_type: { kind: 'string' },
                  layout_template: 'Name: {{item.name}}\nURL: {{item.url}}',
                  token_registry: {
                    name: { kind: 'string' },
                    url: { kind: 'string' },
                  },
                  token_labels: {
                    name: 'Full Name',
                    url: 'Website',
                  },
                },
              },
            },
          ],
        },
      ],
    },
  };
}

describe('GenerateModal premium visual/json workflow', () => {
  it('shows type guidance for standard placeholder values', () => {
    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'full_name',
                  schema: { kind: 'string' },
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'age',
                  schema: { kind: 'integer' },
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'profile_link',
                  schema: { kind: 'hyperlink' },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Enter plain text.'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Enter a numeric value.'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Provide alias and URL.'))).length).toBeGreaterThan(0);
  });

  it('renders custom token_library placeholders as token fields instead of a plain textbox', () => {
    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'student_details',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: 'Name: {{token.name}} Age: {{token.age}}',
                    repeat: false,
                    token_library: [
                      { id: 'name', label: 'Name', kind: 'string' },
                      { id: 'age', label: 'Age', kind: 'integer' },
                      { id: 'photo', label: 'Photo', kind: 'image' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText('student_details')).toBeNull();
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Age').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Photo').length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Image · src, alt'))).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Enter plain text.'))).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Enter a numeric value.'))).length
    ).toBeGreaterThan(0);
  });

  it('shows a readable summary for table token-library items', () => {
    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'grades',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: '{{token.rows}}',
                    token_library: [
                      {
                        id: 'rows',
                        label: 'Rows',
                        kind: 'table',
                        mode: 'row_data',
                        headers: ['course', 'grade'],
                        caption: 'Semester 1 Courses',
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('Table · row_data · course, grade · caption: Semester 1 Courses'))).length).toBeGreaterThan(0);
  });

  it('syncs visual token fields into JSON workspace', async () => {
    const user = userEvent.setup();

    render(
      <GenerateModal
        template={buildTemplate() as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const fullNameInput = screen.getAllByPlaceholderText('name')[0];
    const websiteInput = screen.getAllByPlaceholderText('url')[0];

    await user.clear(fullNameInput);
    await user.type(fullNameInput, 'Ada Lovelace');
    await user.clear(websiteInput);
    await user.type(websiteInput, 'https://example.com');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));

    const jsonPreview = screen.getByLabelText('JSON Preview');
    expect(jsonPreview.textContent).toContain('Ada Lovelace');
    expect(jsonPreview.textContent).toContain('https://example.com');
  });

  it('syncs uploaded JSON back to visual token fields', async () => {
    const user = userEvent.setup();

    render(
      <GenerateModal
        template={buildTemplate() as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const payload = [
      {
        profile: {
          data: {
            name: 'Grace Hopper',
            url: 'https://hopper.dev',
          },
        },
      },
    ];

    const file = new File([JSON.stringify(payload)], 'data.json', { type: 'application/json' });
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect((screen.getAllByPlaceholderText('name')[0] as HTMLInputElement).value).toBe('Grace Hopper');
      expect((screen.getAllByPlaceholderText('url')[0] as HTMLInputElement).value).toBe('https://hopper.dev');
    });
  });

  it('edits list and table placeholders visually without JSON fallback', async () => {
    const user = userEvent.setup();

    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'skills',
                  schema: {
                    kind: 'list',
                    item_type: { kind: 'string' },
                    style: 'bulleted',
                  },
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'marks',
                  schema: {
                    kind: 'table',
                    mode: 'row_data',
                    headers: ['Subject', 'Score'],
                    caption: 'Semester 1',
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const skillsRow = screen.getAllByText('skills')[0].closest('.pg-insert-row');
    expect(skillsRow).toBeTruthy();
    const skillsScope = within(skillsRow as HTMLElement);
    await user.click(skillsScope.getByRole('button', { name: '+ Add Item' }));

    const skillInputs = skillsScope.getAllByRole('textbox');
    await user.clear(skillInputs[0]);
    await user.type(skillInputs[0], 'Mathematics');

    const marksRow = screen.getAllByText('marks')[0].closest('.pg-insert-row');
    expect(marksRow).toBeTruthy();
    const marksScope = within(marksRow as HTMLElement);
    const rowOneCells = marksScope.getAllByDisplayValue('Value 1');
    await user.clear(rowOneCells[0] as HTMLInputElement);
    await user.type(rowOneCells[0] as HTMLInputElement, 'Physics');
    await user.clear(rowOneCells[1] as HTMLInputElement);
    await user.type(rowOneCells[1] as HTMLInputElement, '95');

    expect(marksScope.getByText('Semester 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonPreview = screen.getByLabelText('JSON Preview');
    expect(jsonPreview.textContent).toContain('Physics');
    expect(jsonPreview.textContent).toContain('95');
    expect(jsonPreview.textContent).not.toContain('Semester 1');
  });

  it('edits repeat placeholders visually and syncs JSON', async () => {
    const user = userEvent.setup();

    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'line_items',
                  schema: {
                    kind: 'repeat',
                    item_type: { kind: 'string' },
                    min_items: 1,
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const repeatRow = screen.getAllByText('line_items')[0].closest('.pg-insert-row');
    expect(repeatRow).toBeTruthy();
    const repeatScope = within(repeatRow as HTMLElement);

    const initialInput = repeatScope.getByPlaceholderText('line_items item 1') as HTMLInputElement;
    await user.clear(initialInput);
    await user.type(initialInput, 'Pen');

    await user.click(repeatScope.getByRole('button', { name: '+ Add Item' }));
    const secondInput = repeatScope.getByPlaceholderText('line_items item 2') as HTMLInputElement;
    await user.type(secondInput, 'Paper');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonArea = screen.getByLabelText('JSON Preview');

    expect(jsonArea.textContent).toContain('line_items');
    expect(jsonArea.textContent).toContain('Pen');
    expect(jsonArea.textContent).toContain('Paper');
  });

  it('respects dynamic/static hyperlink token attributes in custom placeholders', async () => {
    const user = userEvent.setup();

    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'profile_link',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: '{{token.link}}',
                    token_library: [
                      {
                        id: 'link',
                        label: 'Profile Link',
                        kind: 'hyperlink',
                        dynamic_fields: ['url'],
                        static_values: { alias: 'Profile' },
                      },
                          {
                            id: 'table_rows',
                            label: 'Table Rows',
                            kind: 'table',
                            mode: 'row_data',
                            headers: ['Item', 'Qty'],
                            caption: 'Inventory',
                          },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const profileRow = screen.getAllByText('profile_link')[0].closest('.pg-insert-row') as HTMLElement;
    const profileScope = within(profileRow);
    expect(profileScope.getByDisplayValue('Profile')).toBeTruthy();
    const urlInput = profileScope.getByPlaceholderText('URL') as HTMLInputElement;
    await user.clear(urlInput);
    await user.type(urlInput, 'https://example.com/me');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonPreview = screen.getByLabelText('JSON Preview');
    expect(jsonPreview.textContent).toContain('Profile');
    expect(jsonPreview.textContent).toContain('https://example.com/me');
  });

  it('respects dynamic/static table token columns in custom placeholders', async () => {
    const user = userEvent.setup();

    const template = {
      ...buildTemplate(),
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'line_table',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: '{{token.rows}}',
                    token_library: [
                      {
                        id: 'rows',
                        label: 'Rows',
                        kind: 'table',
                        mode: 'row_data',
                        headers: ['Item', 'Qty'],
                        dynamic_fields: ['Qty'],
                        static_values: { Item: 'Pen' },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };

    render(
      <GenerateModal
        template={template as any}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    const tableRow = screen.getAllByText('line_table')[0].closest('.pg-insert-row') as HTMLElement;
    const tableScope = within(tableRow);
    const qtyInput = tableScope.getAllByRole('textbox').find((input) => !(input as HTMLInputElement).readOnly) as HTMLInputElement;
    expect(qtyInput).toBeTruthy();
    await user.clear(qtyInput);
    await user.type(qtyInput, '5');

    await user.click(screen.getByRole('button', { name: 'JSON Preview' }));
    const jsonPreview = screen.getByLabelText('JSON Preview');
    expect(jsonPreview.textContent).toContain('Pen');
    expect(jsonPreview.textContent).toContain('5');
  });
});

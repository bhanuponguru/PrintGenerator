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

    await user.click(screen.getByRole('button', { name: 'JSON Workspace' }));

    const jsonArea = screen.getByLabelText('JSON Workspace') as HTMLTextAreaElement;
    expect(jsonArea.value).toContain('Ada Lovelace');
    expect(jsonArea.value).toContain('https://example.com');
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

    await user.click(screen.getByRole('button', { name: 'JSON Workspace' }));
    const jsonArea = screen.getByLabelText('JSON Workspace') as HTMLTextAreaElement;
    expect(jsonArea.value).toContain('Mathematics');
    expect(jsonArea.value).toContain('Physics');
    expect(jsonArea.value).toContain('95');
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

    await user.click(screen.getByRole('button', { name: 'JSON Workspace' }));
    const jsonArea = screen.getByLabelText('JSON Workspace') as HTMLTextAreaElement;

    expect(jsonArea.value).toContain('line_items');
    expect(jsonArea.value).toContain('Pen');
    expect(jsonArea.value).toContain('Paper');
  });
});

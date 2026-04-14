import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateCard from '@/app/components/TemplateCard';
import { createPageComponent } from '@/lib/tiptap/page';
import { createHeaderComponent } from '@/lib/tiptap/header';
import { createFooterComponent } from '@/lib/tiptap/footer';

const baseTemplate = {
  _id: 't1',
  name: 'Sample Template',
  version: '1.0.0',
  tag_ids: [],
  created_on: '2026-01-01T00:00:00.000Z',
  updated_on: '2026-01-02T00:00:00.000Z',
};

describe('TemplateCard readiness behavior', () => {
  it('shows placeholder count and allows generation when placeholders exist', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <TemplateCard
        template={{
          ...baseTemplate,
          template: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'placeholder', attrs: { key: 'name' } }] },
            ],
          },
        } as any}
        tags={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onGenerate={onGenerate}
      />
    );

    expect(screen.getByText('Placeholders')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    const generateButton = screen.getByRole('button', { name: 'Fill & Generate' });
    expect((generateButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(generateButton);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables generation when no placeholders exist', () => {
    render(
      <TemplateCard
        template={{
          ...baseTemplate,
          template: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No fields here' }] }],
          },
        } as any}
        tags={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    const generateButton = screen.getByRole('button', { name: 'Fill & Generate' }) as HTMLButtonElement;
    expect(generateButton.disabled).toBe(true);
    expect(generateButton.title).toContain('Add at least one placeholder');
  });

  it('renders structured page content in the preview', () => {
    render(
      <TemplateCard
        template={{
          ...baseTemplate,
          template: {
            type: 'doc',
            content: [
              createHeaderComponent({ components: ['Header text'] }, { component_types: [{ kind: 'string' }] }),
              createPageComponent({ components: ['Body text'] }, { component_types: [{ kind: 'string' }], pageNumber: 1 }),
              createFooterComponent({ components: ['Footer text'] }, { component_types: [{ kind: 'string' }] }),
            ],
          },
        } as any}
        tags={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByText('Header text')).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
    expect(screen.getByText('Footer text')).toBeTruthy();
  });
});

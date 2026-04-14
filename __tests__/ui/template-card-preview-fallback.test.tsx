import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TemplateCard from '@/app/components/TemplateCard';
import { createHeaderComponent } from '@/lib/tiptap/header';
import { createPageComponent } from '@/lib/tiptap/page';
import { createFooterComponent } from '@/lib/tiptap/footer';

vi.mock('@tiptap/html', () => ({
  generateHTML: vi.fn(() => {
    throw new Error('preview render failed');
  }),
}));

const baseTemplate = {
  _id: 't-preview',
  name: 'Complex Preview Template',
  version: '1.0.0',
  tag_ids: [],
  created_on: '2026-01-01T00:00:00.000Z',
  updated_on: '2026-01-02T00:00:00.000Z',
};

describe('TemplateCard preview fallback', () => {
  it('falls back to a readable structural summary when rich rendering fails', () => {
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

    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('Header text'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('Body text'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => Boolean(element?.textContent?.includes('Footer text'))).length).toBeGreaterThan(0);
  });
});

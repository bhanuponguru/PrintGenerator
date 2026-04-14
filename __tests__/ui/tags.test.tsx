import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagManagementSection from '@/app/components/TagManagementSection';
import CreateTagModal from '@/app/components/CreateTagModal';
import EditTagModal from '@/app/components/EditTagModal';
import CreateTemplateModal from '@/app/components/CreateTemplateModal';
import { TagResponse } from '@/types/tag';

global.fetch = vi.fn();

const mockTags: TagResponse[] = [
  { _id: '1', name: 'Critical', template_ids: ['t1', 't2'], created_on: '2025-01-01T00:00:00Z' },
  { _id: '2', name: 'Draft', template_ids: [], created_on: '2025-01-02T00:00:00Z' },
];

describe('Tag Management UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TagManagementSection', () => {
    it('renders tag cards with counts and action buttons', () => {
      render(
        <TagManagementSection
          tags={mockTags}
          onEditClick={vi.fn()}
          onDeleteClick={vi.fn()}
          onViewTemplatesClick={vi.fn()}
        />
      );

      expect(screen.getByText('Critical')).toBeTruthy();
      expect(screen.getByText('2 templates')).toBeTruthy();
      expect(screen.getByText('Draft')).toBeTruthy();
      expect(screen.getByText('0 templates')).toBeTruthy();
      expect(screen.getAllByRole('button', { name: /View Templates/i })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Edit/i })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Delete/i })).toHaveLength(2);
    });

    it('emits the clicked tag through each callback', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const onView = vi.fn();

      render(
        <TagManagementSection
          tags={mockTags}
          onEditClick={onEdit}
          onDeleteClick={onDelete}
          onViewTemplatesClick={onView}
        />
      );

      await user.click(screen.getAllByRole('button', { name: /Edit/i })[0]);
      await user.click(screen.getAllByRole('button', { name: /Delete/i })[1]);
      await user.click(screen.getAllByRole('button', { name: /View Templates/i })[0]);

      expect(onEdit).toHaveBeenCalledWith(mockTags[0]);
      expect(onDelete).toHaveBeenCalledWith(mockTags[1]);
      expect(onView).toHaveBeenCalledWith(mockTags[0]);
    });
  });

  describe('CreateTagModal', () => {
    it('blocks empty tag names without calling the API', async () => {
      const user = userEvent.setup();

      render(<CreateTagModal onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />);

      await user.type(screen.getByRole('textbox'), '   ');
      await user.click(screen.getByRole('button', { name: /Create Tag/i }));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText('Tag name is required')).toBeTruthy();
    });

    it('creates a tag and calls onSuccess on success', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      (global.fetch as Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, data: { id: '3' } }),
      });

      render(<CreateTagModal onClose={vi.fn()} onSuccess={onSuccess} onError={vi.fn()} />);

      await user.type(screen.getByRole('textbox'), 'NewTag');
      await user.click(screen.getByRole('button', { name: /Create Tag/i }));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tags',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'NewTag' }),
        })
      );

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('EditTagModal', () => {
    it('loads the current tag name and sends the updated value', async () => {
      const user = userEvent.setup();
      (global.fetch as Mock).mockResolvedValueOnce({
        json: async () => ({ success: true }),
      });

      render(<EditTagModal tag={mockTags[0]} onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Critical');

      await user.clear(input);
      await user.type(input, 'Critical-V2');
      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tags',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('Critical-V2'),
        })
      );
    });
  });

  describe('CreateTemplateModal inline tags', () => {
    it('creates a tag inline and shows it after the parent rerenders with the new tags list', async () => {
      const user = userEvent.setup();
      const onTagCreated = vi.fn();
      (global.fetch as Mock).mockResolvedValueOnce({
        json: async () => ({ success: true, data: { id: 'inline-tag-id' } }),
      });

      const { rerender } = render(
        <CreateTemplateModal
          tags={[]}
          onTagCreated={onTagCreated}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('New tag...'), 'InlineTag');
      await user.click(screen.getByRole('button', { name: /Add/i }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
        expect(onTagCreated).toHaveBeenCalled();
      });

      rerender(
        <CreateTemplateModal
          tags={[{ _id: 'inline-tag-id', name: 'InlineTag', template_ids: [], created_on: '2025-01-01T00:00:00Z' }]}
          onTagCreated={onTagCreated}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: 'InlineTag' })).toBeTruthy();
    });

    it('rejects inline tag creation when the name already exists', async () => {
      const user = userEvent.setup();

      render(
        <CreateTemplateModal
          tags={mockTags}
          onTagCreated={vi.fn()}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('New tag...'), 'Draft');
      await user.click(screen.getByRole('button', { name: /Add/i }));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText('Tag already exists')).toBeTruthy();
    });
  });
});

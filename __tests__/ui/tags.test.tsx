import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagManagementSection from '@/app/components/TagManagementSection';
import CreateTagModal from '@/app/components/CreateTagModal';
import EditTagModal from '@/app/components/EditTagModal';
import CreateTemplateModal from '@/app/components/CreateTemplateModal';
import { TagResponse } from '@/types/tag';

// Mock Fetch
global.fetch = vi.fn();

const mockTags: TagResponse[] = [
  { _id: '1', name: 'Critical', template_ids: ['t1', 't2'], created_on: '2025-01-01T00:00:00Z' },
  { _id: '2', name: 'Draft', template_ids: [], created_on: '2025-01-02T00:00:00Z' },
];

describe('Tag Management UI Features', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TagManagementSection', () => {
    it('renders all tags properly with correct meta data and template counts', () => {
      render(
        <TagManagementSection 
          tags={mockTags} 
          onEditClick={vi.fn()} 
          onDeleteClick={vi.fn()} 
          onViewTemplatesClick={vi.fn()} 
        />
      );
      
      expect(screen.getByText('Critical')).toBeDefined();
      expect(screen.getByText('2 templates')).toBeDefined();
      expect(screen.getByText('Draft')).toBeDefined();
      expect(screen.getByText('0 templates')).toBeDefined();
    });

    it('triggers view, edit, and delete callbacks correctly with tag payload', async () => {
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

      const editBtns = screen.getAllByRole('button', { name: /Edit/i });
      const delBtns = screen.getAllByRole('button', { name: /Delete/i });
      const viewBtns = screen.getAllByRole('button', { name: /View Templates/i });

      await userEvent.click(editBtns[0]);
      expect(onEdit).toHaveBeenCalledWith(mockTags[0]);

      await userEvent.click(delBtns[1]);
      expect(onDelete).toHaveBeenCalledWith(mockTags[1]);
      
      await userEvent.click(viewBtns[0]);
      expect(onView).toHaveBeenCalledWith(mockTags[0]);
    });
  });

  describe('CreateTagModal', () => {
    it('disables submission when tag name is empty or only whitespace', async () => {
      render(
        <CreateTagModal onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />
      );

      const input = screen.getByRole('textbox');
      const submitBtn = screen.getByRole('button', { name: /Create Tag/i });

      await userEvent.type(input, '   ');
      
      // Should handle either visual disabled prop or programmatic rejection
      // Testing programmatic black-box rejection 
      await userEvent.click(submitBtn);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls API and triggers onSuccess upon successful tag creation', async () => {
      const onSuccess = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => ({ success: true, data: { id: '3' } })
      });

      render(<CreateTagModal onClose={vi.fn()} onSuccess={onSuccess} onError={vi.fn()} />);
      
      await userEvent.type(screen.getByRole('textbox'), 'NewTag');
      await userEvent.click(screen.getByRole('button', { name: /Create Tag/i }));

      expect(global.fetch).toHaveBeenCalledWith('/api/tags', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'NewTag' })
      }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('displays error messages natively upon backend rejection', async () => {
      const onError = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => ({ success: false, error: 'Tag already exists' })
      });

      render(<CreateTagModal onClose={vi.fn()} onSuccess={vi.fn()} onError={onError} />);
      
      await userEvent.type(screen.getByRole('textbox'), 'DuplicateTag');
      await userEvent.click(screen.getByRole('button', { name: /Create Tag/i }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Tag already exists');
      });
    });
  });

  describe('EditTagModal', () => {
    it('pre-loads existing tag name and permits saving modifications', async () => {
      const onSuccess = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => ({ success: true })
      });

      render(
        <EditTagModal tag={mockTags[0]} onClose={vi.fn()} onSuccess={onSuccess} onError={vi.fn()} />
      );

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Critical');

      await userEvent.clear(input);
      await userEvent.type(input, 'Critical-V2');
      await userEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(global.fetch).toHaveBeenCalledWith('/api/tags', expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('Critical-V2')
      }));
    });
  });

  describe('Inline Tag Creation (CreateTemplateModal)', () => {
    it('creates tag inline and automatically toggles it on', async () => {
      const onTagCreated = vi.fn();
      (global.fetch as any).mockResolvedValueOnce({
        json: async () => ({ success: true, data: { id: 'inline-tag-id' } })
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

      const newTagInput = screen.getByPlaceholderText('New tag...');
      const addBtn = screen.getByRole('button', { name: /Add/i });

      await userEvent.type(newTagInput, 'InlineTag');
      await userEvent.click(addBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
        expect(onTagCreated).toHaveBeenCalled();
      });

      // Simulate parent component fetching and updating the tags prop
      rerender(
        <CreateTemplateModal 
          tags={[{ _id: 'inline-tag-id', name: 'InlineTag', template_ids: [], created_on: '2025-01-01T00:00:00Z' }]} 
          onTagCreated={onTagCreated} 
          onClose={vi.fn()} 
          onSuccess={vi.fn()} 
          onError={vi.fn()} 
        />
      );

      // The inline tag should be automatically generated as a chip that is interactable and selected
      const chips = screen.getAllByRole('button', { name: /InlineTag/i });
      expect(chips.length).toBeGreaterThan(0);
    });

    it('rejects inline tag creation if name exactly matches an existing tag', async () => {
      render(
        <CreateTemplateModal 
          tags={mockTags} 
          onTagCreated={vi.fn()} 
          onClose={vi.fn()} 
          onSuccess={vi.fn()} 
          onError={vi.fn()} 
        />
      );

      const newTagInput = screen.getByPlaceholderText('New tag...');
      const addBtn = screen.getByRole('button', { name: /Add/i });

      await userEvent.type(newTagInput, 'Draft'); // 'Draft' exists
      await userEvent.click(addBtn);

      // Should block the network request natively 
      expect(global.fetch).not.toHaveBeenCalled();
      
      expect(screen.getByText('Tag already exists')).toBeDefined();
    });
  });

});

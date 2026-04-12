'use client';

import { TagResponse } from '@/types/tag';

interface TagManagementSectionProps {
  tags: TagResponse[];
  onEditClick: (tag: TagResponse) => void;
  onDeleteClick: (tag: TagResponse) => void;
  onViewTemplatesClick: (tag: TagResponse) => void;
}

/** Displays the tag collection and exposes edit/delete/view actions per tag. */
export default function TagManagementSection({
  tags,
  onEditClick,
  onDeleteClick,
  onViewTemplatesClick,
}: TagManagementSectionProps) {
  if (tags.length === 0) {
    return (
      <div className="pg-empty" style={{ margin: '20px 0' }}>
        <p style={{ color: 'var(--pg-text-muted)' }}>No tags available.</p>
      </div>
    );
  }

  return (
    <div className="pg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {tags.map(tag => {
        const date = new Date(tag.created_on).toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const templateCount = tag.template_ids ? tag.template_ids.length : 0;

        return (
          <div key={tag._id} className="pg-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--pg-text)' }}>
                {tag.name}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--pg-text-muted)', backgroundColor: 'var(--pg-accent-muted)', padding: '2px 8px', borderRadius: '12px' }}>
                {templateCount} {templateCount === 1 ? 'template' : 'templates'}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--pg-text-muted)', marginBottom: '20px' }}>
              Created on {date}
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="pg-btn-ghost"
                onClick={() => onViewTemplatesClick(tag)}
                style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
              >
                View Templates
              </button>
              <button
                className="pg-btn-ghost"
                onClick={() => onEditClick(tag)}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                Edit
              </button>
              <button
                className="pg-btn-ghost"
                onClick={() => onDeleteClick(tag)}
                style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--pg-danger)' }}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

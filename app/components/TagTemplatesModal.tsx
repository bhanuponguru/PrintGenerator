'use client';

import { Template } from '@/app/page';
import { TagResponse } from '@/types/tag';
import TemplateCard from './TemplateCard';

interface TagTemplatesModalProps {
  tag: TagResponse;
  templates: Template[];
  onClose: () => void;
  onEditTemplate: (template: Template) => void;
  onDeleteTemplate: (id: string) => void;
  onGenerateTemplate: (template: Template) => void;
}

/** Modal that shows every template associated with a selected tag. */
export default function TagTemplatesModal({
  tag,
  templates,
  onClose,
  onEditTemplate,
  onDeleteTemplate,
  onGenerateTemplate,
}: TagTemplatesModalProps) {
  // Only show templates that are associated with the active tag.
  const filteredTemplates = templates.filter(t => 
    t.tag_ids && t.tag_ids.includes(tag._id)
  );

  return (
    <div
      className="pg-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="pg-modal pg-modal-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-templates-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="tag-templates-title">
              Templates in "{tag.name}"
            </h2>
            <p className="pg-modal-subtitle">
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} associated
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {filteredTemplates.length === 0 ? (
             <div className="pg-empty" style={{ margin: '40px 0' }}>
               <p style={{ color: 'var(--pg-text-muted)' }}>No templates found for this tag.</p>
             </div>
          ) : (
            <div className="pg-grid">
              {filteredTemplates.map((t) => (
                <TemplateCard
                  key={t._id}
                  template={t}
                  tags={[tag]}
                  onEdit={() => onEditTemplate(t)}
                  onDelete={() => onDeleteTemplate(t._id)}
                  onGenerate={() => onGenerateTemplate(t)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@/lib/tiptap/placeholder';
import { ComponentExtensions } from '@/lib/tiptap/extensions';
import { countTemplatePlaceholders, escapePreviewHtml, summarizeTemplatePreview } from '@/lib/template-summary';
import type { Template } from '../page';

import { TagResponse } from '@/types/tag';

interface TemplateCardProps {
  template: Template;
  tags: TagResponse[];
  onEdit:     () => void;
  onDelete:   () => void;
  onGenerate: () => void;
}

/**
 * Formats timestamps for display in the template card metadata block.
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Card view for a template entry, combining metadata, preview, and actions.
 */
export default function TemplateCard({ template, tags, onEdit, onDelete, onGenerate }: TemplateCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const placeholderCount = useMemo(() => countTemplatePlaceholders(template.template), [template.template]);
  const canGenerate = placeholderCount > 0;

  /** Renders the preview area from TipTap JSON, with a fallback summary for older data. */
  const previewHtml = useMemo(() => {
    try {
      if (template.template?.type === 'doc') {
        return generateHTML(template.template, [StarterKit, Placeholder, ...ComponentExtensions]);
      }
      const summary = summarizeTemplatePreview(template.template);
      return `<p style="opacity:.5;font-style:italic">${escapePreviewHtml(summary)}</p>`;
    } catch {
      const summary = summarizeTemplatePreview(template.template);
      return `<p style="opacity:.5;font-style:italic">${escapePreviewHtml(summary)}</p>`;
    }
  }, [template.template]);

  return (
    <div className={`pg-card${confirmDelete ? ' pg-card-deleting' : ''}`}>
      <div className="pg-card-header">
        <h3 className="pg-card-name">{template.name}</h3>
        <span className="pg-version-badge">v{template.version}</span>
      </div>

      <div className="pg-card-meta">
        <div className="pg-meta-row">
          <span className="pg-meta-label">Created</span>
          <span>{formatDate(template.created_on)}</span>
        </div>
        <div className="pg-meta-row">
          <span className="pg-meta-label">Updated</span>
          <span>{formatDate(template.updated_on)}</span>
        </div>
        <div className="pg-meta-row">
          <span className="pg-meta-label">Placeholders</span>
          <span>{placeholderCount}</span>
        </div>
      </div>

      {template.tag_ids && template.tag_ids.length > 0 && (
        <div className="pg-keys-list" style={{ marginBottom: '14px' }}>
          {template.tag_ids.map(tagId => {
            const tagMatch = tags.find(t => t._id === tagId);
            if (!tagMatch) return null;
            return (
              <span key={tagId} className="pg-key-chip">
                {tagMatch.name}
              </span>
            );
          })}
        </div>
      )}

      <div className="pg-card-preview" aria-label="Template preview">
        <div
          className="pg-card-preview-inner"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      {confirmDelete ? (
        <div className="pg-delete-confirm">
          <p className="pg-delete-confirm-title">
            Delete{' '}
            <em style={{ fontFamily: 'var(--pg-font-serif)' }}>{template.name}</em>?
          </p>
          <p className="pg-delete-confirm-sub" style={{ marginBottom: '12px' }}>
            This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="pg-btn-danger" onClick={onDelete}>
              Delete
            </button>
            <button className="pg-btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="pg-card-actions">
          <button
            className="pg-btn-primary"
            onClick={onGenerate}
            disabled={!canGenerate}
            title={canGenerate ? 'Fill data and generate documents from this template' : 'Add at least one placeholder before generating'}
          >
            Fill & Generate
          </button>
          <button
            className="pg-btn-ghost"
            onClick={onEdit}
            title="Edit template"
          >
            Edit
          </button>
          <button
            className="pg-btn-icon danger"
            onClick={() => setConfirmDelete(true)}
            title="Delete template"
            aria-label="Delete template"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
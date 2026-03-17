'use client';

import { useState, useMemo } from 'react';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@/lib/tiptap/placeholder';
import type { Template } from '../page';

interface TemplateCardProps {
  template: Template;
  onEdit:     () => void;
  onDelete:   () => void;
  onGenerate: () => void;
}

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

export default function TemplateCard({ template, onEdit, onDelete, onGenerate }: TemplateCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Render TipTap JSON → HTML; fall back to a text summary for legacy/non-TipTap data */
  const previewHtml = useMemo(() => {
    try {
      if (template.template?.type === 'doc') {
        return generateHTML(template.template, [StarterKit, Placeholder]);
      }
      // Legacy / non-TipTap template — show a simple text representation
      return `<p style="opacity:.5;font-style:italic">${JSON.stringify(template.template, null, 2).slice(0, 200)}…</p>`;
    } catch {
      return '<p style="opacity:.5;font-style:italic">Unable to render preview</p>';
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
      </div>

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
            title="Generate documents from this template"
          >
            ⬇ Generate
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
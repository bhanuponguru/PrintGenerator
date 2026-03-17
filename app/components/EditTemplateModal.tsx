'use client';

import { useState, useMemo } from 'react';
import TemplateEditor from './TemplateEditor';
import type { Template } from '../page';

interface EditTemplateModalProps {
  template:  Template;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   (msg: string) => void;
}

/** Return true if the value looks like a TipTap JSON doc */
function isTiptapDoc(value: Record<string, any>): boolean {
  return value?.type === 'doc' && Array.isArray(value?.content);
}

export default function EditTemplateModal({
  template,
  onClose,
  onSuccess,
  onError,
}: EditTemplateModalProps) {
  const [name,         setName]         = useState(template.name);
  const [version,      setVersion]      = useState(template.version);
  const [templateJson, setTemplateJson] = useState<Record<string, any>>(template.template);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(false);

  /**
   * If the stored template is already a TipTap doc, initialise the editor with it.
   * If it's legacy JSON (created via raw API), show a notice and start with a blank doc
   * so the user can re-author it visually.
   */
  const { initialEditorContent, isLegacy } = useMemo(() => {
    if (isTiptapDoc(template.template)) {
      return { initialEditorContent: template.template, isLegacy: false };
    }
    return { initialEditorContent: undefined, isLegacy: true };
  }, [template.template]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name    = 'Name is required';
    if (!version.trim()) errs.version = 'Version is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${template._id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:     name.trim(),
          version:  version.trim(),
          template: templateJson,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        onError(data.error ?? 'Failed to update template');
      }
    } catch {
      onError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="pg-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="pg-modal pg-modal-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="edit-modal-title">
              Edit Template
            </h2>
            <p
              className="pg-modal-subtitle"
              style={{ fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}
            >
              {template.name}&nbsp;·&nbsp;v{template.version}
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
          {/* Legacy template notice */}
          {isLegacy && (
            <div
              style={{
                background: 'rgba(232,184,75,0.06)',
                border: '1px solid rgba(232,184,75,0.2)',
                borderRadius: 'var(--pg-radius)',
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--pg-accent)',
                lineHeight: 1.6,
              }}
            >
              ℹ This template was created with raw JSON (via API or an older version of the UI).
              The editor is starting blank — save to migrate it to the rich-text format, or leave
              it unchanged by clicking Cancel.
            </div>
          )}

          {/* Name + Version */}
          <div className="pg-row">
            <div className="pg-field">
              <label className="pg-label" htmlFor="e-name">Template Name</label>
              <input
                id="e-name"
                className={`pg-input${errors.name ? ' error' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {errors.name && <span className="pg-field-error">{errors.name}</span>}
            </div>

            <div className="pg-field">
              <label className="pg-label" htmlFor="e-version">Version</label>
              <input
                id="e-version"
                className={`pg-input${errors.version ? ' error' : ''}`}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
              {errors.version && <span className="pg-field-error">{errors.version}</span>}
            </div>
          </div>

          {/* TipTap editor */}
          <div className="pg-field">
            <label className="pg-label">Document Content</label>
            <TemplateEditor
              initialContent={initialEditorContent}
              onChange={(json) => setTemplateJson(json)}
            />
          </div>
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="pg-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
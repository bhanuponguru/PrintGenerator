'use client';

import { useState } from 'react';
import type { Template } from '../page';

interface EditTemplateModalProps {
  template:  Template;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   (msg: string) => void;
}

export default function EditTemplateModal({
  template,
  onClose,
  onSuccess,
  onError,
}: EditTemplateModalProps) {
  const [name,         setName]         = useState(template.name);
  const [version,      setVersion]      = useState(template.version);
  const [templateJson, setTemplateJson] = useState(
    JSON.stringify(template.template, null, 2)
  );
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name    = 'Name is required';
    if (!version.trim()) errs.version = 'Version is required';
    try {
      const parsed = JSON.parse(templateJson);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        errs.template = 'Template must be a JSON object';
      }
    } catch {
      errs.template = 'Invalid JSON — check your syntax';
    }
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
          template: JSON.parse(templateJson),
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
      <div className="pg-modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="edit-modal-title">
              Edit Template
            </h2>
            <p className="pg-modal-subtitle" style={{ fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}>
              {template.name}
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="pg-modal-body">
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

          <div className="pg-field">
            <label className="pg-label" htmlFor="e-template">Template JSON</label>
            <textarea
              id="e-template"
              className={`pg-textarea${errors.template ? ' error' : ''}`}
              value={templateJson}
              onChange={(e) => setTemplateJson(e.target.value)}
              rows={9}
              spellCheck={false}
              style={{ minHeight: '220px' }}
            />
            {errors.template ? (
              <span className="pg-field-error">{errors.template}</span>
            ) : (
              <span className="pg-field-hint">
                Modify the JSON structure or placeholders. Changes take effect on next generation.
              </span>
            )}
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
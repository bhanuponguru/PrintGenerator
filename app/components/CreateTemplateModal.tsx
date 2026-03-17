'use client';

import { useState } from 'react';
import TemplateEditor from './TemplateEditor';

interface CreateTemplateModalProps {
  onClose:   () => void;
  onSuccess: () => void;
  onError:   (msg: string) => void;
}

export default function CreateTemplateModal({
  onClose,
  onSuccess,
  onError,
}: CreateTemplateModalProps) {
  const [name,         setName]         = useState('');
  const [version,      setVersion]      = useState('');
  const [templateJson, setTemplateJson] = useState<Record<string, any> | null>(null);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(false);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name     = 'Name is required';
    if (!version.trim()) errs.version  = 'Version is required';
    if (!templateJson)   errs.template = 'Document content is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/templates', {
        method:  'POST',
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
        onError(data.error ?? 'Failed to create template');
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
        aria-labelledby="create-modal-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="create-modal-title">
              New Template
            </h2>
            <p className="pg-modal-subtitle">
              Compose your document and insert{' '}
              <span style={{ color: 'var(--pg-accent)', fontFamily: 'var(--pg-font-mono)' }}>
                {'{}{}'}
              </span>{' '}
              placeholders where dynamic values will be filled at generation time
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
          {/* Name + Version row */}
          <div className="pg-row">
            <div className="pg-field">
              <label className="pg-label" htmlFor="c-name">Template Name</label>
              <input
                id="c-name"
                className={`pg-input${errors.name ? ' error' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Invoice Template"
                autoFocus
              />
              {errors.name && <span className="pg-field-error">{errors.name}</span>}
            </div>

            <div className="pg-field">
              <label className="pg-label" htmlFor="c-version">Version</label>
              <input
                id="c-version"
                className={`pg-input${errors.version ? ' error' : ''}`}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
              />
              {errors.version && <span className="pg-field-error">{errors.version}</span>}
            </div>
          </div>

          {/* TipTap Editor */}
          <div className="pg-field">
            <label className="pg-label">Document Content</label>
            <TemplateEditor
              onChange={(json) => {
                setTemplateJson(json);
                if (errors.template) setErrors((e) => ({ ...e, template: '' }));
              }}
              hasError={!!errors.template}
            />
            {errors.template && (
              <span className="pg-field-error">{errors.template}</span>
            )}
          </div>
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="pg-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState } from 'react';
import TemplateEditor from './TemplateEditor';
import type { TemplateData } from '@/types/template';
import { TagResponse } from '@/types/tag';

interface EditTemplateModalProps {
  template:  TemplateData;
  tags:      TagResponse[];
  onTagCreated: () => void;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   (msg: string) => void;
}

/**
 * Modal for editing an existing template in place, preserving the current
 * values while validating and resubmitting the updated document.
 */
export default function EditTemplateModal({
  template,
  tags,
  onTagCreated,
  onClose,
  onSuccess,
  onError,
}: EditTemplateModalProps) {
  const [name,         setName]         = useState(template.name);
  const [version,      setVersion]      = useState(template.version);
  const [templateJson, setTemplateJson] = useState<Record<string, any>>(template.template);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(template.tag_ids || []);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [editorErrors, setEditorErrors] = useState<string[]>([]);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(false);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const nameToCreate = newTagName.trim();
    if (tags.some(t => t.name.toLowerCase() === nameToCreate.toLowerCase())) {
      setErrors(e => ({ ...e, tag: 'Tag already exists' }));
      return;
    }
    setCreatingTag(true);
    setErrors(e => ({ ...e, tag: '' }));
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToCreate }),
      });
      const data = await res.json();
      if (data.success) {
        onTagCreated();
        setSelectedTagIds(prev => [...prev, data.data.id]);
        setNewTagName('');
      } else {
        setErrors(e => ({ ...e, tag: data.error || 'Failed to create tag' }));
      }
    } catch {
      setErrors(e => ({ ...e, tag: 'Network error creating tag' }));
    } finally {
      setCreatingTag(false);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim())    errs.name    = 'Name is required';
    if (!version.trim()) errs.version = 'Version is required';
    if (editorErrors.length > 0) errs.template = `Resolve ${editorErrors.length} editor validation issue(s) before saving`;
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
          tag_ids:  selectedTagIds,
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

          <div className="pg-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="pg-label">Tags</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input 
                  className="pg-input" 
                  style={{ padding: '4px 8px', fontSize: '12px', width: '120px' }}
                  placeholder="New tag..."
                  value={newTagName}
                  onChange={e => { setNewTagName(e.target.value); setErrors(errs => ({ ...errs, tag: '' })) }}
                  onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                  disabled={creatingTag}
                />
                <button 
                  className="pg-btn-primary" 
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={handleCreateTag}
                  disabled={creatingTag || !newTagName.trim()}
                >
                  {creatingTag ? '...' : 'Add'}
                </button>
              </div>
            </div>
            {errors.tag && <span className="pg-field-error" style={{marginTop: '-4px'}}>{errors.tag}</span>}
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {tags.length === 0 ? (
                <span className="pg-text-muted" style={{ fontSize: '13px' }}>No tags available</span>
              ) : (
                tags.map(tag => {
                  const isSelected = selectedTagIds.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTagIds(selectedTagIds.filter(id => id !== tag._id));
                        } else {
                          setSelectedTagIds([...selectedTagIds, tag._id]);
                        }
                      }}
                      style={{
                        fontSize: '12px',
                        fontFamily: 'var(--pg-font-mono)',
                        padding: '4px 10px',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        transition: 'all var(--pg-ease)',
                        border: isSelected ? '1px solid rgba(232, 184, 75, 0.4)' : '1px solid var(--pg-border)',
                        background: isSelected ? 'var(--pg-accent-dim)' : 'transparent',
                        color: isSelected ? 'var(--pg-accent)' : 'var(--pg-text-muted)'
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* TipTap editor */}
          <div className="pg-field">
            <label className="pg-label">Document Content</label>
            <TemplateEditor
              initialContent={template.template}
              hasError={!!errors.template}
              onChange={(json) => {
                setTemplateJson(json);
                if (errors.template) {
                  setErrors((prev) => ({ ...prev, template: '' }));
                }
              }}
              onValidationChange={({ errors: nextErrors }) => {
                setEditorErrors(nextErrors);
              }}
            />
            {errors.template && <span className="pg-field-error">{errors.template}</span>}
          </div>
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="pg-btn-primary" onClick={handleSubmit} disabled={loading || editorErrors.length > 0}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState } from 'react';

interface CreateTagModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

/** Modal for creating a tag and surfacing any API errors inline. */
export default function CreateTagModal({
  onClose,
  onSuccess,
  onError,
}: CreateTagModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Tag name is required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        onError(data.error ?? 'Failed to create tag');
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
        className="pg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tag-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="create-tag-title">
              Create Tag
            </h2>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
          <div className="pg-field">
            <label className="pg-label" htmlFor="t-name">Tag Name</label>
            <input
              id="t-name"
              className={`pg-input${error ? ' error' : ''}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Invoices"
              autoFocus
            />
            {error && <span className="pg-field-error">{error}</span>}
          </div>
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="pg-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Create Tag'}
          </button>
        </div>
      </div>
    </div>
  );
}

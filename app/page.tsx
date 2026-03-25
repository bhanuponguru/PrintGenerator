'use client';

import { useState, useEffect, useCallback } from 'react';
import TemplateCard from './components/TemplateCard';
import CreateTemplateModal from './components/CreateTemplateModal';
import EditTemplateModal from './components/EditTemplateModal';
import GenerateModal from './components/GenerateModal';

export interface Template {
  _id: string;
  name: string;
  version: string;
  template: Record<string, any>;
  created_on: string;
  updated_on: string;
}

type ToastState = { message: string; type: 'success' | 'error' } | null;

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [generateTemplate, setGenerateTemplate] = useState<Template | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data ?? []);
      } else {
        setFetchError(data.error ?? 'Failed to load templates');
      }
    } catch {
      setFetchError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Template deleted', 'success');
        fetchTemplates();
      } else {
        showToast(data.error ?? 'Delete failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  return (
    <div className="pg-root">
      {/* ── Header ── */}
      <header className="pg-header">
        <div className="pg-header-inner">
          <div className="pg-brand">
            {/* Print-lines icon */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect width="28" height="28" rx="5" fill="var(--pg-accent)" opacity="0.13" />
              <rect x="6"  y="7"  width="16" height="2" rx="1" fill="var(--pg-accent)" />
              <rect x="6"  y="12" width="11" height="2" rx="1" fill="var(--pg-accent)" opacity="0.65" />
              <rect x="6"  y="17" width="13" height="2" rx="1" fill="var(--pg-accent)" opacity="0.45" />
              <rect x="6"  y="22" width="8"  height="2" rx="1" fill="var(--pg-accent)" opacity="0.28" />
            </svg>
            <div>
              <h1 className="pg-title">PrintGenerator</h1>
              <p className="pg-subtitle">Template Management</p>
            </div>
          </div>

          <button className="pg-btn-primary" onClick={() => setShowCreate(true)}>
            + New Template
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="pg-main">
        <div className="pg-section-header">
          <div>
            <p className="pg-section-title">All Templates</p>
            {!loading && !fetchError && (
              <p className="pg-section-count">
                {templates.length} template{templates.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {!loading && !fetchError && templates.length > 0 && (
            <button className="pg-btn-ghost" onClick={fetchTemplates} style={{ fontSize: '11px' }}>
              ↻ Refresh
            </button>
          )}
        </div>

        {loading ? (
          <div className="pg-loading">
            <span className="pg-spinner" />
            Loading templates
          </div>
        ) : fetchError ? (
          <div className="pg-error-banner">
            <span>⚠ {fetchError}</span>
            <button className="pg-btn-primary" onClick={fetchTemplates} style={{ padding: '6px 12px', fontSize: '11px' }}>Retry</button>
          </div>
        ) : templates.length === 0 ? (
          <div className="pg-empty">
            <div className="pg-empty-icon">□</div>
            <p style={{ color: 'var(--pg-text)', fontSize: '15px', fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}>
              No templates yet
            </p>
            <p style={{ color: 'var(--pg-text-muted)', fontSize: '12px', maxWidth: '260px', lineHeight: 1.7 }}>
              Create your first template to start generating filled PDF documents.
            </p>
            <button className="pg-btn-primary" onClick={() => setShowCreate(true)}>
              Create Template
            </button>
          </div>
        ) : (
          <div className="pg-grid">
            {templates.map((t) => (
              <TemplateCard
                key={t._id}
                template={t}
                onEdit={() => setEditTemplate(t)}
                onDelete={() => handleDelete(t._id)}
                onGenerate={() => setGenerateTemplate(t)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchTemplates();
            showToast('Template created!', 'success');
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {editTemplate && (
        <EditTemplateModal
          template={editTemplate}
          onClose={() => setEditTemplate(null)}
          onSuccess={() => {
            setEditTemplate(null);
            fetchTemplates();
            showToast('Template updated!', 'success');
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {generateTemplate && (
        <GenerateModal
          template={generateTemplate}
          onClose={() => setGenerateTemplate(null)}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          key={toast.message + Date.now()}
          className={`pg-toast pg-toast--${toast.type}`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
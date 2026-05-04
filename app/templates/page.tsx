'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TemplateData } from '@/types/template';
import { TagResponse } from '@/types/tag';
import DashboardLayout from '../components/DashboardLayout';
import TemplateCard from '../components/TemplateCard';
import CreateTemplateModal from '../components/CreateTemplateModal';
import EditTemplateModal from '../components/EditTemplateModal';
import GenerateModal from '../components/GenerateModal';
import { useToast } from '../components/useToast';
import { canGenerateFromTemplate } from '@/lib/template-summary';

/**
 * Inner component that uses useSearchParams (requires Suspense boundary).
 */
function TemplatesContent() {
  const searchParams = useSearchParams();
  const initialTagFilter = searchParams.get('tag');

  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tags, setTags] = useState<TagResponse[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(initialTagFilter);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateData | null>(null);
  const [generateTemplate, setGenerateTemplate] = useState<TemplateData | null>(null);

  const { showToast, ToastComponent } = useToast();

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

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.success) {
        setTags(data.data ?? []);
      }
    } catch {
      showToast('Failed to load tags', 'error');
    } finally {
      setLoadingTags(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchTags();
  }, [fetchTemplates, fetchTags]);

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

  const handleGenerateTemplate = (template: TemplateData) => {
    if (!canGenerateFromTemplate(template.template)) {
      showToast('This template has no placeholders yet. Add placeholders before generating.', 'error');
      return;
    }
    setGenerateTemplate(template);
  };

  const filteredTemplates = selectedFilterTag
    ? templates.filter(t => t.tag_ids?.includes(selectedFilterTag))
    : templates;

  const activeFilterTagName = selectedFilterTag
    ? tags.find(t => t._id === selectedFilterTag)?.name
    : null;

  return (
    <DashboardLayout
      headerActions={
        <button className="pg-btn-primary" onClick={() => setShowCreate(true)}>
          + New Template
        </button>
      }
    >
      {/* ── Page Hero ── */}
      <div className="pg-page-hero">
        <div className="pg-page-hero-content">
          <div className="pg-page-hero-icon">◫</div>
          <div>
            <h2 className="pg-page-title">Templates</h2>
            <p className="pg-page-description">
              Create, edit, preview and generate documents from your templates.
            </p>
          </div>
        </div>
      </div>

      <div className="pg-section-header">
        <div>
          <p className="pg-section-title">
            {activeFilterTagName ? `Templates tagged "${activeFilterTagName}"` : 'All Templates'}
          </p>
          {!loading && !fetchError && (
            <p className="pg-section-count">
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            className="pg-input"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
            value={selectedFilterTag || ''}
            onChange={(e) => setSelectedFilterTag(e.target.value || null)}
          >
            <option value="">All Tags</option>
            {tags.map(t => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>

          {!loading && !fetchError && templates.length > 0 && (
            <button className="pg-btn-ghost" onClick={fetchTemplates} style={{ fontSize: '11px' }}>
              ↻ Refresh
            </button>
          )}
        </div>
      </div>

      {/* ── Template Grid ── */}
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
      ) : filteredTemplates.length === 0 ? (
        <div className="pg-empty">
          <div className="pg-empty-icon">□</div>
          <p style={{ color: 'var(--pg-text)', fontSize: '15px', fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}>
            No templates found
          </p>
          {templates.length === 0 ? (
            <>
              <p style={{ color: 'var(--pg-text-muted)', fontSize: '12px', maxWidth: '260px', lineHeight: 1.7 }}>
                Create your first template to start generating filled PDF documents.
              </p>
              <button className="pg-btn-primary" onClick={() => setShowCreate(true)}>
                Create Template
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--pg-text-muted)', fontSize: '12px', maxWidth: '260px', lineHeight: 1.7 }}>
              Try changing your tag filter.
            </p>
          )}
        </div>
      ) : (
        <div className="pg-grid">
          {filteredTemplates.map((t) => (
            <TemplateCard
              key={t._id}
              template={t}
              tags={tags}
              onEdit={() => setEditTemplate(t)}
              onDelete={() => handleDelete(t._id)}
              onGenerate={() => handleGenerateTemplate(t)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateTemplateModal
          tags={tags}
          onTagCreated={fetchTags}
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
          tags={tags}
          onTagCreated={fetchTags}
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

      <ToastComponent />
    </DashboardLayout>
  );
}

/**
 * Templates page — wraps the content in a Suspense boundary
 * as required by Next.js for components using useSearchParams.
 */
export default function TemplatesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="pg-loading">
          <span className="pg-spinner" />
          Loading templates
        </div>
      </DashboardLayout>
    }>
      <TemplatesContent />
    </Suspense>
  );
}

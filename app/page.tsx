'use client';

import { useState, useEffect, useCallback } from 'react';
import { TagResponse } from '@/types/tag';
import TemplateCard from './components/TemplateCard';
import CreateTemplateModal from './components/CreateTemplateModal';
import EditTemplateModal from './components/EditTemplateModal';
import GenerateModal from './components/GenerateModal';
import TagManagementSection from './components/TagManagementSection';
import CreateTagModal from './components/CreateTagModal';
import EditTagModal from './components/EditTagModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import TagTemplatesModal from './components/TagTemplatesModal';

export interface Template {
  _id: string;
  name: string;
  version: string;
  template: Record<string, any>;
  tag_ids?: string[];
  created_on: string;
  updated_on: string;
}

type ToastState = { message: string; type: 'success' | 'error' } | null;

/**
 * Top-level primary dashboard entry point orchestrating the entire front-end user experience.
 * Manages the canonical collection of templates while facilitating triggers for creating,
 * editing, generating, and deleting entities via integrated nested module dialog views.
 * Controls centralized error handling loops and success messaging feedback toasts.
 */
export default function Home() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tags, setTags] = useState<TagResponse[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [activeTab, setActiveTab] = useState<'templates' | 'tags'>('templates');
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);

  // Modal states - Templates
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [generateTemplate, setGenerateTemplate] = useState<Template | null>(null);

  // Modal states - Tags
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [editTag, setEditTag] = useState<TagResponse | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagResponse | null>(null);
  const [tagTemplates, setTagTemplates] = useState<TagResponse | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTemplates = useCallback(async () => {
    // Reset visual loading and error states preparing for data fetch
    setLoading(true);
    setFetchError(null);
    
    try {
      // Execute the primary GET request querying the total templates collection
      const res = await fetch('/api/templates');
      const data = await res.json();
      
      // Unpack response gracefully bypassing null/undefined results
      if (data.success) {
        setTemplates(data.data ?? []);
      } else {
        setFetchError(data.error ?? 'Failed to load templates');
      }
    } catch {
      // Catch network-level systemic failures cleanly without crashing
      setFetchError('Unable to connect to server');
    } finally {
      // Unconditionally terminate the loading state locking the view
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

  // Guarantee UI sync with the database purely on initial mount phases
  useEffect(() => {
    fetchTemplates();
    fetchTags();
  }, [fetchTemplates, fetchTags]);

  const handleDelete = async (id: string) => {
    try {
      // Issue a hard DELETE destructive operation for the specific target
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        // Sequentially queue user feedback and independently trigger a visual refresh
        showToast('Template deleted', 'success');
        fetchTemplates();
      } else {
        // Expose underlying database constraints or deletion failures
        showToast(data.error ?? 'Delete failed', 'error');
      }
    } catch {
      // Gracefully capture disconnected environment failures
      showToast('Network error', 'error');
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTag) return;
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(deleteTag.name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Tag deleted', 'success');
        fetchTags();
        fetchTemplates(); // update templates as well
      } else {
        showToast(data.error ?? 'Delete failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDeleteTag(null);
    }
  };

  const filteredTemplates = selectedFilterTag
    ? templates.filter(t => t.tag_ids?.includes(selectedFilterTag))
    : templates;

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

          <div style={{ display: 'flex', gap: '10px' }}>
            {activeTab === 'templates' ? (
              <button className="pg-btn-primary" onClick={() => setShowCreate(true)}>
                + New Template
              </button>
            ) : (
              <button className="pg-btn-primary" onClick={() => setShowCreateTag(true)}>
                + New Tag
              </button>
            )}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '20px', padding: '0 40px', marginTop: '20px', borderBottom: '1px solid var(--pg-border)' }}>
          <button 
            onClick={() => setActiveTab('templates')}
            style={{ 
              background: 'none', border: 'none', padding: '10px 0', 
              color: activeTab === 'templates' ? 'var(--pg-accent)' : 'var(--pg-text-muted)', 
              borderBottom: activeTab === 'templates' ? '2px solid var(--pg-accent)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: 600, fontSize: '14px' 
            }}
          >
            Templates
          </button>
          <button 
            onClick={() => setActiveTab('tags')}
            style={{ 
              background: 'none', border: 'none', padding: '10px 0', 
              color: activeTab === 'tags' ? 'var(--pg-accent)' : 'var(--pg-text-muted)', 
              borderBottom: activeTab === 'tags' ? '2px solid var(--pg-accent)' : '2px solid transparent',
              cursor: 'pointer', fontWeight: 600, fontSize: '14px' 
            }}
          >
            Manage Tags
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="pg-main">
        {activeTab === 'templates' ? (
          <>
            <div className="pg-section-header">
              <div>
                <p className="pg-section-title">All Templates</p>
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
                onGenerate={() => setGenerateTemplate(t)}
              />
            ))}
          </div>
        )}
        </>
      ) : (
        <>
          <div className="pg-section-header">
            <div>
              <p className="pg-section-title">Manage Tags</p>
              {!loadingTags && (
                <p className="pg-section-count">
                  {tags.length} tag{tags.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {!loadingTags && tags.length > 0 && (
              <button className="pg-btn-ghost" onClick={fetchTags} style={{ fontSize: '11px' }}>
                ↻ Refresh
              </button>
            )}
          </div>
          {loadingTags ? (
            <div className="pg-loading">
              <span className="pg-spinner" />
              Loading tags
            </div>
          ) : (
            <TagManagementSection 
              tags={tags} 
              onEditClick={(tag) => setEditTag(tag)}
              onDeleteClick={(tag) => setDeleteTag(tag)}
              onViewTemplatesClick={(tag) => setTagTemplates(tag)}
            />
          )}
        </>
      )}
      </main>

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

      {/* Tags Modals */}
      {showCreateTag && (
        <CreateTagModal 
          onClose={() => setShowCreateTag(false)}
          onSuccess={() => {
            setShowCreateTag(false);
            fetchTags();
            showToast('Tag created!', 'success');
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {editTag && (
        <EditTagModal 
          tag={editTag}
          onClose={() => setEditTag(null)}
          onSuccess={() => {
            setEditTag(null);
            fetchTags();
            showToast('Tag updated!', 'success');
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {deleteTag && (
        <DeleteConfirmModal
          title="Delete Tag"
          message={`Are you sure you want to delete the tag "${deleteTag.name}"? Templates associated with this tag will not be deleted, but the tag will be removed from them.`}
          onClose={() => setDeleteTag(null)}
          onConfirm={handleDeleteTag}
          loading={false}
        />
      )}

      {tagTemplates && (
        <TagTemplatesModal 
          tag={tagTemplates}
          templates={templates}
          onClose={() => setTagTemplates(null)}
          onEditTemplate={(t) => setEditTemplate(t)}
          onDeleteTemplate={(id) => handleDelete(id)}
          onGenerateTemplate={(t) => setGenerateTemplate(t)}
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
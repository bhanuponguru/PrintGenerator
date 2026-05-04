'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TagResponse } from '@/types/tag';
import DashboardLayout from '../components/DashboardLayout';
import CreateTagModal from '../components/CreateTagModal';
import EditTagModal from '../components/EditTagModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { useToast } from '../components/useToast';

/**
 * Tags management page — displays all tags in a grid layout
 * with edit, delete, and "view templates" actions.
 * Clicking a tag navigates to the Templates page with the tag filter applied.
 */
export default function TagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [editTag, setEditTag] = useState<TagResponse | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagResponse | null>(null);

  const { showToast, ToastComponent } = useToast();

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.success) {
        setTags(data.data ?? []);
      } else {
        showToast('Failed to load tags', 'error');
      }
    } catch {
      showToast('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleDeleteTag = async () => {
    if (!deleteTag) return;
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(deleteTag.name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Tag deleted', 'success');
        fetchTags();
      } else {
        showToast(data.error ?? 'Delete failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDeleteTag(null);
    }
  };

  const handleViewTemplates = (tag: TagResponse) => {
    // Navigate to templates page with tag filter applied
    router.push(`/templates?tag=${tag._id}`);
  };

  return (
    <DashboardLayout
      headerActions={
        <button className="pg-btn-primary" onClick={() => setShowCreateTag(true)}>
          + New Tag
        </button>
      }
    >
      {/* ── Page Hero ── */}
      <div className="pg-page-hero">
        <div className="pg-page-hero-content">
          <div className="pg-page-hero-icon">⬡</div>
          <div>
            <h2 className="pg-page-title">Tags</h2>
            <p className="pg-page-description">
              Organize your templates with tags. Click a tag to view its associated templates.
            </p>
          </div>
        </div>
      </div>

      <div className="pg-section-header">
        <div>
          <p className="pg-section-title">All Tags</p>
          {!loading && (
            <p className="pg-section-count">
              {tags.length} tag{tags.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {!loading && tags.length > 0 && (
          <button className="pg-btn-ghost" onClick={fetchTags} style={{ fontSize: '11px' }}>
            ↻ Refresh
          </button>
        )}
      </div>

      {/* ── Tags Grid ── */}
      {loading ? (
        <div className="pg-loading">
          <span className="pg-spinner" />
          Loading tags
        </div>
      ) : tags.length === 0 ? (
        <div className="pg-empty">
          <div className="pg-empty-icon">⬡</div>
          <p style={{ color: 'var(--pg-text)', fontSize: '15px', fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}>
            No tags yet
          </p>
          <p style={{ color: 'var(--pg-text-muted)', fontSize: '12px', maxWidth: '300px', lineHeight: 1.7 }}>
            Tags help you organize and filter templates. Create your first tag to get started.
          </p>
          <button className="pg-btn-primary" onClick={() => setShowCreateTag(true)}>
            Create Tag
          </button>
        </div>
      ) : (
        <div className="pg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {tags.map(tag => {
            const date = new Date(tag.created_on).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric'
            });
            const templateCount = tag.template_ids ? tag.template_ids.length : 0;

            return (
              <div
                key={tag._id}
                className="pg-card pg-tag-card"
                onClick={() => handleViewTemplates(tag)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleViewTemplates(tag)}
              >
                <div className="pg-tag-card-header">
                  <div className="pg-tag-card-icon">⬡</div>
                  <h3 className="pg-tag-card-name">{tag.name}</h3>
                </div>

                <div className="pg-tag-card-stats">
                  <div className="pg-tag-card-stat">
                    <span className="pg-tag-card-stat-value">{templateCount}</span>
                    <span className="pg-tag-card-stat-label">{templateCount === 1 ? 'template' : 'templates'}</span>
                  </div>
                  <span className="pg-tag-card-date">Created {date}</span>
                </div>

                <div className="pg-tag-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="pg-btn-ghost"
                    onClick={() => handleViewTemplates(tag)}
                    style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
                  >
                    View Templates →
                  </button>
                  <button
                    className="pg-btn-ghost"
                    onClick={() => setEditTag(tag)}
                    style={{ padding: '6px 12px', fontSize: '13px' }}
                  >
                    Edit
                  </button>
                  <button
                    className="pg-btn-ghost"
                    onClick={() => setDeleteTag(tag)}
                    style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--pg-danger)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
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

      <ToastComponent />
    </DashboardLayout>
  );
}

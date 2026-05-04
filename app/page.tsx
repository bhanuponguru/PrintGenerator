'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from './components/DashboardLayout';
import type { TemplateData } from '@/types/template';
import { TagResponse } from '@/types/tag';

/**
 * Dashboard home page — provides a quick guide on how to use PrintGenerator,
 * and quick-access links to Templates and Tags management screens.
 */
export default function Home() {
  const [templateCount, setTemplateCount] = useState<number | null>(null);
  const [tagCount, setTagCount] = useState<number | null>(null);
  const [recentTemplates, setRecentTemplates] = useState<TemplateData[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const [templatesRes, tagsRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/tags'),
      ]);
      const [templatesData, tagsData] = await Promise.all([
        templatesRes.json(),
        tagsRes.json(),
      ]);
      if (templatesData.success) {
        const all = templatesData.data ?? [];
        setTemplateCount(all.length);
        // Show most recent 3 templates
        const sorted = [...all].sort(
          (a: TemplateData, b: TemplateData) =>
            new Date(b.updated_on).getTime() - new Date(a.updated_on).getTime()
        );
        setRecentTemplates(sorted.slice(0, 3));
      }
      if (tagsData.success) {
        setTagCount((tagsData.data ?? []).length);
      }
    } catch {
      // silent — stats are best-effort
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const steps = [
    {
      number: '01',
      icon: '✦',
      title: 'Create a Template',
      description: 'Design your document layout using the rich text editor. Add headers, footers, tables, lists, and style your content just like a word processor.',
      color: 'var(--pg-accent)',
    },
    {
      number: '02',
      icon: '⟐',
      title: 'Insert Placeholders',
      description: 'Mark dynamic areas with {{placeholders}} — these are slots where data will be injected during generation. Supports text, images, tables, lists, and custom components.',
      color: '#88c0d0',
    },
    {
      number: '03',
      icon: '⬡',
      title: 'Organize with Tags',
      description: 'Group related templates using tags for easy filtering and management. Tags help you stay organized as your template library grows.',
      color: '#a3be8c',
    },
    {
      number: '04',
      icon: '⤓',
      title: 'Generate Documents',
      description: 'Fill in placeholder values — manually or via JSON/CSV upload — and generate polished PDF documents in bulk. Download them all as a ZIP archive.',
      color: '#b48ead',
    },
  ];

  return (
    <DashboardLayout>
      {/* ── Welcome Hero ── */}
      <div className="pg-dashboard-hero">
        <div className="pg-dashboard-hero-content">
          <div className="pg-dashboard-hero-badge">Dashboard</div>
          <h2 className="pg-dashboard-hero-title">
            Welcome to <span className="pg-dashboard-hero-accent">PrintGenerator</span>
          </h2>
          <p className="pg-dashboard-hero-subtitle">
            Design document templates, insert dynamic placeholders, and generate polished PDFs at scale.
          </p>
          <div className="pg-dashboard-hero-actions">
            <Link href="/templates" className="pg-btn-primary pg-dashboard-hero-btn">
              Go to Templates →
            </Link>
            <Link href="/tags" className="pg-btn-ghost pg-dashboard-hero-btn">
              Manage Tags
            </Link>
          </div>
        </div>

        {/* Stats cards */}
        <div className="pg-dashboard-stats">
          <Link href="/templates" className="pg-stat-card">
            <div className="pg-stat-value">{templateCount ?? '–'}</div>
            <div className="pg-stat-label">Templates</div>
            <div className="pg-stat-icon">◫</div>
          </Link>
          <Link href="/tags" className="pg-stat-card">
            <div className="pg-stat-value">{tagCount ?? '–'}</div>
            <div className="pg-stat-label">Tags</div>
            <div className="pg-stat-icon">⬡</div>
          </Link>
        </div>
      </div>

      {/* ── Quick Guide ── */}
      <section className="pg-guide-section">
        <div className="pg-guide-header">
          <h3 className="pg-guide-title">Quick Guide</h3>
          <p className="pg-guide-subtitle">Get started with PrintGenerator in four simple steps</p>
        </div>

        <div className="pg-guide-steps">
          {steps.map((step) => (
            <div key={step.number} className="pg-guide-step">
              <div className="pg-guide-step-number" style={{ color: step.color }}>
                {step.number}
              </div>
              <div className="pg-guide-step-icon" style={{ color: step.color }}>
                {step.icon}
              </div>
              <h4 className="pg-guide-step-title">{step.title}</h4>
              <p className="pg-guide-step-desc">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent Templates ── */}
      {recentTemplates.length > 0 && (
        <section className="pg-recent-section">
          <div className="pg-section-header">
            <div>
              <p className="pg-section-title">Recently Updated</p>
              <p className="pg-section-count">{recentTemplates.length} template{recentTemplates.length !== 1 ? 's' : ''}</p>
            </div>
            <Link href="/templates" className="pg-btn-ghost" style={{ fontSize: '11px' }}>
              View All →
            </Link>
          </div>

          <div className="pg-recent-grid">
            {recentTemplates.map((t) => (
              <Link
                key={t._id}
                href="/templates"
                className="pg-recent-card"
              >
                <div className="pg-recent-card-header">
                  <h4 className="pg-recent-card-name">{t.name}</h4>
                  <span className="pg-version-badge">v{t.version}</span>
                </div>
                <p className="pg-recent-card-date">
                  Updated {new Date(t.updated_on).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
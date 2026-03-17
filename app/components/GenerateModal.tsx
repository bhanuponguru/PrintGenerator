'use client';

import { useState, useMemo } from 'react';
import type { Template } from '../page';

interface GenerateModalProps {
  template: Template;
  onClose:  () => void;
  onError:  (msg: string) => void;
}

/** Recursively extract all {{placeholder}} keys from a template object */
function extractPlaceholders(obj: unknown, keys = new Set<string>()): Set<string> {
  if (typeof obj === 'string') {
    const matches = obj.match(/\{\{(\w+)\}\}/g);
    if (matches) {
      matches.forEach((m) => keys.add(m.replace(/\{\{|\}\}/g, '')));
    }
  } else if (typeof obj === 'object' && obj !== null) {
    Object.values(obj).forEach((v) => extractPlaceholders(v, keys));
  }
  return keys;
}

function buildDefaultDatapoints(keys: string[]): string {
  const obj: Record<string, string> = {};
  keys.forEach((k) => { obj[k] = ''; });
  // Two example datapoints so the user sees the array pattern
  return JSON.stringify([obj, { ...obj }], null, 2);
}

export default function GenerateModal({ template, onClose, onError }: GenerateModalProps) {
  const placeholderKeys = useMemo(
    () => Array.from(extractPlaceholders(template.template)),
    [template.template]
  );

  const [dataPointsJson, setDataPointsJson] = useState(
    buildDefaultDatapoints(placeholderKeys)
  );
  const [jsonError, setJsonError] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  /** Parse JSON and return count, or null on error */
  const parsedCount = useMemo(() => {
    try {
      const arr = JSON.parse(dataPointsJson);
      return Array.isArray(arr) ? arr.length : null;
    } catch {
      return null;
    }
  }, [dataPointsJson]);

  const handleGenerate = async () => {
    let dataPoints: unknown[];

    try {
      const parsed = JSON.parse(dataPointsJson);
      if (!Array.isArray(parsed)) throw new Error('Must be a JSON array');
      if (parsed.length === 0)    throw new Error('Array must contain at least one data point');
      dataPoints = parsed;
      setJsonError('');
    } catch (e: any) {
      setJsonError(e.message ?? 'Invalid JSON');
      return;
    }

    setLoading(true);
    setDownloaded(false);

    try {
      const res = await fetch(`/api/templates/${template._id}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dataPoints }),
      });

      if (!res.ok) {
        // Try to parse error JSON
        let errMsg = `Server error (${res.status})`;
        try {
          const data = await res.json();
          errMsg = data.error ?? errMsg;
          // Show missing-key detail if present
          if (data.data?.invalidDataPoints) {
            const details = data.data.invalidDataPoints
              .map((p: { index: number; missing: string[] }) =>
                `Row ${p.index + 1}: missing ${p.missing.join(', ')}`
              )
              .join(' · ');
            errMsg = `${errMsg} — ${details}`;
          }
        } catch { /* ignore */ }
        onError(errMsg);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}-documents.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloaded(true);
    } catch {
      onError('Network error during generation');
    } finally {
      setLoading(false);
    }
  };

  const generateLabel = (() => {
    if (loading) return 'Generating…';
    if (parsedCount === null) return 'Generate ↓';
    return `Generate ${parsedCount} PDF${parsedCount !== 1 ? 's' : ''} ↓`;
  })();

  return (
    <div
      className="pg-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="pg-modal pg-modal-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gen-modal-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="gen-modal-title">
              Generate Documents
            </h2>
            <p
              className="pg-modal-subtitle"
              style={{ fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}
            >
              {template.name}&nbsp;·&nbsp;v{template.version}
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="pg-modal-body">
          {/* Detected placeholders */}
          {placeholderKeys.length > 0 ? (
            <div className="pg-field">
              <label className="pg-label">Required Placeholders</label>
              <div className="pg-keys-list">
                {placeholderKeys.map((k) => (
                  <span key={k} className="pg-key-chip">
                    {`{{${k}}}`}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="pg-field">
              <span className="pg-field-hint">
                No <code style={{ color: 'var(--pg-accent)' }}>{'{{placeholders}}'}</code> detected —
                the generated PDF will be identical for every data point.
              </span>
            </div>
          )}

          {/* DataPoints editor */}
          <div className="pg-field">
            <label className="pg-label" htmlFor="g-datapoints">
              Data Points
              <span
                style={{
                  color: 'var(--pg-text-muted)',
                  textTransform: 'none',
                  letterSpacing: 0,
                  marginLeft: 6,
                  fontSize: '10px',
                  fontWeight: 'normal',
                }}
              >
                — one object = one PDF in the ZIP
              </span>
            </label>
            <textarea
              id="g-datapoints"
              className={`pg-textarea${jsonError ? ' error' : ''}`}
              value={dataPointsJson}
              onChange={(e) => {
                setDataPointsJson(e.target.value);
                setDownloaded(false);
                if (jsonError) setJsonError('');
              }}
              rows={10}
              spellCheck={false}
              style={{ minHeight: '240px' }}
            />
            {jsonError ? (
              <span className="pg-field-error">{jsonError}</span>
            ) : (
              <span className="pg-field-hint">
                JSON array of objects. Each object must supply values for all required placeholders.
              </span>
            )}
          </div>

          {/* Success indicator */}
          {downloaded && (
            <div className="pg-download-ok">
              ✓ ZIP downloaded — check your downloads folder
            </div>
          )}
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Close
          </button>
          <button
            className="pg-btn-primary"
            onClick={handleGenerate}
            disabled={loading || parsedCount === null || parsedCount === 0}
          >
            {generateLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
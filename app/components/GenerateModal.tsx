'use client';

import { useState, useMemo } from 'react';
import type { Template } from '../page';

interface GenerateModalProps {
  template: Template;
  onClose:  () => void;
  onError:  (msg: string) => void;
}

/* ─── Placeholder extraction ─────────────────────────────
 * Handles two formats:
 *   1. TipTap JSON  — nodes with type:'placeholder' and attrs.key
 *   2. Legacy JSON  — any string values containing {{key}} patterns
 * ──────────────────────────────────────────────────────── */
/**
 * Recursively scans a template definition extracting all dynamic placeholder target keys.
 * Handles both rich-text Tiptap JSON layouts as well as fallback flat JSON string objects.
 * @param template The structured document template to traverse for placeholders.
 * @returns An array of unique string keys corresponding to discovered interpolation names.
 */
function extractPlaceholderKeys(template: Record<string, any>): string[] {
  const keys = new Set<string>();

  // Format 1: TipTap doc
  if (template?.type === 'doc') {
    walkTiptapJson(template, (node) => {
      if (node.type === 'placeholder' && typeof node.attrs?.key === 'string' && node.attrs.key) {
        keys.add(node.attrs.key);
      }
    });
    return Array.from(keys);
  }

  // Format 2: Legacy flat JSON — scan all string values for {{key}}
  walkValues(template, (val: string) => {
    const matches = val.match(/\{\{(\w+)\}\}/g);
    if (matches) {
      matches.forEach((m) => keys.add(m.replace(/^\{\{|\}\}$/g, '')));
    }
  });

  return Array.from(keys);
}

/**
 * Specifically traverses a complex TipTap node tree deeply executing a visitor sequence.
 * @param node The current document JSON node element under traversal check.
 * @param visit The callback function executing operations on matching node instances.
 */
function walkTiptapJson(
  node: Record<string, any>,
  visit: (n: Record<string, any>) => void
) {
  visit(node);
  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => walkTiptapJson(child, visit));
  }
}

/**
 * Progressively recurses through generic JSON structures mapping string elements.
 * Extracted explicitly to handle legacy plain JSON template definitions.
 * @param obj The structured object or raw value being evaluated.
 * @param visit A localized callback taking a string, checking it for placeholder text.
 */
function walkValues(obj: unknown, visit: (val: string) => void) {
  if (typeof obj === 'string') { visit(obj); return; }
  if (typeof obj === 'object' && obj !== null) {
    Object.values(obj).forEach((v) => walkValues(v, visit));
  }
}

/* ─── Skeleton builder ───────────────────────────────────── */
/**
 * Iterates through a provided array of required template placeholder strings to create
 * an empty initialization dataset mapping structure ready for user populating.
 * @param keys A flat array list specifying all tracked and necessary value keys.
 * @returns A JSON stringified array containing a base empty datapoint template structure.
 */
function buildDefaultDatapoints(keys: string[]): string {
  const obj: Record<string, string> = {};
  keys.forEach((k) => { obj[k] = ''; });
  return JSON.stringify(keys.length > 0 ? [obj, { ...obj }] : [{}], null, 2);
}

/* ─── Component ──────────────────────────────────────────── */
/**
 * Presentational and operational Modal Dialog handling batch PDF creation jobs.
 * Permits users to supply data points via a JSON text field which are then mapped
 * out to a zip file full of distinctly mapped PDF iterations of the parent Template.
 * @param template The driving Template data object specifying layouts and structure.
 * @param onClose Control callback dismissing this modal window manually.
 * @param onError Exception piping mechanism reporting failure states outwards.
 */
export default function GenerateModal({ template, onClose, onError }: GenerateModalProps) {
  const placeholderKeys = useMemo(
    () => extractPlaceholderKeys(template.template),
    [template.template]
  );

  const [dataPointsJson, setDataPointsJson] = useState(
    buildDefaultDatapoints(placeholderKeys)
  );
  const [jsonError,  setJsonError]  = useState('');
  const [loading,    setLoading]    = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  /** Live parse count */
  const parsedCount = useMemo(() => {
    try {
      const arr = JSON.parse(dataPointsJson);
      return Array.isArray(arr) ? arr.length : null;
    } catch {
      return null;
    }
  }, [dataPointsJson]);

  const handleGenerate = async () => {
    // Array holding parsed submission inputs mapped to template requirements
    let dataPoints: unknown[];

    try {
      // Try to parse the user's manual string JSON payload
      const parsed = JSON.parse(dataPointsJson);
      // Validate the high-level struct conforming to array collections exclusively
      if (!Array.isArray(parsed))  throw new Error('Must be a JSON array of objects');
      if (parsed.length === 0)     throw new Error('Provide at least one data point object');
      dataPoints = parsed;
      setJsonError('');
    } catch (e: any) {
      // Isolate malformed JSON block syntax strings returning user friendly feedback
      setJsonError(e.message ?? 'Invalid JSON');
      return;
    }

    setLoading(true);
    setDownloaded(false);

    try {
      // Fire raw generation request to backend microservice 
      const res = await fetch(`/api/templates/${template._id}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dataPoints }),
      });

      if (!res.ok) {
        // Fallback generic HTTP error text wrapper
        let errMsg = `Server error (${res.status})`;
        try {
          // Unpack custom API payload responses specifically isolating validation issues
          const data = await res.json();
          errMsg = data.error ?? errMsg;
          // Dynamically map exact unsupplied variables to help users debug their own queries
          if (data.data?.invalidDataPoints) {
            const details = (
              data.data.invalidDataPoints as { index: number; missing: string[] }[]
            )
              .map((p) => `Row ${p.index + 1}: missing ${p.missing.join(', ')}`)
              .join(' · ');
            errMsg = `${errMsg} — ${details}`;
          }
        } catch { /* ignore */ }
        onError(errMsg);
        return;
      }

      // Convert backend streaming ZIP archive blob into isolated object string
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      
      // Implement an invisible DOM anchor technique simulating direct local user downloads
      const a    = document.createElement('a');
      a.href     = url;
      // Sanitize standard file string name configurations formatting a safe zip property
      a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}-documents.zip`;
      
      document.body.appendChild(a);
      a.click();
      
      // Immediately garbage collect the object string representation
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloaded(true);
    } catch {
      onError('Network error during generation');
    } finally {
      setLoading(false);
    }
  };

  const btnLabel = loading
    ? 'Generating…'
    : parsedCount !== null
    ? `Generate ${parsedCount} PDF${parsedCount !== 1 ? 's' : ''} ↓`
    : 'Generate ↓';

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
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
          {/* Detected placeholder chips */}
          {placeholderKeys.length > 0 ? (
            <div className="pg-field">
              <label className="pg-label">Detected Placeholders</label>
              <div className="pg-keys-list">
                {placeholderKeys.map((k) => (
                  <span key={k} className="pg-key-chip">{`{{${k}}}`}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="pg-field">
              <span className="pg-field-hint">
                No placeholders detected — every generated PDF will be identical.
              </span>
            </div>
          )}

          {/* Data-points JSON editor */}
          <div className="pg-field">
            <label className="pg-label" htmlFor="g-dp">
              Data Points
              <span
                style={{
                  color: 'var(--pg-text-muted)',
                  textTransform: 'none',
                  letterSpacing: 0,
                  marginLeft: 6,
                  fontSize: '10px',
                }}
              >
                — one object = one PDF in the ZIP
              </span>
            </label>
            <textarea
              id="g-dp"
              className={`pg-textarea${jsonError ? ' error' : ''}`}
              value={dataPointsJson}
              onChange={(e) => {
                setDataPointsJson(e.target.value);
                setDownloaded(false);
                if (jsonError) setJsonError('');
              }}
              rows={10}
              spellCheck={false}
              style={{ minHeight: '230px' }}
            />
            {jsonError ? (
              <span className="pg-field-error">{jsonError}</span>
            ) : (
              <span className="pg-field-hint">
                JSON array of objects. Each object must supply a value for every detected placeholder.
              </span>
            )}
          </div>

          {/* Download success */}
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
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
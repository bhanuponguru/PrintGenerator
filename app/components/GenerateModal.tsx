'use client';

import { useState, useMemo, useRef } from 'react';
import type { Template } from '../page';
import type { ComponentTypeSchema } from '@/types/template';
import { deriveSchemaFromChildren } from '@/lib/tiptap/extensions';

interface GenerateModalProps {
  template: Template;
  onClose:  () => void;
  onError:  (msg: string) => void;
}

interface PlaceholderInfo {
  key: string;
  schema: ComponentTypeSchema | null;
  style?: 'bulleted' | 'numbered' | 'plain';
  mode?: 'row_data' | 'column_data';
  headers?: string[];
  column_types?: Record<string, ComponentTypeSchema>;
  row_types?: Record<string, ComponentTypeSchema>;
  caption?: ComponentTypeSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectPlaceholderDerivedSchemaMap(template: Record<string, any>): Record<string, ComponentTypeSchema> {
  const map: Record<string, ComponentTypeSchema> = {};

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.type === 'placeholder') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const key = typeof attrs.key === 'string' ? attrs.key.trim() : '';

      if (key) {
        const kind = typeof attrs.kind === 'string' ? attrs.kind : 'string';
        map[key] = deriveSchemaFromChildren(kind, attrs, node.content);
      }
    }

    if (node.attrs) {
      walk(node.attrs);
    }

    if (node.content) {
      walk(node.content);
    }
  };

  walk(template);
  return map;
}

/**
 * Extracts placeholder definitions from a structured Tiptap template and
 * prepares the schema metadata needed to build example payloads.
 * @param template The structured document template to traverse for placeholders.
 * @returns An array of placeholder info objects with key and optional schema.
 */
function extractPlaceholders(template: Record<string, any>): PlaceholderInfo[] {
  const placeholders = new Map<string, PlaceholderInfo>();

  if (template?.type !== 'doc') {
    return Array.from(placeholders.values());
  }

  const derivedSchemaMap = collectPlaceholderDerivedSchemaMap(template);

  walkTiptapJson(template, (node) => {
    if (node.type === 'placeholder' && typeof node.attrs?.key === 'string' && node.attrs.key) {
      const key = node.attrs.key;
      if (!placeholders.has(key)) {
        const schema = derivedSchemaMap[key] || null;

        placeholders.set(key, {
          key,
          schema,
          style: node.attrs.style,
          mode: node.attrs.mode,
          headers: Array.isArray(node.attrs.headers)
            ? node.attrs.headers
            : undefined,
          column_types: node.attrs.column_types,
          row_types: node.attrs.row_types,
          caption: node.attrs.caption ?? null,
        });
      }
    }
  });

  return Array.from(placeholders.values());
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
 * Generates a realistic example value based on a placeholder's type schema.
 * @param schema The ComponentTypeSchema defining the expected data type.
 * @param templateConfig Template-specific configuration (style, mode, headers, etc.)
 * @returns An example value matching the schema type.
 */
/** Builds a representative example value for each supported placeholder schema. */
function generateExampleValue(
  schema: ComponentTypeSchema | null,
  templateConfig?: Partial<PlaceholderInfo>
): unknown {
  if (!schema) return 'Example value';

  switch (schema.kind) {
    case 'string':
      return 'Sample text';

    case 'integer':
      return 42;

    case 'image':
      return {
        src: 'https://via.placeholder.com/300x200?text=Example',
        alt: 'Example image',
      };

    case 'hyperlink':
      return {
        url: 'https://example.com',
        alias: 'Example Link',
      };

    case 'list': {
      const itemExample = generateExampleValue(schema.item_type);
      return [itemExample, itemExample];
    }

    case 'container': {
      return {
        components: schema.component_types.map((componentSchema) =>
          generateExampleValue(componentSchema)
        ),
      };
    }

    case 'table': {
      const headers = templateConfig?.headers || ['Column 1', 'Column 2'];
      const mode = templateConfig?.mode || 'row_data';
      const columnTypes = templateConfig?.column_types || {};
      const rowTypes = templateConfig?.row_types || {};

      if (mode === 'row_data') {
        const makeRow = (label: string) => Object.fromEntries(
          headers.map((h) => [
            h,
            generateExampleValue(columnTypes[h] || { kind: 'string' }),
          ])
        );
        return {
          rows: [
            makeRow('Row 1'),
            makeRow('Row 2'),
          ],
        };
      } else {
        const columnNames = ['Column 1', 'Column 2'];
        return {
          columns: Object.fromEntries(
            columnNames.map((columnName) => [
              columnName,
              Object.fromEntries(
                headers.map((rowHeader) => [
                  rowHeader,
                  generateExampleValue(rowTypes[rowHeader] || { kind: 'string' }),
                ])
              ),
            ])
          ),
        };
      }
    }

    default:
      return 'Example value';
  }
}

/* ─── Skeleton builder ───────────────────────────────────── */
/**
 * Generates example datapoints based on placeholder schemas.
 * @param placeholders Array of placeholder info with key, schema, and template config.
 * @returns A JSON stringified array containing example datapoint template structures.
 */
function buildDefaultDatapoints(placeholders: PlaceholderInfo[]): string {
  if (placeholders.length === 0) return JSON.stringify([{}], null, 2);

  const firstExample: Record<string, unknown> = {};
  const secondExample: Record<string, unknown> = {};

  placeholders.forEach((placeholder) => {
    const example = generateExampleValue(placeholder.schema, placeholder);
    firstExample[placeholder.key] = example;
    // For second example, vary some values if possible
    if (
      placeholder.schema?.kind === 'string' ||
      placeholder.schema?.kind === 'integer'
    ) {
      secondExample[placeholder.key] =
        placeholder.schema.kind === 'integer' ? 99 : 'Another example';
    } else {
      secondExample[placeholder.key] = example;
    }
  });

  return JSON.stringify([firstExample, secondExample], null, 2);
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
  /** Cached placeholder metadata derived from the current template. */
  const placeholders = useMemo(
    () => extractPlaceholders(template.template),
    [template.template]
  );

  const placeholderKeys = placeholders.map((p) => p.key);

  const [dataPointsJson, setDataPointsJson] = useState(
    buildDefaultDatapoints(placeholders)
  );
  const [jsonError,  setJsonError]  = useState('');
  const [loading,    setLoading]    = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        // Basic validation: attempt to parse
        JSON.parse(content);
        setDataPointsJson(content);
        setJsonError('');
        setDownloaded(false);
      } catch (err) {
        onError('Invalid JSON file format');
      } finally {
        // Reset input so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => onError('Failed to read file');
    reader.readAsText(file);
  };

  const handleClearDataPoints = () => {
    setDataPointsJson('[]');
    setJsonError('');
    setDownloaded(false);
  };

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
            <label className="pg-label" htmlFor="g-dp" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              Data Points
              <div style={{ display: 'inline-flex', gap: '8px', marginLeft: 'auto' }}>
                <button
                  className="pg-btn-ghost"
                  style={{ fontSize: '12px', padding: '2px 6px', height: 'auto' }}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload JSON file"
                >
                  Upload JSON
                </button>
                <button
                  className="pg-btn-ghost"
                  style={{ fontSize: '12px', padding: '2px 6px', height: 'auto' }}
                  onClick={handleClearDataPoints}
                  title="Clear all data points"
                >
                  Clear
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json,application/json"
                style={{ display: 'none' }}
              />
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
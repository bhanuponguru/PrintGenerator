'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { Template } from '../page';
import type { ComponentTypeSchema } from '@/types/template';
import { deriveSchemaFromChildren } from '@/lib/tiptap/extensions';
import { fileToDataUrl } from '@/lib/image-utils';

interface GenerateModalProps {
  template: Template;
  onClose: () => void;
  onError: (msg: string) => void;
}

interface PlaceholderInfo {
  key: string;
  schema: ComponentTypeSchema | null;
}

type RenderSchemaEditor = (
  schema: ComponentTypeSchema | null,
  value: unknown,
  onChange: (next: unknown) => void,
  label: string
) => React.JSX.Element;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function walkTiptapJson(node: Record<string, any>, visit: (n: Record<string, any>) => void) {
  visit(node);
  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => walkTiptapJson(child, visit));
  }
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
      const attrs = (isRecord(node.attrs) ? node.attrs : {}) as Record<string, any>;
      const key = typeof attrs.key === 'string' ? attrs.key.trim() : '';
      if (key) {
        const kind = typeof attrs.schema?.kind === 'string'
          ? attrs.schema.kind
          : (typeof attrs.kind === 'string' ? attrs.kind : 'string');
        map[key] = deriveSchemaFromChildren(kind, attrs, node.content);
      }
    }

    if (node.attrs) walk(node.attrs);
    if (node.content) walk(node.content);
  };

  walk(template);
  return map;
}

function extractPlaceholders(template: Record<string, any>): PlaceholderInfo[] {
  const placeholders = new Map<string, PlaceholderInfo>();

  if (template?.type !== 'doc') {
    return [];
  }

  const derivedSchemaMap = collectPlaceholderDerivedSchemaMap(template);

  walkTiptapJson(template, (node) => {
    if (node.type !== 'placeholder' || typeof node.attrs?.key !== 'string' || !node.attrs.key) return;
    const key = node.attrs.key;
    if (placeholders.has(key)) return;
    placeholders.set(key, { key, schema: derivedSchemaMap[key] || null });
  });

  return Array.from(placeholders.values());
}

function generateExampleValue(schema: ComponentTypeSchema | null): unknown {
  if (!schema) return 'Sample text';

  switch (schema.kind) {
    case 'string':
      return 'Sample text';
    case 'integer':
      return 42;
    case 'image':
      return { src: 'https://via.placeholder.com/300x200?text=Example', alt: 'Example image' };
    case 'hyperlink':
      return { alias: 'Example Link', url: 'https://example.com' };
    case 'list':
      return { items: [generateExampleValue(schema.item_type), generateExampleValue(schema.item_type)], style: schema.style || 'bulleted' };
    case 'repeat':
      return { items: [generateExampleValue(schema.item_type), generateExampleValue(schema.item_type)] };
    case 'table': {
      if (schema.mode === 'column_data') {
        const headers = schema.headers || ['Row 1', 'Row 2'];
        return {
          columns: {
            'Column 1': Object.fromEntries(headers.map((h) => [h, 'Value'])),
            'Column 2': Object.fromEntries(headers.map((h) => [h, 'Value'])),
          },
        };
      }
      const headers = schema.headers || ['Column 1', 'Column 2'];
      return {
        rows: [
          Object.fromEntries(headers.map((h) => [h, 'Value 1'])),
          Object.fromEntries(headers.map((h) => [h, 'Value 2'])),
        ],
      };
    }
    case 'custom': {
      // Handle new token_library model
      if (Array.isArray(schema.token_library) && schema.token_library.length > 0) {
        const tokenSchemas: Record<string, ComponentTypeSchema> = Object.fromEntries(
          schema.token_library.map((token: any) => [token.id, { kind: token.kind, ...token } as ComponentTypeSchema])
        );
        const tokenData = Object.fromEntries(
          Object.entries(tokenSchemas).map(([tokenId, tokenSchema]) => [tokenId, generateExampleValue(tokenSchema)])
        );
        if (schema.repeat) {
          return { data: { items: [tokenData, tokenData] } };
        }
        return { data: tokenData };
      }

      // Fall back to legacy token_registry model
      if (isRecord(schema.token_registry)) {
        const tokenData = Object.fromEntries(
          Object.entries(schema.token_registry).map(([tokenId, tokenSchema]) => [tokenId, generateExampleValue(tokenSchema)])
        );
        if (schema.repeat) {
          return { data: { items: [tokenData, tokenData] } };
        }
        return { data: tokenData };
      }
      if (schema.repeat) {
        return { data: { items: [generateExampleValue(schema.value_type), generateExampleValue(schema.value_type)] } };
      }
      return { data: generateExampleValue(schema.value_type) };
    }
    default:
      return 'Sample text';
  }
}

function buildDefaultDataPoints(placeholders: PlaceholderInfo[]): Array<Record<string, unknown>> {
  if (placeholders.length === 0) return [{}];

  const first: Record<string, unknown> = {};
  const second: Record<string, unknown> = {};

  placeholders.forEach((placeholder) => {
    const sample = generateExampleValue(placeholder.schema);
    first[placeholder.key] = sample;
    second[placeholder.key] = sample;
  });

  return [first, second];
}

function parseInputJson(text: string): { ok: true; value: Array<Record<string, unknown>> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'The uploaded file does not contain a JSON array. Please ensure it is a properly formatted array of objects.' };
    }
    const points = parsed.map((entry) => (isRecord(entry) ? entry : {}));
    return { ok: true, value: points };
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Syntax error';
    return { ok: false, error: `The uploaded file is not valid JSON. Please check for syntax errors. Details: ${details}` };
  }
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function tokenKindLabel(schema: ComponentTypeSchema | null): string {
  if (!schema) return 'text';

  switch (schema.kind) {
    case 'string':
      return 'text';
    case 'integer':
      return 'number';
    case 'hyperlink':
      return 'link';
    default:
      return schema.kind;
  }
}

function tokenValueHint(schema: ComponentTypeSchema | null): string {
  if (!schema) return 'Enter text value.';

  switch (schema.kind) {
    case 'string':
      return 'Enter plain text.';
    case 'integer':
      return 'Enter a numeric value.';
    case 'image':
      return 'Provide image URL or upload a file.';
    case 'hyperlink':
      return 'Provide alias and URL.';
    case 'list':
      return 'Provide item values for the list.';
    case 'table':
      return 'Fill table cell values only.';
    case 'repeat':
      return 'Provide repeated item values.';
    case 'custom':
      return 'Provide values for nested custom tokens.';
    default:
      return 'Enter value.';
  }
}

function describeTokenConfiguration(schema: ComponentTypeSchema | null): string {
  if (!schema) return 'text';

  switch (schema.kind) {
    case 'string':
      return 'Text · single value';
    case 'integer':
      return 'Number · single value';
    case 'image': {
      const s = schema as import('@/types/template').ImageTypeSchema;
      const fields = Array.isArray(s.dynamic_fields) && s.dynamic_fields.length > 0
        ? s.dynamic_fields.join(', ')
        : 'src, alt';
      return `Image · ${fields}`;
    }
    case 'hyperlink': {
      const s = schema as import('@/types/template').HyperlinkTypeSchema;
      const fields = Array.isArray(s.dynamic_fields) && s.dynamic_fields.length > 0
        ? s.dynamic_fields.join(', ')
        : 'alias, url';
      return `Link · ${fields}`;
    }
    case 'list': {
      const s = schema as import('@/types/template').ListTypeSchema;
      return `List · ${s.style || 'bulleted'}`;
    }
    case 'table': {
      const s = schema as import('@/types/template').TableTypeSchema;
      const headers = Array.isArray(s.headers) && s.headers.length > 0
        ? s.headers.join(', ')
        : 'no headers';
      const caption = typeof s.caption === 'string' && s.caption.trim() !== ''
        ? `caption: ${s.caption.trim()}`
        : 'caption: none';
      const mode = s.mode === 'column_data' ? 'column_data' : 'row_data';
      return `Table · ${mode} · ${headers} · ${caption}`;
    }
    case 'repeat':
      return 'Repeat · repeated items';
    case 'custom':
      return 'Custom';
    default:
      return (schema as any).kind || 'unknown';
  }
}

function resolveDynamicFields(schema: ComponentTypeSchema, defaults: string[]): Set<string> {
  const s = schema as any;
  const raw = s.dynamic_fields;
  if (Array.isArray(raw) && raw.length > 0) {
    return new Set(raw.filter((field: unknown): field is string => typeof field === 'string'));
  }
  return new Set(defaults);
}

function resolveStaticValues(schema: ComponentTypeSchema): Record<string, unknown> {
  const s = schema as any;
  const raw = s.static_values;
  if (isRecord(raw)) {
    return raw;
  }
  return {};
}

function ImageValueEditor({
  schema,
  value,
  label,
  onChange,
}: {
  schema: ComponentTypeSchema;
  value: unknown;
  label: string;
  onChange: (next: unknown) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dynamicFields = resolveDynamicFields(schema, ['src', 'alt']);
  const staticValues = resolveStaticValues(schema);
  const image = isRecord(value) ? value : {};
  const src = dynamicFields.has('src')
    ? (typeof image.src === 'string' ? image.src : '')
    : (typeof staticValues.src === 'string' ? staticValues.src : '');
  const alt = dynamicFields.has('alt')
    ? (typeof image.alt === 'string' ? image.alt : '')
    : (typeof staticValues.alt === 'string' ? staticValues.alt : '');
  const source = typeof image.source === 'string' ? image.source : (src.startsWith('data:') ? 'file' : 'url');

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onChange({
      ...image,
      src: dataUrl,
      alt,
      source: 'file',
      mime_type: file.type,
      file_name: file.name,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="pg-layout-composer" aria-label={label}>
      <div className="pg-layout-composer-actions">
        <label className="pg-label" style={{ minWidth: 120 }}>Image source</label>
        <select
          className="pg-input"
          value={source}
          disabled={!dynamicFields.has('src')}
          onChange={(e) => {
            const nextSource = e.target.value === 'file' ? 'file' : 'url';
            onChange({ ...image, src, alt, source: nextSource });
            if (nextSource === 'file') {
              fileInputRef.current?.click();
            }
          }}
        >
          <option value="url">URL</option>
          <option value="file">File</option>
        </select>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          disabled={!dynamicFields.has('src')}
          onChange={(e) => {
            handleFileChange(e.target.files?.[0]).catch(() => undefined);
          }}
        />
      </div>
      {source === 'url' ? (
        <input
          className="pg-input"
          value={src}
          readOnly={!dynamicFields.has('src')}
          aria-readonly={!dynamicFields.has('src')}
          onChange={(e) => onChange({ ...image, src: e.target.value, alt, source: 'url' })}
          placeholder="https://example.com/image.png"
        />
      ) : (
        <input
          className="pg-input"
          value={typeof image.file_name === 'string' ? image.file_name : src ? 'uploaded-image' : ''}
          readOnly
          aria-readonly="true"
          placeholder="Upload an image file"
        />
      )}
      <input
        className="pg-input"
        value={alt}
        readOnly={!dynamicFields.has('alt')}
        aria-readonly={!dynamicFields.has('alt')}
        onChange={(e) => onChange({ ...image, src, alt: e.target.value, source })}
        placeholder="Alt text"
      />
      {src ? <div className="pg-layout-preview"><img src={src} alt={alt || label} style={{ maxWidth: '180px', height: 'auto', borderRadius: '12px' }} /></div> : null}
    </div>
  );
}

function CollectionEditor({
  kind,
  schema,
  value,
  onChange,
  renderSchemaEditor,
  label,
}: {
  kind: 'list' | 'repeat';
  schema: Extract<ComponentTypeSchema, { kind: 'list' | 'repeat' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  renderSchemaEditor: RenderSchemaEditor;
  label: string;
}) {
  const collection = isRecord(value) ? value : {};
  const items = Array.isArray(value)
    ? value
    : Array.isArray(collection.items)
      ? collection.items
      : [];
  const style = kind === 'list' && typeof (collection as any).style === 'string'
    ? (collection as any).style
    : kind === 'list'
      ? (schema as any).style || 'bulleted'
      : undefined;

  const emit = (nextItems: unknown[], nextStyle?: string) => {
    if (kind === 'list') {
      onChange({ items: nextItems, style: nextStyle || 'bulleted' });
      return;
    }
    onChange({ items: nextItems });
  };

  return (
    <div className="pg-layout-composer" aria-label={label}>
      {kind === 'list' ? (
        <div className="pg-insert-row">
          <label className="pg-label">List Style</label>
          <span style={{backgroundColor: '#e9ecef', padding: '4px 8px', borderRadius: '4px', display: 'inline-block'}}>{style || 'bulleted'}</span>
        </div>
      ) : null}

      {items.map((item, index) => (
        <div className="pg-layout-composer" key={`${label}-item-${index}`}>
          <div className="pg-layout-composer-actions">
            <span className="pg-layout-token-assist-label">Item {index + 1}</span>
            <button
              type="button"
              className="pg-layout-pattern"
              onClick={() => {
                const next = [...items];
                if (index > 0) {
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  emit(next, style);
                }
              }}
              disabled={index === 0}
            >
              Move Up
            </button>
            <button
              type="button"
              className="pg-layout-pattern"
              onClick={() => {
                const next = [...items];
                if (index < next.length - 1) {
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  emit(next, style);
                }
              }}
              disabled={index === items.length - 1}
            >
              Move Down
            </button>
            <button
              type="button"
              className="pg-layout-pattern"
              onClick={() => {
                const next = items.filter((_, itemIndex) => itemIndex !== index);
                emit(next, style);
              }}
            >
              Delete
            </button>
          </div>
          {renderSchemaEditor(
            schema.item_type,
            item,
            (nextItem) => {
              const next = [...items];
              next[index] = nextItem;
              emit(next, style);
            },
            `${label} item ${index + 1}`
          )}
        </div>
      ))}

      <div className="pg-layout-composer-actions">
        <button
          type="button"
          className="pg-layout-pattern"
          onClick={() => emit([...items, generateExampleValue(schema.item_type)], style)}
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}

function CompositeEditor({
  schema,
  value,
  onChange,
  renderSchemaEditor,
  label,
}: {
  schema: Extract<ComponentTypeSchema, { kind: 'container' | 'page' | 'header' | 'footer' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  renderSchemaEditor: RenderSchemaEditor;
  label: string;
}) {
  const composite = isRecord(value) ? value : {};
  const components = Array.isArray(composite.components) ? composite.components : [];

  if (schema.kind === 'container' && (schema as any).mode === 'repeat') {
    const s = schema as any;
    const itemType = s.item_type || { kind: 'string' as const };
    return (
      <div className="pg-layout-composer" aria-label={label}>
        {components.map((component, index) => (
          <div className="pg-layout-composer" key={`${label}-component-${index}`}>
            <div className="pg-layout-composer-actions">
              <span className="pg-layout-token-assist-label">Component {index + 1}</span>
              <button
                type="button"
                className="pg-layout-pattern"
                onClick={() => {
                  const next = components.filter((_, componentIndex) => componentIndex !== index);
                  onChange({ components: next });
                }}
              >
                Delete
              </button>
            </div>
            {renderSchemaEditor(itemType, component, (nextComponent) => {
              const next = [...components];
              next[index] = nextComponent;
              onChange({ components: next });
            }, `${label} component ${index + 1}`)}
          </div>
        ))}
        <div className="pg-layout-composer-actions">
          <button
            type="button"
            className="pg-layout-pattern"
            onClick={() => onChange({ components: [...components, generateExampleValue(itemType)] })}
          >
            + Add Component
          </button>
        </div>
      </div>
    );
  }

  const componentTypes = Array.isArray(schema.component_types) ? schema.component_types : [];
  const normalizedComponents = componentTypes.map((componentType, index) =>
    index < components.length ? components[index] : generateExampleValue(componentType)
  );

  return (
    <div className="pg-layout-composer" aria-label={label}>
      {componentTypes.map((componentType, index) => (
        <div className="pg-insert-row" key={`${label}-tuple-${index}`}>
          <label className="pg-label">Component {index + 1}</label>
          {renderSchemaEditor(componentType, normalizedComponents[index], (nextComponent) => {
            const next = [...normalizedComponents];
            next[index] = nextComponent;
            onChange({ components: next });
          }, `${label} component ${index + 1}`)}
        </div>
      ))}
      {componentTypes.length === 0 ? <span className="pg-field-hint">No component schema is defined for this placeholder.</span> : null}
    </div>
  );
}

function TableValueEditor({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ComponentTypeSchema, { kind: 'table' }>;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const table = isRecord(value) ? value : {};
  const mode = schema.mode === 'column_data' ? 'column_data' : 'row_data';
  const staticValues = resolveStaticValues(schema);
  const captionText = typeof schema.caption === 'string' && schema.caption.trim() !== '' ? schema.caption.trim() : '';

  if (mode === 'column_data') {
    const columns = isRecord(table.columns) ? table.columns : {};
    const columnNames = Object.keys(columns);
    const rowHeaders = Array.isArray(schema.headers) && schema.headers.length > 0
      ? schema.headers
      : Array.from(new Set(Object.values(columns).flatMap((col) => (isRecord(col) ? Object.keys(col) : []))));
    const safeColumnNames = columnNames.length > 0 ? columnNames : ['Column 1'];
    const safeRowHeaders = rowHeaders.length > 0 ? rowHeaders : ['Row 1'];
    const dynamicFields = resolveDynamicFields(schema, safeRowHeaders);

    const emitColumns = (nextColumns: Record<string, Record<string, unknown>>) => {
      const normalizedColumns: Record<string, Record<string, unknown>> = {};
      Object.entries(nextColumns).forEach(([colName, colData]) => {
        const current = isRecord(colData) ? { ...colData } : {};
        safeRowHeaders.forEach((rowHeader) => {
          if (!dynamicFields.has(rowHeader)) {
            current[rowHeader] = staticValues[rowHeader] ?? '';
          }
        });
        normalizedColumns[colName] = current;
      });
      onChange({
        columns: normalizedColumns,
      });
    };

    return (
      <div className="pg-layout-composer">
        {captionText ? (
          <div className="pg-insert-row">
            <label className="pg-label">Caption</label>
            <div className="pg-field-hint">{captionText}</div>
          </div>
        ) : null}
        <div className="pg-sheet-wrap">
          <table className="pg-sheet-table">
            <thead>
              <tr>
                <th></th>
                {safeColumnNames.map((columnName) => (
                  <th key={`column-name-${columnName}`}>{columnName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRowHeaders.map((rowHeader) => (
                <tr key={`row-header-${rowHeader}`}>
                  <th>{rowHeader}</th>
                  {safeColumnNames.map((columnName) => {
                    const columnData = isRecord(columns[columnName]) ? columns[columnName] : {};
                    return (
                      <td key={`${columnName}-${rowHeader}`}>
                        {dynamicFields.has(rowHeader) ? (
                          <input
                            className="pg-input"
                            value={typeof columnData[rowHeader] === 'string' || typeof columnData[rowHeader] === 'number' ? String(columnData[rowHeader]) : ''}
                            onChange={(e) => {
                              const nextColumns: Record<string, Record<string, unknown>> = {};
                              safeColumnNames.forEach((name) => {
                                const current = isRecord(columns[name]) ? columns[name] : {};
                                nextColumns[name] = { ...current };
                              });
                              nextColumns[columnName][rowHeader] = e.target.value;
                              emitColumns(nextColumns);
                            }}
                          />
                        ) : (
                          <span>{typeof staticValues[rowHeader] === 'string' || typeof staticValues[rowHeader] === 'number' ? String(staticValues[rowHeader]) : ''}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = Array.isArray(table.rows) ? table.rows : [];
  const schemaHeaders = Array.isArray(schema.headers) && schema.headers.length > 0 ? schema.headers : [];
  const inferredHeaders = Array.from(new Set(rows.flatMap((row) => (isRecord(row) ? Object.keys(row) : []))));
  const headers = schemaHeaders.length > 0 ? schemaHeaders : (inferredHeaders.length > 0 ? inferredHeaders : ['Column 1']);
  const dynamicFields = resolveDynamicFields(schema, headers);

  const emitRows = (nextRows: Array<Record<string, unknown>>) => {
    const normalizedRows = nextRows.map((row) => {
      const normalized: Record<string, unknown> = {};
      headers.forEach((header) => {
        if (dynamicFields.has(header)) {
          normalized[header] = row[header] ?? '';
        } else {
          normalized[header] = staticValues[header] ?? '';
        }
      });
      return normalized;
    });

    onChange({
      rows: normalizedRows,
    });
  };

  const safeRows = rows.length > 0
    ? rows.map((row) => {
      const normalized: Record<string, unknown> = {};
      headers.forEach((header) => {
        if (dynamicFields.has(header)) {
          normalized[header] = isRecord(row) ? row[header] ?? '' : '';
        } else {
          normalized[header] = staticValues[header] ?? '';
        }
      });
      return normalized;
    })
    : [Object.fromEntries(headers.map((header) => [header, dynamicFields.has(header) ? '' : (staticValues[header] ?? '')]))];

  return (
    <div className="pg-layout-composer">
      {captionText ? (
        <div className="pg-insert-row">
          <label className="pg-label">Caption</label>
          <div className="pg-field-hint">{captionText}</div>
        </div>
      ) : null}
      <div className="pg-layout-composer-actions">
        <button
          type="button"
          className="pg-layout-pattern"
          onClick={() => {
            emitRows([...safeRows, Object.fromEntries(headers.map((header) => [header, '']))]);
          }}
        >
          + Add Row
        </button>
      </div>
      <div className="pg-sheet-wrap">
        <table className="pg-sheet-table">
          <thead>
            <tr>
              {headers.map((header, headerIndex) => (
                <th key={`header-${headerIndex}`}>{header}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {headers.map((header) => (
                  <td key={`row-${rowIndex}-header-${header}`}>
                    {dynamicFields.has(header) ? (
                      <input
                        className="pg-input"
                        value={typeof row[header] === 'string' || typeof row[header] === 'number' ? String(row[header]) : ''}
                        onChange={(e) => {
                          const nextRows = [...safeRows];
                          nextRows[rowIndex] = { ...nextRows[rowIndex], [header]: e.target.value };
                            emitRows(nextRows);
                        }}
                      />
                    ) : (
                      <span>{typeof staticValues[header] === 'string' || typeof staticValues[header] === 'number' ? String(staticValues[header]) : ''}</span>
                    )}
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="pg-layout-segment-btn"
                    onClick={() => {
                      const nextRows = safeRows.filter((_, index) => index !== rowIndex);
                      emitRows(nextRows.length > 0 ? nextRows : [Object.fromEntries(headers.map((header) => [header, '']))]);
                    }}
                    disabled={safeRows.length === 1}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GenerateModal({ template, onClose, onError }: GenerateModalProps) {
  const placeholders = useMemo(() => extractPlaceholders(template.template), [template.template]);
  const placeholderKeys = placeholders.map((p) => p.key);

  const initialDataPoints = useMemo(() => buildDefaultDataPoints(placeholders), [placeholders]);

  const [entryMode, setEntryMode] = useState<'visual' | 'json'>('visual');
  const [dataPoints, setDataPoints] = useState<Array<Record<string, unknown>>>(initialDataPoints);
  const [dataPointsJson, setDataPointsJson] = useState(prettyJson(initialDataPoints));
  const [jsonError, setJsonError] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateDataPointValue = (index: number, key: string, value: unknown) => {
    setDataPoints((prev) => {
      const next = [...prev];
      const base = isRecord(next[index]) ? next[index] : {};
      next[index] = { ...base, [key]: value };
      const nextJson = prettyJson(next);
      setDataPointsJson(nextJson);
      setJsonError('');
      setDownloaded(false);
      return next;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      const parsed = parseInputJson(content);
      if (!parsed.ok) {
        onError(parsed.error);
      } else {
        setDataPoints(parsed.value);
        setDataPointsJson(prettyJson(parsed.value));
        setJsonError('');
        setDownloaded(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => onError('Failed to read file');
    reader.readAsText(file);
  };

  const handleExportJson = () => {
    const blob = new Blob([dataPointsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}-data-points.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const addDataPoint = () => {
    const next = [...dataPoints, {}];
    setDataPoints(next);
    setDataPointsJson(prettyJson(next));
    setDownloaded(false);
  };

  const removeDataPoint = (index: number) => {
    const next = dataPoints.filter((_, idx) => idx !== index);
    const normalized = next.length > 0 ? next : [{}];
    setDataPoints(normalized);
    setDataPointsJson(prettyJson(normalized));
    setDownloaded(false);
  };

  const cloneDataPoint = (index: number) => {
    const copy = JSON.parse(JSON.stringify(dataPoints[index] || {})) as Record<string, unknown>;
    const next = [...dataPoints];
    next.splice(index + 1, 0, copy);
    setDataPoints(next);
    setDataPointsJson(prettyJson(next));
    setDownloaded(false);
  };

  const renderSchemaEditor: RenderSchemaEditor = (
    schema: ComponentTypeSchema | null,
    value: unknown,
    onChange: (next: unknown) => void,
    label: string
  ) => {
    if (!schema || schema.kind === 'string') {
      return (
        <div className="pg-layout-composer">
          <div className="pg-field-hint">
            <strong>text</strong>: {tokenValueHint({ kind: 'string' })}
          </div>
          <input className="pg-input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={label} />
        </div>
      );
    }

    if (schema.kind === 'integer') {
      return (
        <div className="pg-layout-composer">
          <div className="pg-field-hint">
            <strong>number</strong>: {tokenValueHint({ kind: 'integer' })}
          </div>
          <input className="pg-input" type="number" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value))} placeholder={label} />
        </div>
      );
    }

    if (schema.kind === 'image') {
      return (
        <div className="pg-layout-composer">
          <div className="pg-field-hint">
            <strong>image</strong>: {tokenValueHint({ kind: 'image' })}
          </div>
          <ImageValueEditor schema={schema} value={value} label={label} onChange={onChange} />
        </div>
      );
    }

    if (schema.kind === 'hyperlink') {
      const link = isRecord(value) ? value : {};
      const dynamicFields = resolveDynamicFields(schema, ['alias', 'url']);
      const staticValues = resolveStaticValues(schema);
      const aliasValue = dynamicFields.has('alias')
        ? (typeof link.alias === 'string' ? link.alias : '')
        : (typeof staticValues.alias === 'string' ? staticValues.alias : '');
      const urlValue = dynamicFields.has('url')
        ? (typeof link.url === 'string' ? link.url : '')
        : (typeof staticValues.url === 'string' ? staticValues.url : '');
      return (
        <div className="pg-layout-composer">
          <div className="pg-field-hint">
            <strong>link</strong>: {tokenValueHint({ kind: 'hyperlink' })}
          </div>
          <div className="pg-layout-composer-actions">
            {dynamicFields.has('alias') ? (
              <input
                className="pg-input"
                value={aliasValue}
                onChange={(e) => onChange({ ...link, alias: e.target.value, ...(dynamicFields.has('url') ? {} : { url: urlValue }) })}
                placeholder="Alias"
              />
            ) : (
              <input className="pg-input" value={aliasValue} readOnly aria-readonly="true" placeholder="Alias" />
            )}
            {dynamicFields.has('url') ? (
              <input
                className="pg-input"
                value={urlValue}
                onChange={(e) => onChange({ ...link, url: e.target.value, ...(dynamicFields.has('alias') ? {} : { alias: aliasValue }) })}
                placeholder="URL"
              />
            ) : (
              <input className="pg-input" value={urlValue} readOnly aria-readonly="true" placeholder="URL" />
            )}
          </div>
        </div>
      );
    }

    if (schema.kind === 'custom') {
      // Handle new token_library model
      if (Array.isArray(schema.token_library) && schema.token_library.length > 0) {
        const container = isRecord(value) ? value : {};
        const customData = isRecord(container.data) ? container.data : {};

        if (schema.repeat) {
          const items = isRecord(customData) && Array.isArray(customData.items) ? customData.items : [{}];
          return (
            <div className="pg-layout-composer">
              {items.map((item, itemIndex) => {
                const row = isRecord(item) ? item : {};
                return (
                  <div className="pg-layout-composer" key={`custom-item-${itemIndex}`}>
                    <div className="pg-layout-token-assist-label">Item {itemIndex + 1}</div>
                    {(schema.token_library || []).map((token: any) => {
                      const tokenSchema = { kind: token.kind, ...token } as ComponentTypeSchema;
                      return (
                        <div className="pg-insert-row" key={`token-${token.id}-${itemIndex}`}>
                          <div>
                            <label className="pg-label">{token.label || token.id}</label>
                            <div className="pg-field-hint">{describeTokenConfiguration(tokenSchema)}</div>
                            <div className="pg-field-hint">
                              <strong>{tokenKindLabel(tokenSchema)}</strong>: {tokenValueHint(tokenSchema)}
                            </div>
                          </div>
                          {renderSchemaEditor(tokenSchema, row[token.id], (nextTokenValue) => {
                            const nextItems = [...items];
                            const current = isRecord(nextItems[itemIndex]) ? nextItems[itemIndex] : {};
                            nextItems[itemIndex] = { ...current, [token.id]: nextTokenValue };
                            onChange({ data: { items: nextItems } });
                          }, token.id)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <div className="pg-layout-composer-actions">
                <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: [...items, {}] } })}>+ Item</button>
                <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: items.length > 1 ? items.slice(0, -1) : items } })}>- Item</button>
              </div>
            </div>
          );
        }

        return (
          <div className="pg-layout-composer">
            {schema.token_library.map((token: any) => {
              const tokenSchema = { kind: token.kind, ...token } as ComponentTypeSchema;
              return (
                <div className="pg-insert-row" key={`token-${token.id}`}>
                  <div>
                    <label className="pg-label">{token.label || token.id}</label>
                    <div className="pg-field-hint">{describeTokenConfiguration(tokenSchema)}</div>
                    <div className="pg-field-hint">
                      <strong>{tokenKindLabel(tokenSchema)}</strong>: {tokenValueHint(tokenSchema)}
                    </div>
                  </div>
                  {renderSchemaEditor(tokenSchema, customData[token.id], (nextTokenValue) => {
                    onChange({ data: { ...customData, [token.id]: nextTokenValue } });
                  }, token.id)}
                </div>
              );
            })}
          </div>
        );
      }

      // Fall back to legacy token_registry model
      if (isRecord(schema.token_registry)) {
        const container = isRecord(value) ? value : {};
        const customData = isRecord(container.data) ? container.data : {};
        if (schema.repeat) {
          const items = isRecord(customData) && Array.isArray(customData.items) ? customData.items : [{}];
          return (
            <div className="pg-layout-composer">
              {items.map((item, itemIndex) => {
                const row = isRecord(item) ? item : {};
                return (
                  <div className="pg-layout-composer" key={`custom-item-${itemIndex}`}>
                    <div className="pg-layout-token-assist-label">Item {itemIndex + 1}</div>
                    {Object.entries(schema.token_registry || {}).map(([tokenId, tokenSchema]) => (
                      <div className="pg-insert-row" key={`token-${tokenId}-${itemIndex}`}>
                        <div>
                          <label className="pg-label">{schema.token_labels?.[tokenId] || tokenId}</label>
                          <div className="pg-field-hint">
                            <strong>{tokenKindLabel(tokenSchema as ComponentTypeSchema)}</strong>: {tokenValueHint(tokenSchema as ComponentTypeSchema)}
                          </div>
                        </div>
                        {renderSchemaEditor(tokenSchema, row[tokenId], (nextTokenValue) => {
                          const nextItems = [...items];
                          const current = isRecord(nextItems[itemIndex]) ? nextItems[itemIndex] : {};
                          nextItems[itemIndex] = { ...current, [tokenId]: nextTokenValue };
                          onChange({ data: { items: nextItems } });
                        }, tokenId)}
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="pg-layout-composer-actions">
                <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: [...items, {}] } })}>+ Item</button>
                <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: items.length > 1 ? items.slice(0, -1) : items } })}>- Item</button>
              </div>
            </div>
          );
        }

        return (
          <div className="pg-layout-composer">
            {Object.entries(schema.token_registry || {}).map(([tokenId, tokenSchema]) => (
              <div className="pg-insert-row" key={`token-${tokenId}`}>
                <div>
                  <label className="pg-label">{schema.token_labels?.[tokenId] || tokenId}</label>
                  <div className="pg-field-hint">
                    <strong>{tokenKindLabel(tokenSchema as ComponentTypeSchema)}</strong>: {tokenValueHint(tokenSchema as ComponentTypeSchema)}
                  </div>
                </div>
                {renderSchemaEditor(tokenSchema, customData[tokenId], (nextTokenValue) => {
                  onChange({ data: { ...customData, [tokenId]: nextTokenValue } });
                }, tokenId)}
              </div>
            ))}
          </div>
        );
      }
    }

    if (schema.kind === 'custom' && isRecord(schema.token_registry)) {
      const container = isRecord(value) ? value : {};
      const customData = isRecord(container.data) ? container.data : {};
      if (schema.repeat) {
        const items = isRecord(customData) && Array.isArray(customData.items) ? customData.items : [{}];
        return (
          <div className="pg-layout-composer">
            {items.map((item, itemIndex) => {
              const row = isRecord(item) ? item : {};
              return (
                <div className="pg-layout-composer" key={`custom-item-${itemIndex}`}>
                  <div className="pg-layout-token-assist-label">Item {itemIndex + 1}</div>
                  {Object.entries(schema.token_registry || {}).map(([tokenId, tokenSchema]) => (
                    <div className="pg-insert-row" key={`token-${tokenId}-${itemIndex}`}>
                      <div>
                        <label className="pg-label">{schema.token_labels?.[tokenId] || tokenId}</label>
                        <div className="pg-field-hint">
                          <strong>{tokenKindLabel(tokenSchema as ComponentTypeSchema)}</strong>: {tokenValueHint(tokenSchema as ComponentTypeSchema)}
                        </div>
                      </div>
                      {renderSchemaEditor(tokenSchema, row[tokenId], (nextTokenValue) => {
                        const nextItems = [...items];
                        const current = isRecord(nextItems[itemIndex]) ? nextItems[itemIndex] : {};
                        nextItems[itemIndex] = { ...current, [tokenId]: nextTokenValue };
                        onChange({ data: { items: nextItems } });
                      }, tokenId)}
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="pg-layout-composer-actions">
              <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: [...items, {}] } })}>+ Item</button>
              <button type="button" className="pg-layout-pattern" onClick={() => onChange({ data: { items: items.length > 1 ? items.slice(0, -1) : items } })}>- Item</button>
            </div>
          </div>
        );
      }

      return (
        <div className="pg-layout-composer">
          {Object.entries(schema.token_registry || {}).map(([tokenId, tokenSchema]) => (
            <div className="pg-insert-row" key={`token-${tokenId}`}>
              <div>
                <label className="pg-label">{schema.token_labels?.[tokenId] || tokenId}</label>
                <div className="pg-field-hint">
                  <strong>{tokenKindLabel(tokenSchema as ComponentTypeSchema)}</strong>: {tokenValueHint(tokenSchema as ComponentTypeSchema)}
                </div>
              </div>
              {renderSchemaEditor(tokenSchema, customData[tokenId], (nextTokenValue) => {
                onChange({ data: { ...customData, [tokenId]: nextTokenValue } });
              }, tokenId)}
            </div>
          ))}
        </div>
      );
    }

    if (schema.kind === 'list' || schema.kind === 'repeat') {
      return (
        <CollectionEditor
          kind={schema.kind}
          schema={schema}
          value={value}
          onChange={onChange}
          renderSchemaEditor={renderSchemaEditor}
          label={label}
        />
      );
    }

    if (schema.kind === 'table') {
      return (
        <TableValueEditor
          schema={schema}
          value={value}
          onChange={onChange}
        />
      );
    }

    if (schema.kind === 'container' || schema.kind === 'page' || schema.kind === 'header' || schema.kind === 'footer') {
      return (
        <CompositeEditor
          schema={schema}
          value={value}
          onChange={onChange}
          renderSchemaEditor={renderSchemaEditor}
          label={label}
        />
      );
    }

    return <input className="pg-input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={label} />;
  };

  const handleGenerate = async () => {
    if (dataPoints.length === 0) {
      setJsonError('Provide at least one data point object');
      return;
    }

    setLoading(true);
    setDownloaded(false);

    try {
      const res = await fetch(`/api/templates/${template._id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPoints }),
      });

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const data = await res.json();
          errMsg = data.error ?? errMsg;
        } catch {
          // no-op
        }
        onError(errMsg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
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

  const btnLabel = loading
    ? 'Generating…'
    : `Generate ${dataPoints.length} PDF${dataPoints.length !== 1 ? 's' : ''} ↓`;

  return (
    <div className="pg-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pg-modal pg-modal-lg" role="dialog" aria-modal="true" aria-labelledby="gen-modal-title">
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="gen-modal-title">Generate Documents</h2>
            <p className="pg-modal-subtitle" style={{ fontFamily: 'var(--pg-font-serif)', fontStyle: 'italic' }}>
              {template.name}&nbsp;·&nbsp;v{template.version}
            </p>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
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
              <span className="pg-field-hint">No placeholders detected — every generated PDF will be identical.</span>
            </div>
          )}

          <div className="pg-field">
            <label className="pg-label">Input Mode</label>
            <div className="pg-layout-composer-actions">
                  <button type="button" className={`pg-layout-pattern${entryMode === 'visual' ? ' pg-tb-active' : ''}`} onClick={() => setEntryMode('visual')}>Visual Inserter</button>
                  <button type="button" className={`pg-layout-pattern${entryMode === 'json' ? ' pg-tb-active' : ''}`} onClick={() => setEntryMode('json')}>JSON Preview</button>
              <button type="button" className="pg-layout-pattern" onClick={handleExportJson}>Export JSON</button>
              <button type="button" className="pg-layout-pattern" onClick={() => fileInputRef.current?.click()}>Upload JSON</button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,application/json" style={{ display: 'none' }} />
            </div>
          </div>

          {entryMode === 'visual' ? (
            <div className="pg-layout-composer">
              {dataPoints.map((point, pointIndex) => (
                <div key={`dp-${pointIndex}`} className="pg-layout-composer">
                  <div className="pg-layout-composer-actions">
                    <span className="pg-layout-token-assist-label">Data Point {pointIndex + 1}</span>
                    <button type="button" className="pg-layout-pattern" onClick={() => cloneDataPoint(pointIndex)}>Clone</button>
                    <button type="button" className="pg-layout-pattern" onClick={() => removeDataPoint(pointIndex)}>Delete</button>
                  </div>

                  {placeholders.map((placeholder) => (
                    <div className="pg-insert-row" key={`dp-${pointIndex}-${placeholder.key}`}>
                      <label className="pg-label">{placeholder.key}</label>
                      {renderSchemaEditor(
                        placeholder.schema,
                        point[placeholder.key],
                        (nextValue) => updateDataPointValue(pointIndex, placeholder.key, nextValue),
                        placeholder.key
                      )}
                    </div>
                  ))}
                </div>
              ))}

              <div className="pg-layout-composer-actions">
                <button type="button" className="pg-layout-pattern" onClick={addDataPoint}>+ Add Data Point</button>
              </div>
            </div>
          ) : (
            <div className="pg-field">
              <label className="pg-label" htmlFor="g-dp-json">JSON Preview</label>
              <pre
                id="g-dp-json"
                className="pg-layout-template-output"
                aria-readonly="true"
                aria-label="JSON Preview"
                style={{ maxHeight: '260px', overflow: 'auto', margin: 0 }}
              >
                {dataPointsJson}
              </pre>
              {jsonError ? (
                <span className="pg-field-error">{jsonError}</span>
              ) : (
                <span className="pg-field-hint">JSON is read-only in generation mode and mirrors the visual inputs.</span>
              )}
            </div>
          )}

          {downloaded && (
            <div className="pg-download-ok">✓ ZIP downloaded — check your downloads folder</div>
          )}
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>Close</button>
          <button className="pg-btn-primary" onClick={handleGenerate} disabled={loading || dataPoints.length === 0 || !!jsonError}>
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

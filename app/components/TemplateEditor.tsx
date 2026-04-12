'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { generateHTML } from '@tiptap/html';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Undo,
  Redo,
  Braces,
  Image as ImageIcon,
  Link,
  Box,
  Table,
  Layers,
} from 'lucide-react';
import { Placeholder } from '@/lib/tiptap/placeholder';
import {
  ComponentExtensions,
  createContainerComponent,
  createHyperlinkComponent,
  createImageComponent,
  createListComponent,
  createTableComponent,
  validateContainerAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
} from '@/lib/tiptap/extensions';
import { ComponentTypeSchema, ListStyle, TableMode } from '@/types/template';

interface TemplateEditorProps {
  initialContent?: Record<string, any>;
  onChange: (json: Record<string, any>) => void;
  onValidationChange?: (state: { isValid: boolean; errors: string[] }) => void;
  hasError?: boolean;
}

type InsertPanel = 'placeholder' | 'image' | 'hyperlink' | 'list' | 'container' | 'table' | null;
type PlaceholderKind = ComponentTypeSchema['kind'];

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function walkTiptapJson(node: Record<string, any>, visit: (n: Record<string, any>) => void) {
  visit(node);
  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => walkTiptapJson(child, visit));
  }
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

function parseCommaSeparated(input: string): string[] {
  return input
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseLineItems(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeListStyle(style: string): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function collectValidationErrors(documentJson: Record<string, any>): string[] {
  const errors: string[] = [];

  walkTiptapJson(documentJson, (node) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

    const attrs = (node.attrs || {}) as Record<string, unknown>;

    if (node.type === 'placeholder') {
      const err = validatePlaceholderAttrs(attrs);
      if (err) {
        errors.push(`placeholder: ${err}`);
      }

      const key = typeof attrs.key === 'string' ? attrs.key : '';
      if (!KEY_RE.test(key)) {
        errors.push(`placeholder: invalid key '${key}'`);
      }
    }

    if (node.type === 'imageComponent') {
      const err = validateImageAttrs(attrs);
      if (err) errors.push(`imageComponent: ${err}`);
    }

    if (node.type === 'hyperlinkComponent') {
      const err = validateHyperlinkAttrs(attrs);
      if (err) errors.push(`hyperlinkComponent: ${err}`);
    }

    if (node.type === 'listComponent') {
      const err = validateListAttrs(attrs);
      if (err) errors.push(`listComponent: ${err}`);
    }

    if (node.type === 'containerComponent') {
      const err = validateContainerAttrs(attrs);
      if (err) errors.push(`containerComponent: ${err}`);
    }

    if (node.type === 'tableComponent') {
      const err = validateTableAttrs(attrs);
      if (err) errors.push(`tableComponent: ${err}`);
    }
  });

  return unique(errors);
}

export default function TemplateEditor({
  initialContent,
  onChange,
  onValidationChange,
  hasError = false,
}: TemplateEditorProps) {
  const [insertPanel, setInsertPanel] = useState<InsertPanel>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const [phKey, setPhKey] = useState('');
  const [phKind, setPhKind] = useState<PlaceholderKind>('string');
  const [phListStyle, setPhListStyle] = useState<ListStyle>('bulleted');
  const [phTableMode, setPhTableMode] = useState<TableMode>('row_data');
  const [phTableHeaders, setPhTableHeaders] = useState('Item,Qty');
  const [phContainerSlots, setPhContainerSlots] = useState('2');
  const [insertError, setInsertError] = useState('');

  const [imageSrc, setImageSrc] = useState('https://example.com/logo.png');
  const [imageAlt, setImageAlt] = useState('Image');

  const [linkAlias, setLinkAlias] = useState('Docs');
  const [linkUrl, setLinkUrl] = useState('https://example.com/docs');

  const [listStyle, setListStyle] = useState<ListStyle>('bulleted');
  const [listItemsText, setListItemsText] = useState('First item\nSecond item');

  const [containerItemsText, setContainerItemsText] = useState('Block A\nBlock B');

  const [tableMode, setTableMode] = useState<TableMode>('row_data');
  const [tableCaption, setTableCaption] = useState('');
  const [rowHeaders, setRowHeaders] = useState<string[]>(['Item', 'Qty']);
  const [rowRows, setRowRows] = useState<string[][]>([['Pen', '2']]);
  const [colRowHeaders, setColRowHeaders] = useState<string[]>(['Q1', 'Q2']);
  const [colNames, setColNames] = useState<string[]>(['Sales']);
  const [colMatrix, setColMatrix] = useState<string[][]>([['10'], ['12']]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder,
      ...ComponentExtensions,
    ],
    content: initialContent ?? {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    onUpdate({ editor: ed }) {
      const json = ed.getJSON();
      onChange(json);

      const errors = collectValidationErrors(json as Record<string, any>);
      setValidationErrors(errors);
      onValidationChange?.({ isValid: errors.length === 0, errors });
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'pg-prosemirror',
        spellcheck: 'false',
      },
    },
  });

  useEffect(() => () => { editor?.destroy(); }, [editor]);

  const active = (name: string, opts?: object) =>
    editor?.isActive(name, opts) ? ' pg-tb-active' : '';

  const cmd = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };

  const openPreview = useCallback(() => {
    if (!editor) return;

    try {
      setPreviewHtml(generateHTML(editor.getJSON(), [StarterKit, Placeholder, ...ComponentExtensions]));
    } catch {
      setPreviewHtml('<p>Unable to render preview.</p>');
    }

    setIsPreviewOpen(true);
  }, [editor]);

  const placeholderSchema = useMemo<ComponentTypeSchema | null>(() => {
    if (phKind === 'string' || phKind === 'integer' || phKind === 'image' || phKind === 'hyperlink') {
      return { kind: phKind, in_placeholder: true } as ComponentTypeSchema;
    }

    if (phKind === 'list') {
      return {
        kind: 'list',
        in_placeholder: true,
        style: normalizeListStyle(phListStyle),
        item_type: { kind: 'string', in_placeholder: true },
      };
    }

    if (phKind === 'container') {
      const slots = Number(phContainerSlots);
      const count = Number.isFinite(slots) && slots > 0 ? Math.floor(slots) : 2;
      return {
        kind: 'container',
        in_placeholder: true,
        component_types: Array.from({ length: count }, () => ({ kind: 'string', in_placeholder: true })),
      };
    }

    if (phKind === 'table') {
      const headers = parseCommaSeparated(phTableHeaders);
      return {
        kind: 'table',
        in_placeholder: true,
        mode: phTableMode,
        headers,
      };
    }

    return null;
  }, [phKind, phListStyle, phTableMode, phTableHeaders, phContainerSlots]);

  const insertTypedPlaceholder = useCallback(() => {
    const key = phKey.trim().replace(/\s+/g, '_');
    if (!key || !KEY_RE.test(key)) {
      setInsertError('Placeholder key is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }

    if (!placeholderSchema) {
      setInsertError('Choose a valid placeholder schema.');
      return;
    }

    if (placeholderSchema.kind === 'table' && placeholderSchema.headers.length === 0) {
      setInsertError('Table placeholders require at least one header.');
      return;
    }

    const result = editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'placeholder',
        attrs: {
          key,
          value_schema: placeholderSchema,
          value: '',
          in_placeholder: true,
        },
        content: [{ type: 'text', text: key }],
      })
      .run();

    if (!result) {
      setInsertError('Failed to insert placeholder.');
      return;
    }

    setInsertError('');
    setPhKey('');
    setInsertPanel(null);
  }, [editor, phKey, placeholderSchema]);

  const insertImageComponent = useCallback(() => {
    try {
      const node = createImageComponent(
        {
          src: imageSrc.trim(),
          alt: imageAlt.trim(),
          in_placeholder: false,
        },
        {}
      );
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid image component');
    }
  }, [editor, imageSrc, imageAlt]);

  const insertHyperlinkComponent = useCallback(() => {
    try {
      const node = createHyperlinkComponent(
        {
          alias: linkAlias.trim(),
          url: linkUrl.trim(),
          in_placeholder: false,
        },
        {}
      );
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid hyperlink component');
    }
  }, [editor, linkAlias, linkUrl]);

  const insertListComponent = useCallback(() => {
    const items = parseLineItems(listItemsText);
    if (items.length === 0) {
      setInsertError('List requires at least one item.');
      return;
    }

    try {
      const node = createListComponent({
        items,
        style: normalizeListStyle(listStyle),
        in_placeholder: false,
      });
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid list component');
    }
  }, [editor, listItemsText, listStyle]);

  const insertContainerComponent = useCallback(() => {
    const components = parseLineItems(containerItemsText);
    if (components.length === 0) {
      setInsertError('Container requires at least one component line.');
      return;
    }

    try {
      const node = createContainerComponent(
        {
          components,
          in_placeholder: false,
        },
        {
          component_types: components.map(() => ({ kind: 'string', in_placeholder: false })),
        }
      );
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid container component');
    }
  }, [editor, containerItemsText]);

  const insertTableComponent = useCallback(() => {
    try {
      if (tableMode === 'row_data') {
        const headers = rowHeaders.map((h) => h.trim()).filter(Boolean);
        if (headers.length === 0) {
          setInsertError('Row table requires at least one header.');
          return;
        }

        const rows = rowRows
          .map((row) => {
            const rowObj: Record<string, unknown> = {};
            headers.forEach((header, index) => {
              rowObj[header] = row[index] ?? '';
            });
            return rowObj;
          });

        const node = createTableComponent(
          {
            mode: 'row_data',
            rows,
            caption: tableCaption.trim() || undefined,
            in_placeholder: false,
          },
          { headers }
        );

        editor?.chain().focus().insertContent(node as any).run();
      } else {
        const headers = colRowHeaders.map((h) => h.trim()).filter(Boolean);
        const columns = colNames.map((c) => c.trim()).filter(Boolean);

        if (headers.length === 0) {
          setInsertError('Column table requires row headers.');
          return;
        }
        if (columns.length === 0) {
          setInsertError('Column table requires at least one column name.');
          return;
        }

        const colData: Record<string, Record<string, unknown>> = {};
        columns.forEach((colName, cIdx) => {
          const values: Record<string, unknown> = {};
          headers.forEach((rowHeader, rIdx) => {
            values[rowHeader] = colMatrix[rIdx]?.[cIdx] ?? '';
          });
          colData[colName] = values;
        });

        const node = createTableComponent(
          {
            mode: 'column_data',
            columns: colData,
            caption: tableCaption.trim() || undefined,
            in_placeholder: false,
          },
          { headers }
        );

        editor?.chain().focus().insertContent(node as any).run();
      }

      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid table component');
    }
  }, [editor, tableMode, rowHeaders, rowRows, colRowHeaders, colNames, colMatrix, tableCaption]);

  const placeholderKeys = useMemo(() => {
    if (!editor) return [] as string[];

    const found = new Set<string>();
    const json = editor.getJSON() as Record<string, any>;
    walkTiptapJson(json, (node) => {
      if (node.type === 'placeholder' && typeof node.attrs?.key === 'string') {
        found.add(node.attrs.key);
      }
    });

    return Array.from(found);
  }, [editor?.state]);

  const addRowHeader = () => {
    setRowHeaders((prev) => [...prev, `Column ${prev.length + 1}`]);
    setRowRows((prev) => prev.map((row) => [...row, '']));
  };

  const addDataRow = () => {
    setRowRows((prev) => [...prev, Array.from({ length: rowHeaders.length }, () => '')]);
  };

  const addColumnName = () => {
    setColNames((prev) => [...prev, `Column ${prev.length + 1}`]);
    setColMatrix((prev) => prev.map((row) => [...row, '']));
  };

  const addColumnRowHeader = () => {
    setColRowHeaders((prev) => [...prev, `Row ${prev.length + 1}`]);
    setColMatrix((prev) => [...prev, Array.from({ length: colNames.length }, () => '')]);
  };

  return (
    <div className={`pg-tiptap-wrapper${hasError ? ' pg-tiptap-error' : ''}`}>
      <div className="pg-tiptap-toolbar" role="toolbar" aria-label="Editor toolbar">
        <button
          type="button"
          className={`pg-tb-btn${active('bold')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleBold().run())}
          title="Bold"
        >
          <Bold size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('italic')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleItalic().run())}
          title="Italic"
        >
          <Italic size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('strike')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleStrike().run())}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button
          type="button"
          className={`pg-tb-btn${active('heading', { level: 1 })}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('heading', { level: 2 })}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('bulletList')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleBulletList().run())}
          title="Bullet list"
        >
          <List size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('orderedList')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleOrderedList().run())}
          title="Ordered list"
        >
          <ListOrdered size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button
          type="button"
          className="pg-tb-btn"
          onMouseDown={cmd(() => editor?.chain().focus().undo().run())}
          title="Undo"
          disabled={!editor?.can().undo()}
        >
          <Undo size={16} />
        </button>

        <button
          type="button"
          className="pg-tb-btn"
          onMouseDown={cmd(() => editor?.chain().focus().redo().run())}
          title="Redo"
          disabled={!editor?.can().redo()}
        >
          <Redo size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn pg-tb-btn--accent${insertPanel === 'placeholder' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'placeholder' ? null : 'placeholder'); }} title="Insert typed placeholder">
          <Braces size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${insertPanel === 'image' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'image' ? null : 'image'); }} title="Insert image component">
          <ImageIcon size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${insertPanel === 'hyperlink' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'hyperlink' ? null : 'hyperlink'); }} title="Insert hyperlink component">
          <Link size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${insertPanel === 'list' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'list' ? null : 'list'); }} title="Insert list component">
          <Box size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${insertPanel === 'container' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'container' ? null : 'container'); }} title="Insert container component">
          <Layers size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${insertPanel === 'table' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'table' ? null : 'table'); }} title="Insert table component">
          <Table size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button
          type="button"
          className="pg-tb-btn pg-tb-btn--accent"
          onMouseDown={cmd(openPreview)}
          title="Preview document"
        >
          Preview
        </button>
      </div>

      {insertPanel && (
        <div className="pg-insert-panel">
          {insertPanel === 'placeholder' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Key</label>
                <input className="pg-input" value={phKey} onChange={(e) => setPhKey(e.target.value)} placeholder="recipient_name" />
              </div>
              <div className="pg-insert-row">
                <label className="pg-label">Schema kind</label>
                <select className="pg-input" value={phKind} onChange={(e) => setPhKind(e.target.value as PlaceholderKind)}>
                  <option value="string">string</option>
                  <option value="integer">integer</option>
                  <option value="image">image</option>
                  <option value="hyperlink">hyperlink</option>
                  <option value="list">list</option>
                  <option value="container">container</option>
                  <option value="table">table</option>
                </select>
              </div>

              {phKind === 'list' && (
                <div className="pg-insert-row">
                  <label className="pg-label">List style</label>
                  <select className="pg-input" value={phListStyle} onChange={(e) => setPhListStyle(e.target.value as ListStyle)}>
                    <option value="bulleted">bulleted</option>
                    <option value="numbered">numbered</option>
                    <option value="plain">plain</option>
                  </select>
                </div>
              )}

              {phKind === 'container' && (
                <div className="pg-insert-row">
                  <label className="pg-label">Container slots</label>
                  <input className="pg-input" value={phContainerSlots} onChange={(e) => setPhContainerSlots(e.target.value)} placeholder="2" />
                </div>
              )}

              {phKind === 'table' && (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Table mode</label>
                    <select className="pg-input" value={phTableMode} onChange={(e) => setPhTableMode(e.target.value as TableMode)}>
                      <option value="row_data">row_data</option>
                      <option value="column_data">column_data</option>
                    </select>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Headers (comma separated)</label>
                    <input className="pg-input" value={phTableHeaders} onChange={(e) => setPhTableHeaders(e.target.value)} placeholder="Item,Qty" />
                  </div>
                </>
              )}

              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertTypedPlaceholder}>Insert Placeholder</button>
              </div>
            </>
          )}

          {insertPanel === 'image' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Image URL</label>
                <input className="pg-input" value={imageSrc} onChange={(e) => setImageSrc(e.target.value)} />
              </div>
              <div className="pg-insert-row">
                <label className="pg-label">Alt text</label>
                <input className="pg-input" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} />
              </div>
              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertImageComponent}>Insert Image</button>
              </div>
            </>
          )}

          {insertPanel === 'hyperlink' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Alias</label>
                <input className="pg-input" value={linkAlias} onChange={(e) => setLinkAlias(e.target.value)} />
              </div>
              <div className="pg-insert-row">
                <label className="pg-label">URL</label>
                <input className="pg-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              </div>
              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertHyperlinkComponent}>Insert Hyperlink</button>
              </div>
            </>
          )}

          {insertPanel === 'list' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">List style</label>
                <select className="pg-input" value={listStyle} onChange={(e) => setListStyle(e.target.value as ListStyle)}>
                  <option value="bulleted">bulleted</option>
                  <option value="numbered">numbered</option>
                  <option value="plain">plain</option>
                </select>
              </div>
              <div className="pg-insert-row">
                <label className="pg-label">Items (one per line)</label>
                <textarea className="pg-input" rows={4} value={listItemsText} onChange={(e) => setListItemsText(e.target.value)} />
              </div>
              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertListComponent}>Insert List</button>
              </div>
            </>
          )}

          {insertPanel === 'container' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Components (one per line)</label>
                <textarea className="pg-input" rows={5} value={containerItemsText} onChange={(e) => setContainerItemsText(e.target.value)} />
              </div>
              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertContainerComponent}>Insert Container</button>
              </div>
            </>
          )}

          {insertPanel === 'table' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Mode</label>
                <select className="pg-input" value={tableMode} onChange={(e) => setTableMode(e.target.value as TableMode)}>
                  <option value="row_data">row_data</option>
                  <option value="column_data">column_data</option>
                </select>
              </div>

              <div className="pg-insert-row">
                <label className="pg-label">Caption (optional)</label>
                <input className="pg-input" value={tableCaption} onChange={(e) => setTableCaption(e.target.value)} />
              </div>

              {tableMode === 'row_data' ? (
                <div className="pg-sheet-wrap">
                  <div className="pg-sheet-toolbar">
                    <button type="button" className="pg-btn-ghost" onClick={addRowHeader}>+ Column</button>
                    <button type="button" className="pg-btn-ghost" onClick={addDataRow}>+ Row</button>
                  </div>
                  <table className="pg-sheet-table">
                    <thead>
                      <tr>
                        {rowHeaders.map((header, cIdx) => (
                          <th key={`rh-${cIdx}`}>
                            <input
                              className="pg-input"
                              value={header}
                              onChange={(e) => {
                                const next = [...rowHeaders];
                                next[cIdx] = e.target.value;
                                setRowHeaders(next);
                              }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowRows.map((row, rIdx) => (
                        <tr key={`rr-${rIdx}`}>
                          {rowHeaders.map((_, cIdx) => (
                            <td key={`rc-${rIdx}-${cIdx}`}>
                              <input
                                className="pg-input"
                                value={row[cIdx] ?? ''}
                                onChange={(e) => {
                                  const next = rowRows.map((r) => [...r]);
                                  next[rIdx][cIdx] = e.target.value;
                                  setRowRows(next);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="pg-sheet-wrap">
                  <div className="pg-sheet-toolbar">
                    <button type="button" className="pg-btn-ghost" onClick={addColumnName}>+ Column</button>
                    <button type="button" className="pg-btn-ghost" onClick={addColumnRowHeader}>+ Row Header</button>
                  </div>
                  <table className="pg-sheet-table">
                    <thead>
                      <tr>
                        <th>
                          <span style={{ color: 'var(--pg-text-muted)', fontSize: '11px' }}>row \ col</span>
                        </th>
                        {colNames.map((name, cIdx) => (
                          <th key={`cn-${cIdx}`}>
                            <input
                              className="pg-input"
                              value={name}
                              onChange={(e) => {
                                const next = [...colNames];
                                next[cIdx] = e.target.value;
                                setColNames(next);
                              }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colRowHeaders.map((rowHeader, rIdx) => (
                        <tr key={`ch-${rIdx}`}>
                          <th>
                            <input
                              className="pg-input"
                              value={rowHeader}
                              onChange={(e) => {
                                const next = [...colRowHeaders];
                                next[rIdx] = e.target.value;
                                setColRowHeaders(next);
                              }}
                            />
                          </th>
                          {colNames.map((_, cIdx) => (
                            <td key={`cc-${rIdx}-${cIdx}`}>
                              <input
                                className="pg-input"
                                value={colMatrix[rIdx]?.[cIdx] ?? ''}
                                onChange={(e) => {
                                  const next = colMatrix.map((row) => [...row]);
                                  if (!next[rIdx]) next[rIdx] = [];
                                  next[rIdx][cIdx] = e.target.value;
                                  setColMatrix(next);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pg-insert-actions">
                <button type="button" className="pg-btn-ghost" onClick={() => setInsertPanel(null)}>Cancel</button>
                <button type="button" className="pg-btn-primary" onClick={insertTableComponent}>Insert Table</button>
              </div>
            </>
          )}

          {insertError && <p className="pg-field-error">{insertError}</p>}
        </div>
      )}

      <div className="pg-editor-layout">
        <div className="pg-editor-pane">
          <EditorContent editor={editor} className="pg-tiptap-content" />
        </div>
      </div>

      {isPreviewOpen && (
        <div
          className="pg-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsPreviewOpen(false)}
        >
          <div className="pg-modal pg-modal-xl" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
            <div className="pg-modal-header">
              <div>
                <h2 className="pg-modal-title" id="preview-modal-title">Document Preview</h2>
              </div>
              <button className="pg-modal-close" onClick={() => setIsPreviewOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="pg-modal-body">
              <div className="pg-preview-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}

      <div className="pg-tiptap-footer">
        <span className="pg-tiptap-footer-label">Placeholders:</span>
        {placeholderKeys.length === 0 && <span style={{ color: 'var(--pg-text-muted)', fontSize: '11px' }}>none</span>}
        {placeholderKeys.map((k) => (
          <span key={k} className="pg-key-chip">{`{{${k}}}`}</span>
        ))}
      </div>

      {validationErrors.length > 0 && (
        <div className="pg-validation-summary">
          <p className="pg-validation-title">Validation summary</p>
          {validationErrors.map((error, index) => (
            <p key={`ve-${index}`} className="pg-validation-item">{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

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
  File,
  PanelTop,
  PanelBottom,
  SeparatorHorizontal,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
} from 'lucide-react';
import { Placeholder } from '@/lib/tiptap/placeholder';
import {
  ComponentExtensions,
  createContainerComponent,
  createHyperlinkComponent,
  createImageComponent,
  createListComponent,
  createTableComponent,
  createPageComponent,
  createHeaderComponent,
  createFooterComponent,
  validateContainerAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
  validatePageAttrs,
  validateHeaderAttrs,
  validateFooterAttrs,
} from '@/lib/tiptap/extensions';
import { ComponentTypeSchema, ListStyle, TableMode } from '@/types/template';

interface TemplateEditorProps {
  initialContent?: Record<string, any>;
  onChange: (json: Record<string, any>) => void;
  onValidationChange?: (state: { isValid: boolean; errors: string[] }) => void;
  hasError?: boolean;
}

type InsertPanel = 'placeholder' | 'image' | 'hyperlink' | null;
type PlaceholderKind = ComponentTypeSchema['kind'];
type SubmodalTarget = 'container' | 'page' | 'header' | 'footer' | 'list' | 'table';
type AnyChildType = 'string' | 'integer' | 'image' | 'hyperlink' | 'container' | 'list' | 'table';

interface ChildEntry {
  id: number;
  type: AnyChildType;
  value: unknown; // string, {src,alt}, {alias,url}, {components:[]}, {items:[]}, table data
  schema: ComponentTypeSchema; // the schema for this child
}

interface ModalStackEntry {
  id: number;
  target: SubmodalTarget;
  label: string; // breadcrumb
  children: ChildEntry[];
  nextChildId: number;
  error: string;
  // Page-specific
  pageSize?: string;
  pageOrientation?: 'portrait' | 'landscape';
  pageNumber?: number;
  // List-specific
  listStyle?: ListStyle;
  listItemType?: AnyChildType;
  // Table-specific
  tableMode?: TableMode;
  tableCaption?: string;
  tableRowHeaders?: string[];
  tableRowRows?: string[][];
  tableColRowHeaders?: string[];
  tableColNames?: string[];
  tableColMatrix?: string[][];
  // Callback when this modal confirms
  onConfirm: (children: ChildEntry[], extra?: Record<string, unknown>) => void;
}

function childPreview(child: ChildEntry): string {
  const v = child.value;
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'string') return v || '(empty)';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'src' in (v as any)) return (v as any).alt || (v as any).src || '(image)';
  if (typeof v === 'object' && 'alias' in (v as any)) return (v as any).alias || (v as any).url || '(link)';
  if (typeof v === 'object' && 'components' in (v as any)) {
    const comps = (v as any).components as unknown[];
    return `{${comps.length} component${comps.length !== 1 ? 's' : ''}}`;
  }
  if (typeof v === 'object' && 'items' in (v as any)) {
    const items = (v as any).items as unknown[];
    return `[${items.length} item${items.length !== 1 ? 's' : ''}]`;
  }
  if (typeof v === 'object' && ('rows' in (v as any) || 'columns' in (v as any))) return '(table)';
  return JSON.stringify(v).slice(0, 40);
}

function childToComponentValue(child: ChildEntry): unknown {
  return child.value;
}

function schemaForChildType(type: AnyChildType, childEntries?: ChildEntry[]): ComponentTypeSchema {
  if (type === 'string' || type === 'integer' || type === 'image' || type === 'hyperlink') {
    return { kind: type } as ComponentTypeSchema;
  }
  if (type === 'container' && childEntries) {
    return { kind: 'container', component_types: childEntries.map(c => c.schema) };
  }
  if (type === 'list') return { kind: 'list', item_type: { kind: 'string' } };
  if (type === 'table') return { kind: 'table' };
  return { kind: type } as ComponentTypeSchema;
}

const ALL_CHILD_TYPES: { value: AnyChildType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'integer', label: 'integer' },
  { value: 'image', label: 'image' },
  { value: 'hyperlink', label: 'hyperlink' },
  { value: 'container', label: 'container' },
  { value: 'list', label: 'list' },
  { value: 'table', label: 'table' },
];

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Walks a TipTap document tree so validation can inspect every node. */
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

/** Returns a sensible default schema for the selected placeholder kind. */
function defaultSchemaForKind(kind: PlaceholderKind): ComponentTypeSchema {
  if (kind === 'string' || kind === 'integer' || kind === 'image' || kind === 'hyperlink') {
    return { kind } as ComponentTypeSchema;
  }

  if (kind === 'list') {
    return {
      kind: 'list',
      item_type: { kind: 'string' },
    };
  }

  if (kind === 'container') {
    return {
      kind: 'container',
      component_types: [{ kind: 'string' }],
    };
  }

  return { kind: 'table' };
}

function collectValidationErrors(documentJson: Record<string, any>): string[] {
  const errors: string[] = [];

  /** Enforce the structural contract for each inserted node type. */
  walkTiptapJson(documentJson, (node) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

    const attrs = (node.attrs || {}) as Record<string, unknown>;

    if (node.type === 'placeholder') {
      const err = validatePlaceholderAttrs(attrs);
      if (err) {
        errors.push(`placeholder: ${err}`);
      }

      if (attrs.kind === 'list' && (attrs.item_kind !== 'string' && attrs.item_kind !== 'integer' && attrs.item_kind !== 'image' && attrs.item_kind !== 'hyperlink')) {
        errors.push('placeholder: list placeholders require item_kind');
      }

      if (attrs.kind === 'container' && (!Array.isArray(attrs.component_kinds) || attrs.component_kinds.length === 0)) {
        errors.push('placeholder: container placeholders require component_kinds');
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

    if (node.type === 'pageComponent') {
      const err = validatePageAttrs(attrs);
      if (err) errors.push(`pageComponent: ${err}`);
    }

    if (node.type === 'headerComponent') {
      const err = validateHeaderAttrs(attrs);
      if (err) errors.push(`headerComponent: ${err}`);
    }

    if (node.type === 'footerComponent') {
      const err = validateFooterAttrs(attrs);
      if (err) errors.push(`footerComponent: ${err}`);
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
  /** Toolbar panel state for the various insert dialogs. */
  const [insertPanel, setInsertPanel] = useState<InsertPanel>(null);
  /** Live validation state shown to the user and bubbled to the parent. */
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  /** Placeholder insertion form state. */
  const [phKey, setPhKey] = useState('');
  const [phKind, setPhKind] = useState<PlaceholderKind>('string');
  const [phListStyle, setPhListStyle] = useState<ListStyle>('bulleted');
  const [phListItemKind, setPhListItemKind] = useState<PlaceholderKind>('string');
  const [phTableMode, setPhTableMode] = useState<TableMode>('row_data');
  const [phTableHeaders, setPhTableHeaders] = useState('Item,Qty');
  const [phTableColumnKinds, setPhTableColumnKinds] = useState<Record<string, PlaceholderKind>>({});
  const [phTableRowKinds, setPhTableRowKinds] = useState<Record<string, PlaceholderKind>>({});
  const [phContainerSlots, setPhContainerSlots] = useState('2');
  const [phContainerKinds, setPhContainerKinds] = useState<Record<number, PlaceholderKind>>({});
  const [insertError, setInsertError] = useState('');

  /** Component insertion form state. */
  const [imageSrc, setImageSrc] = useState('https://example.com/logo.png');
  const [imageAlt, setImageAlt] = useState('Image');

  const [linkAlias, setLinkAlias] = useState('Docs');
  const [linkUrl, setLinkUrl] = useState('https://example.com/docs');

  /** Submodal state — modal stack for recursive editing. */
  const [modalStack, setModalStack] = useState<ModalStackEntry[]>([]);
  const [modalNextId, setModalNextId] = useState(1);
  // Per-modal form state (for the primitive add-child form on the topmost modal)
  const [addChildType, setAddChildType] = useState<AnyChildType>('string');
  const [addChildValue, setAddChildValue] = useState('');
  const [addChildImageSrc, setAddChildImageSrc] = useState('https://example.com/logo.png');
  const [addChildImageAlt, setAddChildImageAlt] = useState('Image');
  const [addChildLinkAlias, setAddChildLinkAlias] = useState('Link');
  const [addChildLinkUrl, setAddChildLinkUrl] = useState('https://example.com');
  // List-specific (when adding a list child)
  const [addListItemType, setAddListItemType] = useState<AnyChildType>('string');
  const [addListStyle, setAddListStyle] = useState<ListStyle>('bulleted');

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
      content: [
        {
          type: 'pageComponent',
          attrs: {
            pageNumber: 1,
            size: 'A4',
            orientation: 'portrait',
            value: { components: [] }
          }
        }
      ],
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

  const insertTypedPlaceholder = useCallback(() => {
    const key = phKey.trim().replace(/\s+/g, '_');
    if (!key || !KEY_RE.test(key)) {
      setInsertError('Placeholder key is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }

    const attrs: Record<string, unknown> = {
      key,
      kind: phKind,
      value: '',
    };

    if (phKind === 'list') {
      attrs.style = normalizeListStyle(phListStyle);
      attrs.item_kind = phListItemKind;
    }

    if (phKind === 'container') {
      const slots = Number(phContainerSlots);
      const count = Number.isFinite(slots) && slots > 0 ? Math.floor(slots) : 2;
      attrs.component_kinds = Array.from({ length: count }, (_, index) => phContainerKinds[index] || 'string');
    }

    if (phKind === 'table' && parseCommaSeparated(phTableHeaders).length === 0) {
      setInsertError('Table placeholders require at least one header.');
      return;
    }

    if (phKind === 'table') {
      const headers = parseCommaSeparated(phTableHeaders);
      attrs.mode = phTableMode;
      attrs.headers = headers;

      if (phTableMode === 'row_data') {
        attrs.column_types = Object.fromEntries(
          headers.map((header) => [
            header,
            defaultSchemaForKind(phTableColumnKinds[header] || 'string'),
          ])
        );
      } else {
        attrs.row_types = Object.fromEntries(
          headers.map((header) => [
            header,
            defaultSchemaForKind(phTableRowKinds[header] || 'string'),
          ])
        );
      }
    }

    const result = editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'placeholder',
        attrs,
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
  }, [editor, phKey, phKind, phTableHeaders, phTableMode, phTableColumnKinds, phTableRowKinds, phListStyle, phListItemKind, phContainerSlots, phContainerKinds]);

  const insertImageComponent = useCallback(() => {
    try {
      const node = createImageComponent(
        {
          src: imageSrc.trim(),
          alt: imageAlt.trim(),
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

  // Legacy inline list/table components handled by the full modal stack

  /** ── Modal stack helpers ─────────────────────────────────── */
  const topModal = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
  const submodalOpen = modalStack.length > 0;

  const pushModal = useCallback((entry: Omit<ModalStackEntry, 'id' | 'children' | 'nextChildId' | 'error'>) => {
    setModalNextId(prev => {
      setModalStack(stack => [...stack, { ...entry, id: prev, children: [], nextChildId: 1, error: '' }]);
      return prev + 1;
    });
    setAddChildType('string');
    setAddChildValue('');
    setInsertPanel(null);
  }, []);

  const popModal = useCallback(() => {
    setModalStack(stack => stack.slice(0, -1));
  }, []);

  const updateTopModal = useCallback((updater: (entry: ModalStackEntry) => ModalStackEntry) => {
    setModalStack(stack => {
      if (stack.length === 0) return stack;
      const next = [...stack];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  const openSubmodal = useCallback((target: SubmodalTarget) => {
    const label = target.charAt(0).toUpperCase() + target.slice(1);
    pushModal({
      target,
      label,
      onConfirm: (children, extra) => {
        const components = children.map(c => childToComponentValue(c)) as ComponentValue[];
        const componentTypes = children.map(c => c.schema);
        try {
          if (target === 'container') {
            const node = createContainerComponent({ components }, { component_types: componentTypes });
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'page') {
            const node = createPageComponent({ components }, {
              component_types: componentTypes,
              pageNumber: extra?.pageNumber as number ?? 1,
              size: extra?.size as string ?? 'A4',
              orientation: extra?.orientation as string ?? 'portrait',
            });
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'header') {
            const node = createHeaderComponent({ components }, { component_types: componentTypes });
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'footer') {
            const node = createFooterComponent({ components }, { component_types: componentTypes });
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'list') {
            const items = components;
            const itemSchema = children.length > 0 ? children[0].schema : { kind: 'string' };
            const node = createListComponent(
              { items, style: (extra?.listStyle as ListStyle) || 'bulleted' } as any,
              { item_type: itemSchema as ComponentTypeSchema }
            );
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'table') {
            const tableMode = (extra?.tableMode as TableMode) ?? 'row_data';
            const tableCaption = extra?.tableCaption as string | undefined;
            if (tableMode === 'row_data') {
              const headers = (extra?.tableRowHeaders as string[] ?? []).map((h) => h.trim()).filter(Boolean);
              const rowRows = extra?.tableRowRows as string[][] ?? [];
              const rows = rowRows.map((row) => {
                const rowObj: Record<string, unknown> = {};
                headers.forEach((header, index) => { rowObj[header] = row[index] ?? ''; });
                return rowObj;
              });
              const node = createTableComponent({ mode: 'row_data', rows, caption: tableCaption } as any, { headers });
              editor?.chain().focus().insertContent(node as any).run();
            } else {
              const headers = (extra?.tableColRowHeaders as string[] ?? []).map((h) => h.trim()).filter(Boolean);
              const colNames = extra?.tableColNames as string[] ?? [];
              const colMatrix = extra?.tableColMatrix as string[][] ?? [];
              const columns = colNames.map((name, colIdx) => {
                const vals = colMatrix.map((row) => row[colIdx] ?? '');
                return [name, ...vals];
              });
              const node = createTableComponent({ mode: 'column_data', columns, caption: tableCaption } as any, { headers });
              editor?.chain().focus().insertContent(node as any).run();
            }
          } else if (target === 'list') {
            const items = children.map((c) => childToComponentValue(c));
            const itemSchema = children.length > 0 ? children[0].schema : { kind: 'string' };
            const node = createListComponent(
              { items, style: (extra?.listStyle as ListStyle) || 'bulleted' },
              { item_type: itemSchema as ComponentTypeSchema }
            );
            editor?.chain().focus().insertContent(node as any).run();
          } else if (target === 'table') {
            const tableMode = extra?.tableMode as TableMode ?? 'row_data';
            const tableCaption = extra?.tableCaption as string | undefined;
            if (tableMode === 'row_data') {
              const headers = (extra?.tableRowHeaders as string[] ?? []).map((h) => h.trim()).filter(Boolean);
              const rowRows = extra?.tableRowRows as string[][] ?? [];
              const rows = rowRows.map((row) => {
                const rowObj: Record<string, unknown> = {};
                headers.forEach((header, index) => { rowObj[header] = row[index] ?? ''; });
                return rowObj;
              });
              const node = createTableComponent({ mode: 'row_data', rows, caption: tableCaption }, { headers });
              editor?.chain().focus().insertContent(node as any).run();
            } else {
              const headers = (extra?.tableColRowHeaders as string[] ?? []).map((h) => h.trim()).filter(Boolean);
              const colNames = extra?.tableColNames as string[] ?? [];
              const colMatrix = extra?.tableColMatrix as string[][] ?? [];
              const columns = colNames.map((name, colIdx) => {
                const vals = colMatrix.map((row) => row[colIdx] ?? '');
                return [name, ...vals];
              });
              const node = createTableComponent({ mode: 'column_data', columns, caption: tableCaption }, { headers });
              editor?.chain().focus().insertContent(node as any).run();
            }
          }
        } catch (err) {
          // error handled at modal level
        }
      },
      // extra initial state per target
      ...(target === 'page' ? { pageSize: 'A4', pageOrientation: 'portrait' as const, pageNumber: 1 } : {}),
      ...(target === 'list' ? { listStyle: 'bulleted' as const, listItemType: 'string' as const } : {}),
      ...(target === 'table' ? {
        tableMode: 'row_data' as const,
        tableCaption: '',
        tableRowHeaders: ['Item', 'Qty'],
        tableRowRows: [['Pen', '2']],
        tableColRowHeaders: ['Q1', 'Q2'],
        tableColNames: ['Sales'],
        tableColMatrix: [['10'], ['12']],
      } : {}),
    });
  }, [editor, pushModal]);

  const closeSubmodal = useCallback(() => {
    setModalStack([]);
  }, []);

  const addPrimitiveChild = useCallback(() => {
    let value: unknown;
    let schema: ComponentTypeSchema;

    if (addChildType === 'string' || addChildType === 'integer') {
      if (!addChildValue.trim()) {
        updateTopModal(m => ({ ...m, error: 'Value cannot be empty.' }));
        return;
      }
      value = addChildValue.trim();
      schema = { kind: addChildType } as ComponentTypeSchema;
    } else if (addChildType === 'image') {
      if (!addChildImageSrc.trim()) {
        updateTopModal(m => ({ ...m, error: 'Image URL cannot be empty.' }));
        return;
      }
      value = { src: addChildImageSrc.trim(), alt: addChildImageAlt.trim() };
      schema = { kind: 'image' };
    } else if (addChildType === 'hyperlink') {
      if (!addChildLinkUrl.trim()) {
        updateTopModal(m => ({ ...m, error: 'Link URL cannot be empty.' }));
        return;
      }
      value = { alias: addChildLinkAlias.trim(), url: addChildLinkUrl.trim() };
      schema = { kind: 'hyperlink' };
    } else {
      return; // complex types handled by pushing a new modal
    }

    updateTopModal(m => ({
      ...m,
      children: [...m.children, { id: m.nextChildId, type: addChildType, value, schema }],
      nextChildId: m.nextChildId + 1,
      error: '',
    }));
    setAddChildValue('');
  }, [addChildType, addChildValue, addChildImageSrc, addChildImageAlt, addChildLinkAlias, addChildLinkUrl, updateTopModal]);

  const addComplexChild = useCallback((type: 'container' | 'list' | 'table') => {
    const parentLabel = topModal?.label || '';
    const childIdx = (topModal?.children.length ?? 0) + 1;

    if (type === 'container') {
      pushModal({
        target: 'container',
        label: `${parentLabel} > Container #${childIdx}`,
        onConfirm: (children) => {
          const components = children.map(c => childToComponentValue(c));
          const componentTypes = children.map(c => c.schema);
          const containerValue = { components };
          const containerSchema: ComponentTypeSchema = { kind: 'container', component_types: componentTypes };
          updateTopModal(m => ({
            ...m,
            children: [...m.children, { id: m.nextChildId, type: 'container', value: containerValue, schema: containerSchema }],
            nextChildId: m.nextChildId + 1,
            error: '',
          }));
        },
      });
    } else if (type === 'list') {
      // For list: push a modal that collects list items
      pushModal({
        target: 'container', // reuse container-like UI for collecting items
        label: `${parentLabel} > List #${childIdx}`,
        onConfirm: (children) => {
          const items = children.map(c => childToComponentValue(c));
          const itemSchema = children.length > 0 ? children[0].schema : { kind: 'string' as const };
          const tableMode = children[0]?.value && typeof children[0].value === 'object' && 'mode' in children[0].value ? (children[0].value as any).mode : 'row_data';

          let tableValue: unknown;
          if (tableMode === 'row_data') {
            const headers = extra?.tableRowHeaders as string[] ?? [];
            const rowRows = extra?.tableRowRows as string[][] ?? [];
            const rows = rowRows.map((row) => {
              const rowObj: Record<string, unknown> = {};
              headers.forEach((h, i) => { rowObj[h] = row[i] ?? ''; });
              return rowObj;
            });
            tableValue = { rows, mode: 'row_data', caption: extra?.tableCaption };
          } else {
            const headers = extra?.tableColRowHeaders as string[] ?? [];
            const colNames = extra?.tableColNames as string[] ?? [];
            const colMatrix = extra?.tableColMatrix as string[][] ?? [];
            const columns = colNames.map((name, colIdx) => [name, ...colMatrix.map(r => r[colIdx] ?? '')]);
            tableValue = { columns, mode: 'column_data', caption: extra?.tableCaption };
          }

          updateTopModal(m => ({
            ...m,
            children: [...m.children, { id: m.nextChildId, type: 'table', value: tableValue, schema: { kind: 'table' } }],
            nextChildId: m.nextChildId + 1,
            error: '',
          }));
        },
        tableMode: 'row_data',
        tableCaption: '',
        tableRowHeaders: ['Item', 'Qty'],
        tableRowRows: [['Pen', '2']],
        tableColRowHeaders: ['Q1', 'Q2'],
        tableColNames: ['Sales'],
        tableColMatrix: [['10'], ['12']],
      });
    }
  }, [topModal, pushModal, updateTopModal]);

  const removeModalChild = useCallback((id: number) => {
    updateTopModal(m => ({ ...m, children: m.children.filter(c => c.id !== id) }));
  }, [updateTopModal]);

  const moveModalChild = useCallback((id: number, direction: 'up' | 'down') => {
    updateTopModal(m => {
      const idx = m.children.findIndex(c => c.id === id);
      if (idx < 0) return m;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= m.children.length) return m;
      const next = [...m.children];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...m, children: next };
    });
  }, [updateTopModal]);

  const confirmTopModal = useCallback(() => {
    if (!topModal) return;
    if (topModal.children.length === 0) {
      updateTopModal(m => ({ ...m, error: 'Add at least one component.' }));
      return;
    }
    const extra = {
      pageNumber: topModal.pageNumber,
      size: topModal.pageSize,
      orientation: topModal.pageOrientation,
      listStyle: topModal.listStyle,
      tableMode: topModal.tableMode,
      tableCaption: topModal.tableCaption,
      tableRowHeaders: topModal.tableRowHeaders,
      tableRowRows: topModal.tableRowRows,
      tableColRowHeaders: topModal.tableColRowHeaders,
      tableColNames: topModal.tableColNames,
      tableColMatrix: topModal.tableColMatrix,
    };
    const onConfirm = topModal.onConfirm;
    const children = topModal.children;
    popModal();
    onConfirm(children, extra);
  }, [topModal, popModal, updateTopModal]);

  const insertPageBreak = useCallback(() => {
    editor?.chain().focus().insertContent({ type: 'pageBreakComponent' }).run();
  }, [editor]);

  /** Extracts the set of placeholder keys present in the current editor state. */
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

  // Legacy inline spreadsheet helpers removed in favor of topModal updates

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

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'list' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('list')} title="Insert list component">
          <Box size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'container' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('container')} title="Insert container component">
          <Layers size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'table' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('table')} title="Insert table component">
          <Table size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'page' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('page')} title="Insert page element">
          <File size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'header' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('header')} title="Insert header element">
          <PanelTop size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${submodalOpen && topModal?.target === 'footer' && modalStack.length === 1 ? ' pg-tb-active' : ''}`} onClick={() => openSubmodal('footer')} title="Insert footer element">
          <PanelBottom size={16} />
        </button>

        <button type="button" className="pg-tb-btn" onMouseDown={cmd(insertPageBreak)} title="Insert page break">
          <SeparatorHorizontal size={16} />
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
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">List style</label>
                    <select className="pg-input" value={phListStyle} onChange={(e) => setPhListStyle(e.target.value as ListStyle)}>
                      <option value="bulleted">bulleted</option>
                      <option value="numbered">numbered</option>
                      <option value="plain">plain</option>
                    </select>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">List item type</label>
                    <select className="pg-input" value={phListItemKind} onChange={(e) => setPhListItemKind(e.target.value as PlaceholderKind)}>
                      <option value="string">string</option>
                      <option value="integer">integer</option>
                      <option value="image">image</option>
                      <option value="hyperlink">hyperlink</option>
                    </select>
                  </div>
                </>
              )}

              {phKind === 'container' && (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Container slots</label>
                    <input className="pg-input" value={phContainerSlots} onChange={(e) => setPhContainerSlots(e.target.value)} placeholder="2" />
                  </div>
                  {Array.from({ length: Number.isFinite(Number(phContainerSlots)) && Number(phContainerSlots) > 0 ? Math.floor(Number(phContainerSlots)) : 2 }, (_, index) => (
                    <div className="pg-insert-row" key={`container-kind-${index}`}>
                      <label className="pg-label">Slot {index + 1} kind</label>
                      <select
                        className="pg-input"
                        value={phContainerKinds[index] || 'string'}
                        onChange={(e) => setPhContainerKinds((prev) => ({ ...prev, [index]: e.target.value as PlaceholderKind }))}
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="image">image</option>
                        <option value="hyperlink">hyperlink</option>
                      </select>
                    </div>
                  ))}
                </>
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

                  {parseCommaSeparated(phTableHeaders).length > 0 && (
                    <div className="pg-sheet-wrap" style={{ marginTop: 8 }}>
                      <div className="pg-sheet-toolbar">
                        <strong>
                          {phTableMode === 'row_data'
                            ? 'Column type for each header'
                            : 'Row type for each header'}
                        </strong>
                      </div>
                      <table className="pg-sheet-table">
                        <thead>
                          <tr>
                            <th>Header</th>
                            <th>Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseCommaSeparated(phTableHeaders).map((header) => (
                            <tr key={header}>
                              <td>{header}</td>
                              <td>
                                <select
                                  className="pg-input"
                                  value={
                                    phTableMode === 'row_data'
                                      ? (phTableColumnKinds[header] || 'string')
                                      : (phTableRowKinds[header] || 'string')
                                  }
                                  onChange={(e) => {
                                    const kind = e.target.value as PlaceholderKind;
                                    if (phTableMode === 'row_data') {
                                      setPhTableColumnKinds((prev) => ({ ...prev, [header]: kind }));
                                    } else {
                                      setPhTableRowKinds((prev) => ({ ...prev, [header]: kind }));
                                    }
                                  }}
                                >
                                  <option value="string">string</option>
                                  <option value="integer">integer</option>
                                  <option value="image">image</option>
                                  <option value="hyperlink">hyperlink</option>
                                  <option value="list">list</option>
                                  <option value="container">container</option>
                                  <option value="table">table</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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

          {/* Legacy inline insert panels removed. */}

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

      {/* ── Recursive Modal Stack ────────────────────────── */}
      {topModal && (
        <div
          className="pg-submodal-overlay"
          onClick={(e) => e.target === e.currentTarget && (modalStack.length === 1 ? closeSubmodal() : popModal())}
        >
          <div className="pg-submodal" role="dialog" aria-modal="true" aria-labelledby="submodal-title">
            <div className="pg-submodal-header">
              <div>
                <h2 className="pg-submodal-title" id="submodal-title">
                  Edit {topModal.label} Components
                </h2>
                {modalStack.length > 1 && (
                  <p className="pg-submodal-subtitle" style={{ fontFamily: 'var(--pg-font-mono)', fontSize: '11px', color: 'var(--pg-accent)' }}>
                    {modalStack.map(m => m.label).join(' › ')}
                  </p>
                )}
                <p className="pg-submodal-subtitle">
                  Add and arrange child components. Complex types open nested editors.
                </p>
              </div>
              <button className="pg-modal-close" onClick={() => modalStack.length === 1 ? closeSubmodal() : popModal()} aria-label="Close">✕</button>
            </div>

            <div className="pg-submodal-body">
              {/* Page-specific fields */}
              {topModal.target === 'page' && modalStack.length === 1 && (
                <div className="pg-submodal-page-fields">
                  <div className="pg-insert-row">
                    <label className="pg-label">Page Number</label>
                    <input className="pg-input" type="number" min="1" value={topModal.pageNumber ?? 1} onChange={(e) => updateTopModal(m => ({ ...m, pageNumber: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Size</label>
                    <select className="pg-input" value={topModal.pageSize ?? 'A4'} onChange={(e) => updateTopModal(m => ({ ...m, pageSize: e.target.value }))}>
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="Letter">Letter</option>
                    </select>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Orientation</label>
                    <select className="pg-input" value={topModal.pageOrientation ?? 'portrait'} onChange={(e) => updateTopModal(m => ({ ...m, pageOrientation: e.target.value as 'portrait' | 'landscape' }))}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Child component list */}
              <div className="pg-child-list">
                {topModal.children.length === 0 ? (
                  <div className="pg-child-list-empty">No components added yet. Use the form below to add children.</div>
                ) : (
                  topModal.children.map((child, idx) => (
                    <div className="pg-child-entry" key={child.id}>
                      <span className="pg-child-index">{idx + 1}</span>
                      <span className={`pg-child-type-badge pg-child-type-badge--${child.type}`}>{child.type}</span>
                      <span className="pg-child-preview">{childPreview(child)}</span>
                      <div className="pg-child-actions">
                        <button type="button" className="pg-child-action-btn" title="Move up" disabled={idx === 0} onClick={() => moveModalChild(child.id, 'up')}>
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="pg-child-action-btn" title="Move down" disabled={idx === topModal.children.length - 1} onClick={() => moveModalChild(child.id, 'down')}>
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" className="pg-child-action-btn danger" title="Remove" onClick={() => removeModalChild(child.id)}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add child form */}
              <div className="pg-add-child-section">
                <div className="pg-add-child-header">
                  <Plus size={14} />
                  <label className="pg-label">Type</label>
                  <select className="pg-input" value={addChildType} onChange={(e) => { setAddChildType(e.target.value as AnyChildType); updateTopModal(m => ({ ...m, error: '' })); }} style={{ maxWidth: 160 }}>
                    {ALL_CHILD_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="pg-add-child-body">
                  {(addChildType === 'string' || addChildType === 'integer') && (
                    <div className="pg-insert-row">
                      <label className="pg-label">Value</label>
                      <input className="pg-input" value={addChildValue} onChange={(e) => setAddChildValue(e.target.value)} placeholder={addChildType === 'integer' ? '42' : 'Text content'} />
                    </div>
                  )}
                  {addChildType === 'image' && (
                    <>
                      <div className="pg-insert-row">
                        <label className="pg-label">Image URL</label>
                        <input className="pg-input" value={addChildImageSrc} onChange={(e) => setAddChildImageSrc(e.target.value)} />
                      </div>
                      <div className="pg-insert-row">
                        <label className="pg-label">Alt text</label>
                        <input className="pg-input" value={addChildImageAlt} onChange={(e) => setAddChildImageAlt(e.target.value)} />
                      </div>
                    </>
                  )}
                  {addChildType === 'hyperlink' && (
                    <>
                      <div className="pg-insert-row">
                        <label className="pg-label">Alias</label>
                        <input className="pg-input" value={addChildLinkAlias} onChange={(e) => setAddChildLinkAlias(e.target.value)} />
                      </div>
                      <div className="pg-insert-row">
                        <label className="pg-label">URL</label>
                        <input className="pg-input" value={addChildLinkUrl} onChange={(e) => setAddChildLinkUrl(e.target.value)} />
                      </div>
                    </>
                  )}
                  {(addChildType === 'container' || addChildType === 'list' || addChildType === 'table') && (
                    <div style={{ padding: '8px 0', color: 'var(--pg-text-muted)', fontSize: '12px' }}>
                      Click "Add" to open a nested editor for this {addChildType}.
                    </div>
                  )}
                </div>
                <div className="pg-add-child-actions">
                  {(addChildType === 'string' || addChildType === 'integer' || addChildType === 'image' || addChildType === 'hyperlink') && (
                    <button type="button" className="pg-btn-primary" onClick={addPrimitiveChild}>Add Component</button>
                  )}
                  {(addChildType === 'container' || addChildType === 'list' || addChildType === 'table') && (
                    <button type="button" className="pg-btn-primary" onClick={() => addComplexChild(addChildType)}>Add {addChildType.charAt(0).toUpperCase() + addChildType.slice(1)}…</button>
                  )}
                </div>
              </div>

              {topModal.error && <p className="pg-field-error">{topModal.error}</p>}
            </div>

            <div className="pg-submodal-footer">
              <button type="button" className="pg-btn-ghost" onClick={() => modalStack.length === 1 ? closeSubmodal() : popModal()}>
                {modalStack.length === 1 ? 'Cancel' : '← Back'}
              </button>
              <button type="button" className="pg-btn-primary" onClick={confirmTopModal}>
                {modalStack.length === 1
                  ? `Insert ${topModal.label}`
                  : `Confirm ${topModal.label}`}
              </button>
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

'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { generateHTML } from '@tiptap/html';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  FileImage,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Redo,
  SeparatorHorizontal,
  Strikethrough,
  Table,
  Undo,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Placeholder } from '@/lib/tiptap/placeholder';
import {
  ComponentExtensions,
  createHyperlinkComponent,
  createImageComponent,
  createTableComponent,
  deriveSchemaFromChildren,
  validateContainerAttrs,
  validateFooterAttrs,
  validateHeaderAttrs,
  validateHyperlinkAttrs,
  validateImageAttrs,
  validateListAttrs,
  validatePageAttrs,
  validatePlaceholderAttrs,
  validateTableAttrs,
} from '@/lib/tiptap/extensions';
import { fileToDataUrl } from '@/lib/image-utils';
import { ComponentTypeSchema, CustomPlaceholderItemSchema, ListStyle, TableMode } from '@/types/template';

interface TemplateEditorProps {
  initialContent?: Record<string, unknown>;
  onChange: (json: Record<string, unknown>) => void;
  onValidationChange?: (state: { isValid: boolean; errors: string[] }) => void;
  hasError?: boolean;
}

type InsertPanel = 'placeholder' | 'image' | 'hyperlink' | 'table' | null;
type PlaceholderKind = ComponentTypeSchema['kind'];
type DynamicItemKind = 'string' | 'integer' | 'image' | 'hyperlink' | 'list' | 'table' | 'repeat' | 'custom';
type CustomLayoutNodeKind = 'text' | 'token' | 'newline';
type TokenKind = 'string' | 'integer' | 'image' | 'hyperlink' | 'list' | 'table';

/** A typed token in the token library. Can be string, list, table, etc. */
interface TokenLibraryItemDraft {
  id: string;
  label: string;
  kind: TokenKind; // not 'custom' or 'repeat'
  // For list tokens
  itemType?: TokenKind; // list item type
  listStyle?: 'bulleted' | 'numbered' | 'plain';
  // For table tokens
  tableMode?: 'row_data' | 'column_data';
  tableHeaders?: string[];
  dynamicHeaders?: boolean;
  // For nesting (complex tokens)
  nestedTokens?: TokenLibraryItemDraft[];
}

/** @deprecated Use TokenLibraryItemDraft for new token library items */
interface CustomTokenDraft {
  id: string;
  label: string;
  kind: DynamicItemKind;
}

/** @deprecated Use TokenLibraryItemDraft instead */
interface CustomPlaceholderItemDraft {
  id: string;
  label: string;
  kind: DynamicItemKind;
  tokens: CustomTokenDraft[];
  tokenIdDraft: string;
  tokenLabelDraft: string;
  tokenKindDraft: DynamicItemKind;
  layoutNodes: CustomLayoutNodeDraft[];
  layoutTemplate: string;
}

interface CustomLayoutNodeDraft {
  id: string;
  kind: CustomLayoutNodeKind;
  value: string;
  tokenId?: string;
  prefix?: string;
  suffix?: string;
}

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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

function normalizeIdentifierDraft(input: string): string {
  return input.trim().replace(/\s+/g, '_');
}

function defaultHeaderName(index: number): string {
  return `Column_${index + 1}`;
}

function alignMatrixToHeaders(headers: string[], current: string[][]): string[][] {
  if (headers.length === 0) return [];
  if (current.length === 0) {
    return [headers.map(() => '')];
  }
  return current.map((row) => {
    const next = headers.map((_, idx) => row[idx] ?? '');
    return next;
  });
}

function normalizeListStyle(style: string): ListStyle {
  return style === 'numbered' || style === 'plain' ? style : 'bulleted';
}

function buildLayoutTokens(baseVariable: string, fields: string[]): string[] {
  const safeBase = KEY_RE.test(baseVariable.trim()) ? baseVariable.trim() : 'item';
  const normalizedFields = unique(fields.map((field) => normalizeIdentifierDraft(field)).filter(Boolean));
  return unique([
    `{{${safeBase}}}`,
    ...normalizedFields.map((field) => `{{${safeBase}.${field}}}`),
  ]);
}

function insertTokenIntoTemplate(current: string, token: string): string {
  if (current.trim() === '') {
    return token;
  }

  if (current.endsWith('\n')) {
    return `${current}${token}`;
  }

  return `${current} ${token}`;
}

function createCustomLayoutNode(kind: CustomLayoutNodeKind, value: string, tokenId?: string): CustomLayoutNodeDraft {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    kind,
    value,
    tokenId,
  };
}

/** Create a new typed token for the token library */
function createTokenLibraryItem(id: string, kind: TokenKind, label?: string): TokenLibraryItemDraft {
  return {
    id,
    label: label || id,
    kind,
  };
}

function createCustomTokenDraft(id: string, label: string, kind: DynamicItemKind): CustomTokenDraft {
  return { id, label, kind };
}

function createCustomPlaceholderItemDraft(id: string): CustomPlaceholderItemDraft {
  const tokenId = 'value';

  return {
    id,
    label: id,
    kind: 'custom',
    tokens: [createCustomTokenDraft(tokenId, 'Value', 'string')],
    tokenIdDraft: '',
    tokenLabelDraft: '',
    tokenKindDraft: 'string',
    layoutNodes: [createCustomLayoutNode('token', '', tokenId)],
    layoutTemplate: `{{${id}.${tokenId}}}`,
  };
}

function buildCustomLayoutTemplate(baseVariable: string, nodes: CustomLayoutNodeDraft[]): string {
  const safeBase = KEY_RE.test(baseVariable.trim()) ? baseVariable.trim() : 'item';
  return nodes
    .map((node) => {
      if (node.kind === 'newline') return '\n';
      if (node.kind === 'text') return node.value;
      if (!node.tokenId) return '';
      const tokenPart = `{{${safeBase}.${node.tokenId}}}`;
      return `${node.prefix || ''}${tokenPart}${node.suffix || ''}`;
    })
    .join('');
}

function toCustomLayoutSchemaNodes(nodes: CustomLayoutNodeDraft[]) {
  return nodes.map((node) => {
    if (node.kind === 'newline') return { kind: 'newline' as const };
    if (node.kind === 'text') return { kind: 'text' as const, value: node.value };
    return {
      kind: 'token' as const,
      token_id: node.tokenId || '',
      ...(node.prefix ? { prefix: node.prefix } : {}),
      ...(node.suffix ? { suffix: node.suffix } : {}),
    };
  });
}

function applyTemplatePreview(template: string, baseVariable: string, fields: string[]): string {
  if (!template.trim()) {
    return '';
  }

  const safeBase = KEY_RE.test(baseVariable.trim()) ? baseVariable.trim() : 'item';
  const values = Object.fromEntries(fields.map((field, idx) => [field, `${field}_${idx + 1}`]));

  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g, (_, token: string) => {
    if (token === safeBase) {
      return JSON.stringify(values);
    }

    const prefix = `${safeBase}.`;
    if (token.startsWith(prefix)) {
      const key = token.slice(prefix.length);
      return key in values ? String(values[key]) : '';
    }

    return '';
  });
}

function defaultSchemaForKind(kind: PlaceholderKind): ComponentTypeSchema {
  if (kind === 'string' || kind === 'integer' || kind === 'image' || kind === 'hyperlink') {
    return { kind } as ComponentTypeSchema;
  }

  if (kind === 'custom') {
    return {
      kind: 'custom',
      base_variable: 'item',
      value_type: { kind: 'string' },
      layout_template: '{{item}}',
      repeat: false,
    };
  }

  if (kind === 'list') {
    return { kind: 'list', item_type: { kind: 'string' } };
  }

  if (kind === 'repeat') {
    return { kind: 'repeat', item_type: { kind: 'string' } };
  }

  if (kind === 'container') {
    return { kind: 'container', component_types: [{ kind: 'string' }] };
  }

  if (kind === 'page_break') {
    return { kind: 'page_break' };
  }

  return { kind: 'table' };
}

function walkTiptapJson(node: Record<string, any>, visit: (n: Record<string, any>) => void) {
  visit(node);
  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => walkTiptapJson(child, visit));
  }
}

function collectValidationErrors(documentJson: Record<string, any>): string[] {
  const errors: string[] = [];
  const placeholderSchemaFingerprint = new Map<string, string>();

  walkTiptapJson(documentJson, (node) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

    const attrs = (node.attrs || {}) as Record<string, unknown>;

    if (node.type === 'placeholder') {
      const err = validatePlaceholderAttrs(attrs);
      if (err) errors.push(`placeholder: ${err}`);

      const key = typeof attrs.key === 'string' ? attrs.key.trim() : '';
      if (!KEY_RE.test(key)) {
        errors.push(`placeholder: invalid key '${key}'`);
      }

      const kind = typeof attrs.kind === 'string'
        ? attrs.kind
        : (typeof attrs.schema === 'object' && attrs.schema && 'kind' in (attrs.schema as Record<string, unknown>)
          ? String((attrs.schema as Record<string, unknown>).kind)
          : 'string');

      const schema = deriveSchemaFromChildren(kind, attrs, node.content);

      if (schema.kind === 'list' && !schema.item_type) {
        errors.push(`placeholder '${key}': list requires item_type`);
      }

      if (schema.kind === 'container' && schema.mode !== 'repeat' && (!Array.isArray(schema.component_types) || schema.component_types.length === 0)) {
        errors.push(`placeholder '${key}': tuple container requires component_types`);
      }

      if (schema.kind === 'table' && schema.mode !== undefined && schema.mode !== 'row_data' && schema.mode !== 'column_data') {
        errors.push(`placeholder '${key}': table mode must be row_data or column_data`);
      }

      const fingerprint = JSON.stringify({
        kind,
        schema,
      });

      if (key) {
        const existing = placeholderSchemaFingerprint.get(key);
        if (existing && existing !== fingerprint) {
          errors.push(`placeholder '${key}': duplicate key with conflicting schema`);
        }
        placeholderSchemaFingerprint.set(key, fingerprint);
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

    if (node.type === 'tableComponent') {
      const err = validateTableAttrs(attrs);
      if (err) errors.push(`tableComponent: ${err}`);
    }

    if (node.type === 'containerComponent') {
      const err = validateContainerAttrs(attrs);
      if (err) errors.push(`containerComponent: ${err}`);
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
  const [insertPanel, setInsertPanel] = useState<InsertPanel>(null);
  const [insertError, setInsertError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedBlockStyle, setSelectedBlockStyle] = useState<'paragraph' | 'h1' | 'h2' | 'h3'>('paragraph');

  const [phKey, setPhKey] = useState('');
  const [phKind, setPhKind] = useState<PlaceholderKind>('string');
  const [phListStyle, setPhListStyle] = useState<ListStyle>('bulleted');
  const [phListItemKind, setPhListItemKind] = useState<DynamicItemKind>('string');
  const [phRepeatItemKind, setPhRepeatItemKind] = useState<DynamicItemKind>('string');
  const [phRepeatMinItems, setPhRepeatMinItems] = useState('');
  const [phRepeatMaxItems, setPhRepeatMaxItems] = useState('');
  const [phRepeatBaseVariable, setPhRepeatBaseVariable] = useState('item');
  const [phRepeatLayoutTemplate, setPhRepeatLayoutTemplate] = useState('');
  const [phRepeatLayoutFields, setPhRepeatLayoutFields] = useState<string[]>(['name', 'value']);
  const [phRepeatLayoutFieldDraft, setPhRepeatLayoutFieldDraft] = useState('');
  const [phCustomItems, setPhCustomItems] = useState<CustomPlaceholderItemDraft[]>([]);
  const [phCustomItemIdDraft, setPhCustomItemIdDraft] = useState('');
  const [phCustomItemLabelDraft, setPhCustomItemLabelDraft] = useState('');
  const [phCustomSelectedItemId, setPhCustomSelectedItemId] = useState('');
  const [phCustomItemFilter, setPhCustomItemFilter] = useState('');
  const [phCustomTokenKindDraft, setPhCustomTokenKindDraft] = useState<TokenKind>('string');
  const [phCustomTokenFilter, setPhCustomTokenFilter] = useState('');
  const [phCustomTemplate, setPhCustomTemplate] = useState('');
  const [phCustomLayoutNodes, setPhCustomLayoutNodes] = useState<CustomLayoutNodeDraft[]>([]);
  const [phCustomRepeat, setPhCustomRepeat] = useState(false);
  const customTokenDragRef = useRef<string | null>(null);
  const customItemTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const customPlaceholderTemplateRef = useRef<HTMLTextAreaElement | null>(null);

  const repeatLayoutTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [phTableMode, setPhTableMode] = useState<TableMode>('row_data');
  const [phTableHeaders, setPhTableHeaders] = useState<string[]>(['Item', 'Qty']);
  const [phTableHeaderDraft, setPhTableHeaderDraft] = useState('');
  const [phTableColumnKinds, setPhTableColumnKinds] = useState<Record<string, PlaceholderKind>>({});
  const [phTableRowKinds, setPhTableRowKinds] = useState<Record<string, PlaceholderKind>>({});

  const [imageSrc, setImageSrc] = useState('https://example.com/logo.png');
  const [imageAlt, setImageAlt] = useState('Logo');

  const [linkAlias, setLinkAlias] = useState('Documentation');
  const [linkUrl, setLinkUrl] = useState('https://example.com/docs');

  const [tableMode, setTableMode] = useState<TableMode>('row_data');
  const [tableCaption, setTableCaption] = useState('');
  const [tableHeaders, setTableHeaders] = useState<string[]>(['Item', 'Qty']);
  const [tableHeaderDraft, setTableHeaderDraft] = useState('');
  const [tableRows, setTableRows] = useState<string[][]>([['Pen', '2'], ['Paper', '5']]);
  const [tableColumnNames, setTableColumnNames] = useState<string[]>(['Sales']);
  const [tableColumnNameDraft, setTableColumnNameDraft] = useState('');
  const [tableColumnRowHeaders, setTableColumnRowHeaders] = useState<string[]>(['Q1', 'Q2']);
  const [tableColumnRowHeaderDraft, setTableColumnRowHeaderDraft] = useState('');
  const [tableColumnMatrix, setTableColumnMatrix] = useState<string[][]>([['1200'], ['2400']]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder,
      ...ComponentExtensions,
    ],
    content: initialContent ?? {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start writing your template…' }] }],
    },
    onCreate({ editor: ed }) {
      const json = ed.getJSON();
      onChange(json);
      const errors = collectValidationErrors(json as Record<string, any>);
      setValidationErrors(errors);
      onValidationChange?.({ isValid: errors.length === 0, errors });
    },
    onUpdate({ editor: ed }) {
      const json = ed.getJSON();
      onChange(json);
      const errors = collectValidationErrors(json as Record<string, any>);
      setValidationErrors(errors);
      onValidationChange?.({ isValid: errors.length === 0, errors });

      if (ed.isActive('heading', { level: 1 })) setSelectedBlockStyle('h1');
      else if (ed.isActive('heading', { level: 2 })) setSelectedBlockStyle('h2');
      else if (ed.isActive('heading', { level: 3 })) setSelectedBlockStyle('h3');
      else setSelectedBlockStyle('paragraph');
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'pg-prosemirror',
        spellcheck: 'false',
      },
    },
  });

  useEffect(() => () => {
    editor?.destroy();
  }, [editor]);

  const active = (name: string, opts?: object) => (editor?.isActive(name, opts) ? ' pg-tb-active' : '');
  const activeAlign = (align: 'left' | 'center' | 'right' | 'justify') => (editor?.isActive({ textAlign: align }) ? ' pg-tb-active' : '');

  const cmd = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };

  const placeholderMeta = useMemo(() => {
    if (!editor) return [] as Array<{ key: string; kind: string }>;
    const result: Array<{ key: string; kind: string }> = [];
    const seen = new Set<string>();
    const json = editor.getJSON() as Record<string, any>;

    walkTiptapJson(json, (node) => {
      if (node.type !== 'placeholder') return;
      const key = typeof node.attrs?.key === 'string' ? node.attrs.key : '';
      const kind = typeof node.attrs?.schema?.kind === 'string'
        ? node.attrs.schema.kind
        : typeof node.attrs?.kind === 'string'
          ? node.attrs.kind
          : 'string';
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push({ key, kind });
    });

    return result.sort((a, b) => a.key.localeCompare(b.key));
  }, [editor?.state]);

  const metrics = useMemo(() => {
    if (!editor) return { words: 0, characters: 0 };
    const text = editor.getText().trim();
    const words = text ? text.split(/\s+/).length : 0;
    return { words, characters: text.length };
  }, [editor?.state]);

  const repeatLayoutFields = useMemo(
    () => unique(phRepeatLayoutFields.map((field) => normalizeIdentifierDraft(field)).filter(Boolean)),
    [phRepeatLayoutFields]
  );

  const repeatLayoutTokens = useMemo(
    () => buildLayoutTokens(phRepeatBaseVariable, repeatLayoutFields),
    [phRepeatBaseVariable, repeatLayoutFields]
  );

  const repeatLayoutPreview = useMemo(
    () => applyTemplatePreview(phRepeatLayoutTemplate, phRepeatBaseVariable, repeatLayoutFields),
    [phRepeatLayoutTemplate, phRepeatBaseVariable, repeatLayoutFields]
  );

  const selectedCustomItem = useMemo(
    () => (phCustomItems.find((item) => item.id === phCustomSelectedItemId) as TokenLibraryItemDraft | undefined) || null,
    [phCustomItems, phCustomSelectedItemId]
  );

  const filteredCustomItems = useMemo(() => {
    const query = phCustomItemFilter.trim().toLowerCase();
    if (!query) return phCustomItems;
    return phCustomItems.filter((item) => item.id.toLowerCase().includes(query) || (item.label && item.label.toLowerCase().includes(query)));
  }, [phCustomItems, phCustomItemFilter]);

  const insertTokenAtCursor = useCallback((target: 'repeat' | 'custom', token: string) => {
    const textarea = target === 'repeat' ? repeatLayoutTextareaRef.current : null;

    if (!textarea) {
      if (target === 'repeat') {
        setPhRepeatLayoutTemplate((prev) => insertTokenIntoTemplate(prev, token));
      }
      return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const current = textarea.value;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    const caret = start + token.length;

    if (target === 'repeat') {
      setPhRepeatLayoutTemplate(next);
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }, []);

  const addRepeatLayoutField = useCallback(() => {
    const next = normalizeIdentifierDraft(phRepeatLayoutFieldDraft);
    if (!next) return;
    if (!KEY_RE.test(next)) {
      setInsertError('Repeat field id is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }
    setPhRepeatLayoutFields((prev) => unique([...prev, next]));
    setPhRepeatLayoutFieldDraft('');
    setInsertError('');
  }, [phRepeatLayoutFieldDraft]);

  const removeRepeatLayoutField = useCallback((field: string) => {
    setPhRepeatLayoutFields((prev) => prev.filter((item) => item !== field));
  }, []);

  const addPlaceholderTableHeader = useCallback(() => {
    const next = normalizeIdentifierDraft(phTableHeaderDraft);
    if (!next) return;
    if (!KEY_RE.test(next)) {
      setInsertError('Table header id is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }
    setPhTableHeaders((prev) => {
      if (prev.includes(next)) return prev;
      return [...prev, next];
    });
    setPhTableHeaderDraft('');
    setInsertError('');
  }, [phTableHeaderDraft]);

  const removePlaceholderTableHeader = useCallback((header: string) => {
    setPhTableHeaders((prev) => prev.filter((item) => item !== header));
    setPhTableColumnKinds((prev) => {
      const next = { ...prev };
      delete next[header];
      return next;
    });
    setPhTableRowKinds((prev) => {
      const next = { ...prev };
      delete next[header];
      return next;
    });
  }, []);

  const addTableHeader = useCallback(() => {
    const nextHeader = normalizeIdentifierDraft(tableHeaderDraft);
    if (!nextHeader) return;
    if (!KEY_RE.test(nextHeader)) {
      setInsertError('Table header id is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }
    setTableHeaders((prev) => {
      if (prev.includes(nextHeader)) return prev;
      return [...prev, nextHeader];
    });
    setTableRows((prev) => alignMatrixToHeaders([...tableHeaders, nextHeader], prev));
    setTableHeaderDraft('');
    setInsertError('');
  }, [tableHeaderDraft, tableHeaders]);

  const removeTableHeader = useCallback((header: string) => {
    setTableHeaders((prevHeaders) => {
      const nextHeaders = prevHeaders.filter((item) => item !== header);
      setTableRows((prevRows) => {
        const headerIndex = prevHeaders.indexOf(header);
        if (headerIndex < 0) return prevRows;
        return prevRows.map((row) => row.filter((_, idx) => idx !== headerIndex));
      });
      return nextHeaders.length > 0 ? nextHeaders : [defaultHeaderName(0)];
    });
  }, []);

  const updateTableCell = useCallback((rowIndex: number, columnIndex: number, nextValue: string) => {
    setTableRows((prev) => prev.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const nextRow = [...row];
      nextRow[columnIndex] = nextValue;
      return nextRow;
    }));
  }, []);

  const addTableRow = useCallback(() => {
    setTableRows((prev) => [...prev, tableHeaders.map(() => '')]);
  }, [tableHeaders]);

  const removeTableRow = useCallback((rowIndex: number) => {
    setTableRows((prev) => {
      const next = prev.filter((_, idx) => idx !== rowIndex);
      return next.length > 0 ? next : [tableHeaders.map(() => '')];
    });
  }, [tableHeaders]);

  const addCustomItem = useCallback(() => {
    const nextId = phCustomItemIdDraft.trim().replace(/\s+/g, '_');
    if (!KEY_RE.test(nextId)) {
      setInsertError('Token id is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }
    if (phCustomItems.some((item) => item.id === nextId)) {
      setInsertError(`Token '${nextId}' already exists.`);
      return;
    }

    const newToken: TokenLibraryItemDraft = {
      id: nextId,
      label: phCustomItemLabelDraft.trim() || nextId,
      kind: phCustomTokenKindDraft,
    };

    setPhCustomItems((prev) => [...prev, newToken as any]);
    setPhCustomSelectedItemId(nextId);
    setPhCustomItemIdDraft('');
    setPhCustomItemLabelDraft('');
    setPhCustomTokenKindDraft('string');
    setInsertError('');
  }, [phCustomItemIdDraft, phCustomItemLabelDraft, phCustomTokenKindDraft, phCustomItems]);

  const updateCustomItem = useCallback((itemId: string, patch: Partial<TokenLibraryItemDraft>) => {
    setPhCustomItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, ...patch };
    }) as any);
  }, []);

  const moveCustomItem = useCallback((itemId: string, direction: 'up' | 'down') => {
    setPhCustomItems((prev) => {
      const index = prev.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeCustomItem = useCallback((itemId: string) => {
    setPhCustomItems((prev) => prev.filter((item) => item.id !== itemId));
    setPhCustomLayoutNodes((prev) => prev.filter((node) => node.kind !== 'token' || node.tokenId !== itemId));
    setPhCustomSelectedItemId((prev) => (prev === itemId ? '' : prev));
  }, []);

  const duplicateCustomItem = useCallback((itemId: string) => {
    setPhCustomItems((prev) => {
      const source = prev.find((item) => item.id === itemId) as TokenLibraryItemDraft;
      if (!source) return prev;

      let suffix = 2;
      let nextId = `${source.id}_${suffix}`;
      const ids = new Set(prev.map((item) => item.id));
      while (ids.has(nextId)) {
        suffix += 1;
        nextId = `${source.id}_${suffix}`;
      }

      const cloned: TokenLibraryItemDraft = {
        ...source,
        id: nextId,
        label: source.label ? `${source.label} Copy` : `${nextId}`,
      };

      setPhCustomSelectedItemId(nextId);
      return [...prev, cloned as any];
    });
  }, []);

  const insertCustomPlaceholderTokenSet = useCallback((tokenId: string) => {
    const tokenText = `{{${tokenId}}}`;
    const textarea = customPlaceholderTemplateRef.current;
    if (!textarea) {
      setPhCustomTemplate((prev) => insertTokenIntoTemplate(prev, tokenText));
      return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const nextTemplate = `${textarea.value.slice(0, start)}${tokenText}${textarea.value.slice(end)}`;
    const caret = start + tokenText.length;
    setPhCustomTemplate(nextTemplate);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }, []);

  const appendCustomNode = useCallback((kind: CustomLayoutNodeKind, tokenId?: string) => {
    setPhCustomLayoutNodes((prev) => [...prev, createCustomLayoutNode(kind, kind === 'newline' ? '\n' : '', tokenId)]);
  }, []);

  const handleCustomItemDragStart = useCallback((tokenId: string) => {
    customTokenDragRef.current = tokenId;
  }, []);

  const handleCustomLayoutDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const tokenId = customTokenDragRef.current;
    if (tokenId) {
      appendCustomNode('token', tokenId);
    }
    customTokenDragRef.current = null;
  }, [appendCustomNode]);

  const updateCustomNode = useCallback((id: string, patch: Partial<CustomLayoutNodeDraft>) => {
    setPhCustomLayoutNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  }, []);

  const removeCustomNode = useCallback((id: string) => {
    setPhCustomLayoutNodes((prev) => {
      const next = prev.filter((node) => node.id !== id);
      return next.length > 0 ? next : [createCustomLayoutNode('text', '')];
    });
  }, []);

  const moveCustomNode = useCallback((id: string, direction: 'up' | 'down') => {
    setPhCustomLayoutNodes((prev) => {
      const index = prev.findIndex((node) => node.id === id);
      if (index === -1) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const openPreview = useCallback(() => {
    if (!editor) return;
    try {
      setPreviewHtml(generateHTML(editor.getJSON(), [
        StarterKit,
        Highlight,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Placeholder,
        ...ComponentExtensions,
      ]));
    } catch {
      setPreviewHtml('<p>Unable to render preview.</p>');
    }
    setIsPreviewOpen(true);
  }, [editor]);

  const insertTypedPlaceholder = useCallback(() => {
    if (!editor) return;

    const key = phKey.trim().replace(/\s+/g, '_');
    if (!KEY_RE.test(key)) {
      setInsertError('Placeholder key is invalid. Use letters/digits/underscore and start with letter or _.');
      return;
    }

    const attrs: Record<string, unknown> = { key, kind: phKind, value: '' };
    let schema: ComponentTypeSchema = defaultSchemaForKind(phKind);

    if (phKind === 'list') {
      schema = {
        kind: 'list',
        item_type: defaultSchemaForKind(phListItemKind),
        style: normalizeListStyle(phListStyle),
      };
    }

    if (phKind === 'repeat') {
      const minItems = phRepeatMinItems.trim() === '' ? undefined : Number(phRepeatMinItems);
      const maxItems = phRepeatMaxItems.trim() === '' ? undefined : Number(phRepeatMaxItems);
      const baseVariable = phRepeatBaseVariable.trim() || 'item';
      const layoutTemplate = phRepeatLayoutTemplate.trim();

      if (minItems !== undefined && (!Number.isFinite(minItems) || minItems < 0)) {
        setInsertError('Repeat min items must be a non-negative number.');
        return;
      }

      if (maxItems !== undefined && (!Number.isFinite(maxItems) || maxItems < 0)) {
        setInsertError('Repeat max items must be a non-negative number.');
        return;
      }

      if (!KEY_RE.test(baseVariable)) {
        setInsertError('Repeat base variable is invalid. Use letters/digits/underscore and start with letter or _.');
        return;
      }

      schema = {
        kind: 'repeat',
        item_type: defaultSchemaForKind(phRepeatItemKind),
        ...(minItems !== undefined ? { min_items: Math.floor(minItems) } : {}),
        ...(maxItems !== undefined ? { max_items: Math.floor(maxItems) } : {}),
        ...(baseVariable ? { base_variable: baseVariable } : {}),
        ...(layoutTemplate ? { layout_template: layoutTemplate } : {}),
      };
    }

    if (phKind === 'custom') {
      const placeholderTemplate = phCustomTemplate.trim();

      if (phCustomItems.length === 0) {
        setInsertError('Custom placeholders require at least one token in the token library.');
        return;
      }

      if (!placeholderTemplate) {
        setInsertError('Custom placeholder template is required.');
        return;
      }

      // Convert token library items to schema
      const tokenLibrarySchema: any[] = phCustomItems.map((token) => {
        const schemaBase: any = {
          id: token.id,
          ...(token.label.trim() ? { label: token.label.trim() } : {}),
          kind: token.kind,
        };

        // Add type-specific attributes
        if (token.kind === 'list') {
          schemaBase.item_type = token.itemType ? defaultSchemaForKind(token.itemType as any) : { kind: 'string' };
          if (token.listStyle) schemaBase.style = token.listStyle;
        }

        if (token.kind === 'table') {
          if (token.tableMode) schemaBase.mode = token.tableMode;
          if (token.tableHeaders && token.tableHeaders.length > 0) schemaBase.headers = token.tableHeaders;
          if (token.dynamicHeaders !== undefined) schemaBase.dynamic_headers = token.dynamicHeaders;
        }

        return schemaBase;
      });

      schema = {
        kind: 'custom',
        base_variable: 'token',
        value_type: defaultSchemaForKind('string'),
        layout_template: placeholderTemplate,
        repeat: phCustomRepeat,
        token_library: tokenLibrarySchema,
      };
    }

    if (phKind === 'table') {
      const headers = phTableHeaders.map((header) => normalizeIdentifierDraft(header)).filter(Boolean);
      const baseTableSchema: ComponentTypeSchema = {
        kind: 'table',
        mode: phTableMode,
        dynamic_headers: headers.length === 0,
        ...(headers.length > 0 ? { headers } : {}),
      };

      if (phTableMode === 'row_data') {
        schema = {
          ...baseTableSchema,
          kind: 'table',
          column_types: Object.fromEntries(
          headers.map((header) => [header, defaultSchemaForKind(phTableColumnKinds[header] || 'string')])
          ),
        };
      } else {
        schema = {
          ...baseTableSchema,
          kind: 'table',
          row_types: Object.fromEntries(
          headers.map((header) => [header, defaultSchemaForKind(phTableRowKinds[header] || 'string')])
          ),
        };
      }
    }

    attrs.schema = schema;

    const ok = editor
      .chain()
      .focus()
      .insertContent({
        type: 'placeholder',
        attrs,
        content: [{ type: 'text', text: key }],
      })
      .run();

    if (!ok) {
      setInsertError('Failed to insert placeholder.');
      return;
    }

    setPhKey('');
    setInsertError('');
    setInsertPanel(null);
  }, [editor, phKey, phKind, phListStyle, phListItemKind, phRepeatItemKind, phRepeatMinItems, phRepeatMaxItems, phRepeatBaseVariable, phRepeatLayoutTemplate, phCustomTemplate, phCustomRepeat, phCustomItems, phTableHeaders, phTableMode, phTableColumnKinds, phTableRowKinds]);

  const insertImageComponent = useCallback(() => {
    try {
      const node = createImageComponent({ src: imageSrc.trim(), alt: imageAlt.trim() }, {});
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid image component');
    }
  }, [editor, imageSrc, imageAlt]);

  const handleImageFileSelection = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageSrc(dataUrl);
      setInsertError('');
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Failed to load image file');
    }
  }, []);

  const insertHyperlinkComponent = useCallback(() => {
    try {
      const node = createHyperlinkComponent({ alias: linkAlias.trim(), url: linkUrl.trim() }, {});
      editor?.chain().focus().insertContent(node as any).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid hyperlink component');
    }
  }, [editor, linkAlias, linkUrl]);

  const insertTableComponent = useCallback(() => {
    try {
      if (tableMode === 'row_data') {
        const headers = tableHeaders.map((header) => normalizeIdentifierDraft(header)).filter(Boolean);
        if (headers.length === 0) {
          setInsertError('Table headers are required.');
          return;
        }

        const rows = (tableRows.length > 0 ? tableRows : [headers.map(() => '')]).map((cells) => {
          const row: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            row[header] = cells[index] ?? '';
          });
          return row;
        });

        const node = createTableComponent(
          { rows, ...(tableCaption.trim() ? { caption: tableCaption.trim() } : {}) },
          { headers }
        );
        editor?.chain().focus().insertContent(node as any).run();
      } else {
        const rowHeaders = tableColumnRowHeaders.map((header) => normalizeIdentifierDraft(header)).filter(Boolean);
        const colNames = tableColumnNames.map((name) => normalizeIdentifierDraft(name)).filter(Boolean);
        const matrix = alignMatrixToHeaders(colNames, tableColumnMatrix);

        if (rowHeaders.length === 0 || colNames.length === 0) {
          setInsertError('Column tables require row headers and column names.');
          return;
        }

        const columns = Object.fromEntries(
          colNames.map((name, colIdx) => {
            const columnData: Record<string, unknown> = {};
            rowHeaders.forEach((rowHeader, rowIdx) => {
              columnData[rowHeader] = matrix[rowIdx]?.[colIdx] ?? '';
            });
            return [name, columnData];
          })
        );

        const node = createTableComponent(
          { columns, ...(tableCaption.trim() ? { caption: tableCaption.trim() } : {}) },
          { headers: rowHeaders }
        );
        editor?.chain().focus().insertContent(node as any).run();
      }

      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid table component');
    }
  }, [editor, tableMode, tableHeaders, tableRows, tableCaption, tableColumnRowHeaders, tableColumnNames, tableColumnMatrix]);

  const insertPageBreak = useCallback(() => {
    editor?.chain().focus().insertContent({ type: 'pageBreakComponent' }).run();
  }, [editor]);

  return (
    <div className={`pg-tiptap-wrapper${hasError ? ' pg-tiptap-error' : ''}`}>
      <div className="pg-tiptap-toolbar" role="toolbar" aria-label="Editor toolbar">
        <select
          className="pg-input pg-toolbar-select"
          value={selectedBlockStyle}
          onChange={(e) => {
            const value = e.target.value as 'paragraph' | 'h1' | 'h2' | 'h3';
            setSelectedBlockStyle(value);
            if (value === 'paragraph') {
              editor?.chain().focus().setParagraph().run();
              return;
            }
            const level = value === 'h1' ? 1 : value === 'h2' ? 2 : 3;
            editor?.chain().focus().toggleHeading({ level }).run();
          }}
          aria-label="Block style"
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn${active('bold')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleBold().run())} title="Bold">
          <Bold size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('italic')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleItalic().run())} title="Italic">
          <Italic size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('underline')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleUnderline().run())} title="Underline">
          <UnderlineIcon size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('strike')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleStrike().run())} title="Strikethrough">
          <Strikethrough size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('highlight')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleHighlight().run())} title="Highlight">
          <Highlighter size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn${active('heading', { level: 1 })}`} onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())} title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('heading', { level: 2 })}`} onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())} title="Heading 2">
          <Heading2 size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('heading', { level: 3 })}`} onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())} title="Heading 3">
          <Heading3 size={16} />
        </button>

        <button type="button" className={`pg-tb-btn${active('bulletList')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleBulletList().run())} title="Bullet list">
          <List size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('orderedList')}`} onMouseDown={cmd(() => editor?.chain().focus().toggleOrderedList().run())} title="Ordered list">
          <ListOrdered size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn${activeAlign('left')}`} onMouseDown={cmd(() => editor?.chain().focus().setTextAlign('left').run())} title="Align left">
          <AlignLeft size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('center')}`} onMouseDown={cmd(() => editor?.chain().focus().setTextAlign('center').run())} title="Align center">
          <AlignCenter size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('right')}`} onMouseDown={cmd(() => editor?.chain().focus().setTextAlign('right').run())} title="Align right">
          <AlignRight size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('justify')}`} onMouseDown={cmd(() => editor?.chain().focus().setTextAlign('justify').run())} title="Justify">
          <AlignJustify size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => editor?.chain().focus().undo().run())} title="Undo" disabled={!editor?.can().undo()}>
          <Undo size={16} />
        </button>
        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => editor?.chain().focus().redo().run())} title="Redo" disabled={!editor?.can().redo()}>
          <Redo size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className={`pg-tb-btn pg-tb-btn--accent${insertPanel === 'placeholder' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'placeholder' ? null : 'placeholder'); }} title="Insert typed placeholder">
          <Braces size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'image' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'image' ? null : 'image'); }} title="Insert image component">
          <FileImage size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'hyperlink' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'hyperlink' ? null : 'hyperlink'); }} title="Insert hyperlink component">
          <LinkIcon size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'table' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'table' ? null : 'table'); }} title="Insert table component">
          <Table size={16} />
        </button>

        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => editor?.chain().focus().setHorizontalRule().run())} title="Insert horizontal rule">
          <Minus size={16} />
        </button>
        <button type="button" className="pg-tb-btn" onMouseDown={cmd(insertPageBreak)} title="Insert page break">
          <SeparatorHorizontal size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className="pg-tb-btn pg-tb-btn--accent" onMouseDown={cmd(openPreview)} title="Preview document">
          Preview
        </button>
      </div>

      {insertPanel && (
        <div className="pg-insert-panel">
          {insertPanel === 'placeholder' && (
            <>
              <div className="pg-insert-row">
                <label className="pg-label">Placeholder key</label>
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
                  <option value="repeat">repeat</option>
                  <option value="custom">custom</option>
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
                    <label className="pg-label">Item kind</label>
                    <select className="pg-input" value={phListItemKind} onChange={(e) => setPhListItemKind(e.target.value as DynamicItemKind)}>
                      <option value="string">string</option>
                      <option value="integer">integer</option>
                      <option value="image">image</option>
                      <option value="hyperlink">hyperlink</option>
                      <option value="list">list</option>
                      <option value="repeat">repeat</option>
                      <option value="custom">custom</option>
                      <option value="table">table</option>
                    </select>
                  </div>
                </>
              )}

              {phKind === 'repeat' && (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Repeat item kind</label>
                    <select className="pg-input" value={phRepeatItemKind} onChange={(e) => setPhRepeatItemKind(e.target.value as DynamicItemKind)}>
                      <option value="string">string</option>
                      <option value="integer">integer</option>
                      <option value="image">image</option>
                      <option value="hyperlink">hyperlink</option>
                      <option value="list">list</option>
                      <option value="repeat">repeat</option>
                      <option value="custom">custom</option>
                      <option value="table">table</option>
                    </select>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Min items (optional)</label>
                    <input className="pg-input" value={phRepeatMinItems} onChange={(e) => setPhRepeatMinItems(e.target.value)} placeholder="0" />
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Max items (optional)</label>
                    <input className="pg-input" value={phRepeatMaxItems} onChange={(e) => setPhRepeatMaxItems(e.target.value)} placeholder="" />
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Base variable</label>
                    <input className="pg-input" value={phRepeatBaseVariable} onChange={(e) => setPhRepeatBaseVariable(e.target.value)} placeholder="item" />
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Item layout (optional)</label>
                    <textarea
                      ref={repeatLayoutTextareaRef}
                      className="pg-input"
                      rows={4}
                      value={phRepeatLayoutTemplate}
                      onChange={(e) => setPhRepeatLayoutTemplate(e.target.value)}
                      placeholder={"{{item.name}} - {{item.value}}"}
                    />
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Suggested fields</label>
                    <div className="pg-layout-composer">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={phRepeatLayoutFieldDraft}
                          onChange={(e) => setPhRepeatLayoutFieldDraft(e.target.value)}
                          placeholder="field_name"
                        />
                        <button type="button" className="pg-layout-pattern" onClick={addRepeatLayoutField}>+ Field</button>
                      </div>
                      <div className="pg-layout-token-list">
                        {repeatLayoutFields.map((field) => (
                          <span key={field} className="pg-layout-segment pg-layout-segment-token">
                            {field}
                            <button
                              type="button"
                              className="pg-layout-segment-btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => removeRepeatLayoutField(field)}
                              aria-label={`Remove ${field}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pg-layout-token-assist" role="group" aria-label="Repeat layout tokens">
                    <p className="pg-layout-token-assist-label">Click to insert token</p>
                    <div className="pg-layout-token-list">
                      {repeatLayoutTokens.map((token) => (
                        <button
                          key={token}
                          type="button"
                          className="pg-layout-token"
                          onClick={() => insertTokenAtCursor('repeat', token)}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <div className="pg-layout-patterns">
                      <button type="button" className="pg-layout-pattern" onClick={() => setPhRepeatLayoutTemplate(`• {{${phRepeatBaseVariable}.name}} | {{${phRepeatBaseVariable}.value}}`)}>Line item pattern</button>
                      <button type="button" className="pg-layout-pattern" onClick={() => setPhRepeatLayoutTemplate(`{{${phRepeatBaseVariable}.name}}\n{{${phRepeatBaseVariable}.value}}`)}>Two-line pattern</button>
                    </div>
                  </div>
                  {repeatLayoutPreview && (
                    <div className="pg-layout-preview" aria-live="polite">
                      <p className="pg-layout-preview-label">Live preview with sample data</p>
                      <pre>{repeatLayoutPreview}</pre>
                    </div>
                  )}
                </>
              )}

              {phKind === 'custom' && (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Token Library</label>
                    <div className="pg-layout-composer" role="group" aria-label="Token library">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={phCustomItemIdDraft}
                          onChange={(e) => setPhCustomItemIdDraft(e.target.value)}
                          placeholder="token_id"
                        />
                        <input
                          className="pg-input"
                          value={phCustomItemLabelDraft}
                          onChange={(e) => setPhCustomItemLabelDraft(e.target.value)}
                          placeholder="Token label"
                        />
                        <select className="pg-input" value={phCustomTokenKindDraft} onChange={(e) => setPhCustomTokenKindDraft(e.target.value as TokenKind)}>
                          <option value="string">string</option>
                          <option value="integer">integer</option>
                          <option value="image">image</option>
                          <option value="hyperlink">hyperlink</option>
                          <option value="list">list</option>
                          <option value="table">table</option>
                        </select>
                        <button type="button" className="pg-layout-pattern" onClick={addCustomItem}>+ Token</button>
                      </div>

                      {phCustomItems.length === 0 ? (
                        <div className="pg-layout-preview">
                          <p className="pg-layout-preview-label">Token library is empty</p>
                          <pre>Create tokens, then reference them in the placeholder template with {`{{tokenId}}`}.</pre>
                        </div>
                      ) : (
                        <div className="pg-custom-workspace">
                          <div className="pg-custom-library" role="group" aria-label="Tokens">
                            <input
                              className="pg-input"
                              value={phCustomItemFilter}
                              onChange={(e) => setPhCustomItemFilter(e.target.value)}
                              placeholder="Search tokens"
                              aria-label="Search tokens"
                            />
                            <p className="pg-layout-preview-label">{filteredCustomItems.length} of {phCustomItems.length} token(s)</p>
                            {filteredCustomItems.map((token) => {
                              const index = phCustomItems.findIndex((entry) => entry.id === token.id);
                              return (
                              <div
                                key={token.id}
                                className={`pg-custom-item-card${token.id === (selectedCustomItem?.id || '') ? ' pg-custom-item-card-active' : ''}`}
                                draggable
                                onDragStart={() => handleCustomItemDragStart(token.id)}
                              >
                                <button
                                  type="button"
                                  className="pg-custom-item-select"
                                  onClick={() => setPhCustomSelectedItemId(token.id)}
                                >
                                  <span className="pg-layout-segment pg-layout-segment-token">{token.id}</span>
                                  <span className="pg-layout-preview-label">{token.kind}</span>
                                </button>
                                <div className="pg-layout-segment-actions">
                                  <button type="button" className="pg-layout-segment-btn" onClick={() => insertCustomPlaceholderTokenSet(token.id)}>Insert</button>
                                  <button type="button" className="pg-layout-segment-btn" onClick={() => moveCustomItem(token.id, 'up')} disabled={index === 0}>↑</button>
                                  <button type="button" className="pg-layout-segment-btn" onClick={() => moveCustomItem(token.id, 'down')} disabled={index === phCustomItems.length - 1}>↓</button>
                                  <button type="button" className="pg-layout-segment-btn" onClick={() => duplicateCustomItem(token.id)}>Duplicate</button>
                                  <button type="button" className="pg-layout-segment-btn" onClick={() => removeCustomItem(token.id)}>×</button>
                                </div>
                              </div>
                              );
                            })}
                            {filteredCustomItems.length === 0 && (
                              <div className="pg-layout-preview">
                                <p className="pg-layout-preview-label">No tokens match this search</p>
                                <pre>Try searching by token id or label.</pre>
                              </div>
                            )}
                          </div>

                          {selectedCustomItem ? (() => {
                            const token = selectedCustomItem as TokenLibraryItemDraft;
                            return (
                              <div className="pg-custom-detail">
                                <div className="pg-layout-composer-actions">
                                  <input
                                    className="pg-input"
                                    value={token.label || ''}
                                    onChange={(e) => updateCustomItem(token.id, { label: e.target.value })}
                                    placeholder="Token label"
                                  />
                                  <span className="pg-layout-segment pg-layout-segment-token">{token.kind}</span>
                                </div>

                                {token.kind === 'list' && (
                                  <>
                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">List item type</label>
                                      <select 
                                        className="pg-input"
                                        value={token.itemType || 'string'}
                                        onChange={(e) => updateCustomItem(token.id, { itemType: e.target.value as TokenKind })}
                                      >
                                        <option value="string">string</option>
                                        <option value="integer">integer</option>
                                        <option value="image">image</option>
                                        <option value="hyperlink">hyperlink</option>
                                      </select>
                                    </div>
                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">List style</label>
                                      <select 
                                        className="pg-input"
                                        value={token.listStyle || 'bulleted'}
                                        onChange={(e) => updateCustomItem(token.id, { listStyle: e.target.value as any })}
                                      >
                                        <option value="bulleted">bulleted</option>
                                        <option value="numbered">numbered</option>
                                        <option value="plain">plain</option>
                                      </select>
                                    </div>
                                  </>
                                )}

                                {token.kind === 'table' && (
                                  <>
                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">Table mode</label>
                                      <select 
                                        className="pg-input"
                                        value={token.tableMode || 'row_data'}
                                        onChange={(e) => updateCustomItem(token.id, { tableMode: e.target.value as any })}
                                      >
                                        <option value="row_data">row_data</option>
                                        <option value="column_data">column_data</option>
                                      </select>
                                    </div>
                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">Dynamic headers</label>
                                      <input 
                                        type="checkbox"
                                        checked={token.dynamicHeaders || false}
                                        onChange={(e) => updateCustomItem(token.id, { dynamicHeaders: e.target.checked })}
                                        style={{ width: 'auto', marginLeft: 8 }}
                                      />
                                    </div>
                                  </>
                                )}

                                <div className="pg-layout-template-output">
                                  <p className="pg-layout-preview-label">Token properties</p>
                                  <pre>{JSON.stringify(token, null, 2)}</pre>
                                </div>
                              </div>
                            );
                          })() : null}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Custom Placeholder Template</label>
                    <textarea
                      ref={customPlaceholderTemplateRef}
                      className="pg-input"
                      aria-label="Custom placeholder template"
                      rows={5}
                      value={phCustomTemplate}
                      onChange={(e) => setPhCustomTemplate(e.target.value)}
                      placeholder="{{token1}}\n{{token2}}"
                    />
                  </div>
                  <div className="pg-layout-token-assist" role="group" aria-label="Token references">
                    <p className="pg-layout-token-assist-label">Insert token reference (or drag-drop from library)</p>
                    <div className="pg-layout-token-list">
                      {phCustomItems.map((token) => (
                        <button
                          key={token.id}
                          type="button"
                          className="pg-layout-token"
                          onClick={() => insertCustomPlaceholderTokenSet(token.id)}
                        >
                          {`{{${token.id}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pg-layout-template-output">
                    <p className="pg-layout-preview-label">Generated placeholder template</p>
                    <pre>{phCustomTemplate.trim() || '(empty)'}</pre>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Repeat rendering</label>
                    <select className="pg-input" value={phCustomRepeat ? 'true' : 'false'} onChange={(e) => setPhCustomRepeat(e.target.value === 'true')}>
                      <option value="false">single value</option>
                      <option value="true">repeat over items</option>
                    </select>
                  </div>
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
                    <label className="pg-label">Headers</label>
                    <div className="pg-layout-composer">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={phTableHeaderDraft}
                          onChange={(e) => setPhTableHeaderDraft(e.target.value)}
                          placeholder="header_name"
                        />
                        <button type="button" className="pg-layout-pattern" onClick={addPlaceholderTableHeader}>+ Header</button>
                      </div>
                      <div className="pg-layout-token-list">
                        {phTableHeaders.map((header) => (
                          <span key={header} className="pg-layout-segment pg-layout-segment-token">
                            {header}
                            <button
                              type="button"
                              className="pg-layout-segment-btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => removePlaceholderTableHeader(header)}
                              aria-label={`Remove ${header}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {phTableHeaders.length > 0 && (
                    <div className="pg-sheet-wrap">
                      <table className="pg-sheet-table">
                        <thead>
                          <tr>
                            <th>Header</th>
                            <th>Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phTableHeaders.map((header) => (
                            <tr key={header}>
                              <td>{header}</td>
                              <td>
                                <select
                                  className="pg-input"
                                  value={phTableMode === 'row_data' ? (phTableColumnKinds[header] || 'string') : (phTableRowKinds[header] || 'string')}
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
                                  <option value="repeat">repeat</option>
                                  <option value="custom">custom</option>
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
                <label className="pg-label">Image source</label>
                <div className="pg-layout-composer-actions">
                  <input className="pg-input" value={imageSrc} onChange={(e) => setImageSrc(e.target.value)} placeholder="https://example.com/image.png" />
                  <label className="pg-layout-pattern" style={{ cursor: 'pointer' }}>
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleImageFileSelection(e.target.files?.[0])}
                    />
                  </label>
                </div>
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
                <input className="pg-input" value={tableCaption} onChange={(e) => setTableCaption(e.target.value)} placeholder="Quarterly summary" />
              </div>

              {tableMode === 'row_data' ? (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Headers</label>
                    <div className="pg-layout-composer">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={tableHeaderDraft}
                          onChange={(e) => setTableHeaderDraft(e.target.value)}
                          placeholder="header_name"
                        />
                        <button type="button" className="pg-layout-pattern" onClick={addTableHeader}>+ Header</button>
                      </div>
                      <div className="pg-layout-token-list">
                        {tableHeaders.map((header) => (
                          <span key={header} className="pg-layout-segment pg-layout-segment-token">
                            {header}
                            <button
                              type="button"
                              className="pg-layout-segment-btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => removeTableHeader(header)}
                              aria-label={`Remove ${header}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Rows</label>
                    <div className="pg-sheet-wrap">
                      <table className="pg-sheet-table">
                        <thead>
                          <tr>
                            <th style={{ width: 48 }}>#</th>
                            {tableHeaders.map((header) => (
                              <th key={header}>{header}</th>
                            ))}
                            <th style={{ width: 64 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row, rowIndex) => (
                            <tr key={`row-${rowIndex}`}>
                              <td>{rowIndex + 1}</td>
                              {tableHeaders.map((header, colIndex) => (
                                <td key={`${header}-${rowIndex}`}>
                                  <input
                                    className="pg-input"
                                    value={row[colIndex] ?? ''}
                                    onChange={(e) => updateTableCell(rowIndex, colIndex, e.target.value)}
                                  />
                                </td>
                              ))}
                              <td>
                                <button
                                  type="button"
                                  className="pg-layout-segment-btn"
                                  onClick={() => removeTableRow(rowIndex)}
                                  aria-label={`Remove row ${rowIndex + 1}`}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="pg-layout-pattern" onClick={addTableRow}>+ Row</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pg-insert-row">
                    <label className="pg-label">Row headers</label>
                    <div className="pg-layout-composer">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={tableColumnRowHeaderDraft}
                          onChange={(e) => setTableColumnRowHeaderDraft(e.target.value)}
                          placeholder="row_label"
                        />
                        <button
                          type="button"
                          className="pg-layout-pattern"
                          onClick={() => {
                            const next = normalizeIdentifierDraft(tableColumnRowHeaderDraft);
                            if (!next) return;
                            if (!KEY_RE.test(next)) {
                              setInsertError('Row header id is invalid. Use letters/digits/underscore and start with letter or _.');
                              return;
                            }
                            setTableColumnRowHeaders((prev) => {
                              if (prev.includes(next)) return prev;
                              const updated = [...prev, next];
                              setTableColumnMatrix((prevMatrix) => [...prevMatrix, tableColumnNames.map(() => '')]);
                              return updated;
                            });
                            setTableColumnRowHeaderDraft('');
                            setInsertError('');
                          }}
                        >
                          + Row header
                        </button>
                      </div>
                      <div className="pg-layout-token-list">
                        {tableColumnRowHeaders.map((rowHeader, index) => (
                          <span key={rowHeader} className="pg-layout-segment pg-layout-segment-token">
                            {rowHeader}
                            <button
                              type="button"
                              className="pg-layout-segment-btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => {
                                setTableColumnRowHeaders((prev) => prev.filter((_, idx) => idx !== index));
                                setTableColumnMatrix((prev) => {
                                  const next = prev.filter((_, idx) => idx !== index);
                                  return next.length > 0 ? next : [tableColumnNames.map(() => '')];
                                });
                              }}
                              aria-label={`Remove ${rowHeader}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Column names</label>
                    <div className="pg-layout-composer">
                      <div className="pg-layout-composer-actions">
                        <input
                          className="pg-input"
                          value={tableColumnNameDraft}
                          onChange={(e) => setTableColumnNameDraft(e.target.value)}
                          placeholder="column_name"
                        />
                        <button
                          type="button"
                          className="pg-layout-pattern"
                          onClick={() => {
                            const next = normalizeIdentifierDraft(tableColumnNameDraft);
                            if (!next) return;
                            if (!KEY_RE.test(next)) {
                              setInsertError('Column name id is invalid. Use letters/digits/underscore and start with letter or _.');
                              return;
                            }
                            setTableColumnNames((prev) => {
                              if (prev.includes(next)) return prev;
                              const updated = [...prev, next];
                              setTableColumnMatrix((prevMatrix) => alignMatrixToHeaders(updated, prevMatrix));
                              return updated;
                            });
                            setTableColumnNameDraft('');
                            setInsertError('');
                          }}
                        >
                          + Column
                        </button>
                      </div>
                      <div className="pg-layout-token-list">
                        {tableColumnNames.map((columnName, index) => (
                          <span key={columnName} className="pg-layout-segment pg-layout-segment-token">
                            {columnName}
                            <button
                              type="button"
                              className="pg-layout-segment-btn"
                              style={{ marginLeft: 6 }}
                              onClick={() => {
                                setTableColumnNames((prev) => {
                                  const next = prev.filter((_, idx) => idx !== index);
                                  setTableColumnMatrix((prevMatrix) => {
                                    const trimmed = prevMatrix.map((row) => row.filter((_, colIdx) => colIdx !== index));
                                    return alignMatrixToHeaders(next.length > 0 ? next : [defaultHeaderName(0)], trimmed);
                                  });
                                  return next.length > 0 ? next : [defaultHeaderName(0)];
                                });
                              }}
                              aria-label={`Remove ${columnName}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pg-insert-row">
                    <label className="pg-label">Matrix</label>
                    <div className="pg-sheet-wrap">
                      <table className="pg-sheet-table">
                        <thead>
                          <tr>
                            <th>Row</th>
                            {tableColumnNames.map((columnName) => (
                              <th key={columnName}>{columnName}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableColumnRowHeaders.map((rowHeader, rowIndex) => (
                            <tr key={`${rowHeader}-${rowIndex}`}>
                              <td>{rowHeader}</td>
                              {tableColumnNames.map((columnName, colIndex) => (
                                <td key={`${columnName}-${rowHeader}`}>
                                  <input
                                    className="pg-input"
                                    value={tableColumnMatrix[rowIndex]?.[colIndex] ?? ''}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setTableColumnMatrix((prev) => prev.map((row, idx) => {
                                        if (idx !== rowIndex) return row;
                                        const nextRow = [...row];
                                        nextRow[colIndex] = nextValue;
                                        return nextRow;
                                      }));
                                    }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
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
        <div className="pg-overlay" onClick={(e) => e.target === e.currentTarget && setIsPreviewOpen(false)}>
          <div className="pg-modal pg-modal-xl" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
            <div className="pg-modal-header">
              <h2 className="pg-modal-title" id="preview-modal-title">Document Preview</h2>
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
        {placeholderMeta.length === 0 && <span style={{ color: 'var(--pg-text-muted)', fontSize: '11px' }}>none</span>}
        {placeholderMeta.map((item) => (
          <span key={item.key} className="pg-key-chip">{`{{${item.key}}}`} · {item.kind}</span>
        ))}
        <span className="pg-tiptap-footer-spacer" />
        <span className="pg-tiptap-footer-metric">{metrics.words} words</span>
        <span className="pg-tiptap-footer-metric">{metrics.characters} chars</span>
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

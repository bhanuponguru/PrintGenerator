'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { generateHTML } from '@tiptap/html';
import { Table as TableExtension } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { CustomTableCell as TableCell } from '@/lib/tiptap/custom-table';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image as ImageExtension } from '@tiptap/extension-image';
import { Link as LinkExtension } from '@tiptap/extension-link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  ChevronDown,
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
  Paintbrush,
  Redo,
  SeparatorHorizontal,
  Strikethrough,
  Table,
  Undo,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Placeholder } from '@/lib/tiptap/placeholder';
import { PaginationPlugin } from '@/lib/tiptap/pagination-plugin';
import {
  ComponentExtensions,
  createHeaderComponent,
  createFooterComponent,
  deriveSchemaFromChildren,
  validateContainerAttrs,
  validateFooterAttrs,
  validateHeaderAttrs,
  validateListAttrs,
  validatePageAttrs,
  validatePlaceholderAttrs,
} from '@/lib/tiptap/extensions';
import { fileToDataUrl } from '@/lib/image-utils';
import { ComponentTypeSchema, ColumnStyle, CustomPlaceholderItemSchema, ListStyle, TableMode, TableTypeSchema } from '@/types/template';

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
  tableHeaderDraft?: string;
  dynamicHeaders?: boolean;
  tableCaption?: string;
  dynamicFields?: string[];
  staticValues?: Record<string, unknown>;
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
  const dynamicFields = kind === 'hyperlink'
    ? ['alias', 'url']
    : kind === 'image'
      ? ['src', 'alt']
      : kind === 'table'
        ? ['Column_1', 'Column_2']
      : undefined;

  return {
    id,
    label: label || id,
    kind,
    ...(dynamicFields ? { dynamicFields } : {}),
    ...(kind === 'table' ? { tableHeaders: ['Column_1', 'Column_2'], tableHeaderDraft: '', tableCaption: '', staticValues: {} } : {}),
  };
}

function describeTokenLibraryItem(token: TokenLibraryItemDraft): string {
  if (token.kind === 'table') {
    const headers = (token.tableHeaders || []).join(', ') || 'no headers';
    const mode = token.tableMode || 'row_data';
    const caption = token.tableCaption && token.tableCaption.trim() !== '' ? `caption: ${token.tableCaption.trim()}` : 'caption: none';
    const dynamicFields = Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0 ? `dynamic: ${token.dynamicFields.join(', ')}` : 'dynamic: all';
    return `Table · ${mode} · ${headers} · ${caption} · ${dynamicFields}`;
  }

  if (token.kind === 'hyperlink') {
    const dynamicFields = Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0 ? token.dynamicFields.join(', ') : 'alias, url';
    return `Link · ${dynamicFields}`;
  }

  if (token.kind === 'image') {
    const dynamicFields = Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0 ? token.dynamicFields.join(', ') : 'src, alt';
    return `Image · ${dynamicFields}`;
  }

  if (token.kind === 'list') {
    return `List · ${token.listStyle || 'bulleted'} · ${token.itemType || 'string'}`;
  }

  return token.kind;
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

function normalizeCustomTokenReferences(template: string, baseVariable: string, tokenIds: string[]): string {
  if (!template.trim()) {
    return template;
  }

  const safeBase = KEY_RE.test(baseVariable.trim()) ? baseVariable.trim() : 'item';
  const tokenIdSet = new Set(tokenIds.filter((tokenId) => KEY_RE.test(tokenId)));

  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g, (match, token: string) => {
    if (token === safeBase || token.startsWith(`${safeBase}.`)) {
      return `{{${token}}}`;
    }

    if (!token.includes('.') && tokenIdSet.has(token)) {
      return `{{${safeBase}.${token}}}`;
    }

    return match;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textTemplateToHtml(template: string): string {
  if (!template.trim()) {
    return '<p></p>';
  }

  return template
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
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

const DYNAMIC_KINDS = new Set(['list', 'table', 'repeat', 'custom']);

function collectValidationErrors(documentJson: Record<string, any>): string[] {
  const errors: string[] = [];
  const placeholderSchemaFingerprint = new Map<string, string>();
  const dynamicPlaceholderKeys: string[] = [];

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

      // Track dynamic placeholders for the at-most-one rule
      if (DYNAMIC_KINDS.has(kind) && key && !dynamicPlaceholderKeys.includes(key)) {
        dynamicPlaceholderKeys.push(key);
      }

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

    if (node.type === 'listComponent') {
      const err = validateListAttrs(attrs);
      if (err) errors.push(`listComponent: ${err}`);
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

  // Enforce single dynamic placeholder rule
  if (dynamicPlaceholderKeys.length > 1) {
    errors.push(
      `Template has ${dynamicPlaceholderKeys.length} dynamic placeholders (${dynamicPlaceholderKeys.join(', ')}), but only 1 is allowed.`
    );
  }

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
  const [previewSrcdoc, setPreviewSrcdoc] = useState('');
  const [selectedBlockStyle, setSelectedBlockStyle] = useState<'paragraph' | 'h1' | 'h2' | 'h3'>('paragraph');
  // Incrementing this on every editor transaction forces React to re-render the
  // toolbar so that active() calls (isActive checks) reflect the latest state.
  const [, setEditorTick] = useState(0);

  // ── Color picker state ──────────────────────────────────────
  const [colorPickerOpen, setColorPickerOpen] = useState<'text' | 'highlight' | 'bg' | 'cellBg' | null>(null);
  const [activeTextColor, setActiveTextColor] = useState('#000000');
  const [activeHighlightColor, setActiveHighlightColor] = useState('#ffff00');
  const [containerBgColor, setContainerBgColor] = useState('');
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const colorPickerHostRef = useRef<HTMLDivElement>(null);

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
  const [phCustomItems, setPhCustomItems] = useState<TokenLibraryItemDraft[]>([]);
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
  const isSyncingCustomTemplateRef = useRef(false);
  const customTokenIdsRef = useRef<string[]>([]);

  const repeatLayoutTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [phTableMode, setPhTableMode] = useState<TableMode>('row_data');
  const [phTableHeaders, setPhTableHeaders] = useState<string[]>(['Item', 'Qty']);
  const [phTableHeaderDraft, setPhTableHeaderDraft] = useState('');
  const [phTableColumnKinds, setPhTableColumnKinds] = useState<Record<string, PlaceholderKind>>({});
  const [phTableRowKinds, setPhTableRowKinds] = useState<Record<string, PlaceholderKind>>({});
  const [phTableCaptionText, setPhTableCaptionText] = useState('');
  const [phTableColStyles, setPhTableColStyles] = useState<Record<string, ColumnStyle>>({});
  const [phTableStriped, setPhTableStriped] = useState(false);
  const [phTextColor, setPhTextColor] = useState('#000000');
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
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder,
      PaginationPlugin,
      ImageExtension,
      LinkExtension.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      TableExtension.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
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
    onTransaction({ editor: ed }) {
      // Bump tick so any render-time isActive() calls see the fresh state.
      setEditorTick((t) => t + 1);

      if (ed.isActive('heading', { level: 1 })) setSelectedBlockStyle('h1');
      else if (ed.isActive('heading', { level: 2 })) setSelectedBlockStyle('h2');
      else if (ed.isActive('heading', { level: 3 })) setSelectedBlockStyle('h3');
      else setSelectedBlockStyle('paragraph');
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

  useEffect(() => () => {
    editor?.destroy();
  }, [editor]);

  const customTemplateEditor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: textTemplateToHtml(phCustomTemplate),
    editorProps: {
      attributes: {
        class: 'pg-custom-template-prosemirror',
        'aria-label': 'Custom placeholder template',
      },
    },
    onUpdate({ editor: ed }) {
      if (isSyncingCustomTemplateRef.current) return;
      const canonical = normalizeCustomTokenReferences(
        ed.getText({ blockSeparator: '\n' }),
        'token',
        customTokenIdsRef.current
      );
      setPhCustomTemplate(canonical);
    },
    immediatelyRender: false,
  });

  useEffect(() => () => {
    customTemplateEditor?.destroy();
  }, [customTemplateEditor]);

  useEffect(() => {
    customTokenIdsRef.current = phCustomItems.map((token) => token.id);
  }, [phCustomItems]);

  useEffect(() => {
    if (!customTemplateEditor) return;
    const current = normalizeCustomTokenReferences(
      customTemplateEditor.getText({ blockSeparator: '\n' }),
      'token',
      phCustomItems.map((token) => token.id)
    );
    const next = normalizeCustomTokenReferences(
      phCustomTemplate,
      'token',
      phCustomItems.map((token) => token.id)
    );
    if (current === next) return;
    isSyncingCustomTemplateRef.current = true;
    customTemplateEditor.commands.setContent(textTemplateToHtml(next));
    isSyncingCustomTemplateRef.current = false;
  }, [customTemplateEditor, phCustomTemplate, phCustomItems]);

  const active = (name: string, opts?: object) => (editor?.isActive(name, opts) ? ' pg-tb-active' : '');
  const activeAlign = (align: 'left' | 'center' | 'right' | 'justify') => (editor?.isActive({ textAlign: align }) ? ' pg-tb-active' : '');

  // Close color pickers when clicking outside
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerHostRef.current && !colorPickerHostRef.current.contains(e.target as Node)) {
        setColorPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerOpen]);

  // ── Color palette definition ────────────────────────────────
  // Theme colors: 10 columns (base tones) × 6 rows (base + 5 tints/shades)
  const THEME_COLORS: string[][] = [
    // Row 0: base
    ['#FFFFFF', '#000000', '#EEECE1', '#1F497D', '#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646'],
    // Row 1: 80% tint
    ['#F2F2F2', '#808080', '#DDD9C3', '#C6D9F0', '#DBE5F1', '#F2DCDB', '#EBF1DD', '#E5E0EC', '#DBEEF3', '#FDEADA'],
    // Row 2: 60% tint
    ['#D8D8D8', '#595959', '#C4BD97', '#8DB3E2', '#B8CCE4', '#E6B9B8', '#D7E4BC', '#CCC1D9', '#B7DDE8', '#FBD5B5'],
    // Row 3: 40% tint / base
    ['#BFBFBF', '#404040', '#938953', '#548DD4', '#95B3D7', '#DA9694', '#C3D69B', '#B2A2C7', '#92CDDC', '#FAC08F'],
    // Row 4: 25% shade
    ['#A5A5A5', '#262626', '#494429', '#17375E', '#366092', '#953734', '#76923C', '#5F497A', '#31849B', '#E36C09'],
    // Row 5: 50% shade
    ['#7F7F7F', '#0C0C0C', '#1D1B10', '#0F243E', '#243F60', '#632423', '#4F6228', '#3f3151', '#215868', '#974806'],
  ];

  const STANDARD_COLORS: string[] = [
    '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
    '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
  ];

  // Quick palette for style panel (compact)
  const QUICK_COLORS: string[] = [
    'transparent', '#FFFFFF', '#F2F2F2', '#FFFBE6', '#FFF3CD', '#D4EDDA',
    '#D1ECF1', '#CCE5FF', '#F8D7DA', '#E2D9F3', '#1c1a16',
  ];

  const applyTextColor = (color: string) => {
    setActiveTextColor(color);
    setColorPickerOpen(null);
    let chain = editor?.chain().focus();
    if (editor?.isActive('placeholder')) {
      chain = chain?.updateAttributes('placeholder', { color: color === 'auto' ? null : color });
    }
    if (color === 'auto') {
      chain?.unsetColor().run();
    } else {
      chain?.setColor(color).run();
    }
  };

  const applyHighlightColor = (color: string) => {
    setActiveHighlightColor(color);
    setColorPickerOpen(null);
    let chain = editor?.chain().focus();
    if (editor?.isActive('placeholder')) {
      chain = chain?.updateAttributes('placeholder', { backgroundColor: color === 'auto' ? null : color });
    }
    if (color === 'auto') {
      chain?.unsetHighlight().run();
    } else {
      chain?.setHighlight({ color }).run();
    }
  };

  const applyCellBgColor = (color: string) => {
    setColorPickerOpen(null);
    if (color === 'transparent' || color === '') {
      editor?.chain().focus().updateAttributes('tableCell', { backgroundColor: null }).run();
      editor?.chain().focus().updateAttributes('tableHeader', { backgroundColor: null }).run();
    } else {
      editor?.chain().focus().updateAttributes('tableCell', { backgroundColor: color }).run();
      editor?.chain().focus().updateAttributes('tableHeader', { backgroundColor: color }).run();
    }
  };

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

  const hasDynamicPlaceholder = useMemo(
    () => placeholderMeta.some((ph) => DYNAMIC_KINDS.has(ph.kind)),
    [placeholderMeta]
  );

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

    if (phCustomTokenKindDraft === 'hyperlink') {
      newToken.dynamicFields = ['alias', 'url'];
      newToken.staticValues = {};
    }

    if (phCustomTokenKindDraft === 'image') {
      newToken.dynamicFields = ['src', 'alt'];
      newToken.staticValues = {};
    }

    if (phCustomTokenKindDraft === 'table') {
      newToken.tableHeaders = ['Column_1', 'Column_2'];
      newToken.dynamicFields = ['Column_1', 'Column_2'];
      newToken.staticValues = {};
      newToken.tableHeaderDraft = '';
    }

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
    const tokenText = `{{token.${tokenId}}}`;
    if (customTemplateEditor) {
      customTemplateEditor.chain().focus().insertContent(tokenText).run();
      const next = normalizeCustomTokenReferences(
        customTemplateEditor.getText({ blockSeparator: '\n' }),
        'token',
        phCustomItems.map((token) => token.id)
      );
      setPhCustomTemplate(next);
      return;
    }

    setInsertError('Custom template editor is initializing. Try again.');
  }, [customTemplateEditor, phCustomItems]);

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
      const rawHtml = generateHTML(editor.getJSON(), [
        StarterKit,
        Highlight.configure({ multicolor: true }),
        TextStyle,
        Color,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Placeholder,
        ImageExtension,
        LinkExtension.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
        TableExtension.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        ...ComponentExtensions,
      ]);

      // ── Strip near-white colors (dark-theme artifact) ──────────────────
      const cleanHtml = rawHtml.replace(/style="([^"]*)"/g, (_match, styles: string) => {
        const cleaned = styles.replace(
          /color:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/g,
          (_m: string, r: string, g: string, b: string) => {
            const brightness = (Number(r) + Number(g) + Number(b)) / 3;
            return brightness > 200 ? '' : `color: rgb(${r}, ${g}, ${b})`;
          }
        );
        const trimmed = cleaned.replace(/;\s*;/g, ';').replace(/^;|;$/g, '').trim();
        return trimmed ? `style="${trimmed}"` : '';
      });

      // ── Extract header / footer (same logic as server-side) ───────────
      let bodyHtml = cleanHtml;
      let headerHtml = '';
      let footerHtml = '';

      const headerMatch = bodyHtml.match(/<header[^>]*data-component="header"[^>]*>[\s\S]*?<\/header>/);
      if (headerMatch) {
        headerHtml = headerMatch[0];
        bodyHtml = bodyHtml.replace(headerMatch[0], '');
      }
      const footerMatch = bodyHtml.match(/<footer[^>]*data-component="footer"[^>]*>[\s\S]*?<\/footer>/);
      if (footerMatch) {
        footerHtml = footerMatch[0];
        bodyHtml = bodyHtml.replace(footerMatch[0], '');
      }

      // ── Build full WYSIWYG HTML identical to the PDF source ───────────
      const PREVIEW_CSS = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #e8e8e8;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 13px;
          line-height: 1.6;
          color: #111;
          padding: 24px 0;
        }
        .pg-page {
          background: #ffffff;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 24px;
          padding: 20mm 20mm 20mm 20mm;
          box-shadow: 0 4px 24px rgba(0,0,0,0.18);
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .pg-page-header {
          border-bottom: 2px dashed rgba(100,180,255,0.5);
          padding-bottom: 10px;
          margin-bottom: 16px;
          color: #333;
          font-size: 11px;
          background: rgba(100,180,255,0.04);
          border-radius: 4px 4px 0 0;
          padding: 8px 10px;
        }
        .pg-page-body {
          flex: 1;
        }
        .pg-page-footer {
          border-top: 2px dashed rgba(255,160,80,0.5);
          padding-top: 10px;
          margin-top: 16px;
          color: #333;
          font-size: 11px;
          background: rgba(255,160,80,0.04);
          border-radius: 0 0 4px 4px;
          padding: 8px 10px;
        }
        h1 { font-size: 22px; margin-bottom: 10px; }
        h2 { font-size: 18px; margin-bottom: 8px; }
        h3 { font-size: 15px; margin-bottom: 6px; }
        p { margin-bottom: 8px; }
        ul, ol { margin: 0 0 8px 20px; }
        li { margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        div[data-component='page-break'] {
          border-top: 2px dashed #aaa;
          margin: 16px 0;
          text-align: center;
          font-size: 9px;
          color: #999;
          letter-spacing: .1em;
          padding-top: 4px;
        }
        div[data-component='page-break']::after { content: '— PAGE BREAK —'; }
        span[data-placeholder='true'] {
          background: rgba(232,184,75,0.15);
          color: #b8860b;
          border: 1px solid rgba(232,184,75,0.4);
          border-radius: 3px;
          padding: 1px 5px;
          font-weight: 600;
        }
      `;

      const srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
        <style>${PREVIEW_CSS}</style></head><body>
        <div class="pg-page">
          ${headerHtml ? `<div class="pg-page-header">${headerHtml.replace(/<\/?header[^>]*>/g, '')}</div>` : ''}
          <div class="pg-page-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="pg-page-footer">${footerHtml.replace(/<\/?footer[^>]*>/g, '')}</div>` : ''}
        </div>
      </body></html>`;

      setPreviewSrcdoc(srcdoc);
      setPreviewHtml(cleanHtml); // keep for legacy usage
    } catch {
      setPreviewSrcdoc('<html><body style="color:red;padding:20px">Unable to render preview.</body></html>');
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

    // Enforce single dynamic placeholder rule
    if (DYNAMIC_KINDS.has(phKind) && hasDynamicPlaceholder) {
      setInsertError('Only one dynamic placeholder (list, table, repeat, custom) is allowed per template.');
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
      const canonicalTemplate = normalizeCustomTokenReferences(
        phCustomTemplate.trim(),
        'token',
        phCustomItems.map((token) => token.id)
      );

      if (phCustomItems.length === 0) {
        setInsertError('Custom placeholders require at least one token in the token library.');
        return;
      }

      if (!canonicalTemplate) {
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
          if (token.tableCaption && token.tableCaption.trim() !== '') {
            schemaBase.caption = token.tableCaption.trim();
          }
        }

        if (Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0) {
          schemaBase.dynamic_fields = token.dynamicFields;
        }

        if (token.staticValues && Object.keys(token.staticValues).length > 0) {
          schemaBase.static_values = token.staticValues;
        }

        return schemaBase;
      });

      schema = {
        kind: 'custom',
        base_variable: 'token',
        value_type: defaultSchemaForKind('string'),
        layout_template: canonicalTemplate,
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
        ...(phTableCaptionText.trim() ? { caption: phTableCaptionText.trim() } : {}),
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
    attrs.color = phTextColor === '#000000' ? null : phTextColor;
    if (phKind === 'table') {
      attrs.striped = phTableStriped;
      (schema as TableTypeSchema).column_styles = phTableColStyles;
    }

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
  }, [editor, phKey, phKind, phListStyle, phListItemKind, phRepeatItemKind, phRepeatMinItems, phRepeatMaxItems, phRepeatBaseVariable, phRepeatLayoutTemplate, phCustomTemplate, phCustomRepeat, phCustomItems, phTableHeaders, phTableMode, phTableColumnKinds, phTableRowKinds, phTableCaptionText, tableCaption, hasDynamicPlaceholder]);

  const insertImageComponent = useCallback(() => {
    try {
      editor?.chain().focus().setImage({ src: imageSrc.trim(), alt: imageAlt.trim() }).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid image');
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
      const url = linkUrl.trim();
      const alias = linkAlias.trim() || url;
      editor?.chain().focus().insertContent(`<a href="${escapeHtml(url)}">${escapeHtml(alias)}</a>`).run();
      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid hyperlink');
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

        const tableHtml = `
          <table>
            ${tableCaption.trim() ? `<caption>${escapeHtml(tableCaption.trim())}</caption>` : ''}
            <tbody>
              <tr>
                ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
              </tr>
              ${rows.map(row => `
                <tr>
                  ${headers.map(h => `<td>${escapeHtml(String(row[h] ?? ''))}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        editor?.chain().focus().insertContent(tableHtml).run();
      } else {
        const rowHeaders = tableColumnRowHeaders.map((header) => normalizeIdentifierDraft(header)).filter(Boolean);
        const colNames = tableColumnNames.map((name) => normalizeIdentifierDraft(name)).filter(Boolean);
        const matrix = alignMatrixToHeaders(colNames, tableColumnMatrix);

        if (rowHeaders.length === 0 || colNames.length === 0) {
          setInsertError('Column tables require row headers and column names.');
          return;
        }

        const tableHtml = `
          <table>
            ${tableCaption.trim() ? `<caption>${escapeHtml(tableCaption.trim())}</caption>` : ''}
            <tbody>
              <tr>
                <th></th>
                ${colNames.map(name => `<th>${escapeHtml(name)}</th>`).join('')}
              </tr>
              ${rowHeaders.map((rowHeader, rowIdx) => `
                <tr>
                  <th>${escapeHtml(rowHeader)}</th>
                  ${colNames.map((_, colIdx) => `<td>${escapeHtml(String(matrix[rowIdx]?.[colIdx] ?? ''))}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        editor?.chain().focus().insertContent(tableHtml).run();
      }

      setInsertError('');
      setInsertPanel(null);
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'Invalid table component');
    }
  }, [editor, tableMode, tableHeaders, tableRows, tableCaption, tableColumnRowHeaders, tableColumnNames, tableColumnMatrix]);

  const insertPageBreak = useCallback(() => {
    if (!editor) return;
    const { state } = editor;
    const { $from } = state.selection;
    // Climb to the direct child of the document (depth 1) and insert after it.
    // If we're already at depth 0 (empty doc), afterTopLevel will be the doc end.
    const topDepth = Math.min($from.depth, 1);
    const afterTopLevel = $from.after(topDepth > 0 ? topDepth : 0);
    editor.chain()
      .focus()
      .insertContentAt(afterTopLevel, { type: 'pageBreakComponent' })
      .run();
  }, [editor]);

  const insertHeaderComponent = useCallback(() => {
    if (!editor) return;
    // Always place header at the very start of the document.
    editor.chain()
      .focus()
      .insertContentAt(0, {
        type: 'headerComponent',
        content: [{ type: 'paragraph' }],
      })
      .setTextSelection(1) // Move cursor inside the just-inserted paragraph
      .scrollIntoView()
      .run();
  }, [editor]);

  const insertFooterComponent = useCallback(() => {
    if (!editor) return;
    // Always place footer at the end of the document.
    const endPos = editor.state.doc.content.size;
    editor.chain()
      .focus()
      .insertContentAt(endPos, {
        type: 'footerComponent',
        content: [{ type: 'paragraph' }],
      })
      .setTextSelection(endPos + 1) // Move cursor inside the just-inserted paragraph
      .scrollIntoView()
      .run();
  }, [editor]);

  // ── Color Swatch Picker sub-component ──────────────────────
  const ColorSwatchPicker = ({
    kind,
    onSelect,
    onAuto,
    activeColor,
  }: {
    kind: 'text' | 'highlight' | 'bg';
    onSelect: (color: string) => void;
    onAuto: () => void;
    activeColor: string;
  }) => (
    <div className="pg-color-popover" onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="pg-color-auto-btn" onClick={onAuto}>
        <span className="pg-color-auto-swatch" />
        Automatic
      </button>

      <p className="pg-color-section-label">Theme Colors</p>
      <div className="pg-color-grid pg-color-grid--theme">
        {THEME_COLORS.flat().map((color, idx) => (
          <button
            key={`${kind}-theme-${idx}`}
            type="button"
            className={`pg-color-swatch${activeColor === color ? ' pg-swatch-active' : ''}`}
            style={{ background: color }}
            title={color}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>

      <p className="pg-color-section-label" style={{ marginTop: 6 }}>Standard Colors</p>
      <div className="pg-color-grid pg-color-grid--standard">
        {STANDARD_COLORS.map((color, idx) => (
          <button
            key={`${kind}-std-${idx}`}
            type="button"
            className={`pg-color-swatch${activeColor === color ? ' pg-swatch-active' : ''}`}
            style={{ background: color }}
            title={color}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
    </div>
  );

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

        <button type="button" className={`pg-tb-btn${active('bold')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            const isBold = editor.getAttributes('placeholder').fontWeight === 'bold';
            chain = chain?.updateAttributes('placeholder', { fontWeight: isBold ? null : 'bold' });
          }
          chain?.toggleBold().run();
        })} title="Bold">
          <Bold size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('italic')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            const isItalic = editor.getAttributes('placeholder').fontStyle === 'italic';
            chain = chain?.updateAttributes('placeholder', { fontStyle: isItalic ? null : 'italic' });
          }
          chain?.toggleItalic().run();
        })} title="Italic">
          <Italic size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('underline')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            const isUnderline = editor.getAttributes('placeholder').textDecoration === 'underline';
            chain = chain?.updateAttributes('placeholder', { textDecoration: isUnderline ? null : 'underline' });
          }
          chain?.toggleUnderline().run();
        })} title="Underline">
          <UnderlineIcon size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${active('strike')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            const isStrike = editor.getAttributes('placeholder').textDecoration === 'line-through';
            chain = chain?.updateAttributes('placeholder', { textDecoration: isStrike ? null : 'line-through' });
          }
          chain?.toggleStrike().run();
        })} title="Strikethrough">
          <Strikethrough size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        {/* ── Text Color Button ── */}
        <div className="pg-color-picker-host" ref={colorPickerHostRef}>
          <button
            type="button"
            className={`pg-tb-color-btn${colorPickerOpen === 'text' ? ' pg-tb-active' : ''}`}
            title="Text color"
            onClick={() => setColorPickerOpen(colorPickerOpen === 'text' ? null : 'text')}
            aria-label="Text color"
            id="tb-text-color-btn"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1, fontFamily: 'serif' }}>A</span>
              <ChevronDown size={10} />
            </span>
            <span className="pg-tb-color-bar" style={{ background: activeTextColor === 'auto' ? '#000' : activeTextColor }} />
          </button>
          {colorPickerOpen === 'text' && (
            <ColorSwatchPicker
              kind="text"
              activeColor={activeTextColor}
              onSelect={applyTextColor}
              onAuto={() => applyTextColor('auto')}
            />
          )}
        </div>

        {/* ── Highlight / Text Background Color Button ── */}
        <div className="pg-color-picker-host" ref={colorPickerOpen === 'highlight' ? colorPickerHostRef : undefined}>
          <button
            type="button"
            className={`pg-tb-color-btn${colorPickerOpen === 'highlight' ? ' pg-tb-active' : ''}`}
            title="Text highlight color"
            onClick={() => setColorPickerOpen(colorPickerOpen === 'highlight' ? null : 'highlight')}
            aria-label="Highlight color"
            id="tb-highlight-color-btn"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Highlighter size={13} />
              <ChevronDown size={10} />
            </span>
            <span className="pg-tb-color-bar" style={{ background: activeHighlightColor === 'auto' ? 'transparent' : activeHighlightColor, border: activeHighlightColor === 'auto' ? '1px dashed #666' : 'none' }} />
          </button>
          {colorPickerOpen === 'highlight' && (
            <ColorSwatchPicker
              kind="highlight"
              activeColor={activeHighlightColor}
              onSelect={applyHighlightColor}
              onAuto={() => applyHighlightColor('auto')}
            />
          )}
        </div>

        {/* ── Container / Paragraph Background Color Button ── */}
        <div className="pg-color-picker-host" ref={colorPickerOpen === 'bg' ? colorPickerHostRef : undefined}>
          <button
            type="button"
            className={`pg-tb-color-btn${colorPickerOpen === 'bg' ? ' pg-tb-active' : ''}`}
            title="Background color"
            onClick={() => setColorPickerOpen(colorPickerOpen === 'bg' ? null : 'bg')}
            aria-label="Background color"
            id="tb-bg-color-btn"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Paintbrush size={13} />
              <ChevronDown size={10} />
            </span>
            <span className="pg-tb-color-bar" style={{ background: containerBgColor || '#1c1a16', border: !containerBgColor ? '1px dashed #666' : 'none' }} />
          </button>
          {colorPickerOpen === 'bg' && (
            <div className="pg-color-popover" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" className="pg-color-auto-btn" onClick={() => { setContainerBgColor(''); setColorPickerOpen(null); }}>
                <span className="pg-color-auto-swatch" />
                None / Transparent
              </button>
              <p className="pg-color-section-label">Quick Colors</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {QUICK_COLORS.map((c, idx) => (
                  <button
                    key={`bg-quick-${idx}`}
                    type="button"
                    className={`pg-color-swatch${containerBgColor === c ? ' pg-swatch-active' : ''}`}
                    style={{ background: c === 'transparent' ? 'transparent' : c, border: c === 'transparent' ? '1px dashed #555' : '1px solid rgba(0,0,0,0.25)', width: 22, height: 22 }}
                    title={c}
                    onClick={() => { setContainerBgColor(c === 'transparent' ? '' : c); setColorPickerOpen(null); }}
                  />
                ))}
              </div>
              <p className="pg-color-section-label" style={{ marginTop: 4 }}>Theme Colors</p>
              <div className="pg-color-grid pg-color-grid--theme">
                {THEME_COLORS.flat().map((color, idx) => (
                  <button
                    key={`bg-theme-${idx}`}
                    type="button"
                    className={`pg-color-swatch${containerBgColor === color ? ' pg-swatch-active' : ''}`}
                    style={{ background: color }}
                    title={color}
                    onClick={() => { setContainerBgColor(color); setColorPickerOpen(null); }}
                  />
                ))}
              </div>
              <p className="pg-color-section-label" style={{ marginTop: 6 }}>Standard Colors</p>
              <div className="pg-color-grid pg-color-grid--standard">
                {STANDARD_COLORS.map((color, idx) => (
                  <button
                    key={`bg-std-${idx}`}
                    type="button"
                    className={`pg-color-swatch${containerBgColor === color ? ' pg-swatch-active' : ''}`}
                    style={{ background: color }}
                    title={color}
                    onClick={() => { setContainerBgColor(color); setColorPickerOpen(null); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

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

        <button type="button" className={`pg-tb-btn${activeAlign('left')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            chain = chain?.updateAttributes('placeholder', { textAlign: 'left' });
          }
          chain?.setTextAlign('left').run();
        })} title="Align left">
          <AlignLeft size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('center')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            chain = chain?.updateAttributes('placeholder', { textAlign: 'center' });
          }
          chain?.setTextAlign('center').run();
        })} title="Align center">
          <AlignCenter size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('right')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            chain = chain?.updateAttributes('placeholder', { textAlign: 'right' });
          }
          chain?.setTextAlign('right').run();
        })} title="Align right">
          <AlignRight size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${activeAlign('justify')}`} onMouseDown={cmd(() => {
          let chain = editor?.chain().focus();
          if (editor?.isActive('placeholder')) {
            chain = chain?.updateAttributes('placeholder', { textAlign: 'justify' });
          }
          chain?.setTextAlign('justify').run();
        })} title="Justify">
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

        <button type="button" className={`pg-tb-btn pg-tb-btn--accent${insertPanel === 'placeholder' ? ' pg-tb-active' : ''}`} onClick={() => { 
          setInsertError(''); 
          setPhTableColStyles({});
          setPhTextColor('#000000');
          setPhTableStriped(false);
          setInsertPanel(insertPanel === 'placeholder' ? null : 'placeholder'); 
        }} title="Insert typed placeholder">
          <Braces size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'image' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'image' ? null : 'image'); }} title="Insert image component">
          <FileImage size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'hyperlink' ? ' pg-tb-active' : ''}`} onClick={() => { setInsertError(''); setInsertPanel(insertPanel === 'hyperlink' ? null : 'hyperlink'); }} title="Insert hyperlink component">
          <LinkIcon size={16} />
        </button>
        <button type="button" className={`pg-tb-btn${insertPanel === 'table' ? ' pg-tb-active' : ''}`} onClick={() => { 
          setInsertError(''); 
          setPhTableColStyles({});
          setPhTextColor('#000000');
          setPhTableStriped(false);
          setInsertPanel(insertPanel === 'table' ? null : 'table'); 
        }} title="Insert table component">
          <Table size={16} />
        </button>

        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => editor?.chain().focus().setHorizontalRule().run())} title="Insert horizontal rule">
          <Minus size={16} />
        </button>
        <button type="button" className="pg-tb-btn" onMouseDown={cmd(insertPageBreak)} title="Insert page break">
          <SeparatorHorizontal size={16} />
        </button>
        <button type="button" className="pg-tb-btn" onMouseDown={cmd(insertHeaderComponent)} title="Insert header component">
          H
        </button>
        <button type="button" className="pg-tb-btn" onMouseDown={cmd(insertFooterComponent)} title="Insert footer component">
          F
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        {/* ── Styles /  Style panel toggle ── */}
        <button
          type="button"
          className={`pg-tb-style-btn${isStylePanelOpen ? ' pg-tb-active' : ''}`}
          onClick={() => setIsStylePanelOpen((s) => !s)}
          title="Component styles"
          id="tb-style-panel-btn"
        >
          Styles ▾
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        <button type="button" className="pg-tb-btn pg-tb-btn--accent" onMouseDown={cmd(openPreview)} title="Preview document">
          Preview
        </button>
      </div>

      {/* ── Contextual Table Toolbar ── */}
      {editor?.isActive('table') && (
        <div className="pg-tiptap-toolbar" style={{ borderTop: 'none', borderBottom: '1px solid #222', background: 'transparent' }} role="toolbar" aria-label="Table controls">
          <span className="pg-style-panel-label" style={{ marginRight: 8, marginLeft: 8 }}>Table:</span>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().addRowBefore().run())}>Insert Row Above</button>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().addRowAfter().run())}>Insert Row Below</button>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().deleteRow().run())}>Delete Row</button>
          <span className="pg-tb-sep" aria-hidden="true" />
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().addColumnBefore().run())}>Insert Col Left</button>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().addColumnAfter().run())}>Insert Col Right</button>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().deleteColumn().run())}>Delete Col</button>
          <span className="pg-tb-sep" aria-hidden="true" />
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().mergeCells().run())} disabled={!editor?.can().mergeCells()}>Merge Cells</button>
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px' }} onMouseDown={cmd(() => editor?.chain().focus().splitCell().run())} disabled={!editor?.can().splitCell()}>Split Cell</button>
          <span className="pg-tb-sep" aria-hidden="true" />
          
          <div className="pg-color-picker-host" ref={colorPickerOpen === 'cellBg' ? colorPickerHostRef : undefined}>
            <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4 }} title="Cell Background Color" onClick={() => setColorPickerOpen(colorPickerOpen === 'cellBg' ? null : 'cellBg')}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '1px solid #777', background: '#ccc' }} /> Cell Color
            </button>
            {colorPickerOpen === 'cellBg' && (
              <div className="pg-color-popover" onMouseDown={(e) => e.stopPropagation()} style={{ right: 0, left: 'auto' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: 160, padding: 8 }}>
                  {QUICK_COLORS.map((c, idx) => (
                    <button
                      key={`cell-bg-${idx}`}
                      type="button"
                      className="pg-color-swatch"
                      style={{ background: c === 'transparent' ? 'transparent' : c, border: c === 'transparent' ? '1px dashed #666' : '1px solid rgba(0,0,0,0.25)', width: 22, height: 22 }}
                      title={c}
                      onClick={() => applyCellBgColor(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <span className="pg-tb-sep" aria-hidden="true" />
          <button type="button" className="pg-tb-btn" style={{ fontSize: '0.75rem', padding: '0 8px', color: '#ff6b6b' }} onMouseDown={cmd(() => editor?.chain().focus().deleteTable().run())}>Delete Table</button>
        </div>
      )}

      {/* ── Style Panel (component-specific settings) ── */}
      {isStylePanelOpen && (
        <div className="pg-style-panel" role="region" aria-label="Component styles">
          <span className="pg-style-panel-label">Styles:</span>

          {/* Text Color quick swatch */}
          <div className="pg-style-section">
            <span className="pg-style-panel-label">Text</span>
            <div className="pg-style-color-row">
              {['#000000', '#1F497D', '#C00000', '#4F6228', '#7030A0', '#0070C0', '#FFFFFF'].map((c) => (
                <button
                  key={`st-text-${c}`}
                  type="button"
                  className={`pg-style-swatch${activeTextColor === c ? ' pg-swatch-active' : ''}`}
                  style={{ background: c, border: c === '#FFFFFF' ? '1px solid #555' : '1px solid rgba(0,0,0,0.25)' }}
                  title={`Text color ${c}`}
                  onClick={() => applyTextColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Highlight Color quick swatch */}
          <div className="pg-style-section">
            <span className="pg-style-panel-label">Highlight</span>
            <div className="pg-style-color-row">
              {['#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FFA500', '#FF6666', '#92D050', '#00B0F0'].map((c) => (
                <button
                  key={`st-hl-${c}`}
                  type="button"
                  className={`pg-style-swatch${activeHighlightColor === c ? ' pg-swatch-active' : ''}`}
                  style={{ background: c }}
                  title={`Highlight ${c}`}
                  onClick={() => applyHighlightColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Container background color */}
          <div className="pg-style-section">
            <span className="pg-style-panel-label">Background</span>
            <div className="pg-style-color-row">
              {QUICK_COLORS.map((c, idx) => (
                <button
                  key={`st-bg-${idx}`}
                  type="button"
                  className={`pg-style-swatch${containerBgColor === (c === 'transparent' ? '' : c) ? ' pg-swatch-active' : ''}`}
                  style={{ background: c === 'transparent' ? 'transparent' : c, border: c === 'transparent' ? '1px dashed #666' : '1px solid rgba(0,0,0,0.25)' }}
                  title={c}
                  onClick={() => setContainerBgColor(c === 'transparent' ? '' : c)}
                />
              ))}
            </div>
          </div>


          {/* Active background chip */}
          {containerBgColor && (
            <div className="pg-container-bg-chip">
              <span className="pg-container-bg-preview" style={{ background: containerBgColor }} />
              {containerBgColor}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--pg-text-muted)', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: 12, lineHeight: 1 }}
                onClick={() => setContainerBgColor('')}
                aria-label="Clear background color"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

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
                  <option value="list" disabled={hasDynamicPlaceholder}>list{hasDynamicPlaceholder ? ' (limit reached)' : ''}</option>
                  <option value="repeat" disabled={hasDynamicPlaceholder}>repeat{hasDynamicPlaceholder ? ' (limit reached)' : ''}</option>
                  <option value="custom" disabled={hasDynamicPlaceholder}>custom{hasDynamicPlaceholder ? ' (limit reached)' : ''}</option>
                  <option value="table" disabled={hasDynamicPlaceholder}>table{hasDynamicPlaceholder ? ' (limit reached)' : ''}</option>
                </select>
                {hasDynamicPlaceholder && (
                  <p className="pg-insert-hint" style={{ color: '#b8860b', fontSize: '12px', marginTop: '4px' }}>
                    ⚠ This template already contains a dynamic placeholder. Only static types (string, integer, image, hyperlink) can be added.
                  </p>
                )}
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

              {phKind === 'table' && (
                <div className="pg-insert-row" style={{ marginTop: 12 }}>
                  <label className="pg-label">Table Styling</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={phTableStriped}
                        onChange={(e) => setPhTableStriped(e.target.checked)}
                      />
                      <span className="pg-label" style={{ marginBottom: 0 }}>Striped Rows</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="pg-label" style={{ marginBottom: 0 }}>Text Color:</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['#000000', '#1F497D', '#C00000', '#4F6228', '#7030A0'].map(c => (
                          <button
                            key={`ph-clr-${c}`}
                            type="button"
                            className={`pg-color-swatch ${phTextColor === c ? 'pg-swatch-active' : ''}`}
                            style={{ background: c, width: 20, height: 20, cursor: 'pointer' }}
                            onClick={() => setPhTextColor(c)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
                          <pre>Create tokens, then reference them in the placeholder template with {`{{token.tokenId}}`}.</pre>
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
                                <p className="pg-layout-preview-label">{describeTokenLibraryItem(token)}</p>

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
                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">Caption</label>
                                      <input
                                        className="pg-input"
                                        value={token.tableCaption || ''}
                                        onChange={(e) => updateCustomItem(token.id, { tableCaption: e.target.value })}
                                        placeholder="Quarterly summary"
                                      />
                                    </div>

                                    <div className="pg-layout-composer-actions">
                                      <label className="pg-label">Headers</label>
                                    </div>
                                    <div className="pg-layout-composer">
                                      <div className="pg-layout-composer-actions">
                                        <input
                                          className="pg-input"
                                          value={token.tableHeaderDraft || ''}
                                          onChange={(e) => updateCustomItem(token.id, { tableHeaderDraft: e.target.value })}
                                          placeholder="header_name"
                                        />
                                        <button
                                          type="button"
                                          className="pg-layout-pattern"
                                          onClick={() => {
                                            const nextHeader = normalizeIdentifierDraft(token.tableHeaderDraft || '');
                                            if (!nextHeader || !KEY_RE.test(nextHeader)) {
                                              setInsertError('Table header name is invalid. Use letters/digits/underscore and start with letter or _.');
                                              return;
                                            }

                                            const uniqueHeaders = unique([...(token.tableHeaders || []), nextHeader]);
                                            const dynamicSet = new Set(Array.isArray(token.dynamicFields) ? token.dynamicFields : uniqueHeaders);
                                            const nextDynamic = uniqueHeaders.filter((header) => dynamicSet.has(header));
                                            const nextStaticValues = token.staticValues && typeof token.staticValues === 'object' && !Array.isArray(token.staticValues)
                                              ? { ...token.staticValues }
                                              : {};
                                            Object.keys(nextStaticValues).forEach((key) => {
                                              if (!uniqueHeaders.includes(key)) delete nextStaticValues[key];
                                            });

                                            updateCustomItem(token.id, {
                                              tableHeaders: uniqueHeaders,
                                              dynamicFields: nextDynamic,
                                              staticValues: nextStaticValues,
                                              tableHeaderDraft: '',
                                            });
                                          }}
                                        >
                                          + Header
                                        </button>
                                      </div>
                                      <div className="pg-layout-token-list">
                                        {(token.tableHeaders || []).map((header) => (
                                          <span key={header} className="pg-layout-segment pg-layout-segment-token">
                                            {header}
                                            <button
                                              type="button"
                                              className="pg-layout-segment-btn"
                                              style={{ marginLeft: 6 }}
                                              onClick={() => {
                                                const nextHeaders = (token.tableHeaders || []).filter((item) => item !== header);
                                                const nextDynamic = Array.isArray(token.dynamicFields)
                                                  ? token.dynamicFields.filter((item) => item !== header)
                                                  : [];
                                                const nextStaticValues = token.staticValues && typeof token.staticValues === 'object' && !Array.isArray(token.staticValues)
                                                  ? { ...token.staticValues }
                                                  : {};
                                                delete nextStaticValues[header];
                                                updateCustomItem(token.id, {
                                                  tableHeaders: nextHeaders.length > 0 ? nextHeaders : ['Column_1', 'Column_2'],
                                                  dynamicFields: nextDynamic.length > 0 ? nextDynamic : ['Column_1', 'Column_2'],
                                                  staticValues: nextStaticValues,
                                                });
                                              }}
                                              aria-label={`Remove ${header}`}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    {(token.tableHeaders || []).map((header) => {
                                      const dynamicSet = new Set(Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0
                                        ? token.dynamicFields
                                        : (token.tableHeaders || []));
                                      const isDynamic = dynamicSet.has(header);
                                      const staticValues = token.staticValues && typeof token.staticValues === 'object' && !Array.isArray(token.staticValues)
                                        ? token.staticValues
                                        : {};
                                      return (
                                        <div className="pg-layout-composer-actions" key={`${token.id}-field-${header}`}>
                                          <label className="pg-label">{header}</label>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                              type="checkbox"
                                              checked={isDynamic}
                                              onChange={(e) => {
                                                const next = new Set(dynamicSet);
                                                if (e.target.checked) {
                                                  next.add(header);
                                                } else {
                                                  next.delete(header);
                                                }
                                                updateCustomItem(token.id, { dynamicFields: Array.from(next) });
                                              }}
                                            />
                                            Dynamic
                                          </label>
                                          {!isDynamic ? (
                                            <input
                                              className="pg-input"
                                              value={typeof staticValues[header] === 'string' || typeof staticValues[header] === 'number' ? String(staticValues[header]) : ''}
                                              onChange={(e) => {
                                                const nextStatic = { ...(staticValues as Record<string, unknown>), [header]: e.target.value };
                                                updateCustomItem(token.id, { staticValues: nextStatic });
                                              }}
                                              placeholder="Static value"
                                            />
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </>
                                )}

                                {token.kind === 'hyperlink' && (() => {
                                  const dynamicSet = new Set(Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0
                                    ? token.dynamicFields
                                    : ['alias', 'url']);
                                  const staticValues = token.staticValues && typeof token.staticValues === 'object' && !Array.isArray(token.staticValues)
                                    ? token.staticValues
                                    : {};
                                  return (
                                    <>
                                      {['alias', 'url'].map((field) => {
                                        const isDynamic = dynamicSet.has(field);
                                        return (
                                          <div className="pg-layout-composer-actions" key={`${token.id}-${field}`}>
                                            <label className="pg-label">{field}</label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <input
                                                type="checkbox"
                                                checked={isDynamic}
                                                onChange={(e) => {
                                                  const next = new Set(dynamicSet);
                                                  if (e.target.checked) next.add(field);
                                                  else next.delete(field);
                                                  updateCustomItem(token.id, { dynamicFields: Array.from(next) });
                                                }}
                                              />
                                              Dynamic
                                            </label>
                                            {!isDynamic ? (
                                              <input
                                                className="pg-input"
                                                value={typeof staticValues[field] === 'string' ? String(staticValues[field]) : ''}
                                                onChange={(e) => {
                                                  const nextStatic = { ...(staticValues as Record<string, unknown>), [field]: e.target.value };
                                                  updateCustomItem(token.id, { staticValues: nextStatic });
                                                }}
                                                placeholder={`Static ${field}`}
                                              />
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </>
                                  );
                                })()}

                                {token.kind === 'image' && (() => {
                                  const dynamicSet = new Set(Array.isArray(token.dynamicFields) && token.dynamicFields.length > 0
                                    ? token.dynamicFields
                                    : ['src', 'alt']);
                                  const staticValues = token.staticValues && typeof token.staticValues === 'object' && !Array.isArray(token.staticValues)
                                    ? token.staticValues
                                    : {};
                                  return (
                                    <>
                                      {['src', 'alt'].map((field) => {
                                        const isDynamic = dynamicSet.has(field);
                                        return (
                                          <div className="pg-layout-composer-actions" key={`${token.id}-${field}`}>
                                            <label className="pg-label">{field}</label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <input
                                                type="checkbox"
                                                checked={isDynamic}
                                                onChange={(e) => {
                                                  const next = new Set(dynamicSet);
                                                  if (e.target.checked) next.add(field);
                                                  else next.delete(field);
                                                  updateCustomItem(token.id, { dynamicFields: Array.from(next) });
                                                }}
                                              />
                                              Dynamic
                                            </label>
                                            {!isDynamic ? (
                                              <input
                                                className="pg-input"
                                                value={typeof staticValues[field] === 'string' ? String(staticValues[field]) : ''}
                                                onChange={(e) => {
                                                  const nextStatic = { ...(staticValues as Record<string, unknown>), [field]: e.target.value };
                                                  updateCustomItem(token.id, { staticValues: nextStatic });
                                                }}
                                                placeholder={`Static ${field}`}
                                              />
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </>
                                  );
                                })()}

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
                    <div className="pg-custom-template-editor" aria-label="Custom placeholder editor">
                      <div className="pg-custom-template-toolbar" role="toolbar" aria-label="Custom placeholder template toolbar">
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive('bold') ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().toggleBold().run())} title="Bold">
                          <Bold size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive('italic') ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().toggleItalic().run())} title="Italic">
                          <Italic size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive('highlight') ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().toggleHighlight().run())} title="Highlight">
                          <Highlighter size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive('bulletList') ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().toggleBulletList().run())} title="Bullet list">
                          <List size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive('orderedList') ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().toggleOrderedList().run())} title="Ordered list">
                          <ListOrdered size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive({ textAlign: 'left' }) ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().setTextAlign('left').run())} title="Align left">
                          <AlignLeft size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive({ textAlign: 'center' }) ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().setTextAlign('center').run())} title="Align center">
                          <AlignCenter size={14} />
                        </button>
                        <button type="button" className={`pg-tb-btn${customTemplateEditor?.isActive({ textAlign: 'right' }) ? ' pg-tb-active' : ''}`} onMouseDown={cmd(() => customTemplateEditor?.chain().focus().setTextAlign('right').run())} title="Align right">
                          <AlignRight size={14} />
                        </button>
                        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => customTemplateEditor?.chain().focus().undo().run())} title="Undo" disabled={!customTemplateEditor?.can().undo()}>
                          <Undo size={14} />
                        </button>
                        <button type="button" className="pg-tb-btn" onMouseDown={cmd(() => customTemplateEditor?.chain().focus().redo().run())} title="Redo" disabled={!customTemplateEditor?.can().redo()}>
                          <Redo size={14} />
                        </button>
                      </div>
                      <div className="pg-custom-template-canvas">
                        <EditorContent editor={customTemplateEditor} />
                      </div>
                    </div>
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
                          {`{{token.${token.id}}}`}
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

                  <div className="pg-insert-row">
                    <label className="pg-label">Caption</label>
                    <input
                      className="pg-input"
                      value={phTableCaptionText}
                      onChange={(e) => setPhTableCaptionText(e.target.value)}
                      placeholder="Quarterly summary"
                    />
                  </div>

                  {phTableHeaders.length > 0 && (
                    <div className="pg-insert-row">
                      <label className="pg-label">Column Styling</label>
                      <div className="pg-style-panel" style={{ padding: '8px 0', border: 'none', background: 'transparent' }}>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--pg-border)' }}>
                              <th style={{ padding: '4px', fontWeight: '500' }}>Column</th>
                              <th style={{ padding: '4px', fontWeight: '500' }}>Align</th>
                              <th style={{ padding: '4px', fontWeight: '500' }}>Color</th>
                            </tr>
                          </thead>
                          <tbody>
                            {phTableHeaders.map(header => (
                              <tr key={`col-style-${header}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '4px' }}>{header}</td>
                                <td style={{ padding: '4px' }}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    {(['left', 'center', 'right'] as const).map(a => (
                                      <button
                                        key={`${header}-${a}`}
                                        type="button"
                                        className={`pg-tb-btn ${phTableColStyles[header]?.align === a ? 'pg-tb-active' : ''}`}
                                        style={{ width: 22, height: 22, padding: 0 }}
                                        onClick={() => {
                                          const current = phTableColStyles[header] || {};
                                          setPhTableColStyles({ ...phTableColStyles, [header]: { ...current, align: a } });
                                        }}
                                      >
                                        {a === 'left' && <AlignLeft size={12} />}
                                        {a === 'center' && <AlignCenter size={12} />}
                                        {a === 'right' && <AlignRight size={12} />}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td style={{ padding: '4px' }}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    {['#000000', '#1F497D', '#C00000', '#4F6228', '#7030A0'].map(c => (
                                      <button
                                        key={`${header}-${c}`}
                                        type="button"
                                        className={`pg-color-swatch ${(phTableColStyles[header]?.color || '#000000') === c ? 'pg-swatch-active' : ''}`}
                                        style={{ background: c, width: 16, height: 16 }}
                                        onClick={() => {
                                          const current = phTableColStyles[header] || {};
                                          setPhTableColStyles({ ...phTableColStyles, [header]: { ...current, color: c } });
                                        }}
                                      />
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

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
        <div className="pg-editor-pane" style={{ '--pg-paper-bg': containerBgColor || '#ffffff' } as React.CSSProperties}>
          <EditorContent editor={editor} className="pg-tiptap-content" />
        </div>
      </div>

      {isPreviewOpen && (
        <div className="pg-overlay" onClick={(e) => e.target === e.currentTarget && setIsPreviewOpen(false)}>
          <div className="pg-modal pg-modal-xl pg-modal--preview" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
            <div className="pg-modal-header">
              <h2 className="pg-modal-title" id="preview-modal-title">Document Preview</h2>
              <button className="pg-modal-close" onClick={() => setIsPreviewOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="pg-modal-body pg-modal-body--preview">
              <iframe
                srcDoc={previewSrcdoc}
                title="Document Preview"
                className="pg-preview-iframe"
                sandbox="allow-same-origin"
              />
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

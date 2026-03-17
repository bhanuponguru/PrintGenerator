'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Placeholder } from '@/lib/tiptap/placeholder';
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered, Undo, Redo, Braces } from 'lucide-react';

interface TemplateEditorProps {
  /** Initial TipTap JSON content (from editor.getJSON()). Pass undefined for a blank doc. */
  initialContent?: Record<string, any>;
  /** Called every time the document changes with the latest editor.getJSON() */
  onChange: (json: Record<string, any>) => void;
  hasError?: boolean;
}

/** Validate placeholder key: letters, digits, underscores, must start with letter/underscore */
const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export default function TemplateEditor({
  initialContent,
  onChange,
  hasError = false,
}: TemplateEditorProps) {
  const [showKeyPopover, setShowKeyPopover] = useState(false);
  const [keyDraft,       setKeyDraft]       = useState('');
  const [keyError,       setKeyError]       = useState('');
  const keyInputRef = useRef<HTMLInputElement>(null);

  /* ── Tiptap editor ───────────────────────────────────── */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features that don't make sense for document templates
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder,
    ],
    content: initialContent ?? {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    onUpdate({ editor: ed }) {
      onChange(ed.getJSON());
    },
    // Avoid hydration mismatch on SSR
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'pg-prosemirror',
        spellcheck: 'false',
      },
    },
  });

  // Destroy on unmount
  useEffect(() => () => { editor?.destroy(); }, [editor]);

  // Focus the key input when popover opens
  useEffect(() => {
    if (showKeyPopover) {
      setTimeout(() => keyInputRef.current?.focus(), 40);
    }
  }, [showKeyPopover]);

  /* ── Insert placeholder node at cursor ───────────────── */
  const insertPlaceholder = useCallback(() => {
    const key = keyDraft.trim().replace(/\s+/g, '_');

    if (!key) {
      setKeyError('Key cannot be empty');
      return;
    }
    if (!KEY_RE.test(key)) {
      setKeyError('Letters, digits and underscores only; start with a letter or _');
      return;
    }

    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'placeholder',
        attrs: { key },
        content: [{ type: 'text', text: key }],
      })
      .run();

    setKeyDraft('');
    setKeyError('');
    setShowKeyPopover(false);
  }, [editor, keyDraft]);

  const handleKeyInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); insertPlaceholder(); }
    if (e.key === 'Escape') { setShowKeyPopover(false); }
  };

  /* ── Toolbar helpers ─────────────────────────────────── */
  const active = (name: string, opts?: object) =>
    editor?.isActive(name, opts) ? ' pg-tb-active' : '';

  const cmd = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault(); // don't blur the editor
    fn();
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className={`pg-tiptap-wrapper${hasError ? ' pg-tiptap-error' : ''}`}>
      {/* ── Toolbar ── */}
      <div className="pg-tiptap-toolbar" role="toolbar" aria-label="Editor toolbar">
        {/* Text marks */}
        <button
          type="button"
          className={`pg-tb-btn${active('bold')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleBold().run())}
          title="Bold (Ctrl+B)"
          aria-pressed={editor?.isActive('bold')}
        >
          <Bold size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('italic')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleItalic().run())}
          title="Italic (Ctrl+I)"
          aria-pressed={editor?.isActive('italic')}
        >
          <Italic size={16} />
        </button>

        <button
          type="button"
          className={`pg-tb-btn${active('strike')}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleStrike().run())}
          title="Strikethrough"
          aria-pressed={editor?.isActive('strike')}
        >
          <Strikethrough size={16} />
        </button>

        <span className="pg-tb-sep" aria-hidden="true" />

        {/* Block nodes */}
        <button
          type="button"
          className={`pg-tb-btn${active('heading', { level: 1 })}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
          title="Heading 1"
        ><Heading1 size={16} /></button>

        <button
          type="button"
          className={`pg-tb-btn${active('heading', { level: 2 })}`}
          onMouseDown={cmd(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          title="Heading 2"
        ><Heading2 size={16} /></button>

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
        ><ListOrdered size={16} /></button>

        <span className="pg-tb-sep" aria-hidden="true" />

        {/* Undo / Redo */}
        <button
          type="button"
          className="pg-tb-btn"
          onMouseDown={cmd(() => editor?.chain().focus().undo().run())}
          title="Undo (Ctrl+Z)"
          disabled={!editor?.can().undo()}
        ><Undo size={16} /></button>

        <button
          type="button"
          className="pg-tb-btn"
          onMouseDown={cmd(() => editor?.chain().focus().redo().run())}
          title="Redo (Ctrl+Shift+Z)"
          disabled={!editor?.can().redo()}
        ><Redo size={16} /></button>

        <span className="pg-tb-sep" aria-hidden="true" />

        {/* Insert placeholder — accent button + popover */}
        <div className="pg-tb-placeholder-host">
          <button
            type="button"
            className={`pg-tb-btn pg-tb-btn--accent${showKeyPopover ? ' pg-tb-active' : ''}`}
            onMouseDown={cmd(() => {
              setShowKeyPopover((v) => !v);
              setKeyDraft('');
              setKeyError('');
            })}
            title="Insert placeholder {{key}}"
          >
            <Braces size={16} />
          </button>

          {showKeyPopover && (
            <div className="pg-key-popover" role="dialog" aria-label="Insert placeholder">
              <p className="pg-key-popover-label">Placeholder key</p>
              <p className="pg-key-popover-hint">
                Will render as{' '}
                <code className="pg-key-popover-code">
                  {'{{'}
                  {keyDraft.trim() || 'key'}
                  {'}}'}
                </code>
                {' '}at generation
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  ref={keyInputRef}
                  className={`pg-input${keyError ? ' error' : ''}`}
                  style={{ fontSize: 12, padding: '6px 10px', flex: 1 }}
                  placeholder="e.g. recipient_name"
                  value={keyDraft}
                  onChange={(e) => { setKeyDraft(e.target.value); setKeyError(''); }}
                  onKeyDown={handleKeyInputKeyDown}
                />
                <button
                  type="button"
                  className="pg-btn-primary"
                  style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
                  onClick={insertPlaceholder}
                >
                  Insert
                </button>
              </div>
              {keyError && (
                <p className="pg-field-error" style={{ marginTop: 5 }}>{keyError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── ProseMirror canvas ── */}
      <EditorContent editor={editor} className="pg-tiptap-content" />

      {/* ── Footer — shows placeholder chips detected in doc ── */}
      <EditorPlaceholderFooter editor={editor} />
    </div>
  );
}

/* ─── Footer: live-detected placeholder chips ────────────── */
function EditorPlaceholderFooter({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const found = new Set<string>();
      const json  = editor.getJSON();
      walkTiptapJson(json, (node) => {
        if (node.type === 'placeholder' && node.attrs?.key) {
          found.add(node.attrs.key as string);
        }
      });
      setKeys(Array.from(found));
    };

    update();
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  if (keys.length === 0) return null;

  return (
    <div className="pg-tiptap-footer">
      <span className="pg-tiptap-footer-label">Placeholders detected:</span>
      {keys.map((k) => (
        <span key={k} className="pg-key-chip">{`{{${k}}}`}</span>
      ))}
    </div>
  );
}

/** Shallow recursive walk of TipTap JSON nodes */
function walkTiptapJson(
  node: Record<string, any>,
  visit: (n: Record<string, any>) => void
) {
  visit(node);
  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => walkTiptapJson(child, visit));
  }
}
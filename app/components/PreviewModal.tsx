'use client';

import { useMemo } from 'react';
import type { TemplateData } from '@/types/template';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@/lib/tiptap/placeholder';
import { ComponentExtensions } from '@/lib/tiptap/extensions';

interface PreviewModalProps {
  template: TemplateData;
  onClose: () => void;
}

const PREVIEW_CSS = `
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #111111;
  }
  .pg-page {
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    margin: 20px auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    padding: 20mm;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .pg-page-header { border-bottom: 1px solid #eee; margin-bottom: 20px; padding-bottom: 10px; }
  .pg-page-footer { border-top: 1px solid #eee; margin-top: auto; padding-top: 10px; }
  .pg-page-body { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; table-layout: fixed; }
  th, td { border: 1px solid #b9b9b9; padding: 6px 8px; vertical-align: top; word-break: break-word; }
  th { background: #f2f2f2; font-weight: 600; }
  p { margin: 0 0 8px; }
  div[data-component='page-break'] {
    border-top: 2px dashed #ccc;
    margin: 20px 0;
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

export default function PreviewModal({ template, onClose }: PreviewModalProps) {
  const previewSrcdoc = useMemo(() => {
    try {
      if (template.template?.type !== 'doc') {
        throw new Error('Invalid document structure');
      }

      // Generate HTML from the full tiptap json including structural components
      const html = generateHTML(template.template, [StarterKit, Placeholder, ...ComponentExtensions]);

      // Just a simple wrapper for the HTML
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
        <style>${PREVIEW_CSS}</style></head><body>
        <div class="pg-page">
          <div class="pg-page-body">${html}</div>
        </div>
      </body></html>`;
    } catch {
      return '<html><body style="color:red;padding:20px;font-family:sans-serif;">Unable to render preview.</body></html>';
    }
  }, [template.template]);

  return (
    <div className="pg-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pg-modal pg-modal-xl pg-modal--preview" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div className="pg-modal-header">
          <h2 className="pg-modal-title" id="preview-modal-title">Preview: {template.name}</h2>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="pg-modal-body pg-modal-body--preview">
          <iframe
            srcDoc={previewSrcdoc}
            title={`Preview of ${template.name}`}
            className="pg-preview-iframe"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}

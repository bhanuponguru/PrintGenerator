function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Counts unique placeholder keys in a TipTap template document. */
export function countTemplatePlaceholders(template: unknown): number {
  if (!isRecord(template)) return 0;
  const keys = new Set<string>();

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isRecord(node)) return;

    if (node.type === 'placeholder' && isRecord(node.attrs) && typeof node.attrs.key === 'string' && node.attrs.key.trim() !== '') {
      keys.add(node.attrs.key.trim());
    }

    if ('content' in node) {
      walk(node.content);
    }
  };

  walk(template);
  return keys.size;
}

export function canGenerateFromTemplate(template: unknown): boolean {
  return countTemplatePlaceholders(template) > 0;
}

/** Builds a compact human-readable preview summary for complex template JSON. */
export function summarizeTemplatePreview(template: unknown, maxLength = 220): string {
  if (!isRecord(template)) {
    return 'Preview unavailable';
  }

  const parts: string[] = [];

  const append = (value: string) => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    const last = parts[parts.length - 1];
    if (last === trimmed) return;
    parts.push(trimmed);
  };

  const walk = (node: unknown) => {
    if (parts.join(' • ').length >= maxLength) return;

    if (typeof node === 'string') {
      append(node);
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (!isRecord(node)) return;

    if (node.type === 'text' && typeof node.text === 'string') {
      append(node.text);
      return;
    }

    if (node.type === 'placeholder' && isRecord(node.attrs) && typeof node.attrs.key === 'string') {
      append(`{{${node.attrs.key.trim()}}}`);
    }

    if (node.type === 'pageComponent') append('Page');
    if (node.type === 'headerComponent') append('Header');
    if (node.type === 'footerComponent') append('Footer');
    if (node.type === 'containerComponent') append('Container');

    const attrs = isRecord(node.attrs) ? node.attrs : {};
    const value = isRecord(attrs.value) ? attrs.value : null;

    if (value) {
      if (Array.isArray(value.components)) walk(value.components);
      if (Array.isArray(value.items)) walk(value.items);
      if (Array.isArray(value.rows)) walk(value.rows);
      if (isRecord(value.columns)) walk(Object.values(value.columns));
    }

    if ('content' in node) {
      walk((node as Record<string, unknown>).content);
    }
  };

  walk(template);

  const joined = parts.join(' • ').trim();
  if (!joined) {
    return 'Preview unavailable';
  }

  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1)}…` : joined;
}

export function escapePreviewHtml(text: string): string {
  return escapeHtml(text);
}

import { screen } from '@testing-library/react';

export function getInsertRowSelect(label: string): HTMLSelectElement {
  const labelNode = screen.getByText(label);
  const row = labelNode.closest('.pg-insert-row');
  if (!row) {
    throw new Error(`Unable to locate insert row for label: ${label}`);
  }
  const select = row.querySelector('select');
  if (!select) {
    throw new Error(`Unable to locate select for label: ${label}`);
  }
  return select as HTMLSelectElement;
}

export function findPlaceholderByKey(node: unknown, key: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;

  const typed = node as Record<string, unknown>;
  if (typed.type === 'placeholder') {
    const attrs = (typed.attrs || {}) as Record<string, unknown>;
    if (attrs.key === key) {
      return typed;
    }
  }

  const content = typed.content;
  if (Array.isArray(content)) {
    for (const child of content) {
      const match = findPlaceholderByKey(child, key);
      if (match) return match;
    }
  }

  return null;
}
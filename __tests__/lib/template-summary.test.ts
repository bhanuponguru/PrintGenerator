import { describe, expect, it } from 'vitest';
import { canGenerateFromTemplate, countTemplatePlaceholders, summarizeTemplatePreview } from '@/lib/template-summary';

describe('template summary helpers', () => {
  it('counts unique placeholder keys from a TipTap document', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'placeholder', attrs: { key: 'student_name' } },
            { type: 'placeholder', attrs: { key: 'student_name' } },
            { type: 'placeholder', attrs: { key: 'roll_no' } },
          ],
        },
      ],
    };

    expect(countTemplatePlaceholders(template)).toBe(2);
    expect(canGenerateFromTemplate(template)).toBe(true);
  });

  it('returns zero for templates without placeholders', () => {
    const template = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    };

    expect(countTemplatePlaceholders(template)).toBe(0);
    expect(canGenerateFromTemplate(template)).toBe(false);
  });

  it('handles invalid template payloads safely', () => {
    expect(countTemplatePlaceholders(null)).toBe(0);
    expect(countTemplatePlaceholders(undefined)).toBe(0);
    expect(countTemplatePlaceholders('bad')).toBe(0);
    expect(canGenerateFromTemplate('bad')).toBe(false);
  });

  it('summarizes structural templates into readable preview text', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'headerComponent',
          attrs: {
            value: { components: ['Header text'] },
            component_types: [{ kind: 'string' }],
          },
        },
        {
          type: 'pageComponent',
          attrs: {
            value: {
              components: [
                { type: 'text', text: 'Body text' },
                { type: 'placeholder', attrs: { key: 'student_name' } },
              ],
            },
            component_types: [{ kind: 'string' }],
            pageNumber: 1,
          },
        },
        {
          type: 'footerComponent',
          attrs: {
            value: { components: ['Footer text'] },
            component_types: [{ kind: 'string' }],
          },
        },
      ],
    };

    const summary = summarizeTemplatePreview(template);

    expect(summary).toContain('Header');
    expect(summary).toContain('Body text');
    expect(summary).toContain('{{student_name}}');
    expect(summary).toContain('Footer');
  });
});

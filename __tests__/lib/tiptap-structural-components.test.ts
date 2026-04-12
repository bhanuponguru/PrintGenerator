import { describe, expect, it } from 'vitest';
import { validatePageAttrs, createPageComponent } from '@/lib/tiptap/page';
import { validateHeaderAttrs, createHeaderComponent } from '@/lib/tiptap/header';
import { validateFooterAttrs, createFooterComponent } from '@/lib/tiptap/footer';
import { validateTemplateStructure } from '@/lib/template-schema';

describe('TipTap Structural Component validators', () => {
  it('rejects page with non-array components', () => {
    const err = validatePageAttrs({ value: { components: {} } });
    expect(err).toContain('components must be an array');
  });

  it('rejects header with non-array components', () => {
    const err = validateHeaderAttrs({ value: { components: 'bad' } });
    expect(err).toContain('components must be an array');
  });

  it('rejects footer with non-array components', () => {
    const err = validateFooterAttrs({ value: { components: null } });
    expect(err).toContain('components must be an array');
  });

  it('creates page component with default attributes', () => {
    const node = createPageComponent({
      components: ['First', 'Second'],
    });

    expect(node.type).toBe('pageComponent');
    expect(node.attrs.pageNumber).toBe(1);
    expect(node.attrs.orientation).toBe('portrait');
    expect(node.attrs.size).toBe('A4');
    expect(node.attrs.value.components).toEqual(['First', 'Second']);
  });

  it('creates page component handling custom options', () => {
    const node = createPageComponent({ components: [] }, {
      pageNumber: 2,
      orientation: 'landscape',
      size: 'A3'
    });

    expect(node.attrs.pageNumber).toBe(2);
    expect(node.attrs.orientation).toBe('landscape');
    expect(node.attrs.size).toBe('A3');
  });

  it('creates header component node from schema-shaped data', () => {
    const node = createHeaderComponent({ components: ['Title'] });
    expect(node.type).toBe('headerComponent');
    expect(node.attrs.value.components).toEqual(['Title']);
  });
});

describe('Template Structural Rules Validation', () => {
  it('rejects a template that is not a document', () => {
    const result = validateTemplateStructure({ type: 'paragraph', content: [] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('must be a document type');
  });

  it('rejects a template with no content array', () => {
    const result = validateTemplateStructure({ type: 'doc', content: null });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('must have content array');
  });

  it('rejects a template with no pages', () => {
    const result = validateTemplateStructure({ type: 'doc', content: [] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('at least one pageComponent');
  });

  it('rejects a template where root blocks are not pageComponents', () => {
    const result = validateTemplateStructure({
      type: 'doc', 
      content: [{ type: 'paragraph' }] 
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("Top-level elements must be 'pageComponent'");
  });

  it('rejects a template where the first pageNumber is not 1', () => {
    const result = validateTemplateStructure({
      type: 'doc', 
      content: [
        { type: 'pageComponent', attrs: { pageNumber: 2 } }
      ] 
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain('first page must start with pageNumber 1');
  });

  it('approves a rigorously constructed template', () => {
    const result = validateTemplateStructure({
      type: 'doc', 
      content: [
        { type: 'pageComponent', attrs: { pageNumber: 1 } },
        { type: 'pageComponent', attrs: { pageNumber: 2 } }
      ] 
    });
    expect(result.valid).toBe(true);
  });
});

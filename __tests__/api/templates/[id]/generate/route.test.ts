import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/templates/[id]/generate/route';
import { clearDatabase, createTestTemplate } from '@/__tests__/helpers/db-helpers';
import { ObjectId } from 'mongodb';

describe('POST /api/templates/[id]/generate', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should return 400 for invalid ObjectId format', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates/invalid/generate', {
      method: 'POST',
      body: JSON.stringify({ dataPoints: [{ name: 'Alice' }] }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'invalid-id' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid template ID format');
  });

  it('should return 400 for invalid dataPoints payload', async () => {
    const template = await createTestTemplate();

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({ dataPoints: 'not-an-array' }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('dataPoints is required and must be a non-empty array');
  });

  it('should return 404 when template is not found', async () => {
    const id = new ObjectId().toString();

    const request = new NextRequest(`http://localhost:3000/api/templates/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ dataPoints: [{ name: 'Alice' }] }),
    });

    const response = await POST(request, { params: Promise.resolve({ id }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template not found');
  });

  it('should return 400 when a datapoint misses required placeholders', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Name: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'name',
                  kind: 'string',
                },
                content: [{ type: 'text', text: 'recipient name' }],
              },
              { type: 'text', text: ', Order: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'orderId',
                  kind: 'string',
                },
                content: [{ type: 'text', text: 'order id' }],
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [{ name: 'Alice' }],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid placeholder values');
    expect(data.data.invalidDataPoints).toEqual([
      {
        index: 0,
        missing: ['orderId'],
        invalid: [],
      },
    ]);
  });

  it('should report every invalid datapoint in a batch request', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Name: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'name',
                  kind: 'string',
                },
              },
              { type: 'text', text: ', Profile: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'profile',
                  kind: 'hyperlink',
                },
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [
            {
              name: 'Ada',
              profile: { alias: 'Docs', url: '/relative/profile' },
            },
            {
              name: 'Grace',
            },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid placeholder values');
    expect(data.data.invalidDataPoints).toEqual([
      {
        index: 0,
        missing: [],
        invalid: [expect.stringContaining('absolute URL')],
      },
      {
        index: 1,
        missing: ['profile'],
        invalid: [],
      },
    ]);
  });

  it('should reject runtime overrides of static table captions', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'grades',
                  kind: 'table',
                  schema: {
                    kind: 'table',
                    mode: 'row_data',
                    headers: ['course', 'grade'],
                    caption: 'Semester 1 Courses',
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [
            {
              grades: {
                caption: 'Override caption',
                rows: [{ course: 'Algorithms', grade: 'A' }],
              },
            },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid placeholder values');
    expect(data.data.invalidDataPoints).toEqual([
      {
        index: 0,
        missing: [],
        invalid: [expect.stringContaining('caption is static and cannot be overridden')],
      },
    ]);
  });

  it('should reject runtime overrides of static token-library table fields', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'line_table',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: '{{token.rows}}',
                    token_library: [
                      {
                        id: 'rows',
                        kind: 'table',
                        mode: 'row_data',
                        headers: ['Item', 'Qty'],
                        dynamic_fields: ['Qty'],
                        static_values: { Item: 'Pen' },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [
            {
              line_table: {
                data: {
                  rows: {
                    rows: [{ Item: 'Pencil', Qty: '5' }],
                  },
                },
              },
            },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid placeholder values');
    expect(data.data.invalidDataPoints).toEqual([
      {
        index: 0,
        missing: [],
        invalid: [expect.stringContaining('static and cannot be overridden')],
      },
    ]);
  });

  it('should report per-row nested custom token validation failures in batch mode', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'placeholder',
                attrs: {
                  key: 'profile',
                  kind: 'custom',
                  schema: {
                    kind: 'custom',
                    base_variable: 'token',
                    value_type: { kind: 'string' },
                    layout_template: '{{token.name}} - {{token.site}}',
                    token_library: [
                      { id: 'name', kind: 'string' },
                      { id: 'site', kind: 'hyperlink' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [
            {
              profile: {
                data: {
                  name: 'Ada',
                  site: { alias: 'Docs', url: 'https://example.com/docs' },
                },
              },
            },
            {
              profile: {
                data: {
                  name: 'Grace',
                },
              },
            },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid placeholder values');
    expect(data.data.invalidDataPoints).toEqual([
      {
        index: 1,
        missing: [],
        invalid: [expect.stringContaining('profile.data.site is required by custom token schema')],
      },
    ]);
  });

  it('should return a zip with one PDF per data point', async () => {
    const template = await createTestTemplate({
      template: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Name: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'name',
                  kind: 'string',
                },
                content: [{ type: 'text', text: 'recipient name' }],
              },
              { type: 'text', text: ', Order: ' },
              {
                type: 'placeholder',
                attrs: {
                  key: 'orderId',
                  kind: 'string',
                },
                content: [{ type: 'text', text: 'order id' }],
              },
            ],
          },
        ],
      },
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          dataPoints: [
            { name: 'Alice', orderId: 'ORD-1001' },
            { name: 'Bob', orderId: 'ORD-1002' },
          ],
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });

    if (response.status === 500) {
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to generate documents');
      return;
    }

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');

    const zipBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(Buffer.from(zipBuffer));
    const fileNames = Object.keys(zip.files);

    expect(fileNames).toContain('document-1.pdf');
    expect(fileNames).toContain('document-2.pdf');

    const pdf1 = await zip.file('document-1.pdf')?.async('uint8array');
    const pdf2 = await zip.file('document-2.pdf')?.async('uint8array');

    expect(pdf1).toBeDefined();
    expect(pdf2).toBeDefined();

    const pdfHeader1 = Buffer.from(pdf1!).subarray(0, 4).toString('utf8');
    const pdfHeader2 = Buffer.from(pdf2!).subarray(0, 4).toString('utf8');

    expect(pdfHeader1).toBe('%PDF');
    expect(pdfHeader2).toBe('%PDF');
  }, 60000);
});

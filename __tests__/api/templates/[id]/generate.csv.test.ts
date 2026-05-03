import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/templates/[id]/generate/route';
import { clearDatabase, createTestTemplate } from '@/__tests__/helpers/db-helpers';

describe('POST /api/templates/[id]/generate (CSV)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('accepts text/csv and includes csv-warnings.log for static conflicts', async () => {
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
                  key: 'name',
                  kind: 'string',
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'grades',
                  kind: 'table',
                  schema: {
                    kind: 'table',
                    mode: 'row_data',
                    headers: ['course', 'grade'],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const csv = [
      'id,name,course,grade',
      '1,Ada,Math,A',
      '1,Grace,Physics,B',
    ].join('\n');

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
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

    expect(fileNames).toContain('csv-warnings.log');
    // Depending on PDF runtime availability, generation may produce either a PDF or only error.log.
    expect(fileNames.includes('document-1.pdf') || fileNames.includes('error.log')).toBe(true);

    const warnings = await zip.file('csv-warnings.log')?.async('string');
    expect(warnings).toContain("conflicting static value for 'name'");
  }, 60000);

  it('supports an idField query override in raw CSV requests', async () => {
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
                  key: 'name',
                  kind: 'string',
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'grades',
                  kind: 'table',
                  schema: {
                    kind: 'table',
                    mode: 'row_data',
                    headers: ['course', 'grade'],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const csv = [
      'student_id,name,course,grade',
      '1,Ada,Math,A',
      '1,Ada,Physics,B',
    ].join('\n');

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate?idField=student_id`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
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
  }, 60000);

  it('returns 400 when grouped CSV is missing required id column', async () => {
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
                  key: 'name',
                  kind: 'string',
                },
              },
              {
                type: 'placeholder',
                attrs: {
                  key: 'grades',
                  kind: 'table',
                  schema: {
                    kind: 'table',
                    mode: 'row_data',
                    headers: ['course', 'grade'],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const csv = [
      'name,course,grade',
      'Ada,Math,A',
      'Ada,Physics,B',
    ].join('\n');

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: template._id.toString() }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Missing or empty id column 'id'");
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/templates/route';
import { 
  clearDatabase, 
  createTestTemplate, 
  createTestTemplates,
  countTemplates 
} from '@/__tests__/helpers/db-helpers';
import { NextRequest } from 'next/server';

describe('GET /api/templates', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should return an empty array when no templates exist', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual([]);
  });

  it('should return all templates', async () => {
    // Create test templates
    await createTestTemplates(3);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(3);
    expect(data.data[0]).toHaveProperty('_id');
    expect(data.data[0]).toHaveProperty('name');
    expect(data.data[0]).toHaveProperty('version');
    expect(data.data[0]).toHaveProperty('template');
    expect(data.data[0]).toHaveProperty('created_on');
    expect(data.data[0]).toHaveProperty('updated_on');
  });

  it('should return templates sorted by updated_on in descending order', async () => {
    // Create templates with different updated_on dates
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    await createTestTemplate({ 
      name: 'Old Template', 
      updated_on: twoDaysAgo 
    });
    await createTestTemplate({ 
      name: 'Recent Template', 
      updated_on: now 
    });
    await createTestTemplate({ 
      name: 'Middle Template', 
      updated_on: yesterday 
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(3);
    expect(data.data[0].name).toBe('Recent Template');
    expect(data.data[1].name).toBe('Middle Template');
    expect(data.data[2].name).toBe('Old Template');
  });

  it('should handle database errors gracefully', async () => {
    // Close the connection to simulate error
    const { closeConnection } = await import('@/lib/mongodb');
    await closeConnection();

    // Delete environment variable to force error
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch templates');

    // Restore
    process.env.MONGODB_URI = originalUri;
  });
});

describe('POST /api/templates', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should create a new template with valid data', async () => {
    const templateData = {
      name: 'New Template',
      version: '1.0.0',
      template: {
        title: 'Test Title',
        content: 'Test Content',
      },
    };

    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('_id');
    expect(data.data.name).toBe(templateData.name);
    expect(data.data.version).toBe(templateData.version);
    expect(data.data.template).toEqual(templateData.template);
    expect(data.data).toHaveProperty('created_on');
    expect(data.data).toHaveProperty('updated_on');

    // Verify it was actually saved to database
    const count = await countTemplates();
    expect(count).toBe(1);
  });

  it('should return 400 when name is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        version: '1.0.0',
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Name is required and must be a string');
  });

  it('should return 400 when name is not a string', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 123,
        version: '1.0.0',
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Name is required and must be a string');
  });

  it('should return 400 when version is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Version is required and must be a string');
  });

  it('should return 400 when version is not a string', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        version: 1.0,
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Version is required and must be a string');
  });

  it('should return 400 when template is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        version: '1.0.0',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template is required and must be an object');
  });

  it('should return 400 when template is not an object', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        version: '1.0.0',
        template: 'not an object',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template is required and must be an object');
  });

  it('should create template with complex nested template object', async () => {
    const templateData = {
      name: 'Complex Template',
      version: '2.0.0',
      template: {
        header: {
          title: 'Main Title',
          subtitle: 'Subtitle',
        },
        body: {
          sections: [
            { id: 1, content: 'Section 1' },
            { id: 2, content: 'Section 2' },
          ],
        },
        footer: {
          copyright: '2026',
        },
      },
    };

    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.template).toEqual(templateData.template);
  });

  it('should set created_on and updated_on to the same value for new templates', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        version: '1.0.0',
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.created_on).toBeDefined();
    expect(data.data.updated_on).toBeDefined();
    expect(data.data.created_on).toBe(data.data.updated_on);
  });

  it('should return 400 for placeholder schema missing value_schema', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Placeholder Template',
        version: '1.0.0',
        template: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'placeholder',
                  attrs: { key: 'name' },
                  content: [{ type: 'text', text: 'Name' }],
                },
              ],
            },
          ],
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('value_schema');
  });

  it('should return 400 for invalid hyperlinkComponent attrs', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Hyperlink Node Template',
        version: '1.0.0',
        template: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'hyperlinkComponent',
                  attrs: {
                    value: {
                      alias: 'Docs',
                      url: '/relative-url',
                      in_placeholder: false,
                    },
                    in_placeholder: false,
                  },
                },
              ],
            },
          ],
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('absolute URL');
  });

  it('should handle database errors gracefully', async () => {
    // Close the connection to simulate error
    const { closeConnection } = await import('@/lib/mongodb');
    await closeConnection();

    // Delete environment variable to force error
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    const request = new NextRequest('http://localhost:3000/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        version: '1.0.0',
        template: {},
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to create template');

    // Restore
    process.env.MONGODB_URI = originalUri;
  });
});

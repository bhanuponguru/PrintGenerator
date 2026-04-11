import { describe, it, expect, beforeEach } from 'vitest';
import { GET, PUT, DELETE } from '@/app/api/templates/[id]/route';
import { 
  clearDatabase, 
  createTestTemplate, 
  getTemplateById,
  countTemplates 
} from '@/__tests__/helpers/db-helpers';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

describe('GET /api/templates/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should return a template by valid ID', async () => {
    const template = await createTestTemplate({ 
      name: 'Test Template',
      version: '1.0.0' 
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data._id.toString()).toBe(template._id.toString());
    expect(data.data.name).toBe('Test Template');
    expect(data.data.version).toBe('1.0.0');
  });

  it('should return 400 for invalid ObjectId format', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates/invalid-id');
    const params = Promise.resolve({ id: 'invalid-id' });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid template ID format');
  });

  it('should return 400 for invalid placeholder key type schema', async () => {
    const template = await createTestTemplate();

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          template: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'placeholder',
                    attrs: {
                      key: 'details',
                      value_schema: {
                        kind: 'table',
                        in_placeholder: true,
                        mode: 'row_data',
                        headers: ['A', ''],
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('headers must contain non-empty strings');
  });

  it('should return 404 for non-existent template', async () => {
    const nonExistentId = new ObjectId();
    const request = new NextRequest(
      `http://localhost:3000/api/templates/${nonExistentId.toString()}`
    );
    const params = Promise.resolve({ id: nonExistentId.toString() });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template not found');
  });

  it('should handle database errors gracefully', async () => {
    const template = await createTestTemplate();
    
    // Close the connection to simulate error
    const { closeConnection } = await import('@/lib/mongodb');
    await closeConnection();

    // Delete environment variable to force error
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch template');

    // Restore
    process.env.MONGODB_URI = originalUri;
  });
});

describe('PUT /api/templates/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should update a template name', async () => {
    const template = await createTestTemplate({ 
      name: 'Original Name',
      version: '1.0.0' 
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Updated Name');
    expect(data.data.version).toBe('1.0.0'); // Should remain unchanged

    // Verify in database
    const updated = await getTemplateById(template._id);
    expect(updated?.name).toBe('Updated Name');
  });

  it('should update a template version', async () => {
    const template = await createTestTemplate({ 
      name: 'Test Template',
      version: '1.0.0' 
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ version: '2.0.0' }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.version).toBe('2.0.0');
    expect(data.data.name).toBe('Test Template'); // Should remain unchanged
  });

  it('should update template content', async () => {
    const template = await createTestTemplate({ 
      template: { old: 'data' } 
    });

    const newTemplate = {
      new: 'content',
      nested: { key: 'value' },
    };

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ template: newTemplate }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.template).toEqual(newTemplate);
  });

  it('should update multiple fields at once', async () => {
    const template = await createTestTemplate({ 
      name: 'Old Name',
      version: '1.0.0',
      template: { old: 'data' } 
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: 'New Name',
          version: '2.0.0',
          template: { new: 'data' },
        }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('New Name');
    expect(data.data.version).toBe('2.0.0');
    expect(data.data.template).toEqual({ new: 'data' });
  });

  it('should update the updated_on timestamp', async () => {
    const oldDate = new Date('2020-01-01');
    const template = await createTestTemplate({ updated_on: oldDate });

    // Wait a tiny bit to ensure time difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(new Date(data.data.updated_on).getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should not update created_on timestamp', async () => {
    const createdDate = new Date('2020-01-01');
    const template = await createTestTemplate({ 
      created_on: createdDate,
      updated_on: createdDate 
    });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(new Date(data.data.created_on).getTime()).toBe(createdDate.getTime());
  });

  it('should return 400 for invalid ObjectId format', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/templates/invalid-id',
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }
    );
    const params = Promise.resolve({ id: 'invalid-id' });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid template ID format');
  });

  it('should return 404 for non-existent template', async () => {
    const nonExistentId = new ObjectId();
    const request = new NextRequest(
      `http://localhost:3000/api/templates/${nonExistentId.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }
    );
    const params = Promise.resolve({ id: nonExistentId.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template not found');
  });

  it('should handle empty update body', async () => {
    const template = await createTestTemplate();

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({}),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    // Only updated_on should change
    expect(data.data.name).toBe(template.name);
    expect(data.data.version).toBe(template.version);
  });

  it('should handle database errors gracefully', async () => {
    const template = await createTestTemplate();
    
    // Close the connection to simulate error
    const { closeConnection } = await import('@/lib/mongodb');
    await closeConnection();

    // Delete environment variable to force error
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await PUT(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to update template');

    // Restore
    process.env.MONGODB_URI = originalUri;
  });
});

describe('DELETE /api/templates/[id]', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should delete an existing template', async () => {
    const template = await createTestTemplate();

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.message).toBe('Template deleted successfully');

    // Verify it's deleted from database
    const deleted = await getTemplateById(template._id);
    expect(deleted).toBeNull();
  });

  it('should decrease template count after deletion', async () => {
    await createTestTemplate();
    const template2 = await createTestTemplate({ name: 'Template 2' });

    let count = await countTemplates();
    expect(count).toBe(2);

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template2._id.toString()}`
    );
    const params = Promise.resolve({ id: template2._id.toString() });

    await DELETE(request, { params });

    count = await countTemplates();
    expect(count).toBe(1);
  });

  it('should return 400 for invalid ObjectId format', async () => {
    const request = new NextRequest('http://localhost:3000/api/templates/invalid-id');
    const params = Promise.resolve({ id: 'invalid-id' });

    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid template ID format');
  });

  it('should return 404 when deleting non-existent template', async () => {
    const nonExistentId = new ObjectId();
    const request = new NextRequest(
      `http://localhost:3000/api/templates/${nonExistentId.toString()}`
    );
    const params = Promise.resolve({ id: nonExistentId.toString() });

    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Template not found');
  });

  it('should handle database errors gracefully', async () => {
    const template = await createTestTemplate();
    
    // Close the connection to simulate error
    const { closeConnection } = await import('@/lib/mongodb');
    await closeConnection();

    // Delete environment variable to force error
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`
    );
    const params = Promise.resolve({ id: template._id.toString() });

    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to delete template');

    // Restore
    process.env.MONGODB_URI = originalUri;
  });

  it('should truly remove the template (hard delete)', async () => {
    const template = await createTestTemplate({ name: 'To Be Deleted' });

    const request = new NextRequest(
      `http://localhost:3000/api/templates/${template._id.toString()}`
    );
    const params = Promise.resolve({ id: template._id.toString() });

    await DELETE(request, { params });

    // Verify it cannot be retrieved
    const deleted = await getTemplateById(template._id);
    expect(deleted).toBeNull();

    // Verify count is 0
    const count = await countTemplates();
    expect(count).toBe(0);
  });
});

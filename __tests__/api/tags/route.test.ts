import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createTemplate } from '@/app/api/templates/route';
import { POST as createTag } from '@/app/api/tags/route';
import { DELETE as deleteTag } from '@/app/api/tags/[name]/route';
import { getDb } from '@/lib/mongodb';
import { clearDatabase } from '@/__tests__/helpers/db-helpers';
import { Template } from '@/types/template';

describe('Tag Cleanup Logic Integration Test', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should remove tag_id from all associated templates when a tag is deleted', async () => {
    // 1. Create a Tag
    const tagReq = new NextRequest('http://localhost:3000/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'CleanupTag' })
    });
    const tagRes = await createTag(tagReq);
    const tagData = await tagRes.json();
    const tagId = tagData.data.id;

    expect(tagRes.status).toBe(201);

    // 2. Create 3 Templates and attach the tag
    const templateIds: string[] = [];
    for (let i = 0; i < 3; i++) {
        const tReq = new NextRequest('http://localhost:3000/api/templates', {
            method: 'POST',
            body: JSON.stringify({
                name: `Template ${i}`,
                version: '1.0.0',
                template: {},
                tag_ids: [tagId]
            })
        });
        const tRes = await createTemplate(tReq);
        const tData = await tRes.json();
        expect(tRes.status).toBe(201);
        templateIds.push(tData.data._id);
    }

    // 3. Delete the tag
    const delReq = new NextRequest(`http://localhost:3000/api/tags/CleanupTag`, {
        method: 'DELETE'
    });
    const delRes = await deleteTag(delReq, { params: Promise.resolve({ name: 'CleanupTag' }) });
    expect(delRes.status).toBe(200);

    // 4. Assert that tag_ids array in all 3 templates is now empty
    const db = await getDb();
    const templates = await db.collection<Template>('templates').find({}).toArray();
    
    expect(templates.length).toBe(3);
    for (const template of templates) {
        expect(template.tag_ids).toBeDefined();
        // The array should be empty after deletion since the id was pulled
        expect(template.tag_ids?.length).toBe(0);
    }
  });
});

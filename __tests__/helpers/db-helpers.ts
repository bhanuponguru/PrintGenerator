import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Template } from '@/types/template';

/**
 * Clear all collections in the test database
 */
export async function clearDatabase() {
  const db = await getDb();
  const collections = await db.listCollections().toArray();
  
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
  }
}

/**
 * Create a test template in the database
 */
export async function createTestTemplate(overrides?: Partial<Template>): Promise<Template> {
  const db = await getDb();
  const now = new Date();
  
  const template = {
    name: overrides?.name || 'Test Template',
    version: overrides?.version || '1.0.0',
    template: overrides?.template || { 
      title: 'Sample Title',
      content: 'Sample Content' 
    },
    created_on: overrides?.created_on || now,
    updated_on: overrides?.updated_on || now,
  };

  const result = await db.collection('templates').insertOne(template);
  
  return {
    _id: result.insertedId,
    ...template,
  } as Template;
}

/**
 * Create multiple test templates
 */
export async function createTestTemplates(count: number): Promise<Template[]> {
  const templates: Template[] = [];
  
  for (let i = 0; i < count; i++) {
    const template = await createTestTemplate({
      name: `Test Template ${i + 1}`,
      version: `1.${i}.0`,
      template: { index: i, data: `content ${i}` },
    });
    templates.push(template);
  }
  
  return templates;
}

/**
 * Get a template by ID from the database
 */
export async function getTemplateById(id: string | ObjectId): Promise<Template | null> {
  const db = await getDb();
  return await db.collection<Template>('templates').findOne({ 
    _id: typeof id === 'string' ? new ObjectId(id) : id 
  });
}

/**
 * Count templates in the database
 */
export async function countTemplates(): Promise<number> {
  const db = await getDb();
  return await db.collection('templates').countDocuments();
}

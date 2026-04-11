import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { Template, TemplateInput, ApiResponse } from '@/types/template';

const COLLECTION_NAME = 'templates';

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: List all templates
 *     description: Retrieve all templates sorted by updated_on in descending order
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Successfully retrieved templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Template'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET() {
  try {
    const db = await getDb();
    const templates = await db
      .collection<Template>(COLLECTION_NAME)
      .find({})
      .sort({ updated_on: -1 })
      .toArray();

    const response: ApiResponse<Template[]> = {
      success: true,
      data: templates,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching templates:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch templates',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     description: Create a new template with name, version, and template configuration
 *     tags: [Templates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TemplateInput'
 *     responses:
 *       201:
 *         description: Template created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Template'
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function POST(request: NextRequest) {
  try {
    const body: TemplateInput = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Name is required and must be a string',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!body.version || typeof body.version !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Version is required and must be a string',
      };
      return NextResponse.json(response, { status: 400 });
    }

    if (!body.template || typeof body.template !== 'object') {
      const response: ApiResponse = {
        success: false,
        error: 'Template is required and must be an object',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const now = new Date();
    
    // Convert string array of tags passed by user into valid BSON ObjectIDs
    let tagObjectIds: ObjectId[] = [];
    if (body.tag_ids && Array.isArray(body.tag_ids)) {
      tagObjectIds = body.tag_ids
        .filter((id) => typeof id === 'string' && ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
    }

    const newTemplate: Omit<Template, '_id'> = {
      name: body.name,
      version: body.version,
      template: body.template,
      tag_ids: tagObjectIds,
      created_on: now,
      updated_on: now,
    };

    const db = await getDb();
    const result = await db.collection(COLLECTION_NAME).insertOne(newTemplate);

    // After successful template insertion, asynchronously hook up the backwards mappings onto tags
    if (tagObjectIds.length > 0) {
      // Execute batch updates enforcing dual associations concurrently
      await db.collection('tags').updateMany(
        { _id: { $in: tagObjectIds } },
        { $push: { template_ids: result.insertedId } as any }
      );
    }

    const createdTemplate = {
      _id: result.insertedId,
      ...newTemplate,
    };

    const response: ApiResponse<Template> = {
      success: true,
      data: createdTemplate as Template,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create template',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

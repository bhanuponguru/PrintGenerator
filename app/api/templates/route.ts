import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Template, TemplateInput, ApiResponse } from '@/types/template';

const COLLECTION_NAME = 'templates';

/**
 * GET /api/templates
 * List all templates, sorted by updated_on descending
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
 * POST /api/templates
 * Create a new template
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
    const newTemplate = {
      name: body.name,
      version: body.version,
      template: body.template,
      created_on: now,
      updated_on: now,
    };

    const db = await getDb();
    const result = await db.collection(COLLECTION_NAME).insertOne(newTemplate);

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

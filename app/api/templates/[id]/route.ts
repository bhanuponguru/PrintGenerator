import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { Template, TemplateUpdate, ApiResponse } from '@/types/template';

const COLLECTION_NAME = 'templates';

/**
 * GET /api/templates/[id]
 * Get a single template by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid template ID format',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const db = await getDb();
    const template = await db
      .collection<Template>(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });

    if (!template) {
      const response: ApiResponse = {
        success: false,
        error: 'Template not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<Template> = {
      success: true,
      data: template,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching template:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch template',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * PUT /api/templates/[id]
 * Update a template by ID
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid template ID format',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const body: TemplateUpdate = await request.json();

    // Build update object
    const updateFields: any = {
      updated_on: new Date(),
    };

    if (body.name !== undefined) {
      updateFields.name = body.name;
    }
    if (body.version !== undefined) {
      updateFields.version = body.version;
    }
    if (body.template !== undefined) {
      updateFields.template = body.template;
    }

    const db = await getDb();
    const result = await db
      .collection<Template>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateFields },
        { returnDocument: 'after' }
      );

    if (!result) {
      const response: ApiResponse = {
        success: false,
        error: 'Template not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<Template> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error updating template:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update template',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * DELETE /api/templates/[id]
 * Delete a template by ID (hard delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid template ID format',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const db = await getDb();
    const result = await db
      .collection(COLLECTION_NAME)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      const response: ApiResponse = {
        success: false,
        error: 'Template not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse = {
      success: true,
      data: { message: 'Template deleted successfully' },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error deleting template:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete template',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

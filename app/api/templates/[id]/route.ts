import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { Template, TemplateUpdate, ApiResponse } from '@/types/template';

const COLLECTION_NAME = 'templates';

/**
 * @swagger
 * /api/templates/{id}:
 *   get:
 *     summary: Get a template by ID
 *     description: Retrieve a single template by its MongoDB ObjectId
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the template
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Template retrieved successfully
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
 *         description: Invalid template ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
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
 * @swagger
 * /api/templates/{id}:
 *   put:
 *     summary: Update a template
 *     description: Update an existing template's name, version, or configuration
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the template
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TemplateUpdate'
 *     responses:
 *       200:
 *         description: Template updated successfully
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
 *         description: Invalid template ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
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
 * @swagger
 * /api/templates/{id}:
 *   delete:
 *     summary: Delete a template
 *     description: Permanently delete a template by its ID (hard delete)
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the template
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Template deleted successfully
 *       400:
 *         description: Invalid template ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
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

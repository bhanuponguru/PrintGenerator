import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ApiResponse } from '@/types/template';
import { Tag, TagCreateInput, TagUpdateInput, TagResponse } from '@/types/tag';

const COLLECTION_NAME = 'tags';

/**
 * Handle GET requests to retrieve all tag details.
 */
export async function GET() {
  try {
    const db = await getDb();
    const tags = await db
      .collection<Tag>(COLLECTION_NAME)
      .find({})
      .sort({ name: 1 })
      .toArray();

    const tagResponses: TagResponse[] = tags.map(tag => ({
      _id: tag._id.toString(),
      name: tag.name,
      template_ids: (tag.template_ids || []).map(id => id.toString()),
      created_on: tag._id.getTimestamp().toISOString(),
    }));

    const response: ApiResponse<TagResponse[]> = {
      success: true,
      data: tagResponses,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

/**
 * Handle POST requests to create a new tag.
 */
export async function POST(request: NextRequest) {
  try {
    const body: TagCreateInput = await request.json();

    // Validate input
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Tag name is required and must be a valid string' },
        { status: 400 }
      );
    }

    const tagName = body.name.trim();
    const db = await getDb();
    
    // Check for unique tag constraint explicitly
    const existingTag = await db.collection<Tag>(COLLECTION_NAME).findOne({ name: tagName });
    if (existingTag) {
      return NextResponse.json(
        { success: false, error: 'Tag already exists' },
        { status: 409 } // Conflict
      );
    }

    const newTag = {
      name: tagName,
      template_ids: [],
    };

    const result = await db.collection(COLLECTION_NAME).insertOne(newTag);

    const response: ApiResponse<{ id: string }> = {
      success: true,
      data: { id: result.insertedId.toString() },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}

/**
 * Handle PATCH requests to update a tag's name.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body: TagUpdateInput = await request.json();

    if (!body.old_name || typeof body.old_name !== 'string' ||
        !body.new_name || typeof body.new_name !== 'string' || body.new_name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Both old_name and valid new_name strings are required' },
        { status: 400 }
      );
    }

    const oldName = body.old_name.trim();
    const newName = body.new_name.trim();
    
    const db = await getDb();

    // Check if new tag name already exists (would cause conflict)
    const existingTarget = await db.collection<Tag>(COLLECTION_NAME).findOne({ name: newName });
    if (existingTarget && newName !== oldName) {
      return NextResponse.json(
        { success: false, error: `Tag '${newName}' already exists` },
        { status: 409 } // Conflict
      );
    }

    // Perform rename
    const result = await db.collection<Tag>(COLLECTION_NAME).updateOne(
      { name: oldName },
      { $set: { name: newName } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Tag doesn't exist" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error updating tag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update tag' },
      { status: 500 }
    );
  }
}

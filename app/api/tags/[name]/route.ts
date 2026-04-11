import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Tag } from '@/types/tag';

const COLLECTION_NAME = 'tags';
const TEMPLATES_COLLECTION = 'templates';

/**
 * Handle DELETE requests to delete a tag by name and remove it from all templates.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name).trim();

    const db = await getDb();
    
    // 1. Find the target tag to get its _id
    const tag = await db.collection<Tag>(COLLECTION_NAME).findOne({ name: decodedName });
    
    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag not found' },
        { status: 404 }
      );
    }

    // 2. Remove this tag's _id from the tag_ids array of any template that has it
    // We use the $pull operator natively in MongoDB for maximum atomic efficiency
    await db.collection(TEMPLATES_COLLECTION).updateMany(
      { tag_ids: tag._id }, 
      { $pull: { tag_ids: tag._id } as any }
    );

    // 3. Delete the actual tag document completely
    await db.collection(COLLECTION_NAME).deleteOne({ _id: tag._id });

    return NextResponse.json(
      { success: true, data: { message: 'Tag deleted successfully' } },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}

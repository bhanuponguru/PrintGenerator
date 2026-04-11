import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Tag } from '@/types/tag';
import { Template } from '@/types/template';

const COLLECTION_NAME = 'tags';
const TEMPLATES_COLLECTION = 'templates';

/**
 * Handle GET requests to return all templates associated with a specific tag name.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name).trim();

    const db = await getDb();
    
    // 1. Look up the tag by its semantic name
    const tag = await db.collection<Tag>(COLLECTION_NAME).findOne({ name: decodedName });
    
    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag not found' },
        { status: 404 }
      );
    }

    // 2. Resolve the templates two ways seamlessly. As performance optimizations detail: 
    // "having template associations information on tag helps when fetching all templates associated to a tag"
    // Utilizing the direct tag.template_ids field guarantees constant complexity resolving via $in operator.
    
    const templateIds = tag.template_ids || [];
    
    const templates = await db.collection<Template>(TEMPLATES_COLLECTION)
      .find({ _id: { $in: templateIds } })
      .sort({ updated_on: -1 })
      .toArray();

    return NextResponse.json(
      { success: true, data: templates },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching templates for tag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates for tag' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getApiDocs } from '@/lib/swagger';

/**
 * GET /api/docs
 * Returns the OpenAPI specification
 */
export async function GET() {
  const spec = getApiDocs();
  return NextResponse.json(spec);
}

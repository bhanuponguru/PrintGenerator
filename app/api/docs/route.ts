import { NextResponse } from 'next/server';
import { getApiDocs } from '@/lib/swagger';

/**
 * Returns the generated OpenAPI specification used by the docs page.
 */
export async function GET() {
  const spec = getApiDocs();
  return NextResponse.json(spec);
}

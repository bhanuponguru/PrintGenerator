import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';

const MAX_BYTES = 2_000_000; // 2 MB
const ALLOWED_MIMES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = (form.get('file') || form.get('image')) as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    // Some runtimes expose size/type on the File-like object
    const size = (file as any).size ?? undefined;
    if (typeof size === 'number' && size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'File too large' }, { status: 413 });
    }

    const mime = (file as any).type || '';
    const ext = ALLOWED_MIMES[mime];
    if (!ext) {
      return NextResponse.json({ success: false, error: 'Unsupported file type' }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as any).arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'File too large' }, { status: 413 });
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'images');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, buffer, { mode: 0o644 });

    const url = `/uploads/images/${filename}`;
    return NextResponse.json({ success: true, url }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
  }
}

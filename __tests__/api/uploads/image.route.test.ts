import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { POST } from '@/app/api/uploads/image/route';

async function makeBuffer(size: number) {
  return Buffer.alloc(size, 0xff);
}

describe('POST /api/uploads/image', () => {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'images');
  let createdFiles: string[] = [];

  afterEach(async () => {
    // cleanup any files created during tests
    for (const f of createdFiles) {
      try { await fs.unlink(path.join(uploadsDir, f)); } catch {}
    }
    createdFiles = [];
  });

  it('accepts a valid PNG under 2MB', async () => {
    const buffer = await makeBuffer(1024 * 10);
    const fileObj = {
      size: buffer.length,
      type: 'image/png',
      name: 'test.png',
      arrayBuffer: async () => buffer.buffer,
    } as any;

    const req = {
      formData: async () => ({ get: (_: string) => fileObj }),
    } as any;

    const res = await POST(req as any);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.url).toBe('string');
    const parts = data.url.split('/');
    const filename = parts[parts.length - 1];
    createdFiles.push(filename);
  });

  it('rejects files over 2MB with 413', async () => {
    const buffer = await makeBuffer(2_100_000);
    const fileObj = {
      size: buffer.length,
      type: 'image/png',
      name: 'big.png',
      arrayBuffer: async () => buffer.buffer,
    } as any;

    const req = { formData: async () => ({ get: (_: string) => fileObj }) } as any;
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(413);
    expect(data.success).toBe(false);
  });

  it('rejects unsupported mime types', async () => {
    const buffer = await makeBuffer(1024);
    const fileObj = {
      size: buffer.length,
      type: 'application/pdf',
      name: 'doc.pdf',
      arrayBuffer: async () => buffer.buffer,
    } as any;

    const req = { formData: async () => ({ get: (_: string) => fileObj }) } as any;
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

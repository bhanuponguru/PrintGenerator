import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { Template } from '@/types/template';
import {
  applyTemplateDataPoint,
  collectRequiredPlaceholderKeys,
  createPdfFromDocumentHtml,
  DataPoint,
  findMissingPlaceholderKeys,
  renderDocumentHtml,
} from '@/lib/document-generation';

const COLLECTION_NAME = 'templates';

interface GenerateDocumentsRequest {
  dataPoints?: DataPoint[];
  datapoints?: DataPoint[];
}

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/templates/{id}/generate:
 *   post:
 *     summary: Generate filled documents as a ZIP of PDFs
 *     description: Fetches a template by ID, fills placeholder values for each datapoint, generates one PDF per datapoint, and returns a ZIP archive.
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the template
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dataPoints]
 *             properties:
 *               dataPoints:
 *                 type: array
 *                 items:
 *                   type: object
 *                 example:
 *                   - name: Alice
 *                     orderId: ORD-1001
 *                   - name: Bob
 *                     orderId: ORD-1002
 *     responses:
 *       200:
 *         description: ZIP file generated successfully
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request payload
 *       404:
 *         description: Template not found
 *       500:
 *         description: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID format' },
        { status: 400 }
      );
    }

    const body = (await request.json()) as GenerateDocumentsRequest;
    const dataPoints = body.dataPoints ?? body.datapoints;

    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return NextResponse.json(
        { success: false, error: 'dataPoints is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    const hasInvalidDataPoint = dataPoints.some(
      (dataPoint) => !dataPoint || typeof dataPoint !== 'object' || Array.isArray(dataPoint)
    );

    if (hasInvalidDataPoint) {
      return NextResponse.json(
        { success: false, error: 'Each data point must be a JSON object' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const templateDoc = await db
      .collection<Template>(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });

    if (!templateDoc) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    if (!templateDoc.template || typeof templateDoc.template !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Stored template is invalid' },
        { status: 500 }
      );
    }

    const requiredPlaceholderKeys = collectRequiredPlaceholderKeys(templateDoc.template);
    const invalidDataPoints: Array<{ index: number; missing: string[] }> = [];

    for (let i = 0; i < dataPoints.length; i += 1) {
      const missing = findMissingPlaceholderKeys(dataPoints[i], requiredPlaceholderKeys);
      if (missing.length > 0) {
        invalidDataPoints.push({
          index: i,
          missing,
        });
      }
    }

    if (invalidDataPoints.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required placeholder values',
          data: {
            invalidDataPoints,
          },
        },
        { status: 400 }
      );
    }

    const zip = new JSZip();

    for (let i = 0; i < dataPoints.length; i += 1) {
      const filledDocument = applyTemplateDataPoint(templateDoc.template, dataPoints[i]);
      const html = renderDocumentHtml(filledDocument);
      const pdfBytes = await createPdfFromDocumentHtml(html);

      zip.file(`document-${i + 1}.pdf`, pdfBytes);
    }

    const zipBytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const zipStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(zipBytes);
        controller.close();
      },
    });

    return new NextResponse(zipStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="generated-documents.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error generating documents:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate documents' },
      { status: 500 }
    );
  }
}

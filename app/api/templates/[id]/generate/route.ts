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

    // Validate the incoming URL parameter to ensure it is a structurally valid BSON ObjectId
    // Prevent malformed queries directly hitting the MongoDB driver
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID format' },
        { status: 400 }
      );
    }

    // Extract the JSON body payload containing the template variables
    // Safely support both "dataPoints" and "datapoints" object keys for legacy robustness
    const body = (await request.json()) as GenerateDocumentsRequest;
    const dataPoints = body.dataPoints ?? body.datapoints;

    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return NextResponse.json(
        { success: false, error: 'dataPoints is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Iterate through every mapped object item ensuring they are properly formatted dictionaries
    // We cannot render arrays or primitive strings/numbers at the top level
    const hasInvalidDataPoint = dataPoints.some(
      (dataPoint) => !dataPoint || typeof dataPoint !== 'object' || Array.isArray(dataPoint)
    );

    if (hasInvalidDataPoint) {
      return NextResponse.json(
        { success: false, error: 'Each data point must be a JSON object' },
        { status: 400 }
      );
    }

    // Instantiate a connection and pull the master Template record defining our visual structure
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

    // Deep traverse the TipTap configuration retrieving every unique placeholder key we demand from the client
    const requiredPlaceholderKeys = collectRequiredPlaceholderKeys(templateDoc.template);
    
    // Accumulator array tracking data array indexes that miss critical placeholders
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

    // Fail early if any provided sequence item is missing required variables.
    // This prevents partial ZIP generation failures or broken visual PDFs.
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

    // Initialize the asynchronous ZIP archive wrapper
    const zip = new JSZip();

    // Primary Generation Loop: Iterate sequentially across the supplied variable combinations
    for (let i = 0; i < dataPoints.length; i += 1) {
      // 1. Swap placeholders in the JSON AST with the specific dictionary mappings
      const filledDocument = applyTemplateDataPoint(templateDoc.template, dataPoints[i]);
      // 2. Synthesize complete browser-ready HTML from the AST
      const html = renderDocumentHtml(filledDocument);
      // 3. Mount a headless Chrome instance to snapshot the DOM as an A4 formatted PDF
      const pdfBytes = await createPdfFromDocumentHtml(html);

      // Immediately buffer the completed file representation into the active ZIP directory
      zip.file(`document-${i + 1}.pdf`, pdfBytes);
    }

    // Crunch the buffered files compiling a unified byte array via DEFLATE compression
    const zipBytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Encapsulate the result into a Web ReadableStream for optimized HTTP transfer chunking
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

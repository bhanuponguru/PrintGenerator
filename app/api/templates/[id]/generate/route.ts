import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { Template } from '@/types/template';
import {
  applyTemplateDataPoint,
  collectPlaceholderValidationConfigMap,
  createPdfFromDocumentHtml,
  DataPoint,
  renderDocumentHtml,
  validateDataPointAgainstPlaceholderConfigMap,
} from '@/lib/document-generation';
import parseCsvToDataPoints from '@/lib/csv-parser';

const COLLECTION_NAME = 'templates';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/templates/{id}/generate:
 *   post:
 *     summary: Generate filled documents as a ZIP of PDFs
 *     description: Fetches a template by ID, parses a CSV body into internal datapoints, generates one PDF per record, and returns a ZIP archive.
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
 *         text/csv:
 *           schema:
 *             type: string
 *             format: binary
 *           description: Raw CSV body. Use ?idField= to override the grouping id column name (default id).
 *     responses:
 *       200:
 *         description: ZIP file generated successfully
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request payload, CSV parse error, or invalid placeholder values
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
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID format' },
        { status: 400 }
      );
    }

    // Fetch the template document first (needed for CSV parsing)
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

    // Parse the CSV body into the internal datapoint shape expected by generation.
    let dataPoints: DataPoint[] | undefined;
    let csvWarnings: string[] = [];

    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/csv')) {
      return NextResponse.json(
        { success: false, error: 'CSV payload is required and must use Content-Type: text/csv' },
        { status: 400 }
      );
    }

    const csvText = await request.text();
    const idField = request.nextUrl ? request.nextUrl.searchParams.get('idField') || 'id' : 'id';
    const parsed = parseCsvToDataPoints(csvText, templateDoc.template, { idField });
    if (parsed.error) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    dataPoints = parsed.dataPoints;
    csvWarnings = parsed.warnings || [];

    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return NextResponse.json(
        { success: false, error: 'dataPoints is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    const validDataPoints: Array<{ index: number; data: DataPoint }> = [];
    const invalidDataPoints: Array<{ index: number; missing: string[]; invalid: string[] }> = [];
    let errorLog = '';

    // Gather placeholder type and template-level config contracts (mode/headers/type maps).
    const placeholderConfigMap = collectPlaceholderValidationConfigMap(templateDoc.template);
    
    for (let i = 0; i < dataPoints.length; i += 1) {
      const dataPoint = dataPoints[i];
      if (!dataPoint || typeof dataPoint !== 'object' || Array.isArray(dataPoint)) {
        errorLog += `[Row ${i + 1}] Error: Data point must be a JSON object, but received ${typeof dataPoint}.\n`;
        invalidDataPoints.push({
          index: i,
          missing: [],
          invalid: ['Data point must be a JSON object'],
        });
        continue;
      }

      const validation = validateDataPointAgainstPlaceholderConfigMap(dataPoint, placeholderConfigMap);
      if (validation.missing.length > 0 || validation.invalid.length > 0) {
        errorLog += `[Row ${i + 1}] Validation Failed:\n`;
        if (validation.missing.length > 0) {
          errorLog += `  - Missing fields: ${validation.missing.join(', ')}\n`;
        }
        if (validation.invalid.length > 0) {
          errorLog += `  - Invalid fields: ${validation.invalid.join(', ')}\n`;
        }
        invalidDataPoints.push({
          index: i,
          missing: validation.missing,
          invalid: validation.invalid,
        });
        continue;
      }

      validDataPoints.push({ index: i, data: validation.normalizedDataPoint });
    }

    if (invalidDataPoints.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid placeholder values',
          data: { invalidDataPoints },
        },
        { status: 400 }
      );
    }

    // Initialize the asynchronous ZIP archive wrapper
    const zip = new JSZip();

    // Primary Generation Loop: Iterate sequentially across the supplied variable combinations
    for (const validPoint of validDataPoints) {
      try {
        // 1. Swap placeholders in the JSON AST with the specific dictionary mappings
        const filledDocument = applyTemplateDataPoint(templateDoc.template, validPoint.data);
        // 2. Synthesize complete browser-ready HTML from the AST
        const html = renderDocumentHtml(filledDocument);
        // 3. Mount a headless Chrome instance to snapshot the DOM as an A4 formatted PDF
        const pdfBytes = await createPdfFromDocumentHtml(html);

        // Immediately buffer the completed file representation into the active ZIP directory
        zip.file(`document-${validPoint.index + 1}.pdf`, pdfBytes);
      } catch (err) {
        errorLog += `[Row ${validPoint.index + 1}] Error generating PDF: ${err instanceof Error ? err.message : String(err)}\n`;
      }
    }

    if (errorLog) {
      zip.file('error.log', errorLog);
    }

    // Include CSV warnings if present
    if (csvWarnings && csvWarnings.length > 0) {
      zip.file('csv-warnings.log', csvWarnings.join('\n'));
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

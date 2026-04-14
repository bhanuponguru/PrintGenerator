'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

/**
 * Client-side mounted SwaggerUI viewer interface for exploring API capabilities.
 * Lazily fetches the /api/docs OpenAPI definition file mapping out all available
 * backend routes directly within this interactive browser context.
 */
export default function ApiDocsPage() {
  return (
    <div>
      <SwaggerUI url="/api/docs" />
    </div>
  );
}

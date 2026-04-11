import { createSwaggerSpec } from 'next-swagger-doc';

/**
 * Generates and returns a complete OpenAPI / Swagger configuration specification
 * describing the routes, metadata, servers, and component schemas of the project API.
 * @returns The built specification document for rendering API documentation.
 */
export const getApiDocs = () => {
  const spec = createSwaggerSpec({
    apiFolder: 'app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Print Generator API',
        version: '0.1.0',
        description: 'API documentation for Print Generator template management system',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
        {
          url: 'https://your-production-url.com',
          description: 'Production server',
        },
      ],
      tags: [
        {
          name: 'Templates',
          description: 'Template management endpoints',
        },
      ],
      components: {
        schemas: {
          Template: {
            type: 'object',
            required: ['_id', 'name', 'version', 'template', 'created_on', 'updated_on'],
            properties: {
              _id: {
                type: 'string',
                description: 'MongoDB ObjectId',
                example: '507f1f77bcf86cd799439011',
              },
              name: {
                type: 'string',
                description: 'Template name',
                example: 'Invoice Template',
              },
              version: {
                type: 'string',
                description: 'Template version',
                example: '1.0.0',
              },
              template: {
                type: 'object',
                description: 'Template configuration object (flexible structure)',
                example: {
                  title: 'Sample Title',
                  content: 'Sample Content',
                },
              },
              created_on: {
                type: 'string',
                format: 'date-time',
                description: 'Creation timestamp',
              },
              updated_on: {
                type: 'string',
                format: 'date-time',
                description: 'Last update timestamp',
              },
            },
          },
          TemplateInput: {
            type: 'object',
            required: ['name', 'version', 'template'],
            properties: {
              name: {
                type: 'string',
                description: 'Template name',
                example: 'New Template',
              },
              version: {
                type: 'string',
                description: 'Template version',
                example: '1.0.0',
              },
              template: {
                type: 'object',
                description: 'Template configuration object',
                example: {
                  title: 'Sample Title',
                  content: 'Sample Content',
                },
              },
            },
          },
          TemplateUpdate: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Template name',
              },
              version: {
                type: 'string',
                description: 'Template version',
              },
              template: {
                type: 'object',
                description: 'Template configuration object',
              },
            },
          },
          ApiResponse: {
            type: 'object',
            required: ['success'],
            properties: {
              success: {
                type: 'boolean',
                description: 'Indicates if the request was successful',
              },
              data: {
                description: 'Response data (type varies by endpoint)',
              },
              error: {
                type: 'string',
                description: 'Error message if success is false',
              },
            },
          },
          Error: {
            type: 'object',
            required: ['success', 'error'],
            properties: {
              success: {
                type: 'boolean',
                example: false,
              },
              error: {
                type: 'string',
                example: 'Error message',
              },
            },
          },
        },
      },
    },
  });

  return spec;
};

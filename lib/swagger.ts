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
        description: 'API documentation for Print Generator template management system with dual-associated tagging.',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      tags: [
        {
          name: 'Templates',
          description: 'Template management endpoints',
        },
        {
          name: 'Tags',
          description: 'Tag management endpoints allowing two-way categorization associations',
        }
      ],
      paths: {
        '/api/tags': {
          get: {
            summary: 'List all tags',
            tags: ['Tags'],
            responses: {
              200: { description: 'Successfully recovered pure array of string names for frontend loading' }
            }
          },
          post: {
            summary: 'Create Tag safely',
            tags: ['Tags'],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } }
            },
            responses: {
              201: { description: 'Tag created correctly mapped to new ID.' },
              409: { description: 'Conflict: Tag heavily existing' }
            }
          },
          patch: {
            summary: 'Update tag identifier string names completely',
            tags: ['Tags'],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object', properties: { old_name: { type: 'string' }, new_name: { type: 'string' } } } } }
            },
            responses: { 200: { description: 'Renamed cleanly' } }
          }
        },
        '/api/tags/{name}': {
          delete: {
            summary: 'Hard delete a tag permanently handling mappings',
            tags: ['Tags'],
            parameters: [{ in: 'path', name: 'name', type: 'string', required: true }],
            responses: { 200: { description: 'Deleted correctly removing mappings from every internal layout schema associated concurrently.' } }
          }
        },
        '/api/tags/{name}/templates': {
          get: {
            summary: 'Identify specific arrays cleanly isolated to this identifier',
            tags: ['Tags'],
            parameters: [{ in: 'path', name: 'name', type: 'string', required: true }],
            responses: { 200: { description: 'Succeeded fetching subset mapping layout definitions intelligently utilizing 2-way database maps natively.' } }
          }
        }
      },
      components: {
        schemas: {
          Template: {
            type: 'object',
            required: ['_id', 'name', 'version', 'template', 'created_on', 'updated_on'],
            properties: {
              _id: { type: 'string', description: 'MongoDB ObjectId' },
              name: { type: 'string' },
              version: { type: 'string' },
              template: { type: 'object' },
              tag_ids: { type: 'array', items: { type: 'string' }, description: 'Mapping IDs referencing independent specific categories securely' },
              created_on: { type: 'string', format: 'date-time' },
              updated_on: { type: 'string', format: 'date-time' },
            },
          },
          TemplateInput: {
            type: 'object',
            required: ['name', 'version', 'template'],
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              template: { type: 'object' },
              tag_ids: { type: 'array', items: { type: 'string' }, description: 'Newly added arrays assigning explicitly tags directly during creations strictly' }
            },
          },
          TemplateUpdate: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              template: { type: 'object' },
              tag_ids: { type: 'array', items: { type: 'string' }, description: 'Array mapping definitions automatically orchestrating differential removal syncing internally via dual mapping' }
            },
          },
          ApiResponse: {
            type: 'object',
            required: ['success'],
            properties: {
              success: { type: 'boolean' },
              data: { description: 'Response data' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  });

  return spec;
};

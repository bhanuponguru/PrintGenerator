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
        ,
        '/api/templates/{id}/generate': {
          post: {
            summary: 'Generate filled documents as a ZIP from CSV',
            tags: ['Templates'],
            parameters: [{ in: 'path', name: 'id', type: 'string', required: true }],
            requestBody: {
              required: true,
              content: {
                'text/csv': {
                  schema: { type: 'string', format: 'binary', description: 'Raw CSV body. Use `?idField=` to override the grouping id column name (default `id`).' }
                }
              }
            },
            responses: {
              200: {
                description: 'ZIP file generated successfully (application/zip)',
                content: {
                  'application/zip': {
                    schema: { type: 'string', format: 'binary' }
                  }
                }
              },
              400: {
                description: 'Invalid request payload, CSV parse error, or invalid placeholder values',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiResponse' }
                  }
                }
              },
              404: {
                description: 'Template not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ApiResponse' }
                  }
                }
              }
            }
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
              template: {
                type: 'object',
                description: 'Tiptap/ProseMirror JSON document containing placeholder nodes. Placeholder nodes must use attrs.keys as key->type map.',
              },
              tag_ids: { type: 'array', items: { type: 'string' }, description: 'Newly added arrays assigning explicitly tags directly during creations strictly' }
            },
          },
          TemplateUpdate: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              template: {
                type: 'object',
                description: 'Tiptap/ProseMirror JSON document containing placeholder nodes. Placeholder nodes must use attrs.keys as key->type map.',
              },
              tag_ids: { type: 'array', items: { type: 'string' }, description: 'Array mapping definitions automatically orchestrating differential removal syncing internally via dual mapping' }
            },
          },
          CsvParseResult: {
            type: 'object',
            required: ['dataPoints', 'warnings'],
            properties: {
              dataPoints: {
                type: 'array',
                items: { type: 'object' },
              },
              warnings: {
                type: 'array',
                items: { type: 'string' },
              },
              error: {
                type: 'string',
                nullable: true,
              },
            },
          },
          ComponentTypeSchema: {
            type: 'object',
            required: ['kind'],
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'string',
                  'integer',
                  'image',
                  'hyperlink',
                  'list',
                  'table',
                  'container',
                  'repeat',
                  'custom',
                  'page',
                  'header',
                  'footer',
                  'page_break',
                ],
              },
              option: {
                type: 'object',
                additionalProperties: true,
                description: 'Optional image options metadata',
              },
              item_type: {
                $ref: '#/components/schemas/ComponentTypeSchema',
              },
              mode: {
                type: 'string',
                enum: ['row_data', 'column_data'],
              },
              headers: {
                type: 'array',
                items: { type: 'string' },
              },
              caption: {
                type: 'string',
                description: 'Static table caption set at template creation time',
              },
              component_types: {
                type: 'array',
                items: { $ref: '#/components/schemas/ComponentTypeSchema' },
              },
              token_library: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
              token_registry: {
                type: 'object',
                additionalProperties: { $ref: '#/components/schemas/ComponentTypeSchema' },
              },
              layout_template: {
                type: 'string',
              },
              layout_nodes: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
              static_values: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
          PlaceholderKeysMap: {
            type: 'object',
            additionalProperties: {
              $ref: '#/components/schemas/ComponentTypeSchema',
            },
            description: 'Map of placeholder key name to type schema',
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

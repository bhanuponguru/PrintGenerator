import { describe, expect, it } from 'vitest';
import { applyTemplateDataPoint, renderDocumentHtml, validateDataPointAgainstKeyTypeMap } from '@/lib/document-generation';
import {
  createContainerComponent,
  createFooterComponent,
  createImageComponent,
  createHyperlinkComponent,
  createListComponent,
  createPageComponent,
  createHeaderComponent,
  createTableComponent,
} from '@/lib/tiptap/extensions';

describe('document generation HTML coverage', () => {
  it('renders a mixed template with all component classes', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'name',
                kind: 'string',
              },
              content: [{ type: 'text', text: '{{name}}' }],
            },
          ],
        },
        createImageComponent(
          {
            src: 'https://example.com/logo.png',
            alt: 'Company logo',
          },
          { width: '200', height: '120' }
        ),
        createHyperlinkComponent(
          {
            alias: 'Docs',
            url: 'https://example.com/docs',
          },
          { title: 'Documentation' }
        ),
        createListComponent(
          {
            items: ['First', 'Second'],
          },
          { 'data-role': 'bullets' }
        ),
        createContainerComponent(
          {
            components: ['Intro', 'Body', 'Footer'],
          },
          {
            component_types: [
              { kind: 'string' },
              { kind: 'string' },
              { kind: 'string' },
            ],
          }
        ),
        createTableComponent({
          rows: [
            { Item: 'Pen', Qty: 2 },
            { Item: 'Notebook', Qty: 1 },
          ],
        }, {
          headers: ['Item', 'Qty'],
          caption: 'Inventory',
        }),
        createTableComponent({
          columns: {
            Sales: { Q1: 10, Q2: 12 },
            Profit: { Q1: 3, Q2: 4 },
          },
        }, {
          headers: ['Q1', 'Q2'],
          caption: 'Quarterly',
        }),
      ],
    };

    const validation = validateDataPointAgainstKeyTypeMap(
      { name: 'Ada', count: '42.8' },
      {
        name: { kind: 'string' },
        count: { kind: 'integer' },
      }
    );

    expect(validation.missing).toEqual([]);
    expect(validation.invalid).toEqual([]);

    const html = renderDocumentHtml(applyTemplateDataPoint(template, validation.normalizedDataPoint));

    expect(html).toContain('data-placeholder="true">Ada</span>');
    expect(html).toContain('<img');
    expect(html).toContain('logo.png');
    expect(html).toContain('width="200"');
    expect(html).toContain('height="120"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('Intro');
    expect(html).toContain('<table');
    expect(html).toContain('<caption>Inventory</caption>');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('Notebook');
    expect(html).toContain('<caption>Quarterly</caption>');
    expect(html).toContain('<th></th>');
    expect(html).toContain('Sales');
  });

  it('renders an empty list and empty row_data table without breaking layout', () => {
    const template = {
      type: 'doc',
      content: [
        createListComponent({
          items: [],
        }),
        createTableComponent({
          rows: [],
        }, {
          headers: ['A', 'B'],
          caption: 'Empty rows',
        }),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('<ul></ul>');
    expect(html).toContain('<caption>Empty rows</caption>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<th>B</th>');
  });

  it('renders a column_data table with zero dynamic columns as a valid empty matrix', () => {
    const template = {
      type: 'doc',
      content: [
        createTableComponent({
          columns: {},
        }, {
          headers: ['Q1', 'Q2'],
          caption: 'Empty matrix',
        }),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('<caption>Empty matrix</caption>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('undefined');
  });

  it('renders structured table captions through schema-aware rendering', () => {
    const template = {
      type: 'doc',
      content: [
        createTableComponent(
          {
            rows: [{ Item: 'Pen' }],
          },
          {
            headers: ['Item'],
            caption: 'Inventory link',
          }
        ),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('<caption>');
    expect(html).toContain('Inventory link');
  });

  it('preserves sequential container content order', () => {
    const template = {
      type: 'doc',
      content: [
        createContainerComponent(
          {
            components: ['First block', 'Second block', 'Third block'],
          },
          {
            component_types: [
              { kind: 'string' },
              { kind: 'string' },
              { kind: 'string' },
            ],
          }
        ),
      ],
    };

    const html = renderDocumentHtml(template);
    const firstIndex = html.indexOf('First block');
    const secondIndex = html.indexOf('Second block');
    const thirdIndex = html.indexOf('Third block');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  it('does not mutate the original template when applying placeholder data', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'title',
                kind: 'string',
              },
              content: [{ type: 'text', text: 'Hello {{title}}' }],
            },
          ],
        },
      ],
    };

    const original = JSON.parse(JSON.stringify(template));
    const rendered = applyTemplateDataPoint(template, { title: 'Ada' });

    expect(template).toEqual(original);
    expect(rendered).not.toEqual(template);
    expect(renderDocumentHtml(rendered)).toContain('Hello Ada');
  });

  it('renders a no-due form with structural header and footer content', () => {
    const template = {
      type: 'doc',
      content: [
        createHeaderComponent(
          {
            components: [
              { src: 'https://example.com/logo.png', alt: 'Logo' },
            ],
          },
          {
            component_types: [{ kind: 'image' }],
          }
        ),
        createPageComponent(
          {
            components: [
              {
                data: {
                  name: 'Ada Lovelace',
                  roll_no: '23',
                  department: 'CSE',
                },
              },
              'Signature: No due',
            ],
          },
          {
            component_types: [
              {
                kind: 'custom',
                base_variable: 'student',
                value_type: { kind: 'string' },
                layout_template: 'Name: {{student.name}} | Roll: {{student.roll_no}} | Dept: {{student.department}}',
                token_library: [
                  { id: 'name', kind: 'string' },
                  { id: 'roll_no', kind: 'string' },
                  { id: 'department', kind: 'string' },
                ],
              },
              { kind: 'string' },
            ],
            pageNumber: 1,
          }
        ),
        createFooterComponent(
          {
            components: ['No due declaration and disclaimer'],
          },
          {
            component_types: [{ kind: 'string' }],
          }
        ),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('data-component="header"');
    expect(html).toContain('logo.png');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Signature: No due');
    expect(html).toContain('data-component="footer"');
    expect(html).toContain('No due declaration and disclaimer');
  });

  it('renders a grade card with student details and grades tables', () => {
    const template = {
      type: 'doc',
      content: [
        createHeaderComponent(
          {
            components: [{ src: 'https://example.com/logo.png', alt: 'Logo' }],
          },
          { component_types: [{ kind: 'image' }] }
        ),
        createPageComponent(
          {
            components: [
              {
                data: {
                  name: 'Ada Lovelace',
                  student_id: 'S-001',
                  program: 'BSc CS',
                  semester: 'Semester 4',
                },
              },
              {
                rows: [
                  { course: 'Algorithms', course_id: 'CS401', grade: 'A' },
                  { course: 'Databases', course_id: 'CS402', grade: 'A+' },
                ],
              },
            ],
          },
          {
            component_types: [
              {
                kind: 'custom',
                base_variable: 'student',
                value_type: { kind: 'string' },
                layout_template: 'Student: {{student.name}} | ID: {{student.student_id}} | Program: {{student.program}} | {{student.semester}}',
                token_library: [
                  { id: 'name', kind: 'string' },
                  { id: 'student_id', kind: 'string' },
                  { id: 'program', kind: 'string' },
                  { id: 'semester', kind: 'string' },
                ],
              },
              {
                kind: 'table',
                mode: 'row_data',
                headers: ['course', 'course_id', 'grade'],
              },
            ],
            pageNumber: 1,
          }
        ),
        createFooterComponent(
          {
            components: ['This is an electronically generated document'],
          },
          {
            component_types: [{ kind: 'string' }],
          }
        ),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html).toContain('Student: Ada Lovelace');
    expect(html).toContain('CS401');
    expect(html).toContain('Algorithms');
    expect(html).toContain('<th>course</th>');
    expect(html).toContain('<th>course_id</th>');
    expect(html).toContain('<th>grade</th>');
    expect(html).toContain('This is an electronically generated document');
  });

  it('renders transcript pages for all semesters at generation time', () => {
    const semesters = [
      {
        number: 1,
        rows: [
          { course: 'Programming 1', course_id: 'CS101', grade: 'A' },
          { course: 'Math 1', course_id: 'MA101', grade: 'B+' },
        ],
      },
      {
        number: 2,
        rows: [
          { course: 'Programming 2', course_id: 'CS201', grade: 'A+' },
          { course: 'Data Structures', course_id: 'CS202', grade: 'A' },
        ],
      },
      {
        number: 3,
        rows: [
          { course: 'Operating Systems', course_id: 'CS301', grade: 'A' },
          { course: 'Networks', course_id: 'CS302', grade: 'B' },
        ],
      },
    ];

    const template = {
      type: 'doc',
      content: [
        createHeaderComponent({ components: [{ src: 'https://example.com/logo.png', alt: 'Logo' }] }, { component_types: [{ kind: 'image' }] }),
        ...semesters.map((semester) => createPageComponent(
          {
            components: [
              `Semester ${semester.number}`,
              { rows: semester.rows },
            ],
          },
          {
            component_types: [
              { kind: 'string' },
              {
                kind: 'table',
                mode: 'row_data',
                headers: ['course', 'course_id', 'grade'],
              },
            ],
            pageNumber: semester.number,
          }
        )),
        createFooterComponent({ components: ['This is an electronically generated document'] }, { component_types: [{ kind: 'string' }] }),
      ],
    };

    const html = renderDocumentHtml(template);

    expect(html.match(/Semester \d/g)?.length).toBe(3);
    expect(html.match(/<table/g)?.length).toBe(3);
    expect(html).toContain('Semester 1');
    expect(html).toContain('Semester 2');
    expect(html).toContain('Semester 3');
    expect(html).toContain('Programming 1');
    expect(html).toContain('Operating Systems');
    expect(html).toContain('This is an electronically generated document');
  });
});

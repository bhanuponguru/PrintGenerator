export function buildNoDueFlowTemplate() {
  return {
    _id: 'flow-no-due',
    name: 'No Due Flow',
    version: '1.0.0',
    created_on: '2026-01-01T00:00:00.000Z',
    updated_on: '2026-01-01T00:00:00.000Z',
    template: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Student Details: ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'student_details',
                kind: 'custom',
                schema: {
                  kind: 'custom',
                  base_variable: 'student',
                  value_type: { kind: 'string' },
                  layout_template: 'Name: {{student.name}}\nRoll No: {{student.roll_no}}\nDepartment: {{student.department}}',
                  token_library: [
                    { id: 'name', label: 'Name', kind: 'string' },
                    { id: 'roll_no', label: 'Roll No', kind: 'string' },
                    { id: 'department', label: 'Department', kind: 'string' },
                  ],
                },
              },
              content: [{ type: 'text', text: 'student details' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Signature: No due' }],
        },
      ],
    },
  };
}

export function buildGradeCardFlowTemplate() {
  return {
    _id: 'flow-grade-card',
    name: 'Grade Card Flow',
    version: '1.0.0',
    created_on: '2026-01-01T00:00:00.000Z',
    updated_on: '2026-01-01T00:00:00.000Z',
    template: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Student Details: ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'student_details',
                kind: 'custom',
                schema: {
                  kind: 'custom',
                  base_variable: 'student',
                  value_type: { kind: 'string' },
                  layout_template: 'Name: {{student.name}}\nStudent ID: {{student.student_id}}\nProgram: {{student.program}}',
                  token_library: [
                    { id: 'name', label: 'Name', kind: 'string' },
                    { id: 'student_id', label: 'Student ID', kind: 'string' },
                    { id: 'program', label: 'Program', kind: 'string' },
                  ],
                },
              },
              content: [{ type: 'text', text: 'student details' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Grades: ' },
            {
              type: 'placeholder',
              attrs: {
                key: 'grades',
                kind: 'table',
                schema: {
                  kind: 'table',
                  mode: 'row_data',
                  headers: ['course', 'course_id', 'grade'],
                  caption: 'Semester 1 Courses',
                },
                value: { rows: [{ course: '', course_id: '', grade: '' }] },
              },
              content: [{ type: 'text', text: 'grades' }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'This is an electronically generated document' }],
        },
      ],
    },
  };
}

export function buildTranscriptFlowTemplate() {
  return {
    _id: 'flow-transcript',
    name: 'Transcript Flow',
    version: '1.0.0',
    created_on: '2026-01-01T00:00:00.000Z',
    updated_on: '2026-01-01T00:00:00.000Z',
    template: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Semester blocks are repeated below.' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'semesters',
                kind: 'custom',
                schema: {
                  kind: 'custom',
                  base_variable: 'semester',
                  value_type: { kind: 'string' },
                  repeat: true,
                  layout_template: 'Semester {{semester.semester_number}}\n{{semester.grades}}',
                  token_library: [
                    { id: 'semester_number', label: 'Semester Number', kind: 'string' },
                    {
                      id: 'grades',
                      label: 'Grades',
                      kind: 'table',
                      mode: 'row_data',
                      headers: ['course', 'course_id', 'grade'],
                    },
                  ],
                },
                value: { items: [] },
              },
              content: [{ type: 'text', text: 'semesters' }],
            },
          ],
        },
      ],
    },
  };
}
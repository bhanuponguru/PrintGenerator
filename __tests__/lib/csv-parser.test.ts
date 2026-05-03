import { describe, expect, it } from 'vitest';
import { parseCsvToDataPoints } from '@/lib/csv-parser';

function templateWithSingleTableDynamic() {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'placeholder',
            attrs: {
              key: 'name',
              kind: 'string',
            },
          },
          {
            type: 'placeholder',
            attrs: {
              key: 'grades',
              kind: 'table',
              schema: {
                kind: 'table',
                mode: 'row_data',
                headers: ['course', 'grade'],
              },
            },
          },
        ],
      },
    ],
  } as Record<string, unknown>;
}

describe('csv parser', () => {
  it('returns an explicit error when template has more than one dynamic placeholder', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'placeholder',
              attrs: {
                key: 'grades',
                kind: 'table',
                schema: {
                  kind: 'table',
                  mode: 'row_data',
                  headers: ['course', 'grade'],
                },
              },
            },
            {
              type: 'placeholder',
              attrs: {
                key: 'activities',
                kind: 'list',
                schema: {
                  kind: 'list',
                  item_type: { kind: 'string' },
                },
              },
            },
          ],
        },
      ],
    } as Record<string, unknown>;

    const csv = 'id,course,grade\n1,Math,A';
    const result = parseCsvToDataPoints(csv, template);

    expect(result.error).toContain('at most one dynamic placeholder');
    expect(result.dataPoints).toEqual([]);
  });

  it('groups rows by id and emits warnings when static values conflict', () => {
    const csv = [
      'id,name,course,grade',
      '1,Ada,Math,A',
      '1,Grace,Physics,B',
    ].join('\n');

    const result = parseCsvToDataPoints(csv, templateWithSingleTableDynamic());

    expect(result.error).toBeUndefined();
    expect(result.dataPoints).toHaveLength(1);
    expect(result.dataPoints[0].name).toBe('Ada');
    expect((result.dataPoints[0].grades as { rows: Array<Record<string, unknown>> }).rows).toEqual([
      { course: 'Math', grade: 'A' },
      { course: 'Physics', grade: 'B' },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Group '1': conflicting static value for 'name'");
  });

  it('supports dotted headers for dynamic fields', () => {
    const csv = [
      'id,name,grades.course,grades.grade',
      '1,Ada,Math,A',
      '1,Ada,Physics,B',
    ].join('\n');

    const result = parseCsvToDataPoints(csv, templateWithSingleTableDynamic());

    expect(result.error).toBeUndefined();
    expect(result.dataPoints).toHaveLength(1);
    expect((result.dataPoints[0].grades as { rows: Array<Record<string, unknown>> }).rows).toEqual([
      { course: 'Math', grade: 'A' },
      { course: 'Physics', grade: 'B' },
    ]);
  });

  it('returns an error when grouped dynamic parsing cannot find id field', () => {
    const csv = [
      'name,course,grade',
      'Ada,Math,A',
      'Ada,Physics,B',
    ].join('\n');

    const result = parseCsvToDataPoints(csv, templateWithSingleTableDynamic());

    expect(result.error).toContain("Missing or empty id column 'id'");
    expect(result.dataPoints).toEqual([]);
  });

  it('treats each row as separate datapoint when there is no dynamic placeholder', () => {
    const template = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'placeholder', attrs: { key: 'name', kind: 'string' } },
            { type: 'placeholder', attrs: { key: 'orderId', kind: 'string' } },
          ],
        },
      ],
    } as Record<string, unknown>;

    const csv = [
      'id,name,orderId',
      '1,Ada,ORD-1',
      '1,Grace,ORD-2',
    ].join('\n');

    const result = parseCsvToDataPoints(csv, template);

    expect(result.error).toBeUndefined();
    expect(result.dataPoints).toEqual([
      { name: 'Ada', orderId: 'ORD-1' },
      { name: 'Grace', orderId: 'ORD-2' },
    ]);
  });
});

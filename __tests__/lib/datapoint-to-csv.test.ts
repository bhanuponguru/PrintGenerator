import { describe, it, expect } from 'vitest';
import dataPointsToCsv from '@/lib/datapoint-to-csv';

describe('dataPointsToCsv', () => {
  it('generates simple CSV with headers and rows', () => {
    const dps = [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 },
    ];
    const csv = dataPointsToCsv(dps);
    expect(csv.split('\n')[0]).toContain('id');
    expect(csv.split('\n').length).toBe(3);
    expect(csv).toContain('Alice');
    expect(csv).toContain('Bob');
  });

  it('escapes commas and quotes and serializes nested objects', () => {
    const dps = [
      { id: '1', note: 'He said, "Hello"', meta: { a: 'x,y' } },
    ];
    const csv = dataPointsToCsv(dps);
    expect(csv).toContain('"He said, ""Hello"""');
    // nested object flattened to dotted header 'meta.a' -> value 'x,y'
    expect(csv).toContain('x,y');
  });

  it('flattens one dynamic table placeholder to repeated rows', () => {
    const dps = [
      {
        id: '1',
        name: 'sample',
        products: {
          rows: [
            { item: 'prod1', qty: '1' },
            { item: 'prod2', qty: '2' },
          ],
        },
      },
    ];

    const csv = dataPointsToCsv(dps);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('id,name,products.item,products.qty');
    expect(lines[1]).toBe('1,sample,prod1,1');
    expect(lines[2]).toBe('1,sample,prod2,2');
    expect(csv).not.toContain('products.rows');
    expect(csv).not.toContain('[{');
  });
});

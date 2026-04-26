// tests/bridge/offsets.test.js
import { describe, it, expect } from 'vitest';
import { buildOffsetTable, lineColToOffset, addOffsets } from '../../src/utils/offsets.js';

describe('buildOffsetTable', () => {
  it('single line', () => {
    expect(buildOffsetTable('hello')).toEqual([0]);
  });
  it('two lines', () => {
    expect(buildOffsetTable('ab\ncd')).toEqual([0, 3]);
  });
  it('three lines', () => {
    expect(buildOffsetTable('a\nb\nc')).toEqual([0, 2, 4]);
  });
});

describe('lineColToOffset', () => {
  it('line 1 col 1 is 0', () => {
    const t = buildOffsetTable('hello\nworld');
    expect(lineColToOffset(t, 1, 1)).toBe(0);
  });
  it('line 2 col 1', () => {
    const t = buildOffsetTable('hello\nworld');
    expect(lineColToOffset(t, 2, 1)).toBe(6);
  });
  it('line 2 col 3', () => {
    const t = buildOffsetTable('hello\nworld');
    expect(lineColToOffset(t, 2, 3)).toBe(8);
  });

  it('accounts for tab width when converting visual columns to offsets', () => {
    const src = 'foo[\n\t\t(*\n]';
    const t = buildOffsetTable(src, 2);
    expect(lineColToOffset(t, 2, 5)).toBe(src.indexOf('(*'));
  });
});

describe('addOffsets', () => {
  it('adds locStart and locEnd to a leaf node', () => {
    const src = 'f[x]';
    const table = buildOffsetTable(src);
    const node = { type: 'LeafNode', kind: 'Symbol', value: 'f', source: [[1,1],[1,2]], children: [] };
    addOffsets(node, table);
    expect(node.locStart).toBe(0);
    expect(node.locEnd).toBe(1);
  });

  it('does not crash on unknown child nodes without source metadata', () => {
    const src = '~f~x';
    const table = buildOffsetTable(src);
    const node = {
      type: 'TernaryNode',
      op: 'TernaryTilde',
      source: [[1, 1], [1, 5]],
      children: [
        { type: 'Unknown', wl: 'ErrorNode[...]' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~', source: [[1, 1], [1, 2]] },
        { type: 'LeafNode', kind: 'Symbol', value: 'f', source: [[1, 2], [1, 3]] },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~', source: [[1, 3], [1, 4]] },
        { type: 'LeafNode', kind: 'Symbol', value: 'x', source: [[1, 4], [1, 5]] },
      ],
    };

    addOffsets(node, table);

    expect(node.locStart).toBe(0);
    expect(node.locEnd).toBe(4);
    expect(node.children[0].locStart).toBe(0);
    expect(node.children[0].locEnd).toBe(0);
  });

  it('falls back to child offsets when a wrapper node has no source', () => {
    const src = 'x';
    const table = buildOffsetTable(src);
    const node = {
      type: 'WrapperNode',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x', source: [[1, 1], [1, 2]] },
      ],
    };

    addOffsets(node, table);

    expect(node.locStart).toBe(0);
    expect(node.locEnd).toBe(1);
  });

  it('preserves tab-indented comment source ranges', () => {
    const src = 'foo[\n\t\t(*\n\t\tSome comment\n\t\t*)\n]';
    const table = buildOffsetTable(src, 2);
    const node = {
      type: 'LeafNode',
      kind: 'Token`Comment',
      value: '(*\n\t\tSome comment\n\t\t*)',
      source: [[2, 5], [4, 7]],
      children: [],
    };

    addOffsets(node, table);

    expect(src.slice(node.locStart, node.locEnd)).toBe(node.value);
  });
});

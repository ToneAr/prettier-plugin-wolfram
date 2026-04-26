import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import { printContainer } from '../../src/translator/nodes/container.js';
import { printInfix } from '../../src/translator/nodes/infix.js';
import { documentationCommentColumn } from '../../src/translator/docComments.js';

function fmt(doc) {
  return prettier.doc.printer.printDocToString(doc, { printWidth: 80, tabWidth: 2, useTabs: false }).formatted;
}

describe('printContainer', () => {
  it('keeps leading comments attached to the following declaration and inserts blank lines above the comment block', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* c1 *)' },
        { type: 'LeafNode', kind: 'Token`Newline', value: '\n' },
        { type: 'BinaryNode', op: 'Set', value: 'a = 1' },
        { type: 'LeafNode', kind: 'Token`Newline', value: '\n' },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* c2 *)' },
        { type: 'LeafNode', kind: 'Token`Newline', value: '\n' },
        { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2' },
        { type: 'LeafNode', kind: 'Token`Newline', value: '\n' },
        { type: 'CallNode', value: 'Print[x]' },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, {}, print));

    expect(out).toBe('(* c1 *)\na = 1\n\n(* c2 *)\nb := 2\nPrint[x]');
  });

  it('removes blank lines between a leading comment block and the following definition', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'BinaryNode', op: 'Set', value: 'a = 1' },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* docs *)' },
        { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2' },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, {}, print));

    expect(out).toBe('a = 1\n\n(* docs *)\nb := 2');
  });

  it('aligns trailing documentation comments in a contiguous block', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'BinaryNode', op: 'Set', value: 'a = 1', source: [[1, 1], [1, 6]] },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* first *)', source: [[1, 8], [1, 19]] },
        { type: 'BinaryNode', op: 'Set', value: 'longName = 2', source: [[2, 1], [2, 13]] },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* second *)', source: [[2, 15], [2, 27]] },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, { printWidth: 10 }, print));

    expect(out).toBe('a = 1      (* first *)\n\nlongName = 2  (* second *)');
  });

  it('manual documentation comment column is clamped above line width', () => {
    const entries = [
      { doc: 'a = 1', trailingCommentDoc: '(* c *)' },
    ];
    expect(documentationCommentColumn(entries, { printWidth: 20, wolframDocumentationCommentColumn: 5 })).toBe(21);
  });

  it('supports top-level spacing mode none', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'BinaryNode', op: 'Set', value: 'a = 1' },
        { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2' },
      ],
    };
    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, { wolframTopLevelSpacingMode: 'none' }, print));
    expect(out).toBe('a = 1\nb := 2');
  });

  it('preserves configured blank lines between non-definition top-level code', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'CallNode', value: 'Print[a]', source: [[1, 1], [1, 8]] },
        { type: 'CallNode', value: 'Print[b]', source: [[3, 1], [3, 8]] },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, {}, print));

    expect(out).toBe('Print[a]\n\nPrint[b]');
  });

  it('caps blank lines between non-definition top-level code', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'CallNode', value: 'Print[a]', source: [[1, 1], [1, 8]] },
        { type: 'CallNode', value: 'Print[b]', source: [[5, 1], [5, 8]] },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, { wolframMaxBlankLinesBetweenCode: 2 }, print));

    expect(out).toBe('Print[a]\n\n\nPrint[b]');
  });

  it('uses the definition spacing option between adjacent definitions', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        { type: 'BinaryNode', op: 'Set', value: 'a = 1', source: [[1, 1], [1, 6]] },
        { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2', source: [[2, 1], [2, 7]] },
      ],
    };

    const print = (child) => String(child.value ?? '');
    const out = fmt(printContainer(node, { wolframNewlinesBetweenDefinitions: 2 }, print));

    expect(out).toBe('a = 1\n\n\nb := 2');
  });

  it('treats semicolon-terminated top-level definitions as definitions for spacing', () => {
    const node = {
      type: 'ContainerNode',
      kind: 'String',
      children: [
        {
          type: 'InfixNode',
          op: 'CompoundExpression',
          value: 'a = 1',
          source: [[1, 1], [1, 5]],
          children: [
            { type: 'BinaryNode', op: 'Set', value: 'a = 1' },
            { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
            { type: 'LeafNode', kind: 'Token`Fake`ImplicitNull', value: '' },
          ],
        },
        {
          type: 'InfixNode',
          op: 'CompoundExpression',
          value: 'b := 2',
          source: [[2, 1], [2, 6]],
          children: [
            { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2' },
            { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
            { type: 'LeafNode', kind: 'Token`Fake`ImplicitNull', value: '' },
          ],
        },
      ],
    };

    const print = (child) => {
      if (child.type === 'InfixNode') return printInfix(child, {}, print);
      return String(child.value ?? '');
    };
    const out = fmt(printContainer(node, {}, print));

    expect(out).toBe('a = 1;\n\nb := 2;');
  });
});

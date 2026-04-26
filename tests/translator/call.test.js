// tests/translator/call.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { printCall } from '../../src/translator/nodes/call.js';
import prettier from 'prettier';

const require = createRequire(import.meta.url);
const callFixture = require('../fixtures/call-simple.json');

const opts = { wolframSpaceAfterComma: true, printWidth: 80 };

/** Create a mock prettier path rooted at `root` that supports path.call(print, ...keys). */
function makePath(root) {
  function makePathAt(node) {
    return {
      getValue: () => node,
      call: (print, ...keys) => {
        let cur = node;
        for (const key of keys) cur = cur[key];
        return print(makePathAt(cur), opts, print);
      },
    };
  }
  return makePathAt(root);
}

describe('printCall', () => {
  it('formats simple call inline', () => {
    // ContainerNode > CallNode
    const callNode = callFixture.children[0];

    const print = (path, _options, _print) => {
      const node = path.getValue();
      if (node.type === 'LeafNode') return String(node.value);
      if (node.type === 'CallNode') return printCall(path, opts, print, node);
      if (node.type === 'InfixNode') {
        // Shouldn't be reached in this test, but just in case
        return '';
      }
      return '';
    };

    const path = makePath(callNode);
    const doc = printCall(path, opts, print, callNode);
    const result = prettier.doc.printer.printDocToString(doc, { printWidth: 80, tabWidth: 2, useTabs: false });
    expect(result.formatted).toBe('f[x, y]');
  });

  it('preserves comments after the last wrapped argument', () => {
    const callNode = {
      type: 'CallNode',
      head: { type: 'LeafNode', kind: 'Symbol', value: 'Block' },
      children: [
        { type: 'LeafNode', kind: 'Token`OpenSquare', value: '[' },
        {
          type: 'InfixNode',
          op: 'Comma',
          children: [
            {
              type: 'GroupNode',
              kind: 'List',
              children: [
                { type: 'LeafNode', kind: 'Token`OpenCurly', value: '{' },
                { type: 'LeafNode', kind: 'Symbol', value: 'x' },
                { type: 'LeafNode', kind: 'Token`CloseCurly', value: '}' },
              ],
            },
            { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
            {
              type: 'LeafNode',
              kind: 'Symbol',
              value: 'body',
            },
          ],
        },
        {
          type: 'LeafNode',
          kind: 'Token`Comment',
          value: '(* keep me *)',
        },
        { type: 'LeafNode', kind: 'Token`CloseSquare', value: ']' },
      ],
    };

    const print = (path, _options, _print) => {
      const node = path.getValue();
      if (node.type === 'LeafNode') return String(node.value);
      if (node.type === 'CallNode') return printCall(path, opts, print, node);
      if (node.type === 'GroupNode') return '{x}';
      if (node.type === 'InfixNode') return '';
      return '';
    };

    const path = makePath(callNode);
    const doc = printCall(path, opts, print, callNode);
    const result = prettier.doc.printer.printDocToString(doc, { printWidth: 20, tabWidth: 2, useTabs: false });

    expect(result.formatted).toContain('(* keep me *)');
  });
});

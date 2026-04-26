// tests/translator/specialForms.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import prettier from 'prettier';
import { getSpecialPrinter, buildDispatchSets } from '../../src/translator/specialForms.js';

const require = createRequire(import.meta.url);
const ifFixture = require('../fixtures/if-simple.json');

function fmt(doc, width = 80) {
  return prettier.doc.printer.printDocToString(doc, { printWidth: width, tabWidth: 2, useTabs: false }).formatted;
}

const opts = {
  wolframSpaceAfterComma: true,
  tabWidth: 2,
  wolframModuleVarsBreakThreshold: 40,
  wolframConditionFirstFunctions: 'If,Switch',
  wolframBlockStructureFunctions: 'Module,With,Block,DynamicModule',
  wolframCaseStructureFunctions: 'Which',
};

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

const mockPrint = (path, _options, _print) => {
  const node = path.getValue();
  if (node.type === 'LeafNode') return String(node.value);
  if (node.type === 'InfixNode') return 'LONG_CONDITION_EXPRESSION';
  if (node.type === 'CallNode') {
    const printer = getSpecialPrinter(node, opts);
    if (printer) return printer(path, opts, mockPrint, node);
  }
  return 'EXPR';
};

describe('getSpecialPrinter', () => {
  it('returns printConditionFirst for If', () => {
    const callNode = ifFixture.children[0];
    expect(getSpecialPrinter(callNode, opts)).toBeTruthy();
  });

  it('returns null for unknown function', () => {
    const node = { type: 'CallNode', head: { type: 'LeafNode', kind: 'Symbol', value: 'MyFn' }, children: [] };
    expect(getSpecialPrinter(node, opts)).toBeNull();
  });
});

describe('printConditionFirst (If)', () => {
  it('stays inline when it fits within printWidth', () => {
    const ifNode = ifFixture.children[0];
    const printer = getSpecialPrinter(ifNode, opts);
    const path = makePath(ifNode);
    const doc = printer(path, opts, mockPrint, ifNode);
    const result = fmt(doc, 80);
    expect(result.trim()).toBe('If[LONG_CONDITION_EXPRESSION, x, EXPR]');
  });

  it('keeps condition on same line, breaks remaining args', () => {
    const ifNode = ifFixture.children[0];
    const printer = getSpecialPrinter(ifNode, opts);
    const path = makePath(ifNode);
    const doc = printer(path, opts, mockPrint, ifNode);
    const result = fmt(doc, 10); // force break
    expect(result).toMatch(/^If\[/);
    expect(result).toContain('\n');
  });
});

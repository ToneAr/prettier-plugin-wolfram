import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import { printLeaf } from '../../src/translator/nodes/leaf.js';
import { printBinary } from '../../src/translator/nodes/binary.js';
import { printInfix } from '../../src/translator/nodes/infix.js';
import { printCompound } from '../../src/translator/nodes/compound.js';
import { printGroup } from '../../src/translator/nodes/group.js';
import { printPrefix } from '../../src/translator/nodes/prefix.js';
import { printPostfix } from '../../src/translator/nodes/postfix.js';
import { printTernary } from '../../src/translator/nodes/ternary.js';
import * as plugin from '../../src/index.js';

const opts = { wolframSpaceAroundOperators: true, wolframSpaceAfterComma: true };

function fmt(doc, printWidth = 80) {
  return prettier.doc.printer.printDocToString(doc, { printWidth, tabWidth: 2, useTabs: false }).formatted;
}

function comments(text) {
  return text.match(/\(\*.*?\*\)/gs) ?? [];
}

function longestLine(text) {
  return Math.max(...text.trimEnd().split('\n').map((line) => line.length));
}

function displayLineWidth(line, tabWidth) {
  let width = 0;
  for (const char of line) {
    width += char === '\t' ? tabWidth - (width % tabWidth) : 1;
  }
  return width;
}

function longestDisplayLine(text, tabWidth) {
  return Math.max(...text.trimEnd().split('\n').map((line) => displayLineWidth(line, tabWidth)));
}

const leafPrint = (node) => {
  if (node.type === 'LeafNode') return printLeaf(node, opts);
  if (node.type === 'CompoundNode') return printCompound(node, opts, leafPrint);
  if (node.type === 'BinaryNode') return printBinary(node, opts, leafPrint);
  if (node.type === 'InfixNode') return printInfix(node, opts, leafPrint);
  if (node.type === 'PrefixNode') return printPrefix(node, opts, leafPrint);
  if (node.type === 'PostfixNode') return printPostfix(node, opts, leafPrint);
  if (node.type === 'TernaryNode') return printTernary(node, opts, leafPrint);
  return '';
};

function makePath(root, printFn) {
  function at(node) {
    return {
      getValue: () => node,
      call: (print, ...keys) => {
        let cur = node;
        for (const key of keys) cur = cur[key];
        return print(at(cur), opts, printFn);
      },
    };
  }
  return at(root);
}

describe('translator regressions', () => {
  it('prints raw string leaves without double-quoting', () => {
    expect(printLeaf({ type: 'LeafNode', kind: 'String', value: '"processing"' }, opts)).toBe('"processing"');
  });

  it('formats long string literals as multiline StringJoin expressions', async () => {
    const source = 'longName = "a very long string that should wrap nicely across multiple lines"';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 30,
    });

    expect(result).toBe(
      'longName =\n' +
      '  StringJoin[\n' +
      '    "a very long string ",\n' +
      '    "that should wrap ",\n' +
      '    "nicely across ",\n' +
      '    "multiple lines"\n' +
      '  ]'
    );
  }, 15000);

  it('flattens long strings inside StringJoin across repeated formatting', async () => {
    const source =
      'StringJoin["a very long string that should wrap nicely across multiple lines", " and another long tail that will also wrap"]';
    const once = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 30,
    });
    const twice = await prettier.format(once, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 30,
    });

    expect(once).toBe(
      'StringJoin[\n' +
      '  "a very long string that ",\n' +
      '  "should wrap nicely ",\n' +
      '  "across multiple lines ",\n' +
      '  "and another long tail ",\n' +
      '  "that will also wrap"\n' +
      ']'
    );
    expect(twice).toBe(once);
    expect(twice.split('StringJoin[').length - 1).toBe(1);
  }, 15000);

  it('flattens nested StringJoin calls into one StringJoin', async () => {
    const source =
      'StringJoin[StringJoin["a very long string that should wrap nicely across multiple lines"], "tail"]';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 30,
    });

    expect(result).toBe(
      'StringJoin[\n' +
      '  "a very long string that ",\n' +
      '  "should wrap nicely ",\n' +
      '  "across multiple ",\n' +
      '  "linestail"\n' +
      ']'
    );
    expect(result.split('StringJoin[').length - 1).toBe(1);
  }, 15000);

  it('redistributes adjacent StringJoin string fragments before breaking lines', async () => {
    const source =
      'rawXML = Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"]';
    const once = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
    });
    const twice = await prettier.format(once, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
    });

    expect(once).toBe(
      'rawXML =\n' +
      '  Import[\n' +
      '    StringJoin[\n' +
      '      "https://www.wolfram.com/events/technology-conference/innovator-award/"\n' +
      '    ],\n' +
      '    "XMLObject"\n' +
      '  ]'
    );
    expect(twice).toBe(once);
    expect(once).not.toContain('"v"');
    expect(once).not.toContain('"a"');
  }, 15000);

  it('respects printWidth for joined string fragments with wider tab widths', async () => {
    const source =
      'rawXML = Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"]';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 4,
      useTabs: false,
    });

    expect(longestLine(result)).toBeLessThanOrEqual(80);
    expect(result).toContain(
      '            "https://www.wolfram.com/events/technology-conference/innovator-a",'
    );
  }, 15000);

  it('does not over-count wrapper depth when wrapping tab-indented joined strings', async () => {
    const source =
      'rawXML = Dataset[{<|"x" -> Import[StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"], "XMLObject"], "sections" -> sections|>}]';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 4,
      useTabs: true,
    });

    expect(longestDisplayLine(result, 4)).toBeLessThanOrEqual(80);
    expect(result).toContain('"https://www.wolfram.com/events/technology-conference",');
  }, 15000);

  it('fills earlier unbroken joined string chunks before later chunks', async () => {
    const source =
      'StringJoin["https://www.wolfram.com/events/technology-conference/inno", "v", "a", "tor-award/"]';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 60,
    });

    expect(result).toBe(
      'StringJoin[\n' +
      '  "https://www.wolfram.com/events/technology-conference/i",\n' +
      '  "nnovator-award/"\n' +
      ']'
    );
  }, 15000);

  it('fills earlier long string chunks before later chunks', async () => {
    const source =
      'StringJoin["a long string with many medium sized words that currently gets split into too many small pieces across lines"]';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 40,
    });

    expect(result).toBe(
      'StringJoin[\n' +
      '  "a long string with many medium ",\n' +
      '  "sized words that currently gets ",\n' +
      '  "split into too many small pieces ",\n' +
      '  "across lines"\n' +
      ']'
    );
  }, 15000);

  it('keeps multiline strings within printWidth in nested contexts', async () => {
    const cases = [
      {
        width: 80,
        source: 'StringJoin["Failed to retrieve log file \\`1\\`. Please ensure the file exists and you have read permissions."]',
      },
      {
        width: 20,
        source: 'f[g["123456789012345678"]]',
      },
      {
        width: 20,
        source: '<|"key" -> "a very long string that should wrap nicely across multiple lines"|>',
      },
      {
        width: 40,
        source: 'foo = veryLongFunctionName[anotherLongName["a very long string that should wrap nicely across multiple lines and still respect the configured print width in nested contexts"]]',
      },
    ];

    for (const { source, width } of cases) {
      const once = await prettier.format(source, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: width,
      });
      const twice = await prettier.format(once, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: width,
      });

      expect(longestLine(once), source).toBeLessThanOrEqual(width);
      expect(twice, source).toBe(once);
    }
  }, 15000);

  it('keeps compact binary RHS calls stable when nested strings wrap into StringJoin', async () => {
    const cases = [
      {
        source: 'foo -> f[beta, "a fairly long string that should wrap nicely across lines"]',
        operator: '->',
      },
      {
        source: 'foo /. f[beta, "a fairly long string that should wrap nicely across lines"]',
        operator: '/.',
      },
      {
        source: '{a} -> CloudPut[alpha, "short", "a fairly long string that should wrap nicely across lines"]',
        operator: '->',
      },
    ];

    for (const { source, operator } of cases) {
      const once = await prettier.format(source, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: 40,
      });
      const twice = await prettier.format(once, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: 40,
      });

      expect(twice, source).toBe(once);
      expect(once, source).not.toContain(`${operator}\n`);
      expect(once, source).toContain(`${operator} `);
    }
  }, 15000);

  it('keeps width-aware special forms within printWidth after formatting', async () => {
    const cases = [
      {
        width: 30,
        source: 'Module[{alphaBetaGammaDelta = 1, secondName = 2}, alphaBetaGammaDelta + secondName]',
        options: { wolframModuleVarsBreakThreshold: 100 },
      },
      {
        width: 40,
        source: 'x ~ customLongFunctionName ~ yVeryLongArgumentName',
      },
      {
        width: 30,
        source: 'reallyLongLeftHandSideName > reallyLongRightHandSideName',
      },
    ];

    for (const { source, width, options = {} } of cases) {
      const formatOptions = {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: width,
        tabWidth: 2,
        ...options,
      };
      const once = await prettier.format(source, formatOptions);
      const twice = await prettier.format(once, formatOptions);

      expect(longestLine(once), source).toBeLessThanOrEqual(width);
      expect(twice, source).toBe(once);
    }
  }, 15000);

  it('preserves incomplete expressions instead of printing raw CST internals', async () => {
    const source = 'f[';
    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
    });

    expect(result).toBe(source);
    expect(result).not.toContain('CallNode[');
    expect(result).not.toContain('GroupMissingCloserNode[');
  }, 15000);

  it('preserves comments in operator expressions', async () => {
    const cases = [
      'a (*1*) + (*2*) b',
      'x /. {a(*c*) -> b}',
      'a (*c*) -> b',
      'x // (*c*) f',
      '! (*c*) x',
      'x ~ (*c*) f ~ y',
      'a(*c*)@b',
      'x::(*c*)"usage"',
    ];

    for (const source of cases) {
      const result = await prettier.format(source, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: 30,
      });

      expect(comments(result), source).toEqual(comments(source));
      expect(result.length, source).toBeGreaterThan(0);
    }
  }, 15000);

  it('retains multiline comment indentation across formatting passes', async () => {
    const cases = [
      {
        source: 'foo[\n\t\t(*\n\t\tSome comment\n\t\t*)\n]',
        expected: 'foo[\n  (*\n  Some comment\n  *)\n]',
      },
      {
        source: 'foo[\n    (*\n      Some comment\n    *)\n]',
        expected: 'foo[\n  (*\n    Some comment\n  *)\n]',
      },
    ];

    for (const { source, expected } of cases) {
      const once = await prettier.format(source, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: 80,
        tabWidth: 2,
      });
      const twice = await prettier.format(once, {
        parser: 'wolfram',
        plugins: [plugin],
        printWidth: 80,
        tabWidth: 2,
      });

      expect(once, source).toBe(expected);
      expect(twice, source).toBe(once);
    }
  }, 15000);

  it('preserves multiline trailing comments without stringifying doc fragments', async () => {
    const source = 'x = 1; (*\n    Some comment\n    *)';
    const once = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });
    const twice = await prettier.format(once, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });

    expect(once).not.toContain('[object Object]');
    expect(once).toContain('(*');
    expect(once).toContain('Some comment');
    expect(once).toContain('*)');
    expect(twice).toBe(once);
  }, 15000);

  it('groups leading comments with the following definition and keeps the separating blank line above the comment block', async () => {
    const source = 'a = 1\n(* docs for b *)\n\nb := 2';
    const once = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });
    const twice = await prettier.format(once, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });

    expect(once).toBe('a = 1\n\n(* docs for b *)\nb := 2');
    expect(twice).toBe(once);
  }, 15000);

  it('preserves trailing comments inside block-structured calls', async () => {
    const source = `scrapeCustomerStoryData // PackageScoped;
scrapeCustomerStoryData[]:=
\tBlock[{urlGroup, data},
\t\turlGroup = Flatten@(getURLs /@ $BaseURLs);
\t\tdata = If[
\t\t\tStringTake[#, -3] === "pdf",
\t\t\tscrapePDF[#],
\t\t\tscrapeData[#]
\t\t]& /@ urlGroup;
\t\tDeleteCases[
\t\t\tdata,
\t\t\t<|_,_, "Content"-> x_ /;Length[x] > 0|>,
\t\t\tInfinity
\t\t](*Temp remove broken data*)
\t\t(*Wont actually make inxex correctly, missing map func thats in master*)
        (*Package into defined structure*)

];`;

    const result = await prettier.format(source, {
      parser: 'wolfram',
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
    });

    expect(comments(result)).toEqual(comments(source));
  }, 15000);

  it('prints PatternBlank as x_', () => {
    const node = {
      type: 'CompoundNode',
      op: 'PatternBlank',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`Under', value: '_' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('x_');
  });

  it('prints PatternBlankSequence as x__', () => {
    const node = {
      type: 'CompoundNode',
      op: 'PatternBlankSequence',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`UnderUnder', value: '__' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('x__');
  });

  it('prints PatternBlankNullSequence as x___', () => {
    const node = {
      type: 'CompoundNode',
      op: 'PatternBlankNullSequence',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`UnderUnderUnder', value: '___' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('x___');
  });

  it('prints typed Blank as _Integer', () => {
    const node = {
      type: 'CompoundNode',
      op: 'Blank',
      children: [
        { type: 'LeafNode', kind: 'Token`Under', value: '_' },
        { type: 'LeafNode', kind: 'Symbol', value: 'Integer' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('_Integer');
  });

  it('prints typed BlankSequence as __Integer', () => {
    const node = {
      type: 'CompoundNode',
      op: 'BlankSequence',
      children: [
        { type: 'LeafNode', kind: 'Token`UnderUnder', value: '__' },
        { type: 'LeafNode', kind: 'Symbol', value: 'Integer' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('__Integer');
  });

  it('prints typed BlankNullSequence as ___Integer', () => {
    const node = {
      type: 'CompoundNode',
      op: 'BlankNullSequence',
      children: [
        { type: 'LeafNode', kind: 'Token`UnderUnderUnder', value: '___' },
        { type: 'LeafNode', kind: 'Symbol', value: 'Integer' },
      ],
    };
    expect(fmt(printCompound(node, opts, leafPrint))).toBe('___Integer');
  });

  it('prints slot forms correctly', () => {
    expect(fmt(printLeaf({ type: 'LeafNode', kind: 'Token`Hash', value: '#' }, opts))).toBe('#');

    expect(fmt(printCompound({
      type: 'CompoundNode',
      op: 'Slot',
      children: [
        { type: 'LeafNode', kind: 'Token`Hash', value: '#' },
        { type: 'LeafNode', kind: 'Integer', value: '1' },
      ],
    }, opts, leafPrint))).toBe('#1');

    expect(fmt(printCompound({
      type: 'CompoundNode',
      op: 'SlotSequence',
      children: [
        { type: 'LeafNode', kind: 'Token`HashHash', value: '##' },
        { type: 'LeafNode', kind: 'Integer', value: '2' },
      ],
    }, opts, leafPrint))).toBe('##2');
  });

  it('prints Power as x ^ 2', () => {
    const node = {
      type: 'BinaryNode',
      op: 'Power',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`Caret', value: '^' },
        { type: 'LeafNode', kind: 'Integer', value: '2' },
      ],
    };
    expect(fmt(printBinary(node, opts, leafPrint))).toBe('x ^ 2');
  });

  it('treats # as a semantic operand in binary expressions', () => {
    const node = {
      type: 'BinaryNode',
      op: 'Power',
      children: [
        { type: 'LeafNode', kind: 'Token`Hash', value: '#' },
        { type: 'LeafNode', kind: 'Token`Caret', value: '^' },
        { type: 'LeafNode', kind: 'Integer', value: '2' },
      ],
    };
    expect(fmt(printBinary(node, opts, leafPrint))).toBe('# ^ 2');
  });

  it('prints ReplaceAll as expr /. rhs', () => {
    const node = {
      type: 'BinaryNode',
      op: 'ReplaceAll',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'expr' },
        { type: 'LeafNode', kind: 'Token`SlashDot', value: '/.' },
        { type: 'LeafNode', kind: 'Symbol', value: 'rules' },
      ],
    };
    expect(fmt(printBinary(node, opts, leafPrint))).toBe('expr /. rules');
  });

  it('prints span operators compactly', () => {
    const binaryCases = [
      [
        '1;;3',
        [
          { type: 'LeafNode', kind: 'Integer', value: '1' },
          { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
          { type: 'LeafNode', kind: 'Integer', value: '3' },
        ],
      ],
      [
        ';;3',
        [
          { type: 'LeafNode', kind: 'Token`Fake`ImplicitOne', value: '' },
          { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
          { type: 'LeafNode', kind: 'Integer', value: '3' },
        ],
      ],
      [
        '1;;',
        [
          { type: 'LeafNode', kind: 'Integer', value: '1' },
          { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
          { type: 'LeafNode', kind: 'Token`Fake`ImplicitAll', value: '' },
        ],
      ],
      [
        ';;',
        [
          { type: 'LeafNode', kind: 'Token`Fake`ImplicitOne', value: '' },
          { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
          { type: 'LeafNode', kind: 'Token`Fake`ImplicitAll', value: '' },
        ],
      ],
    ];

    for (const [expected, children] of binaryCases) {
      const node = { type: 'BinaryNode', op: 'Span', children };
      expect(fmt(printBinary(node, opts, leafPrint))).toBe(expected);
    }

    expect(fmt(printTernary({
      type: 'TernaryNode',
      op: 'Span',
      children: [
        { type: 'LeafNode', kind: 'Integer', value: '1' },
        { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
        { type: 'LeafNode', kind: 'Integer', value: '3' },
        { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
        { type: 'LeafNode', kind: 'Integer', value: '2' },
      ],
    }, opts, leafPrint))).toBe('1;;3;;2');
  });

  it('prints ;; compactly based on the token even for unexpected binary ops', () => {
    const node = {
      type: 'BinaryNode',
      op: 'Unknown',
      children: [
        { type: 'LeafNode', kind: 'Integer', value: '1' },
        { type: 'LeafNode', kind: 'Token`SemiSemi', value: ';;' },
        { type: 'LeafNode', kind: 'Integer', value: '3' },
      ],
    };

    expect(fmt(printBinary(node, opts, leafPrint))).toBe('1;;3');
  });

  it('prints MessageName without spaces', () => {
    const node = {
      type: 'InfixNode',
      op: 'MessageName',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'f' },
        { type: 'LeafNode', kind: 'Token`ColonColon', value: '::' },
        { type: 'LeafNode', kind: 'String', value: 'usage' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('f::"usage"');
  });

  it('prints PatternTest without spaces', () => {
    const node = {
      type: 'BinaryNode',
      op: 'PatternTest',
      children: [
        {
          type: 'CompoundNode',
          op: 'PatternBlank',
          children: [
            { type: 'LeafNode', kind: 'Symbol', value: 'x' },
            { type: 'LeafNode', kind: 'Token`Under', value: '_' },
          ],
        },
        { type: 'LeafNode', kind: 'Token`Question', value: '?' },
        { type: 'LeafNode', kind: 'Symbol', value: 'NumericQ' },
      ],
    };
    expect(fmt(printBinary(node, opts, leafPrint))).toBe('x_?NumericQ');
  });

  it('prints InfixInequality using token text', () => {
    const node = {
      type: 'InfixNode',
      op: 'InfixInequality',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'n' },
        { type: 'LeafNode', kind: 'Token`Greater', value: '>' },
        { type: 'LeafNode', kind: 'Integer', value: '0' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('n > 0');
  });

  it('prints actual infix token text for minus expressions', () => {
    const node = {
      type: 'InfixNode',
      op: 'Plus',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'n' },
        { type: 'LeafNode', kind: 'Token`Minus', value: '-' },
        { type: 'LeafNode', kind: 'Integer', value: '1' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('n - 1');
  });

  it('prints CompoundExpression with semicolons', () => {
    const node = {
      type: 'InfixNode',
      op: 'CompoundExpression',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'a' },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
        { type: 'LeafNode', kind: 'Symbol', value: 'b' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('a; b');
  });

  it('preserves capped blank lines between compound statements', () => {
    const node = {
      type: 'CompoundNode',
      op: 'CompoundExpression',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'a', source: [[1, 1], [1, 2]] },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';', source: [[1, 2], [1, 3]] },
        { type: 'LeafNode', kind: 'Symbol', value: 'b', source: [[5, 1], [5, 2]] },
      ],
    };

    expect(fmt(printCompound(node, { ...opts, wolframMaxBlankLinesBetweenCode: 2 }, leafPrint))).toBe('a;\n\n\nb');
  });

  it('uses definition spacing between compound definition statements', () => {
    const node = {
      type: 'CompoundNode',
      op: 'CompoundExpression',
      children: [
        { type: 'BinaryNode', op: 'Set', value: 'a = 1', source: [[1, 1], [1, 6]] },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';', source: [[1, 6], [1, 7]] },
        { type: 'BinaryNode', op: 'SetDelayed', value: 'b := 2', source: [[2, 1], [2, 7]] },
      ],
    };

    const print = (child) => String(child.value ?? '');
    expect(fmt(printCompound(node, { ...opts, wolframNewlinesBetweenDefinitions: 2 }, print))).toBe('a = 1;\n\n\nb := 2');
  });

  it('keeps commas attached to the preceding expression', () => {
    const node = {
      type: 'InfixNode',
      op: 'Comma',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'a' },
        { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
        { type: 'LeafNode', kind: 'Symbol', value: 'b' },
        { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
        { type: 'LeafNode', kind: 'Symbol', value: 'c' },
      ],
    };

    expect(fmt(printInfix(node, opts, leafPrint))).toBe('a, b, c');
    expect(fmt(printInfix(node, opts, leafPrint), 1)).toBe('a,\nb,\nc');
  });

  it('treats comments as inert in compound expressions', () => {
    const node = {
      type: 'InfixNode',
      op: 'CompoundExpression',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'a' },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* comment *)' },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
        { type: 'LeafNode', kind: 'Symbol', value: 'b' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('a; (* comment *) b');
  });

  it('aligns trailing documentation comments in statement; comment form', () => {
    const node = {
      type: 'InfixNode',
      op: 'CompoundExpression',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'operation1' },
        { type: 'LeafNode', kind: 'Token`Semi', value: ';' },
        { type: 'LeafNode', kind: 'Token`Comment', value: '(* doc *)' },
      ],
    };
    const result = fmt(printInfix(node, { ...opts, printWidth: 10, wolframDocumentationCommentColumn: 20 }, leafPrint));
    expect(result).toBe('operation1;         (* doc *)');
  });

  it('prints list contents inside InfixNode[Comma] wrappers', () => {
    const node = {
      type: 'GroupNode',
      kind: 'List',
      children: [
        { type: 'LeafNode', kind: 'Token`OpenCurly', value: '{' },
        {
          type: 'InfixNode',
          op: 'Comma',
          children: [
            { type: 'LeafNode', kind: 'Symbol', value: 'a' },
            { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
            { type: 'LeafNode', kind: 'Symbol', value: 'b' },
          ],
        },
        { type: 'LeafNode', kind: 'Token`CloseCurly', value: '}' },
      ],
    };
    const print = (path) => {
      const n = path.getValue();
      if (n.type === 'LeafNode') return printLeaf(n, opts);
      if (n.type === 'GroupNode') return printGroup(path, opts, print, n);
      if (n.type === 'InfixNode') return printInfix(n, opts, (child) => printLeaf(child, opts));
      return '';
    };
    expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe('{a, b}');
  });

  it('treats comment blocks as inert inside wrapped lists', () => {
    const node = {
      type: 'GroupNode',
      kind: 'List',
      children: [
        { type: 'LeafNode', kind: 'Token`OpenCurly', value: '{' },
        {
          type: 'InfixNode',
          op: 'Comma',
          children: [
            { type: 'LeafNode', kind: 'Symbol', value: 'a' },
            { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
            { type: 'LeafNode', kind: 'Token`Comment', value: '(* comment *)' },
            { type: 'LeafNode', kind: 'Symbol', value: 'b' },
          ],
        },
        { type: 'LeafNode', kind: 'Token`CloseCurly', value: '}' },
      ],
    };
    const print = (path) => {
      const n = path.getValue();
      if (n.type === 'LeafNode') return printLeaf(n, opts);
      if (n.type === 'GroupNode') return printGroup(path, opts, print, n);
      if (n.type === 'InfixNode') return printInfix(n, opts, (child) => printLeaf(child, opts));
      return '';
    };
    expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe('{a, (* comment *) b}');
  });

  it('prints association contents with <| |> delimiters', () => {
    const node = {
      type: 'GroupNode',
      kind: 'Association',
      children: [
        { type: 'LeafNode', kind: 'Token`LessBar', value: '<|' },
        {
          type: 'InfixNode',
          op: 'Comma',
          children: [
            {
              type: 'BinaryNode',
              op: 'Rule',
              children: [
                { type: 'LeafNode', kind: 'Symbol', value: 'a' },
                { type: 'LeafNode', kind: 'Token`MinusGreater', value: '->' },
                { type: 'LeafNode', kind: 'Integer', value: '1' },
              ],
            },
            { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
            {
              type: 'BinaryNode',
              op: 'RuleDelayed',
              children: [
                { type: 'LeafNode', kind: 'Symbol', value: 'b' },
                { type: 'LeafNode', kind: 'Token`ColonGreater', value: ':>' },
                { type: 'LeafNode', kind: 'Symbol', value: 'x' },
              ],
            },
          ],
        },
        { type: 'LeafNode', kind: 'Token`BarGreater', value: '|>' },
      ],
    };
    const print = (path) => {
      const n = path.getValue();
      if (n.type === 'LeafNode') return printLeaf(n, opts);
      if (n.type === 'GroupNode') return printGroup(path, opts, print, n);
      if (n.type === 'InfixNode') return printInfix(n, opts, leafPrint);
      if (n.type === 'BinaryNode') return printBinary(n, opts, leafPrint);
      return '';
    };
    expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe('<|a -> 1, b :> x|>');
  });

  it('treats comment blocks as inert inside associations', () => {
    const node = {
      type: 'GroupNode',
      kind: 'Association',
      children: [
        { type: 'LeafNode', kind: 'Token`LessBar', value: '<|' },
        {
          type: 'InfixNode',
          op: 'Comma',
          children: [
            {
              type: 'BinaryNode',
              op: 'Rule',
              children: [
                { type: 'LeafNode', kind: 'Symbol', value: 'a' },
                { type: 'LeafNode', kind: 'Token`MinusGreater', value: '->' },
                { type: 'LeafNode', kind: 'Integer', value: '1' },
              ],
            },
            { type: 'LeafNode', kind: 'Token`Comma', value: ',' },
            { type: 'LeafNode', kind: 'Token`Comment', value: '(* comment *)' },
            {
              type: 'BinaryNode',
              op: 'Rule',
              children: [
                { type: 'LeafNode', kind: 'Symbol', value: 'b' },
                { type: 'LeafNode', kind: 'Token`MinusGreater', value: '->' },
                { type: 'LeafNode', kind: 'Integer', value: '2' },
              ],
            },
          ],
        },
        { type: 'LeafNode', kind: 'Token`BarGreater', value: '|>' },
      ],
    };
    const print = (path) => {
      const n = path.getValue();
      if (n.type === 'LeafNode') return printLeaf(n, opts);
      if (n.type === 'GroupNode') return printGroup(path, opts, print, n);
      if (n.type === 'InfixNode') return printInfix(n, opts, leafPrint);
      if (n.type === 'BinaryNode') return printBinary(n, opts, leafPrint);
      return '';
    };
    expect(fmt(printGroup(makePath(node, print), opts, print, node))).toBe('<|a -> 1, (* comment *) b -> 2|>');
  });

  it('prints empty associations as <||>', () => {
    const node = {
      type: 'GroupNode',
      kind: 'Association',
      children: [
        { type: 'LeafNode', kind: 'Token`LessBar', value: '<|' },
        { type: 'LeafNode', kind: 'Token`BarGreater', value: '|>' },
      ],
    };
    expect(fmt(printGroup(makePath(node, () => ''), opts, () => '', node))).toBe('<||>');
  });

  it('prints shorthand binary operators', () => {
    const cases = [
      ['Map', '/@'],
      ['Apply', '@@'],
      ['MapApply', '@@@'],
      ['MapAll', '//@'],
      ['BinaryAt', '@'],
      ['BinarySlashSlash', '//'],
    ];

    for (const [op, token] of cases) {
      const node = {
        type: 'BinaryNode',
        op,
        children: [
          { type: 'LeafNode', kind: 'Symbol', value: 'lhs' },
          { type: 'LeafNode', kind: 'Token`Op', value: token },
          { type: 'LeafNode', kind: 'Symbol', value: 'rhs' },
        ],
      };
      expect(fmt(printBinary(node, opts, leafPrint))).toBe(`lhs ${token} rhs`);
    }
  });

  it('does not indent wrapped prefix and postfix operator bodies', () => {
    const cases = [
      ['BinaryAt', 'f', '@', 'body', 'f @\nbody'],
      ['BinarySlashSlash', 'body', '//', 'f', 'body //\nf'],
    ];

    for (const [op, lhs, token, rhs, expected] of cases) {
      const node = {
        type: 'BinaryNode',
        op,
        children: [
          { type: 'LeafNode', kind: 'Symbol', value: lhs },
          { type: 'LeafNode', kind: 'Token`Op', value: token },
          { type: 'LeafNode', kind: 'Symbol', value: rhs },
        ],
      };

      expect(fmt(printBinary(node, opts, leafPrint), 5)).toBe(expected);
    }
  });

  it('prints prefix and postfix shorthand operators', () => {
    expect(fmt(printPrefix({
      type: 'PrefixNode',
      op: 'Not',
      children: [
        { type: 'LeafNode', kind: 'Token`Bang', value: '!' },
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
      ],
    }, opts, leafPrint))).toBe('!x');

    expect(fmt(printPostfix({
      type: 'PostfixNode',
      op: 'Function',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'f' },
        { type: 'LeafNode', kind: 'Token`Amp', value: '&' },
      ],
    }, opts, leafPrint))).toBe('f&');

    expect(fmt(printPostfix({
      type: 'PostfixNode',
      op: 'Function',
      children: [
        { type: 'LeafNode', kind: 'Token`Hash', value: '#' },
        { type: 'LeafNode', kind: 'Token`Amp', value: '&' },
      ],
    }, opts, leafPrint))).toBe('#&');
  });

  it('prints preserved ternary tilde infix operators like Join', () => {
    const node = {
      type: 'TernaryNode',
      op: 'TernaryTilde',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'Join' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'y' },
      ],
    };
    expect(fmt(printTernary(node, opts, leafPrint))).toBe('Join[x, y]');
  });

  it('supports configurable preserved ~f~ infix heads', () => {
    const node = {
      type: 'TernaryNode',
      op: 'TernaryTilde',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'CustomOp' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'y' },
      ],
    };
    expect(fmt(printTernary(node, { ...opts, wolframPreserveTildeInfixFunctions: 'Join,CustomOp' }, leafPrint))).toBe('x ~ CustomOp ~ y');
  });

  it('normalizes general ternary tilde infix form to call syntax', () => {
    const node = {
      type: 'TernaryNode',
      op: 'TernaryTilde',
      children: [
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'f' },
        { type: 'LeafNode', kind: 'Token`Tilde', value: '~' },
        { type: 'LeafNode', kind: 'Symbol', value: 'y' },
      ],
    };
    expect(fmt(printTernary(node, opts, leafPrint))).toBe('f[x, y]');
  });

  it('treats anonymous blank leaves as semantic operands in StringExpression', () => {
    // ___ ~~ "str" ~~ x__ ~~ "str2" ~~ ___
    // Anonymous blanks are LeafNode[Token`UnderUnderUnder] in the CST.
    // They must not be classified as operator tokens, or ~~ gets replaced
    // by the op name "StringExpression" and the blanks disappear from output.
    const node = {
      type: 'InfixNode',
      op: 'StringExpression',
      children: [
        { type: 'LeafNode', kind: 'Token`UnderUnderUnder', value: '___' },
        { type: 'LeafNode', kind: 'Whitespace', value: ' ' },
        { type: 'LeafNode', kind: 'Token`TildeTilde', value: '~~' },
        { type: 'LeafNode', kind: 'Whitespace', value: ' ' },
        { type: 'LeafNode', kind: 'String', value: '"hello"' },
        { type: 'LeafNode', kind: 'Whitespace', value: ' ' },
        { type: 'LeafNode', kind: 'Token`TildeTilde', value: '~~' },
        { type: 'LeafNode', kind: 'Whitespace', value: ' ' },
        { type: 'LeafNode', kind: 'Token`UnderUnderUnder', value: '___' },
      ],
    };
    expect(fmt(printInfix(node, opts, leafPrint))).toBe('___ ~~ "hello" ~~ ___');
  });

  it('treats anonymous blank as semantic operand in binary expressions', () => {
    // _ -> x: the LHS is a bare LeafNode[Token`Under], not a CompoundNode.
    const node = {
      type: 'BinaryNode',
      op: 'Rule',
      children: [
        { type: 'LeafNode', kind: 'Token`Under', value: '_' },
        { type: 'LeafNode', kind: 'Token`MinusGreater', value: '->' },
        { type: 'LeafNode', kind: 'Symbol', value: 'x' },
      ],
    };
    expect(fmt(printBinary(node, opts, leafPrint))).toBe('_ -> x');
  });
});

import { describe, expect, it } from 'vitest';

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }

  isBeforeOrEqual(other) {
    return this.line < other.line || (
      this.line === other.line &&
      this.character <= other.character
    );
  }
}

class Range {
  constructor(startOrLine, startCharOrPos, endLine, endChar) {
    if (startOrLine instanceof Position) {
      this.start = startOrLine;
      this.end = startCharOrPos;
      return;
    }

    this.start = new Position(startOrLine, startCharOrPos);
    this.end = new Position(endLine, endChar);
  }
}

const vscodeApi = {
  Position,
  Range,
};

const helpers = await import('../../vscode-extension/src/diagnosticRanges.js');

function makeDocument(text) {
  const lines = text.split('\n');

  function offsetAt(position) {
    let offset = 0;
    for (let i = 0; i < position.line; i++) {
      offset += lines[i].length + 1;
    }
    return offset + position.character;
  }

  function positionAt(offset) {
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
      const lineLength = lines[line].length;
      if (remaining <= lineLength) return new Position(line, remaining);
      remaining -= lineLength + 1;
    }
    return new Position(lines.length - 1, lines.at(-1)?.length ?? 0);
  }

  return {
    lineCount: lines.length,
    lineAt(line) {
      return { text: lines[line] ?? '' };
    },
    offsetAt,
    positionAt,
    getText(range) {
      if (!range) return text;
      return text.slice(offsetAt(range.start), offsetAt(range.end));
    },
  };
}

describe('diagnostic range anchoring', () => {
  it('anchors whitespace rule findings to the enclosing semantic expression', () => {
    const document = makeDocument('a +b');
    const ast = {
      type: 'ContainerNode',
      source: [[1, 1], [1, 5]],
      locStart: 0,
      locEnd: 4,
      children: [
        {
          type: 'InfixNode',
          source: [[1, 1], [1, 5]],
          locStart: 0,
          locEnd: 4,
          children: [
            { type: 'LeafNode', kind: 'Symbol', source: [[1, 1], [1, 2]], locStart: 0, locEnd: 1 },
            { type: 'LeafNode', kind: 'Token`Whitespace', source: [[1, 2], [1, 3]], locStart: 1, locEnd: 2 },
            { type: 'LeafNode', kind: 'Token`Plus', source: [[1, 3], [1, 4]], locStart: 2, locEnd: 3 },
            { type: 'LeafNode', kind: 'Symbol', source: [[1, 4], [1, 5]], locStart: 3, locEnd: 4 },
          ],
        },
      ],
    };

    const finding = {
      node: ast.children[0].children[1],
    };

    const range = helpers.diagnosticRangeForFinding(vscodeApi, document, ast, finding);

    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(0);
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(4);
  });

  it('anchors single-token formatter diffs to the enclosing semantic node', () => {
    const original = 'f[a,b]';
    const formatted = 'f[a, b]';
    const document = makeDocument(original);
    const ast = {
      type: 'ContainerNode',
      source: [[1, 1], [1, 7]],
      locStart: 0,
      locEnd: 6,
      children: [
        {
          type: 'CallNode',
          source: [[1, 1], [1, 7]],
          locStart: 0,
          locEnd: 6,
          children: [
            { type: 'LeafNode', kind: 'Token`OpenSquare', source: [[1, 2], [1, 3]], locStart: 1, locEnd: 2 },
            {
              type: 'InfixNode',
              source: [[1, 3], [1, 6]],
              locStart: 2,
              locEnd: 5,
              children: [
                { type: 'LeafNode', kind: 'Symbol', source: [[1, 3], [1, 4]], locStart: 2, locEnd: 3 },
                { type: 'LeafNode', kind: 'Token`Comma', source: [[1, 4], [1, 5]], locStart: 3, locEnd: 4 },
                { type: 'LeafNode', kind: 'Symbol', source: [[1, 5], [1, 6]], locStart: 4, locEnd: 5 },
              ],
            },
            { type: 'LeafNode', kind: 'Token`CloseSquare', source: [[1, 6], [1, 7]], locStart: 5, locEnd: 6 },
          ],
          head: {
            type: 'LeafNode',
            kind: 'Symbol',
            source: [[1, 1], [1, 2]],
            locStart: 0,
            locEnd: 1,
          },
        },
      ],
    };

    const hunk = helpers.diffLineHunks(original, formatted)[0];
    const range = helpers.diagnosticRangeForHunk(vscodeApi, document, ast, hunk);

    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(2);
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(5);
  });

  it('expands whitespace-only ranges to the visible line span', () => {
    const document = makeDocument('  x := 1');
    const whitespaceRange = new Range(new Position(0, 0), new Position(0, 2));

    const range = helpers.ensureVisibleRange(vscodeApi, document, whitespaceRange);

    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(0);
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(8);
  });

  it('keeps visible line-width findings on the reported overflow span', () => {
    const text = 'foo = StringJoin["this is a deliberately overlong string that should not underline the whole expression"]';
    const document = makeDocument(text);
    const ast = {
      type: 'ContainerNode',
      source: [[1, 1], [1, text.length + 1]],
      locStart: 0,
      locEnd: text.length,
      children: [
        {
          type: 'BinaryNode',
          op: 'Set',
          source: [[1, 1], [1, text.length + 1]],
          locStart: 0,
          locEnd: text.length,
          children: [
            {
              type: 'CallNode',
              source: [[1, 7], [1, text.length + 1]],
              locStart: 6,
              locEnd: text.length,
              children: [],
              head: {
                type: 'LeafNode',
                kind: 'Symbol',
                source: [[1, 7], [1, 17]],
                locStart: 6,
                locEnd: 16,
              },
            },
          ],
        },
      ],
    };

    const finding = {
      node: {
        source: [[1, 41], [1, text.length + 1]],
      },
    };

    const range = helpers.diagnosticRangeForFinding(vscodeApi, document, ast, finding);

    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(40);
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(text.length);
  });

  it('keeps one-line-to-multiline formatter diffs on the changed tail', () => {
    const original = 'foo = StringJoin["a deliberately long string that will be wrapped by formatting"]';
    const formatted =
      'foo =\n' +
      '  StringJoin[\n' +
      '    "a deliberately long string ",\n' +
      '    "that will be wrapped by formatting"\n' +
      '  ]';
    const document = makeDocument(original);
    const ast = {
      type: 'ContainerNode',
      source: [[1, 1], [1, original.length + 1]],
      locStart: 0,
      locEnd: original.length,
      children: [
        {
          type: 'BinaryNode',
          op: 'Set',
          source: [[1, 1], [1, original.length + 1]],
          locStart: 0,
          locEnd: original.length,
          children: [
            {
              type: 'CallNode',
              source: [[1, 7], [1, original.length + 1]],
              locStart: 6,
              locEnd: original.length,
              children: [],
              head: {
                type: 'LeafNode',
                kind: 'Symbol',
                source: [[1, 7], [1, 17]],
                locStart: 6,
                locEnd: 16,
              },
            },
          ],
        },
      ],
    };

    const hunk = helpers.diffLineHunks(original, formatted)[0];
    const range = helpers.diagnosticRangeForHunk(vscodeApi, document, ast, hunk);

    expect(range.start.line).toBe(0);
    expect(range.start.character).toBe(5);
    expect(range.end.line).toBe(0);
    expect(range.end.character).toBe(original.length);
  });
});

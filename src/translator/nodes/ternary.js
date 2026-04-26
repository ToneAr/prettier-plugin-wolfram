// src/translator/nodes/ternary.js
import { doc } from 'prettier';
const { builders } = doc;
import { isTrivia } from './leaf.js';
import { hasImmediateComment, printOriginalSource } from '../sourcePreservation.js';
const { group, indent, line, softline } = builders;

function preservedTildeFunctions(options) {
  return new Set(
    String(options.wolframPreserveTildeInfixFunctions ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isFakeTokenLeaf(node) {
  return node?.type === 'LeafNode' && node.kind.startsWith('Token`Fake`');
}

function isSpanToken(node) {
  return node?.type === 'LeafNode' && node.kind === 'Token`SemiSemi';
}

function tildeGap(token, options) {
  if (options.wolframSpaceAroundOperators ?? true) {
    return [` ${token}`, line];
  }

  return [token, softline];
}

export function printTernary(node, options, print) {
  if (hasImmediateComment(node)) {
    return printOriginalSource(node, options);
  }

  const semantic = node.children.filter((c) => !isTrivia(c));

  if (node.op === 'Span') {
    return group(semantic.map((child) => {
      if (isSpanToken(child)) return ';;';
      if (isFakeTokenLeaf(child)) return '';
      return print(child);
    }));
  }

  if (node.op === 'TernaryTilde' && semantic.length === 5) {
    const [lhs, firstTilde, fn, secondTilde, rhs] = semantic;
    if (fn.type === 'LeafNode' && fn.kind === 'Symbol' && preservedTildeFunctions(options).has(fn.value)) {
      return group([
        print(lhs),
        ...tildeGap(firstTilde.value, options),
        print(fn),
        ...tildeGap(secondTilde.value, options),
        print(rhs),
      ]);
    }

    return group([
      print(fn),
      '[',
      indent([
        softline,
        print(lhs),
        ',',
        line,
        print(rhs),
      ]),
      softline,
      ']',
    ]);
  }

  return printOriginalSource(node, options);
}

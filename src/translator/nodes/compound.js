// src/translator/nodes/compound.js
import { doc } from 'prettier';
const { builders } = doc;
import { isTrivia, isComment } from './leaf.js';
import { joinDocsWithSpace } from '../docComments.js';
import { blankLinesForCodeGap, observedBlankLinesBetween } from '../../utils/codeSpacing.js';
const { group, hardline } = builders;

const PATTERN_BLANK_OPS = new Set([
  'PatternBlank',
  'PatternBlankSequence',
  'PatternBlankNullSequence',
]);

const BLANK_OPS = new Set([
  'Blank',
  'BlankSequence',
  'BlankNullSequence',
]);

function printBlankCompound(node, print) {
  const semantic = node.children.filter((c) => !isTrivia(c));
  if (semantic.length === 0) return '';
  return group(semantic.map((child) => print(child)));
}

export function printCompound(node, options, print) {
  if (PATTERN_BLANK_OPS.has(node.op)) {
    return printBlankCompound(node, print);
  }

  if (BLANK_OPS.has(node.op)) {
    return printBlankCompound(node, print);
  }

  if (node.op === 'Pattern') {
    const semantic = node.children.filter((c) => !isTrivia(c));
    if (semantic.length === 2) return [print(semantic[0]), ':', print(semantic[1])];
  }

  if (node.op === 'Slot' || node.op === 'SlotSequence') {
    return node.children.filter((c) => !isTrivia(c)).map((c) => print(c));
  }

  // CompoundNode[Semicolon, {a, ws, ;, ws, b, ...}]
  const stmts = node.children.filter(c => !isTrivia(c) &&
    !isComment(c) &&
    !(c.type === 'LeafNode' && (c.kind === 'Token`Semi' || c.kind === 'Token`Semicolon')));
  const trailingComments = node.children.filter((c) => isComment(c));

  if (stmts.length === 1) {
    return trailingComments.length === 0
      ? [print(stmts[0]), ';']
      : [print(stmts[0]), '; ', joinDocsWithSpace(trailingComments.map((c) => print(c)))];
  }

  const body = [];
  let previousStmt = null;

  for (const stmt of stmts) {
    if (previousStmt) {
      const observedBlankLines = observedBlankLinesBetween(
        previousStmt.source?.[1]?.[0],
        stmt.source?.[0]?.[0],
      );
      const blankLines = blankLinesForCodeGap(
        previousStmt,
        stmt,
        observedBlankLines,
        options,
      );
      body.push(';', hardline, ...Array(blankLines).fill(hardline));
    }

    body.push(print(stmt));
    previousStmt = stmt;
  }

  if (trailingComments.length === 0) return body;
  return [body, ' ', joinDocsWithSpace(trailingComments.map((c) => print(c)))];
}

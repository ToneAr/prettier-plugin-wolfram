// src/translator/nodes/prefix.js
import { isTrivia } from './leaf.js';
import { hasImmediateComment, printOriginalSource } from '../sourcePreservation.js';

const OP_DISPLAY = {
  Minus: '-', Not: '!', PreIncrement: '++', PreDecrement: '--',
};

export function printPrefix(node, options, print) {
  if (hasImmediateComment(node)) {
    return printOriginalSource(node, options);
  }

  const semantic = node.children.filter(c => !isTrivia(c));
  if (semantic.length < 2) {
    return printOriginalSource(node, options);
  }
  const opStr = semantic[0]?.value ?? OP_DISPLAY[node.op] ?? node.op;
  const operand = semantic[semantic.length - 1];
  return [opStr, print(operand)];
}

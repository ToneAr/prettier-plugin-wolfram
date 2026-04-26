const TIGHT_INFIX_OPERATORS = new Set([
  'MessageName',
]);

const TIGHT_BINARY_OPERATORS = new Set([
  'PatternTest',
  'Span',
]);

const TIGHT_TERNARY_OPERATORS = new Set([
  'Span',
]);

const TIGHT_OPERATOR_TOKENS = new Set([
  'Token`ColonColon',
  'Token`Question',
  'Token`SemiSemi',
]);

const TIGHT_OPERATOR_VALUES = new Set([
  '::',
  '?',
  ';;',
]);

export function prefersNoSpacesAroundOperator(node, operatorToken = null) {
  if (operatorToken && (
    TIGHT_OPERATOR_TOKENS.has(operatorToken.kind) ||
    TIGHT_OPERATOR_VALUES.has(operatorToken.value)
  )) {
    return true;
  }

  if (node?.type === 'InfixNode') return TIGHT_INFIX_OPERATORS.has(node.op);
  if (node?.type === 'BinaryNode') return TIGHT_BINARY_OPERATORS.has(node.op);
  if (node?.type === 'TernaryNode') return TIGHT_TERNARY_OPERATORS.has(node.op);
  return false;
}

export function wantsSpacesAroundOperator(node, options = {}, operatorToken = null) {
  if (prefersNoSpacesAroundOperator(node, operatorToken)) return false;
  return options?.wolframSpaceAroundOperators ?? true;
}

export {
  TIGHT_BINARY_OPERATORS,
  TIGHT_INFIX_OPERATORS,
  TIGHT_OPERATOR_TOKENS,
  TIGHT_OPERATOR_VALUES,
  TIGHT_TERNARY_OPERATORS,
};

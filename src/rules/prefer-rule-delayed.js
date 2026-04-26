// src/rules/prefer-rule-delayed.js

function collectPatternVars(node, vars = new Set()) {
  if (!node) return vars;
  if (node.type === 'CompoundNode' &&
      (node.op === 'PatternBlank' || node.op === 'PatternBlankSequence' ||
       node.op === 'PatternBlankNullSequence' || node.op === 'Pattern')) {
    const namePart = node.children?.find(c => c.type === 'LeafNode' && c.kind === 'Symbol');
    if (namePart) vars.add(namePart.value);
  }
  node.children?.forEach(c => collectPatternVars(c, vars));
  if (node.head) collectPatternVars(node.head, vars);
  return vars;
}

function containsSymbol(node, names) {
  if (!node) return false;
  if (node.type === 'LeafNode' && node.kind === 'Symbol' && names.has(node.value)) return true;
  if (node.children?.some(c => containsSymbol(c, names))) return true;
  if (node.head && containsSymbol(node.head, names)) return true;
  return false;
}

export default {
  name: 'prefer-rule-delayed',
  description: 'f[x_] = body should be := when body references pattern variables',
  defaultLevel: 'warn',

  visit(node, context) {
    if (node.type !== 'BinaryNode' || node.op !== 'Set') return;
    const [lhs, rhs] = [node.children?.[0], node.children?.[node.children.length - 1]];
    if (!lhs || !rhs) return;

    const patVars = collectPatternVars(lhs);
    if (patVars.size === 0) return;

    if (containsSymbol(rhs, patVars)) {
      context.report({
        node,
        message: `Use SetDelayed (:=) instead of Set (=) when the right-hand side references pattern variables (${[...patVars].join(', ')}).`,
      });
    }
  }
};

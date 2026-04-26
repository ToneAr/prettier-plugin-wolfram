// src/rules/no-shadowed-pattern.js

function collectModuleVars(node) {
  const vars = new Set();
  if (node.type !== 'CallNode') return vars;
  const headName = node.head?.value;
  if (!['Module','With','Block','DynamicModule'].includes(headName)) return vars;
  const varList = node.children?.find(c => c.type === 'GroupNode');
  if (!varList) return vars;
  varList.children?.forEach(c => {
    if (c.type === 'LeafNode' && c.kind === 'Symbol') vars.add(c.value);
    if (c.type === 'BinaryNode' && c.op === 'Set') {
      const lhs = c.children?.[0];
      if (lhs?.type === 'LeafNode') vars.add(lhs.value);
    }
  });
  return vars;
}

function findPatternVars(node) {
  const vars = [];
  walk(node, n => {
    if (n.type === 'CompoundNode' && n.op?.startsWith('Pattern')) {
      const name = n.children?.find(c => c.type === 'LeafNode' && c.kind === 'Symbol');
      if (name) vars.push({ name: name.value, node: n });
    }
  });
  return vars;
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  node.children?.forEach(c => walk(c, fn));
  if (node.head) walk(node.head, fn);
}

export default {
  name: 'no-shadowed-pattern',
  description: 'Pattern variable shadows an outer Module/With/Block variable',
  defaultLevel: 'error',

  visit(node, context) {
    if (node.type !== 'BinaryNode' ||
        !['Set','SetDelayed'].includes(node.op)) return;

    const rhs = node.children?.[node.children.length - 1];
    if (!rhs) return;

    const moduleVars = collectModuleVars(rhs);
    if (moduleVars.size === 0) return;

    const lhs = node.children?.[0];
    const patVars = findPatternVars(lhs);

    for (const { name, node: patNode } of patVars) {
      if (moduleVars.has(name)) {
        context.report({
          node: patNode,
          message: `Pattern variable "${name}" shadows a Module/With/Block local variable.`,
        });
      }
    }
  }
};

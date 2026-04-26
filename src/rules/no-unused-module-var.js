// src/rules/no-unused-module-var.js

function getModuleVarNames(varListNode) {
  const names = [];
  if (!varListNode?.children) return names;
  for (const child of varListNode.children) {
    if (child.type === 'LeafNode' && child.kind === 'Symbol') {
      names.push(child.value);
    } else if (child.type === 'BinaryNode' && child.op === 'Set') {
      const lhs = child.children?.[0];
      if (lhs?.type === 'LeafNode' && lhs.kind === 'Symbol') names.push(lhs.value);
    }
  }
  return names;
}

function symbolsUsed(node, exclude = new Set()) {
  const used = new Set();
  walk(node, n => {
    if (n.type === 'LeafNode' && n.kind === 'Symbol' && !exclude.has(n.value)) {
      used.add(n.value);
    }
  });
  return used;
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  node.children?.forEach(c => walk(c, fn));
  if (node.head) walk(node.head, fn);
}

const BLOCK_OPS = new Set(['Module', 'With', 'Block', 'DynamicModule']);

export default {
  name: 'no-unused-module-var',
  description: 'Variables declared in Module/With/Block but never used in the body',
  defaultLevel: 'warn',

  visit(node, context) {
    if (node.type !== 'CallNode') return;
    const headName = node.head?.value;
    if (!BLOCK_OPS.has(headName)) return;

    const args = node.children?.filter(c =>
      !(c.type === 'LeafNode' && ['Token`Comma','Token`Whitespace','Token`Newline'].includes(c.kind))
    ) ?? [];

    if (args.length < 2) return;
    const varList = args[0];
    const body = args.slice(1);

    const declared = getModuleVarNames(varList);
    if (declared.length === 0) return;

    const bodyUsed = new Set();
    body.forEach(b => symbolsUsed(b).forEach(s => bodyUsed.add(s)));

    for (const name of declared) {
      if (!bodyUsed.has(name)) {
        context.report({ node, message: `Variable "${name}" declared in ${headName}[{...}] is never used in the body.` });
      }
    }
  }
};

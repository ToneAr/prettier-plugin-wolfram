// src/rules/no-dynamic-module-leak.js

function getModuleVarNames(varListNode) {
	const names = new Set();
	if (!varListNode?.children) return names;
	for (const c of varListNode.children) {
		if (c.type === "LeafNode" && c.kind === "Symbol") names.add(c.value);
		if (c.type === "BinaryNode" && c.op === "Set") {
			const lhs = c.children?.[0];
			if (lhs?.type === "LeafNode") names.add(lhs.value);
		}
	}
	return names;
}

function findSetTargets(node) {
	const targets = [];
	walk(node, (n) => {
		if (n.type === "BinaryNode" && n.op === "Set") {
			const lhs = n.children?.[0];
			if (lhs?.type === "LeafNode" && lhs.kind === "Symbol") {
				targets.push({ name: lhs.value, node: n });
			}
		}
	});
	return targets;
}

function walk(node, fn) {
	if (!node) return;
	fn(node);
	node.children?.forEach((c) => walk(c, fn));
	if (node.head) walk(node.head, fn);
}

export default {
	name: "no-dynamic-module-leak",
	description:
		"Symbol assigned inside Module body but not declared in var list",
	defaultLevel: "warn",

	visit(node, context) {
		if (node.type !== "CallNode") return;
		if (!["Module", "Block", "DynamicModule"].includes(node.head?.value))
			return;

		const args =
			node.children?.filter(
				(c) =>
					!(
						c.type === "LeafNode" &&
						[
							"Token`Comma",
							"Token`Whitespace",
							"Token`Newline",
						].includes(c.kind)
					),
			) ?? [];
		if (args.length < 2) return;

		const declared = getModuleVarNames(args[0]);
		const body = args.slice(1);
		const setTargets = body.flatMap(findSetTargets);

		for (const { name, node: setNode } of setTargets) {
			if (!declared.has(name)) {
				context.report({
					node: setNode,
					message: `"${name}" is assigned inside ${node.head.value} but not declared in the variable list — this creates a global side effect.`,
				});
			}
		}
	},
};

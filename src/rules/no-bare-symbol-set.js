// src/rules/no-bare-symbol-set.js

export default {
	name: "no-bare-symbol-set",
	description:
		"Global symbol assignment without scoping (x = val at top level)",
	defaultLevel: "warn",

	visit(node, context) {
		if (node.type !== "BinaryNode" || node.op !== "Set") return;
		const lhs = node.children?.[0];
		if (!lhs) return;
		if (lhs.type !== "LeafNode" || lhs.kind !== "Symbol") return;
		context.report({
			node,
			message: `"${lhs.value} = ..." is a global assignment. Consider scoping inside Module or With.`,
		});
	},
};

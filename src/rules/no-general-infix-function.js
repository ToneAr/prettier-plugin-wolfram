// src/rules/no-general-infix-function.js

function preservedTildeFunctions(options) {
	return new Set(
		String(options?.wolframPreserveTildeInfixFunctions ?? "Join")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);
}

export default {
	name: "no-general-infix-function",
	description:
		"Prefer fully qualified call syntax over general infix ~f~ form",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		if (node.type !== "TernaryNode" || node.op !== "TernaryTilde") return;
		const semantic = (node.children ?? []).filter(
			(c) =>
				!(
					c.type === "LeafNode" &&
					[
						"Token`Whitespace",
						"Whitespace",
						"Token`Newline",
						"Newline",
					].includes(c.kind)
				),
		);
		if (semantic.length !== 5) return;

		const fn = semantic[2];
		if (
			fn?.type === "LeafNode" &&
			fn.kind === "Symbol" &&
			preservedTildeFunctions(context.options).has(fn.value)
		) {
			return;
		}

		const fnName = fn?.value ?? "function";
		context.report({
			node,
			message: `Prefer fully qualified call syntax ${fnName}[x, y] over infix ~${fnName}~ form.`,
		});
	},
};

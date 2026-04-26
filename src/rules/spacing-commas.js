// src/rules/spacing-commas.js

function isWhitespace(node) {
	return (
		node?.type === "LeafNode" &&
		["Token`Whitespace", "Whitespace"].includes(node.kind)
	);
}

function isNewline(node) {
	return (
		node?.type === "LeafNode" &&
		["Token`Newline", "Newline"].includes(node.kind)
	);
}

function isComma(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comma";
}

export default {
	name: "spacing-commas",
	description:
		"Comma spacing inconsistent with wolframSpaceAfterComma option",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		const children = node.children ?? [];
		const wantSpaceAfter = context.options?.wolframSpaceAfterComma ?? true;

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (!isComma(child)) continue;

			const prev = children[i - 1];
			const next = children[i + 1];

			if (isWhitespace(prev)) {
				context.report({
					node: prev,
					message: "Unexpected space before comma.",
				});
				return;
			}

			if (wantSpaceAfter) {
				if (!isWhitespace(next) && !isNewline(next) && next) {
					context.report({
						node: child,
						message: "Expected a space after comma.",
					});
					return;
				}
			} else if (isWhitespace(next)) {
				context.report({
					node: next,
					message: "Unexpected space after comma.",
				});
				return;
			}
		}
	},
};

// src/rules/spacing-operators.js

import { wantsSpacesAroundOperator } from "../utils/operatorSpacing.js";

function isDirectComment(child) {
	return child?.type === "LeafNode" && child.kind === "Token`Comment";
}

export default {
	name: "spacing-operators",
	description:
		"Operator spacing inconsistent with wolframSpaceAroundOperators option",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		if (
			node.type !== "InfixNode" &&
			node.type !== "BinaryNode" &&
			node.type !== "TernaryNode"
		)
			return;
		const children = node.children ?? [];
		if (children.some(isDirectComment)) return;

		const isSpaceTrivia = (child) =>
			child?.type === "LeafNode" &&
			[
				"Token`Whitespace",
				"Whitespace",
				"Token`Newline",
				"Newline",
			].includes(child.kind);
		const ignoredOperatorKinds = new Set([
			"Token`Comma",
			"Token`Semi",
			"Token`OpenSquare",
			"Token`CloseSquare",
			"Token`OpenParen",
			"Token`CloseParen",
			"Token`OpenCurly",
			"Token`CloseCurly",
			"Token`Amp",
			"Token`Under",
			"Token`UnderUnder",
			"Token`UnderUnderUnder",
			"Token`Blank",
		]);

		for (let i = 0; i < children.length; i++) {
			const c = children[i];
			if (c.type !== "LeafNode" || !c.kind.startsWith("Token`")) continue;
			const isOp =
				!ignoredOperatorKinds.has(c.kind) &&
				![
					"Token`Whitespace",
					"Whitespace",
					"Token`Newline",
					"Newline",
				].includes(c.kind) &&
				!c.kind.startsWith("Token`Comment") &&
				!c.kind.startsWith("Token`Fake`") &&
				!c.kind.startsWith("Token`Hash");
			if (!isOp) continue;
			const wantSpaces = wantsSpacesAroundOperator(
				node,
				context.options,
				c,
			);
			const prevIsWhitespace = i > 0 && isSpaceTrivia(children[i - 1]);
			const nextIsWhitespace =
				i < children.length - 1 && isSpaceTrivia(children[i + 1]);
			const ok = wantSpaces
				? prevIsWhitespace && nextIsWhitespace
				: !prevIsWhitespace && !nextIsWhitespace;
			if (!ok) {
				context.report({
					node: c,
					message: wantSpaces
						? `Expected spaces around operator "${c.value}".`
						: `Expected no spaces around operator "${c.value}".`,
				});
				return;
			}
		}
	},
};

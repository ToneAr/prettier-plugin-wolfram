// src/rules/newlines-between-definitions.js
import { blankLinesForCodeGap } from "../utils/codeSpacing.js";

export default {
	name: "newlines-between-definitions",
	description:
		"Top-level declarations and preserved code gaps should match configured blank-line spacing; leading comments stay attached to the following statement",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		if (node.type !== "ContainerNode") return;
		const children = (node.children ?? []).filter(
			(c) => !isWhitespaceTrivia(c),
		);

		let previousGroup = null;
		let pendingLeadingCommentStartLine = null;
		let pendingLeadingCommentEndLine = null;

		for (const child of children) {
			if (isComment(child)) {
				const startLine = child.source?.[0]?.[0] ?? 0;
				const endLine = child.source?.[1]?.[0] ?? startLine;

				if (previousGroup && startLine <= previousGroup.endLine) {
					previousGroup = {
						...previousGroup,
						endLine: Math.max(previousGroup.endLine, endLine),
					};
					continue;
				}

				pendingLeadingCommentStartLine ??= startLine;
				pendingLeadingCommentEndLine = endLine;
				continue;
			}

			const currStartLine = child.source?.[0]?.[0] ?? 0;
			const groupStartLine =
				pendingLeadingCommentStartLine ?? currStartLine;
			const leadingCommentGap =
				pendingLeadingCommentEndLine == null
					? 0
					: Math.max(
							0,
							currStartLine - pendingLeadingCommentEndLine - 1,
						);

			if (leadingCommentGap !== 0) {
				context.report({
					node: child,
					message: `Expected 0 blank lines between a leading comment block and the following top-level statement, found ${leadingCommentGap}.`,
				});
			}

			if (!previousGroup) {
				previousGroup = {
					node: child,
					endLine: child.source?.[1]?.[0] ?? 0,
				};
				pendingLeadingCommentStartLine = null;
				pendingLeadingCommentEndLine = null;
				continue;
			}

			const gap = groupStartLine - previousGroup.endLine - 1;
			const expected = blankLinesForCodeGap(
				previousGroup.node,
				child,
				gap,
				context.options,
				{ topLevel: true },
			);
			if (gap !== expected) {
				context.report({
					node: child,
					message: `Expected ${expected} blank line${expected === 1 ? "" : "s"} between top-level statements, found ${gap}.`,
				});
			}

			previousGroup = {
				node: child,
				endLine: child.source?.[1]?.[0] ?? previousGroup.endLine,
			};
			pendingLeadingCommentStartLine = null;
			pendingLeadingCommentEndLine = null;
		}
	},
};

function isWhitespaceTrivia(node) {
	return (
		node?.type === "LeafNode" &&
		["Token`Whitespace", "Whitespace", "Token`Newline", "Newline"].includes(
			node.kind,
		)
	);
}

function isComment(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comment";
}

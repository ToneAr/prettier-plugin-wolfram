// src/rules/newlines-between-definitions.js
import { blankLinesForCodeGap } from "../utils/codeSpacing.js";

export default {
	name: "newlines-between-definitions",
	description:
		"Top-level declarations, comments, and preserved code gaps should match configured blank-line spacing",
	defaultLevel: "warn",
	fixableByFormatter: true,

	visit(node, context) {
		if (node.type !== "ContainerNode") return;
		const entries = topLevelEntries(
			(node.children ?? []).filter((c) => !isWhitespaceTrivia(c)),
		);

		for (let i = 1; i < entries.length; i++) {
			const right = entries[i];
			const gap = observedBlankLinesAtBoundary(entries, i);
			const expected = expectedBlankLinesBetweenEntries(
				entries,
				i,
				gap,
				context.options,
			);

			if (gap !== expected) {
				context.report({
					node: right.node,
					message: `Expected ${expected} blank line${expected === 1 ? "" : "s"} between top-level lines, found ${gap}.`,
				});
			}
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

function startLine(node) {
	const line = node?.source?.[0]?.[0];
	return Number.isFinite(line) ? line : null;
}

function endLine(node) {
	const line = node?.source?.[1]?.[0];
	return Number.isFinite(line) ? line : startLine(node);
}

function observedBlankLines(prevEndLine, nextStartLine) {
	if (!Number.isFinite(prevEndLine) || !Number.isFinite(nextStartLine)) {
		return 0;
	}
	return Math.max(0, nextStartLine - prevEndLine - 1);
}

function observedBlankLinesAtBoundary(entries, index) {
	return observedBlankLines(entries[index - 1].endLine, entries[index].startLine);
}

function topLevelEntries(children) {
	const entries = [];

	for (const child of children) {
		if (isComment(child)) {
			const commentStartLine = startLine(child);
			const commentEndLine = endLine(child);
			const previous = entries[entries.length - 1];

			if (
				previous?.kind === "statement" &&
				Number.isFinite(previous.endLine) &&
				Number.isFinite(commentStartLine) &&
				previous.endLine === commentStartLine
			) {
				previous.endLine = Math.max(previous.endLine, commentEndLine);
				continue;
			}

			if (previous?.kind === "commentBlock") {
				previous.endLine = commentEndLine;
			} else {
				entries.push({
					kind: "commentBlock",
					node: child,
					startLine: commentStartLine,
					endLine: commentEndLine,
				});
			}
			continue;
		}

		entries.push({
			kind: "statement",
			node: child,
			startLine: startLine(child),
			endLine: endLine(child),
		});
	}

	return entries;
}

function statementEntryBefore(entries, index) {
	for (let i = index - 1; i >= 0; i--) {
		if (entries[i].kind === "statement") return entries[i];
	}
	return null;
}

function statementEntryAfter(entries, index) {
	for (let i = index; i < entries.length; i++) {
		if (entries[i].kind === "statement") return entries[i];
	}
	return null;
}

function expectedBlankLinesForCommentRegionBoundary(entries, index, options) {
	const left = entries[index - 1];
	const right = entries[index];
	if (left.kind !== "commentBlock" && right.kind !== "commentBlock") {
		return null;
	}

	// A standalone comment breaks adjacency between the surrounding
	// statements, so each side of the comment is capped independently
	// (via the ordinary code-gap range) instead of sharing one budget
	// across the whole comment region.
	const gap = observedBlankLinesAtBoundary(entries, index);
	return blankLinesForCodeGap(left.node, right.node, gap, options, {
		topLevel: true,
	});
}

function expectedBlankLinesBetweenEntries(
	entries,
	index,
	observedBlankLines,
	options,
) {
	const commentRegionBlankLines = expectedBlankLinesForCommentRegionBoundary(
		entries,
		index,
		options,
	);
	if (commentRegionBlankLines != null) return commentRegionBlankLines;

	const left = entries[index - 1];
	const right = entries[index];
	const leftContext = statementEntryBefore(entries, index) ?? left;
	const rightContext = statementEntryAfter(entries, index) ?? right;

	return blankLinesForCodeGap(
		leftContext.node,
		rightContext.node,
		observedBlankLines,
		options,
		{ topLevel: true },
	);
}

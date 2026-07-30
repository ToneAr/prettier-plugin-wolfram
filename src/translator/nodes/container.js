// src/translator/nodes/container.js
import { doc } from "prettier";
const { builders } = doc;
const { hardline } = builders;
import {
	documentationCommentColumn,
	joinCommentDocs,
	withAlignedTrailingComment,
} from "../docComments.js";
import { commentBoundarySeparator } from "../commentSpacing.js";
import {
	blankLinesForCodeGap,
	observedBlankLinesBetween,
} from "../../utils/codeSpacing.js";
import { nodeEndLine, nodeStartLine } from "../sourceLines.js";

function isTrivia(node) {
	return (
		node.type === "LeafNode" &&
		["Token`Whitespace", "Whitespace", "Token`Newline", "Newline"].includes(
			node.kind,
		)
	);
}

function isComment(node) {
	return node.type === "LeafNode" && node.kind === "Token`Comment";
}

function trailingDocumentationCommentColumns(entries, options) {
	const columns = new Map();
	let block = [];
	let previousEntry = null;

	const flushBlock = () => {
		if (block.length === 0) return;
		const column = documentationCommentColumn(block, options);
		for (const entry of block) {
			columns.set(entry, column);
		}
		block = [];
	};

	for (const entry of entries.filter((entry) => entry.kind === "statement")) {
		const observedBlankLines = previousEntry
			? observedBlankLinesBetween(previousEntry.endLine, entry.startLine)
			: 0;

		if (!entry.trailingCommentDoc || observedBlankLines > 0) {
			flushBlock();
		}

		if (entry.trailingCommentDoc) {
			block.push(entry);
		}

		previousEntry = entry;
	}

	flushBlock();
	return columns;
}

function containerCommentSeparator(leftNode, rightNode, options) {
	return commentBoundarySeparator(leftNode, rightNode, options, hardline);
}

function appendCommentBlock(docs, comments, options) {
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		docs.push(comment.doc);
		const followingComment = comments[i + 1];
		if (followingComment) {
			docs.push(
				containerCommentSeparator(
					comment.node,
					followingComment.node,
					options,
				),
			);
		}
	}
}

function finiteLine(value) {
	return Number.isFinite(value) ? value : null;
}

function entryStartLine(entry) {
	return finiteLine(entry.startLine);
}

function entryEndLine(entry) {
	return finiteLine(entry.endLine);
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

function observedBlankLinesAtBoundary(entries, index) {
	return observedBlankLinesBetween(
		entryEndLine(entries[index - 1]),
		entryStartLine(entries[index]),
	);
}

function blankLinesForCommentRegionBoundary(entries, index, options) {
	const left = entries[index - 1];
	const right = entries[index];
	if (left.kind !== "commentBlock" && right.kind !== "commentBlock") {
		return null;
	}

	// A standalone comment breaks adjacency between the surrounding
	// statements, so each side of the comment is capped independently
	// (via the ordinary code-gap range) instead of sharing one budget
	// across the whole comment region.
	const observedBlankLines = observedBlankLinesAtBoundary(entries, index);
	return blankLinesForCodeGap(left.node, right.node, observedBlankLines, options, {
		topLevel: true,
	});
}

function blankLinesBetweenEntries(entries, index, options) {
	const commentRegionBlankLines = blankLinesForCommentRegionBoundary(
		entries,
		index,
		options,
	);
	if (commentRegionBlankLines != null) return commentRegionBlankLines;

	const left = entries[index - 1];
	const right = entries[index];
	const leftContext = statementEntryBefore(entries, index) ?? left;
	const rightContext = statementEntryAfter(entries, index) ?? right;
	const observedBlankLines = observedBlankLinesAtBoundary(entries, index);

	return blankLinesForCodeGap(
		leftContext.node,
		rightContext.node,
		observedBlankLines,
		options,
		{ topLevel: true },
	);
}

function separatorBetweenEntries(entries, index, options) {
	const left = entries[index - 1];
	const right = entries[index];
	const leftEndLine = entryEndLine(left);
	const rightStartLine = entryStartLine(right);

	if (
		leftEndLine != null &&
		rightStartLine != null &&
		leftEndLine === rightStartLine
	) {
		return containerCommentSeparator(left.node, right.node, options);
	}

	const blankLines = blankLinesBetweenEntries(entries, index, options);
	return [hardline, ...Array(blankLines).fill(hardline)];
}

/** Print a ContainerNode[File, ...] with declaration-aware top-level spacing. */
export function printContainer(node, options, print) {
	const children = node.children.filter((c) => !isTrivia(c));

	if (children.length === 0) return "";

	const entries = [];

	for (const child of children) {
		if (isComment(child) && entries.length > 0) {
			const prev = entries[entries.length - 1];
			const prevEndLine = entryEndLine(prev);
			const commentStartLine = nodeStartLine(child, options);
			if (
				prev.kind === "statement" &&
				prevEndLine != null &&
				commentStartLine != null &&
				prevEndLine === commentStartLine
			) {
				prev.trailingComments.push({ node: child, doc: print(child) });
				prev.endLine = Math.max(
					prev.endLine,
					nodeEndLine(child, options) ?? prev.endLine,
				);
				continue;
			}
		}

		if (isComment(child)) {
			const startLine = nodeStartLine(child, options);
			const endLine = nodeEndLine(child, options) ?? startLine;
			const prev = entries[entries.length - 1];
			const comment = { node: child, doc: print(child) };

			if (prev?.kind === "commentBlock") {
				prev.comments.push(comment);
				prev.endLine = endLine ?? prev.endLine;
			} else {
				entries.push({
					kind: "commentBlock",
					node: child,
					comments: [comment],
					startLine,
					endLine,
				});
			}
			continue;
		}

		const childStartLine = nodeStartLine(child, options);
		const childEndLine = nodeEndLine(child, options) ?? childStartLine;

		entries.push({
			kind: "statement",
			node: child,
			doc: print(child),
			trailingComments: [],
			startLine: childStartLine,
			endLine: childEndLine,
		});
	}

	for (const entry of entries) {
		if (entry.kind !== "statement") continue;
		entry.trailingCommentDoc = joinCommentDocs(
			entry.trailingComments,
			options,
		);
	}

	const trailingCommentColumns = trailingDocumentationCommentColumns(
		entries,
		options,
	);
	const docs = [];

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (i > 0) docs.push(separatorBetweenEntries(entries, i, options));

		if (entry.kind === "commentBlock") {
			appendCommentBlock(docs, entry.comments, options);
			continue;
		}

		const column =
			trailingCommentColumns.get(entry) ??
			documentationCommentColumn([entry], options);
		docs.push(withAlignedTrailingComment(entry, options, column));
	}

	return docs;
}

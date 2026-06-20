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

	for (const entry of entries) {
		const observedBlankLines = previousEntry
			? observedBlankLinesBetween(previousEntry.endLine, entry.startLine)
			: 0;

		if (
			!entry.trailingCommentDoc ||
			entry.leadingComments.length > 0 ||
			observedBlankLines > 0
		) {
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

function appendLeadingComments(docs, comments, nextNode, options) {
	for (let i = 0; i < comments.length; i++) {
		const comment = comments[i];
		const followingNode = comments[i + 1]?.node ?? nextNode;
		docs.push(comment.doc);
		if (followingNode) {
			docs.push(
				containerCommentSeparator(comment.node, followingNode, options),
			);
		}
	}
}

/** Print a ContainerNode[File, ...] with declaration-aware top-level spacing. */
export function printContainer(node, options, print) {
	const children = node.children.filter((c) => !isTrivia(c));

	if (children.length === 0) return "";

	const entries = [];
	let leadingComments = [];
	let leadingCommentStartLine = null;
	let leadingCommentEndLine = null;

	for (const child of children) {
		if (isComment(child) && entries.length > 0) {
			const prev = entries[entries.length - 1];
			const prevEndLine = nodeEndLine(prev.node, options);
			const commentStartLine = nodeStartLine(child, options);
			if (
				prevEndLine &&
				commentStartLine &&
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
			leadingComments.push({ node: child, doc: print(child) });
			leadingCommentStartLine ??= nodeStartLine(child, options);
			leadingCommentEndLine =
				nodeEndLine(child, options) ?? leadingCommentEndLine;
			continue;
		}

		const childStartLine = nodeStartLine(child, options);
		const childEndLine = nodeEndLine(child, options) ?? childStartLine ?? 0;

		entries.push({
			node: child,
			doc: print(child),
			leadingComments,
			trailingComments: [],
			startLine: leadingCommentStartLine ?? childStartLine ?? 0,
			endLine: Math.max(
				childEndLine,
				leadingCommentEndLine ?? childEndLine,
			),
		});
		leadingComments = [];
		leadingCommentStartLine = null;
		leadingCommentEndLine = null;
	}

	for (const entry of entries) {
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
	let previousNode = null;

	for (const entry of entries) {
		if (docs.length > 0) {
			const observedBlankLines = observedBlankLinesBetween(
				previousNode.endLine,
				entry.startLine,
			);
			const blankLines = blankLinesForCodeGap(
				previousNode.node,
				entry.node,
				observedBlankLines,
				options,
				{ topLevel: true },
			);
			docs.push(hardline, ...Array(blankLines).fill(hardline));
		}

		if (entry.leadingComments.length > 0) {
			appendLeadingComments(
				docs,
				entry.leadingComments,
				entry.node,
				options,
			);
		}

		const column =
			trailingCommentColumns.get(entry) ??
			documentationCommentColumn([entry], options);
		docs.push(withAlignedTrailingComment(entry, options, column));
		previousNode = entry;
	}

	if (leadingComments.length > 0) {
		if (docs.length > 0) docs.push(hardline);
		appendLeadingComments(docs, leadingComments, null, options);
	}

	return docs;
}

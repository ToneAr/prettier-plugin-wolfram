// src/translator/nodes/container.js
import { doc } from "prettier";
const { builders } = doc;
const { hardline } = builders;
import {
	documentationCommentColumn,
	joinDocsWithSpace,
	withAlignedTrailingComment,
} from "../docComments.js";
import {
	blankLinesForCodeGap,
	observedBlankLinesBetween,
} from "../../utils/codeSpacing.js";

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

function lineNumberAtOffset(text, offset) {
	if (typeof text !== "string" || typeof offset !== "number" || offset < 0) {
		return null;
	}

	const limit = Math.min(offset, text.length);
	let line = 1;
	let searchFrom = 0;

	while (searchFrom < limit) {
		const newlineOffset = text.indexOf("\n", searchFrom);
		if (newlineOffset === -1 || newlineOffset >= limit) break;
		line++;
		searchFrom = newlineOffset + 1;
	}

	return line;
}

function nodeStartLine(node, options) {
	const sourceStartLine = node?.source?.[0]?.[0];
	if (Number.isFinite(sourceStartLine)) return sourceStartLine;
	return lineNumberAtOffset(options?.originalText, node?.locStart);
}

function nodeEndLine(node, options) {
	const sourceEndLine = node?.source?.[1]?.[0];
	if (Number.isFinite(sourceEndLine)) return sourceEndLine;

	if (typeof node?.locEnd === "number") {
		const lastIncludedOffset =
			typeof node?.locStart === "number" && node.locEnd > node.locStart
				? node.locEnd - 1
				: node.locEnd;
		return lineNumberAtOffset(options?.originalText, lastIncludedOffset);
	}

	return nodeStartLine(node, options);
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
			entry.leadingCommentDocs.length > 0 ||
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

/** Print a ContainerNode[File, ...] with declaration-aware top-level spacing. */
export function printContainer(node, options, print) {
	const children = node.children.filter((c) => !isTrivia(c));

	if (children.length === 0) return "";

	const entries = [];
	let leadingCommentDocs = [];
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
				prev.trailingCommentDocs.push(print(child));
				prev.endLine = Math.max(
					prev.endLine,
					nodeEndLine(child, options) ?? prev.endLine,
				);
				continue;
			}
		}

		if (isComment(child)) {
			leadingCommentDocs.push(print(child));
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
			leadingCommentDocs,
			trailingCommentDocs: [],
			startLine: leadingCommentStartLine ?? childStartLine ?? 0,
			endLine: Math.max(
				childEndLine,
				leadingCommentEndLine ?? childEndLine,
			),
		});
		leadingCommentDocs = [];
		leadingCommentStartLine = null;
		leadingCommentEndLine = null;
	}

	for (const entry of entries) {
		entry.trailingCommentDoc = joinDocsWithSpace(entry.trailingCommentDocs);
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

		if (entry.leadingCommentDocs.length > 0) {
			for (let i = 0; i < entry.leadingCommentDocs.length; i++) {
				docs.push(entry.leadingCommentDocs[i]);
				docs.push(hardline);
			}
		}

		const column =
			trailingCommentColumns.get(entry) ??
			documentationCommentColumn([entry], options);
		docs.push(withAlignedTrailingComment(entry, options, column));
		previousNode = entry;
	}

	if (leadingCommentDocs.length > 0) {
		if (docs.length > 0) docs.push(hardline);
		for (let i = 0; i < leadingCommentDocs.length; i++) {
			docs.push(leadingCommentDocs[i]);
			if (i < leadingCommentDocs.length - 1) docs.push(hardline);
		}
	}

	return docs;
}

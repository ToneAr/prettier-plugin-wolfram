// src/translator/nodes/infix.js
import { doc } from "prettier";
const { builders } = doc;
import { isTrivia, isComment } from "./leaf.js";
import {
	documentationCommentColumn,
	joinDocsWithSpace,
	withAlignedTrailingComment,
} from "../docComments.js";
import { wantsSpacesAroundOperator } from "../../utils/operatorSpacing.js";
import {
	hasImmediateComment,
	printOriginalSource,
} from "../sourcePreservation.js";
import {
	nodeEndLine,
	nodeStartLine,
	sourceLineGap,
} from "../sourceLines.js";
import { normalizeWolframOptions } from "../../options.js";
const { group, indent, line, hardline, join, fill } = builders;

// Map WL op names to their display strings
const OP_DISPLAY = {
	Plus: "+",
	Times: "*",
	Power: "^",
	Equal: "==",
	Unequal: "!=",
	Greater: ">",
	Less: "<",
	GreaterEqual: ">=",
	LessEqual: "<=",
	And: "&&",
	Or: "||",
	StringJoin: "<>",
	Dot: ".",
	Alternatives: "|",
};

function isSemanticTokenLeaf(node) {
	return (
		node?.type === "LeafNode" &&
		[
			"Token`Hash",
			"Token`HashHash",
			"Token`Under",
			"Token`UnderUnder",
			"Token`UnderUnderUnder",
		].includes(node.kind)
	);
}

function isCommaToken(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comma";
}

function isSemicolonToken(node) {
	return (
		node?.type === "LeafNode" &&
		(node.kind === "Token`Semi" || node.kind === "Token`Semicolon")
	);
}

function isNewlineTrivia(node) {
	return (
		node?.type === "LeafNode" &&
		(node.kind === "Token`Newline" ||
			node.kind === "Newline" ||
			(typeof node.value === "string" && node.value.includes("\n")))
	);
}

function commentBoundary(leftNode, rightNode, options, fallback = line) {
	if (!rightNode) return "";
	const gap = sourceLineGap(leftNode, rightNode, options);
	if (gap === 0) return " ";
	if (gap > 0) return hardline;
	return fallback;
}

function hasCommentBoundary(leftNode, rightNode) {
	return isComment(leftNode) || isComment(rightNode);
}

function nextContentNode(entries, startIndex) {
	for (let i = startIndex + 1; i < entries.length; i++) {
		if (!isCommaToken(entries[i])) return entries[i];
	}
	return null;
}

/** Extract semantic operands from InfixNode children (skip trivia + operator tokens). */
function operands(node) {
	// InfixNode children alternate: operand, ws, op-token, ws, operand, ...
	// Keep only non-trivia, non-operator-token children.
	return node.children.filter((c) => {
		if (isTrivia(c)) return false;
		if (
			c.type === "LeafNode" &&
			c.kind.startsWith("Token`") &&
			!isSemanticTokenLeaf(c)
		)
			return false;
		return true;
	});
}

function printMessageNameOperand(node, print) {
	if (
		node?.type === "LeafNode" &&
		node.kind === "String" &&
		!String(node.value ?? "").startsWith('"')
	) {
		return String(node.value ?? "");
	}

	return print(node);
}

export function printInfix(node, options, print) {
	options = normalizeWolframOptions(options);
	if (node.op === "CompoundExpression") {
		const entries = [];
		let leadingComments = [];
		let previousEntry = null;
		let pendingLineBreakBeforeNextEntry = false;

		for (const child of node.children) {
			if (isTrivia(child)) {
				if (previousEntry && isNewlineTrivia(child)) {
					pendingLineBreakBeforeNextEntry = true;
				}
				continue;
			}

			if (isSemicolonToken(child)) {
				if (previousEntry) previousEntry.hasSemicolon = true;
				continue;
			}

			if (isComment(child)) {
				const previousLine = previousEntry?.endLine;
				const commentLine = nodeStartLine(child, options);
				if (
					previousEntry?.hasSemicolon &&
					(!previousLine ||
						!commentLine ||
						previousLine === commentLine)
				) {
					previousEntry.trailingCommentDocs.push(print(child));
					previousEntry.endLine =
						nodeEndLine(child, options) ?? previousEntry.endLine;
					continue;
				}

				leadingComments.push({ node: child, doc: print(child) });
				continue;
			}

			const startLine = nodeStartLine(child, options);
			const previousEndLine = previousEntry?.endLine;
			const entry = {
				node: child,
				doc: print(child),
				leadingComments,
				trailingCommentDocs: [],
				hasSemicolon: false,
				breakBefore:
					entries.length > 0 &&
					(pendingLineBreakBeforeNextEntry ||
						(previousEndLine &&
							startLine &&
							startLine > previousEndLine)),
				endLine: nodeEndLine(child, options) ?? startLine,
			};
			entries.push(entry);
			previousEntry = entry;
			leadingComments = [];
			pendingLineBreakBeforeNextEntry = false;
		}

		for (const entry of entries) {
			entry.trailingCommentDoc = joinDocsWithSpace(
				entry.trailingCommentDocs,
			);
		}

		const suffixForEntry = (entry) => (entry.hasSemicolon ? ";" : "");
		const trailingEntries = entries.filter(
			(entry) => entry.trailingCommentDoc,
		);
		const alignTrailingComments =
			(options.wolframDocumentationCommentColumn ?? 0) > 0 ||
			trailingEntries.length > 1;
		const trailingColumn =
			alignTrailingComments && trailingEntries.length > 0
				? documentationCommentColumn(
						trailingEntries,
						options,
						suffixForEntry,
					)
				: null;

		const docs = [];
		let hasHardSeparator = false;

		for (const entry of entries) {
			if (docs.length > 0) {
				const separator = entry.breakBefore ? hardline : line;
				if (entry.breakBefore) hasHardSeparator = true;
				docs.push(separator);
			}

			if (entry.leadingComments.length > 0) {
				for (let i = 0; i < entry.leadingComments.length; i++) {
					const comment = entry.leadingComments[i];
					const followingNode =
						entry.leadingComments[i + 1]?.node ?? entry.node;
					docs.push(
						comment.doc,
						commentBoundary(
							comment.node,
							followingNode,
							options,
							line,
						),
					);
				}
			}

			if (!entry.trailingCommentDoc) {
				docs.push([entry.doc, suffixForEntry(entry)]);
				continue;
			}

			if (trailingColumn == null) {
				docs.push([
					entry.doc,
					suffixForEntry(entry),
					" ",
					entry.trailingCommentDoc,
				]);
				continue;
			}

			docs.push(
				withAlignedTrailingComment(
					entry,
					options,
					trailingColumn,
					suffixForEntry(entry),
				),
			);
		}

		if (leadingComments.length > 0) {
			if (docs.length > 0) {
				const separator = pendingLineBreakBeforeNextEntry
					? hardline
					: line;
				if (pendingLineBreakBeforeNextEntry) hasHardSeparator = true;
				docs.push(separator);
			}
			for (let i = 0; i < leadingComments.length; i++) {
				const comment = leadingComments[i];
				const followingNode = leadingComments[i + 1]?.node;
				docs.push(comment.doc);
				if (followingNode) {
					docs.push(
						commentBoundary(
							comment.node,
							followingNode,
							options,
							line,
						),
					);
				}
			}
		}

		return hasHardSeparator ? fill(docs) : group(docs);
	}

	if (node.op === "Comma") {
		const docs = [];
		const commaGap = options.wolframSpaceAfterComma
			? line
			: doc.builders.softline;
		let previousKind = null;
		let previousNode = null;
		const entries = node.children.filter((child) => !isTrivia(child));

		for (let i = 0; i < entries.length; i++) {
			const child = entries[i];
			if (isCommaToken(child)) {
				if (previousKind === null || previousKind === "comma") continue;
				const followingEntry = nextContentNode(entries, i);
				const separator =
					followingEntry &&
					hasCommentBoundary(previousNode, followingEntry)
						? commentBoundary(
								previousNode,
								followingEntry,
								options,
								commaGap,
							)
						: commaGap;
				docs.push(",", separator);
				previousKind = "comma";
				continue;
			}

			if (previousKind !== null && previousKind !== "comma") {
				docs.push(
					hasCommentBoundary(previousNode, child)
						? commentBoundary(previousNode, child, options, line)
						: line,
				);
			}

			docs.push(print(child));
			previousKind = isComment(child) ? "comment" : "item";
			previousNode = child;
		}

		return group(docs);
	}

	if (hasImmediateComment(node)) {
		return printOriginalSource(node, options);
	}

	if (node.op === "MessageName") {
		const parts = operands(node);
		return group(
			join(
				["::"],
				parts.map((part, index) =>
					index === 0
						? print(part)
						: printMessageNameOperand(part, print),
				),
			),
		);
	}

	if (node.op === "InfixInequality") {
		const semantic = node.children.filter((c) => !isTrivia(c));
		if (semantic.length === 3 && semantic[1]?.type === "LeafNode") {
			const opStr = semantic[1].value;
			const space = wantsSpacesAroundOperator(node, options, semantic[1]);
			const gap = space ? " " : "";
			return group([
				print(semantic[0]),
				`${gap}${opStr}`,
				space ? line : "",
				print(semantic[2]),
			]);
		}
	}

	const semantic = node.children.filter((c) => {
		if (isTrivia(c)) return false;
		if (
			c.type === "LeafNode" &&
			c.kind.startsWith("Token`") &&
			!isSemanticTokenLeaf(c)
		)
			return false;
		return true;
	});
	const tokens = node.children.filter(
		(c) =>
			!isTrivia(c) &&
			c.type === "LeafNode" &&
			c.kind.startsWith("Token`") &&
			!isSemanticTokenLeaf(c),
	);

	if (semantic.length >= 2 && tokens.length === semantic.length - 1) {
		const parts = [print(semantic[0])];
		for (let i = 0; i < tokens.length; i++) {
			const space = wantsSpacesAroundOperator(node, options, tokens[i]);
			const gap = space ? " " : "";
			if (space) {
				parts.push(
					`${gap}${tokens[i].value}`,
					line,
					print(semantic[i + 1]),
				);
			} else {
				parts.push(tokens[i].value, print(semantic[i + 1]));
			}
		}
		return group(parts);
	}

	const opStr = OP_DISPLAY[node.op] ?? node.op;
	const space = wantsSpacesAroundOperator(node, options);
	const sep = space ? [" ", opStr, line] : [opStr];
	return group(
		join(
			sep,
			operands(node).map((o) => print(o)),
		),
	);
}

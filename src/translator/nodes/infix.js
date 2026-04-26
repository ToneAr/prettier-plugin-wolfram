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
const { group, indent, line, join } = builders;

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

export function printInfix(node, options, print) {
	if (node.op === "CompoundExpression") {
		const semanticChildren = node.children.filter((c) => !isTrivia(c));
		const entries = [];
		let leadingCommentDocs = [];
		let previousEntry = null;

		for (const child of semanticChildren) {
			if (isSemicolonToken(child)) {
				if (previousEntry) previousEntry.hasSemicolon = true;
				continue;
			}

			if (isComment(child)) {
				const previousLine = nodeEndLine(previousEntry?.node, options);
				const commentLine = nodeStartLine(child, options);
				if (
					previousEntry?.hasSemicolon &&
					(!previousLine ||
						!commentLine ||
						previousLine === commentLine)
				) {
					previousEntry.trailingCommentDocs.push(print(child));
					continue;
				}

				leadingCommentDocs.push(print(child));
				continue;
			}

			const entry = {
				node: child,
				doc: print(child),
				leadingCommentDocs,
				trailingCommentDocs: [],
				hasSemicolon: false,
			};
			entries.push(entry);
			previousEntry = entry;
			leadingCommentDocs = [];
		}

		for (const entry of entries) {
			entry.trailingCommentDoc = joinDocsWithSpace(entry.trailingCommentDocs);
		}

		const suffixForEntry = (entry) => (entry.hasSemicolon ? ";" : "");
		const trailingEntries = entries.filter((entry) => entry.trailingCommentDoc);
		const alignTrailingComments =
			(options.wolframDocumentationCommentColumn ?? 0) > 0 ||
			trailingEntries.length > 1;
		const trailingColumn =
			alignTrailingComments && trailingEntries.length > 0
				? documentationCommentColumn(trailingEntries, options, suffixForEntry)
				: null;

		const docs = [];

		for (const entry of entries) {
			if (docs.length > 0) docs.push(line);

			if (entry.leadingCommentDocs.length > 0) {
				for (const commentDoc of entry.leadingCommentDocs) {
					docs.push(commentDoc, line);
				}
			}

			if (!entry.trailingCommentDoc) {
				docs.push([entry.doc, suffixForEntry(entry)]);
				continue;
			}

			if (trailingColumn == null) {
				docs.push([entry.doc, suffixForEntry(entry), " ", entry.trailingCommentDoc]);
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

		if (leadingCommentDocs.length > 0) {
			if (docs.length > 0) docs.push(line);
			for (let i = 0; i < leadingCommentDocs.length; i++) {
				docs.push(leadingCommentDocs[i]);
				if (i < leadingCommentDocs.length - 1) docs.push(line);
			}
		}

		return group(docs);
	}

	if (node.op === "Comma") {
		const docs = [];
		const commaGap = options.wolframSpaceAfterComma
			? line
			: doc.builders.softline;
		let previousKind = null;

		for (const child of node.children) {
			if (isTrivia(child)) continue;
			if (isCommaToken(child)) {
				if (previousKind === null || previousKind === "comma") continue;
				docs.push(",", commaGap);
				previousKind = "comma";
				continue;
			}

			if (previousKind !== null && previousKind !== "comma") {
				docs.push(line);
			}

			docs.push(print(child));
			previousKind = isComment(child) ? "comment" : "item";
		}

		return group(docs);
	}

	if (hasImmediateComment(node)) {
		return printOriginalSource(node, options);
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

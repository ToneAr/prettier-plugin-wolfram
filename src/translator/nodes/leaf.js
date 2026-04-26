// src/translator/nodes/leaf.js

import { doc } from "prettier";
const { builders } = doc;
const { group, indent, line, join, hardline } = builders;

const DISCARD_KINDS = new Set([
	"Token`Whitespace",
	"Whitespace",
	"Token`Newline",
	"Newline",
	"Token`LineContinuation",
	"LineContinuation",
	"Token`Fake`ImplicitNull",
]);

function repairMojibake(value) {
	if (typeof value !== "string") return value;
	// Common UTF-8 bytes decoded as Latin-1 by WL JSON export/import path.
	return value
		.replace(/Ã¢ÂÂ/g, "—")
		.replace(/â/g, "—")
		.replace(/Ã¢ÂÂ/g, "’")
		.replace(/â/g, "’")
		.replace(/Ã¢ÂÂ/g, "“")
		.replace(/Ã¢ÂÂ/g, "”")
		.replace(/â/g, "“")
		.replace(/â/g, "”");
}

function quotedStringLiteral(value) {
	return typeof value === "string" &&
		value.startsWith('"') &&
		value.endsWith('"')
		? value
		: JSON.stringify(String(value ?? ""));
}

function rawQuotedStringLiteral(value) {
	return `"${value}"`;
}

function isQuotedStringLiteral(value) {
	return (
		typeof value === "string" &&
		value.startsWith('"') &&
		value.endsWith('"')
	);
}

function lineWidth(options) {
	return options?.printWidth ?? 80;
}

function tabWidth(options) {
	return options?.tabWidth ?? 2;
}

const INLINE_RHS_BINARY_OPS = new Set([
	"Power",
	"Divide",
	"ReplaceAll",
	"Rule",
	"RuleDelayed",
	"Map",
	"Apply",
	"MapApply",
	"MapAll",
	"BinaryAt",
	"BinarySlashSlash",
]);

function isOperatorLikeLeaf(node) {
	return (
		node?.type === "LeafNode" &&
		node.kind?.startsWith("Token`") &&
		![
			"Token`Hash",
			"Token`HashHash",
			"Token`Under",
			"Token`UnderUnder",
			"Token`UnderUnderUnder",
		].includes(node.kind) &&
		!node.kind.startsWith("Token`Fake`")
	);
}

function binarySemanticChildren(node) {
	return (node?.children ?? []).filter(
		(child) =>
			!DISCARD_KINDS.has(child?.kind) && !isOperatorLikeLeaf(child),
	);
}

function isStringJoinCallNode(node) {
	return (
		node?.type === "CallNode" &&
		node.head?.type === "LeafNode" &&
		node.head.kind === "Symbol" &&
		node.head.value === "StringJoin"
	);
}

function isDirectMultilineStringRhs(node, child) {
	const semantic = binarySemanticChildren(node);
	return (
		semantic[1] === child &&
		((child?.type === "LeafNode" && child.kind === "String") ||
			isStringJoinCallNode(child))
	);
}

function binaryAddsVisibleIndent(node, child) {
	if (!INLINE_RHS_BINARY_OPS.has(node?.op))
		return binarySemanticChildren(node)[1] === child;
	return isDirectMultilineStringRhs(node, child);
}

export function stringLineIndentDepth(path) {
	let depth = 1;
	let child = path?.getValue?.();

	for (const ancestor of path?.ancestors ?? []) {
		if (ancestor?.type === "CallNode" || ancestor?.type === "GroupNode") {
			depth++;
			child = ancestor;
			continue;
		}

		if (
			ancestor?.type === "BinaryNode" &&
			binaryAddsVisibleIndent(ancestor, child)
		) {
			depth++;
		}
		child = ancestor;
	}

	return depth;
}

function inlineStringLiteralWidth(options, indentDepth) {
	return Math.max(
		3,
		lineWidth(options) - Math.max(0, indentDepth - 1) * tabWidth(options),
	);
}

const STRING_JOIN_LINE_OVERHEAD = 3; // opening quote, closing quote, and a trailing comma.

function stringJoinContentWidth(options, indentDepth) {
	return Math.max(
		1,
		lineWidth(options) -
			indentDepth * tabWidth(options) -
			STRING_JOIN_LINE_OVERHEAD,
	);
}

function indentColumns(text, options) {
	let columns = 0;
	const width = tabWidth(options);

	for (const char of text) {
		if (char === " ") {
			columns += 1;
			continue;
		}
		if (char === "\t") {
			columns += width - (columns % width);
			continue;
		}
		break;
	}

	return columns;
}

function stripIndentColumns(line, targetColumns, options) {
	let consumedChars = 0;
	let consumedColumns = 0;
	const width = tabWidth(options);

	while (consumedChars < line.length && consumedColumns < targetColumns) {
		const char = line[consumedChars];

		if (char === " ") {
			consumedChars += 1;
			consumedColumns += 1;
			continue;
		}

		if (char === "\t") {
			const nextColumns =
				consumedColumns + (width - (consumedColumns % width));
			if (nextColumns > targetColumns) break;
			consumedChars += 1;
			consumedColumns = nextColumns;
			continue;
		}

		break;
	}

	return line.slice(consumedChars);
}

function commentIndentPrefix(node, options) {
	if (
		typeof options?.originalText !== "string" ||
		typeof node?.locStart !== "number" ||
		node.locStart < 0
	) {
		return "";
	}

	const lineStart =
		options.originalText.lastIndexOf("\n", Math.max(0, node.locStart - 1)) +
		1;
	return options.originalText.slice(lineStart, node.locStart);
}

function sourceTextForNode(node, options) {
	if (
		typeof options?.originalText !== "string" ||
		typeof node?.locStart !== "number" ||
		typeof node?.locEnd !== "number" ||
		node.locStart < 0 ||
		node.locEnd < node.locStart
	) {
		return null;
	}

	return options.originalText.slice(node.locStart, node.locEnd);
}

function normalizeCommentLines(node, options) {
	const value = repairMojibake(
		sourceTextForNode(node, options) ?? node.value,
	);
	const lines = String(value).split("\n");
	if (lines.length <= 1) return lines;

	const basePrefix = commentIndentPrefix(node, options);
	const baseColumns = indentColumns(basePrefix, options);

	return [
		lines[0],
		...lines.slice(1).map((line) => {
			if (basePrefix && line.startsWith(basePrefix)) {
				return line.slice(basePrefix.length);
			}
			return stripIndentColumns(line, baseColumns, options);
		}),
	];
}

function multilineCommentDoc(node, options) {
	const lines = normalizeCommentLines(node, options);
	if (lines.length <= 1) return lines[0] ?? "";

	const docs = [lines[0]];
	for (let i = 1; i < lines.length; i++) {
		docs.push(hardline, lines[i]);
	}
	return docs;
}

function stringTextUnits(text, preserveEscapes) {
	if (!preserveEscapes) return Array.from(text);

	const units = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== "\\" || i === text.length - 1) {
			units.push(text[i]);
			continue;
		}

		if (text[i + 1] === "u") {
			const hex = text.slice(i + 2, i + 6);
			if (/^[0-9a-fA-F]{4}$/.test(hex)) {
				units.push(text.slice(i, i + 6));
				i += 5;
				continue;
			}
		}

		units.push(text.slice(i, i + 2));
		i++;
	}

	return units;
}

function makeTextToken(units) {
	const text = units.join("");
	let length = 0;
	for (const unit of units) length += unit.length;
	return { units, text, length };
}

function tokenizeStringUnits(units) {
	const tokens = [];
	for (let i = 0; i < units.length; ) {
		const token = [];
		if (/\s/u.test(units[i])) {
			while (i < units.length && /\s/u.test(units[i])) {
				token.push(units[i]);
				i++;
			}
		} else {
			while (i < units.length && !/\s/u.test(units[i])) {
				token.push(units[i]);
				i++;
			}
			while (i < units.length && /\s/u.test(units[i])) {
				token.push(units[i]);
				i++;
			}
		}
		tokens.push(makeTextToken(token));
	}
	return tokens;
}

function splitOversizedTokens(tokens, maxChunkLength) {
	const normalized = [];

	for (const token of tokens) {
		if (token.length <= maxChunkLength) {
			normalized.push(token);
			continue;
		}

		normalized.push(...splitOversizedToken(token, maxChunkLength));
	}

	return normalized;
}

function splitOversizedToken(token, maxChunkLength) {
	const chunks = [];
	let current = [];
	let currentLength = 0;

	for (const unit of token.units) {
		const unitLength = unit.length;

		if (currentLength > 0 && currentLength + unitLength > maxChunkLength) {
			chunks.push(makeTextToken(current));
			current = [];
			currentLength = 0;
		}

		current.push(unit);
		currentLength += unitLength;
	}

	if (currentLength > 0) chunks.push(makeTextToken(current));
	return chunks;
}

function greedyTokenWrap(tokens, maxChunkLength) {
	const chunks = [];
	let current = [];
	let currentLength = 0;

	for (const token of tokens) {
		if (
			currentLength > 0 &&
			currentLength + token.length > maxChunkLength
		) {
			chunks.push(current.map((entry) => entry.text).join(""));
			current = [];
			currentLength = 0;
		}

		current.push(token);
		currentLength += token.length;
	}

	if (currentLength > 0) {
		chunks.push(current.map((entry) => entry.text).join(""));
	}
	return chunks;
}

function splitStringContent(content, maxChunkLength, preserveEscapes = false) {
	const units = stringTextUnits(content, preserveEscapes);
	if (content.length <= maxChunkLength) return [content];

	const tokens = splitOversizedTokens(
		tokenizeStringUnits(units),
		maxChunkLength,
	);
	return greedyTokenWrap(tokens, maxChunkLength);
}

function multilineStringJoin(chunks) {
	return group(
		["StringJoin[", indent([line, join([",", line], chunks)]), line, "]"],
		{ shouldBreak: true },
	);
}

function stringLiteralInfo(value) {
	if (!isQuotedStringLiteral(value)) {
		const content = String(value ?? "");
		return {
			literal: quotedStringLiteral(content),
			content,
			splitSafe: true,
			preserveEscapes: false,
			wrapChunk: quotedStringLiteral,
		};
	}

	return {
		literal: value,
		content: value.slice(1, -1),
		splitSafe: true,
		preserveEscapes: true,
		wrapChunk: rawQuotedStringLiteral,
	};
}

function stringLiteralData(node) {
	if (node?.type !== "LeafNode" || node.kind !== "String") return null;

	const value = repairMojibake(node.value);
	return stringLiteralInfo(value);
}

function docsForStringLiteralInfo(info, options, indentDepth, mode) {
	const literalWidth =
		mode === "stringJoinArg"
			? stringJoinContentWidth(options, indentDepth) + 2
			: inlineStringLiteralWidth(options, indentDepth);

	if (info.splitSafe && info.literal.length > literalWidth) {
		const chunks = splitStringContent(
			info.content,
			stringJoinContentWidth(options, indentDepth),
			info.preserveEscapes,
		);
		if (chunks.length > 1) return chunks.map(info.wrapChunk);
	}

	return [info.literal];
}

function hasOddTrailingBackslashes(text) {
	let count = 0;
	for (let i = text.length - 1; i >= 0 && text[i] === "\\"; i--) {
		count++;
	}
	return count % 2 === 1;
}

function hasOpenNamedCharacterEscape(text) {
	const openIndex = text.lastIndexOf("\\[");
	if (openIndex === -1) return false;
	return text.indexOf("]", openIndex + 2) === -1;
}

function hasOpenHexCharacterEscape(text) {
	return /\\(?:\.[0-9a-fA-F]{0,2}|:[0-9a-fA-F]{0,4})$/u.test(text);
}

function canJoinStringLiteralData(previous, next) {
	if (previous.preserveEscapes !== next.preserveEscapes) return false;
	if (previous.wrapChunk !== next.wrapChunk) return false;
	if (!previous.preserveEscapes) return true;

	return (
		!hasOddTrailingBackslashes(previous.content) &&
		!hasOpenNamedCharacterEscape(previous.content) &&
		!hasOpenHexCharacterEscape(previous.content)
	);
}

function combineStringLiteralData(run) {
	const content = run.map((entry) => entry.content).join("");
	const first = run[0];

	return {
		literal: first.wrapChunk(content),
		content,
		splitSafe: run.every((entry) => entry.splitSafe),
		preserveEscapes: first.preserveEscapes,
		wrapChunk: first.wrapChunk,
	};
}

export function stringLiteralDocs(node, options, context = {}) {
	const info = stringLiteralData(node);
	if (!info) return null;

	const indentDepth =
		context.indentDepth ?? stringLineIndentDepth(context.path);
	const mode = context.mode ?? "inline";

	return docsForStringLiteralInfo(info, options, indentDepth, mode);
}

export function stringLiteralRunDocs(nodes, options, context = {}) {
	const indentDepth =
		context.indentDepth ?? stringLineIndentDepth(context.path);
	const mode = context.mode ?? "inline";
	const docs = [];
	let run = [];

	function flushRun() {
		if (run.length === 0) return;
		docs.push(
			...docsForStringLiteralInfo(
				combineStringLiteralData(run),
				options,
				indentDepth,
				mode,
			),
		);
		run = [];
	}

	for (const node of nodes) {
		const data = stringLiteralData(node);
		if (!data) {
			flushRun();
			continue;
		}

		if (run.length > 0 && !canJoinStringLiteralData(run.at(-1), data)) {
			flushRun();
		}
		run.push(data);
	}

	flushRun();
	return docs;
}

/** Returns the text representation of a leaf node, or '' for trivia. */
export function printLeaf(node, options, context = {}) {
	if (DISCARD_KINDS.has(node.kind)) return "";
	if (node.kind === "String") {
		const docs = stringLiteralDocs(node, options, {
			...context,
			mode: "inline",
		});
		if (!docs) return "";
		return docs.length > 1 ? multilineStringJoin(docs) : docs[0];
	}
	if (node.kind === "Token`Comment") {
		return multilineCommentDoc(node, options);
	}
	const value = repairMojibake(node.value);
	return String(value);
}

export function isTrivia(node) {
	return node?.type === "LeafNode" && DISCARD_KINDS.has(node.kind);
}

export function isComment(node) {
	return node?.type === "LeafNode" && node.kind === "Token`Comment";
}

"use strict";

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function buildLcsTable(a, b) {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	return dp;
}

function diffLineHunks(original, formatted) {
	const a = original.split("\n");
	const b = formatted.split("\n");

	if (a.length * b.length > 200000) {
		return [{ aStart: 0, aEnd: a.length, bStart: 0, bEnd: b.length, a, b }];
	}

	const dp = buildLcsTable(a, b);
	const hunks = [];
	let i = 0;
	let j = 0;
	let hunk = null;

	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			if (hunk) {
				hunk.aEnd = i;
				hunk.bEnd = j;
				hunks.push(hunk);
				hunk = null;
			}
			i++;
			j++;
			continue;
		}

		if (!hunk) hunk = { aStart: i, aEnd: i, bStart: j, bEnd: j, a, b };

		if (j === b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) {
			i++;
		} else {
			j++;
		}
	}

	if (hunk) {
		hunk.aEnd = i;
		hunk.bEnd = j;
		hunks.push(hunk);
	}

	return hunks;
}

function lineChangeSpan(oldLine, newLine) {
	let prefix = 0;
	while (
		prefix < oldLine.length &&
		prefix < newLine.length &&
		oldLine[prefix] === newLine[prefix]
	) {
		prefix++;
	}

	let suffix = 0;
	while (
		suffix < oldLine.length - prefix &&
		suffix < newLine.length - prefix &&
		oldLine[oldLine.length - 1 - suffix] ===
			newLine[newLine.length - 1 - suffix]
	) {
		suffix++;
	}

	return {
		oldStart: prefix,
		oldEnd: oldLine.length - suffix,
		newStart: prefix,
		newEnd: newLine.length - suffix,
	};
}

function normalizeTabWidth(tabWidth) {
	const numeric = Number(tabWidth);
	if (!Number.isFinite(numeric) || numeric <= 0) return 2;
	return Math.max(1, Math.floor(numeric));
}

function tabAdvance(column, tabWidth) {
	const remainder = column % tabWidth;
	return remainder === 0 ? tabWidth : tabWidth - remainder;
}

function leadingHorizontalWhitespaceEnd(line) {
	const match = /[^ \t]/.exec(line);
	return match ? match.index : line.length;
}

function indentationSegments(indent, tabWidth) {
	const segments = [];
	let column = 0;
	for (let index = 0; index < indent.length; index++) {
		const char = indent[index];
		const startColumn = column;
		column += char === "\t" ? tabAdvance(column, tabWidth) : 1;
		segments.push({ char, index, startColumn, endColumn: column });
	}

	return segments;
}

function sameIndentationSegment(a, b) {
	return (
		a?.char === b?.char &&
		a?.startColumn === b?.startColumn &&
		a?.endColumn === b?.endColumn
	);
}

function indentationChangeSpan(oldIndent, newIndent, tabWidth) {
	const oldSegments = indentationSegments(oldIndent, tabWidth);
	const newSegments = indentationSegments(newIndent, tabWidth);

	let prefix = 0;
	while (
		prefix < oldSegments.length &&
		prefix < newSegments.length &&
		sameIndentationSegment(oldSegments[prefix], newSegments[prefix])
	) {
		prefix++;
	}

	let suffix = 0;
	while (
		suffix < oldSegments.length - prefix &&
		suffix < newSegments.length - prefix &&
		sameIndentationSegment(
			oldSegments[oldSegments.length - 1 - suffix],
			newSegments[newSegments.length - 1 - suffix],
		)
	) {
		suffix++;
	}

	const firstChanged = oldSegments[prefix];
	const lastChanged = oldSegments[oldSegments.length - 1 - suffix];

	return {
		oldStart: firstChanged?.index ?? oldIndent.length,
		oldEnd: lastChanged ? lastChanged.index + 1 : oldIndent.length,
	};
}

function leadingIndentationChangeSpan(oldLine, newLine, tabWidth) {
	if (oldLine === newLine) return null;

	const oldIndentEnd = leadingHorizontalWhitespaceEnd(oldLine);
	const newIndentEnd = leadingHorizontalWhitespaceEnd(newLine);
	if (oldLine.slice(oldIndentEnd) !== newLine.slice(newIndentEnd)) {
		return null;
	}

	return indentationChangeSpan(
		oldLine.slice(0, oldIndentEnd),
		newLine.slice(0, newIndentEnd),
		tabWidth,
	);
}

function rangeForLineSpan(vscodeApi, document, line, startChar, endChar) {
	const maxLine = Math.max(0, document.lineCount - 1);
	const safeLine = clamp(line, 0, maxLine);
	const lineLength = document.lineAt(safeLine).text.length;
	let safeStartChar = clamp(startChar, 0, lineLength);
	let safeEndChar = clamp(endChar, safeStartChar, lineLength);

	if (safeStartChar === safeEndChar) {
		if (safeStartChar < lineLength) {
			safeEndChar = safeStartChar + 1;
		} else if (lineLength > 0) {
			safeStartChar = lineLength - 1;
			safeEndChar = lineLength;
		} else {
			safeEndChar = safeStartChar + 1;
		}
	}

	return new vscodeApi.Range(
		new vscodeApi.Position(safeLine, safeStartChar),
		new vscodeApi.Position(safeLine, safeEndChar),
	);
}

function indentationRangesForHunk(vscodeApi, document, hunk, options = {}) {
	const aLen = hunk.aEnd - hunk.aStart;
	const bLen = hunk.bEnd - hunk.bStart;
	if (aLen === 0 || aLen !== bLen) return [];

	const tabWidth = normalizeTabWidth(options.tabWidth);
	const ranges = [];
	for (let offset = 0; offset < aLen; offset++) {
		const oldLine = hunk.a[hunk.aStart + offset] ?? "";
		const newLine = hunk.b[hunk.bStart + offset] ?? "";
		if (oldLine === newLine) continue;

		const span = leadingIndentationChangeSpan(
			oldLine,
			newLine,
			tabWidth,
		);
		if (!span) {
			return [];
		}

		ranges.push(
			rangeForLineSpan(
				vscodeApi,
				document,
				hunk.aStart + offset,
				span.oldStart,
				span.oldEnd,
			),
		);
	}

	return ranges;
}

function rangeForHunk(vscodeApi, document, hunk) {
	const aLen = hunk.aEnd - hunk.aStart;
	const bLen = hunk.bEnd - hunk.bStart;

	if (aLen === 1) {
		const oldLine = hunk.a[hunk.aStart] ?? "";
		const newStartLine = hunk.b[hunk.bStart] ?? "";
		let prefix = 0;
		while (
			prefix < oldLine.length &&
			prefix < newStartLine.length &&
			oldLine[prefix] === newStartLine[prefix]
		) {
			prefix++;
		}
		let suffix = 0;
		const newEndLine = bLen > 0 ? (hunk.b[hunk.bEnd - 1] ?? "") : "";
		while (
			suffix < oldLine.length - prefix &&
			suffix < newEndLine.length - prefix &&
			oldLine[oldLine.length - 1 - suffix] ===
				newEndLine[newEndLine.length - 1 - suffix]
		) {
			suffix++;
		}
		const start = new vscodeApi.Position(hunk.aStart, prefix);
		const endChar = Math.max(prefix + 1, oldLine.length - suffix);
		return new vscodeApi.Range(
			start,
			new vscodeApi.Position(hunk.aStart, endChar),
		);
	}

	const maxLine = Math.max(0, document.lineCount - 1);
	if (aLen === 0) {
		const line = clamp(hunk.aStart, 0, maxLine);
		return new vscodeApi.Range(
			new vscodeApi.Position(line, 0),
			new vscodeApi.Position(
				line,
				Math.max(1, document.lineAt(line).text.length),
			),
		);
	}

	if (aLen > 1) {
		const startLine = clamp(hunk.aStart, 0, maxLine);
		const endLine = clamp(hunk.aEnd - 1, startLine, maxLine);
		const startText = hunk.a[hunk.aStart] ?? "";
		const endText = hunk.a[hunk.aEnd - 1] ?? "";

		let prefix = 0;
		const newStartText = hunk.b[hunk.bStart] ?? "";
		while (
			prefix < startText.length &&
			prefix < newStartText.length &&
			startText[prefix] === newStartText[prefix]
		) {
			prefix++;
		}

		let suffix = 0;
		const newEndText = hunk.b[hunk.bEnd - 1] ?? "";
		while (
			suffix < endText.length &&
			suffix < newEndText.length &&
			endText[endText.length - 1 - suffix] ===
				newEndText[newEndText.length - 1 - suffix]
		) {
			suffix++;
		}

		const startChar = clamp(
			prefix,
			0,
			document.lineAt(startLine).text.length,
		);
		const endChar = clamp(
			Math.max(startChar + 1, endText.length - suffix),
			0,
			document.lineAt(endLine).text.length,
		);

		return new vscodeApi.Range(
			new vscodeApi.Position(startLine, startChar),
			new vscodeApi.Position(endLine, endChar),
		);
	}

	const startLine = clamp(hunk.aStart, 0, maxLine);
	const endLine = clamp(hunk.aEnd - 1, startLine, maxLine);
	return new vscodeApi.Range(
		new vscodeApi.Position(startLine, 0),
		new vscodeApi.Position(endLine, document.lineAt(endLine).text.length),
	);
}

function isTriviaLeaf(node) {
	return (
		node?.type === "LeafNode" &&
		[
			"Token`Whitespace",
			"Whitespace",
			"Token`Newline",
			"Newline",
			"Token`Comment",
		].includes(node.kind)
	);
}

function isSemanticDiagnosticNode(node) {
	if (!node || typeof node !== "object") return false;
	if (typeof node.locStart !== "number" || typeof node.locEnd !== "number")
		return false;
	if (node.locEnd < node.locStart) return false;
	if (node.type === "LeafNode" || node.type === "ContainerNode") return false;
	return true;
}

function findBestDiagnosticNode(root, startOffset, endOffset, best = null) {
	if (!root || typeof root !== "object") return best;
	if (typeof root.locStart !== "number" || typeof root.locEnd !== "number")
		return best;
	if (root.locStart > startOffset || root.locEnd < endOffset) return best;

	if (isSemanticDiagnosticNode(root)) {
		const width = root.locEnd - root.locStart;
		const bestWidth = best ? best.locEnd - best.locStart : Infinity;
		if (width <= bestWidth) best = root;
	}

	if (root.head) {
		best = findBestDiagnosticNode(root.head, startOffset, endOffset, best);
	}

	if (root.children) {
		for (const child of root.children) {
			best = findBestDiagnosticNode(child, startOffset, endOffset, best);
		}
	}

	return best;
}

function nodeRange(vscodeApi, document, node) {
	const src = node?.source;
	if (!Array.isArray(src) || src.length !== 2) return null;
	const [[startLine, startCol], [endLine, endCol]] = src;
	if (
		[startLine, startCol, endLine, endCol].some(
			(n) => typeof n !== "number",
		)
	)
		return null;
	const maxLine = Math.max(0, document.lineCount - 1);
	const safeStartLine = clamp(startLine - 1, 0, maxLine);
	const safeEndLine = clamp(endLine - 1, safeStartLine, maxLine);
	const safeStartCol = clamp(
		startCol - 1,
		0,
		document.lineAt(safeStartLine).text.length,
	);
	const safeEndCol = clamp(
		endCol - 1,
		0,
		document.lineAt(safeEndLine).text.length,
	);
	if (safeStartLine === safeEndLine && safeStartCol === safeEndCol) {
		const lineLen = document.lineAt(safeStartLine).text.length;
		return new vscodeApi.Range(
			new vscodeApi.Position(safeStartLine, safeStartCol),
			new vscodeApi.Position(
				safeEndLine,
				clamp(safeEndCol + 1, safeStartCol + 1, Math.max(1, lineLen)),
			),
		);
	}

	return new vscodeApi.Range(
		new vscodeApi.Position(safeStartLine, safeStartCol),
		new vscodeApi.Position(safeEndLine, Math.max(safeStartCol, safeEndCol)),
	);
}

function offsetSpanForRange(document, range) {
	const startOffset = document.offsetAt(range.start);
	const endOffset = Math.max(startOffset + 1, document.offsetAt(range.end));
	return { startOffset, endOffset };
}

function visibleLineRange(vscodeApi, document, startLine, endLine) {
	const maxLine = Math.max(0, document.lineCount - 1);
	const safeStartLine = clamp(startLine, 0, maxLine);
	const safeEndLine = clamp(endLine, safeStartLine, maxLine);
	return new vscodeApi.Range(
		new vscodeApi.Position(safeStartLine, 0),
		new vscodeApi.Position(
			safeEndLine,
			document.lineAt(safeEndLine).text.length,
		),
	);
}

function ensureVisibleRange(vscodeApi, document, range) {
	const text = document.getText(range);
	if (/\S/.test(text)) return range;
	return visibleLineRange(
		vscodeApi,
		document,
		range.start.line,
		range.end.line,
	);
}

function shouldAnchorRange(document, range) {
	const text = document.getText(range);
	const visible = text.replace(/\s+/g, "");
	if (visible.length === 0) return true;
	if (visible.length <= 1) return true;
	return /^[^\p{L}\p{N}_]+$/u.test(visible);
}

function anchorRangeToSemanticNode(vscodeApi, document, ast, baseRange) {
	if (!ast || !shouldAnchorRange(document, baseRange)) {
		return ensureVisibleRange(vscodeApi, document, baseRange);
	}

	const { startOffset, endOffset } = offsetSpanForRange(document, baseRange);
	const anchor = findBestDiagnosticNode(ast, startOffset, endOffset);
	if (!anchor) return ensureVisibleRange(vscodeApi, document, baseRange);
	return ensureVisibleRange(
		vscodeApi,
		document,
		nodeRange(vscodeApi, document, anchor) ?? baseRange,
	);
}

function diagnosticRangeForFinding(vscodeApi, document, ast, finding) {
	const baseRange = nodeRange(vscodeApi, document, finding?.node);
	if (!baseRange) return new vscodeApi.Range(0, 0, 0, 1);
	return anchorRangeToSemanticNode(vscodeApi, document, ast, baseRange);
}

function anchoredRangeForHunk(vscodeApi, document, ast, hunk) {
	return anchorRangeToSemanticNode(
		vscodeApi,
		document,
		ast,
		rangeForHunk(vscodeApi, document, hunk),
	);
}

function diagnosticRangeForHunk(vscodeApi, document, ast, hunk, options = {}) {
	const indentationRanges = indentationRangesForHunk(
		vscodeApi,
		document,
		hunk,
		options,
	);
	if (indentationRanges.length > 0) return indentationRanges[0];

	return anchoredRangeForHunk(vscodeApi, document, ast, hunk);
}

function diagnosticRangesForHunk(vscodeApi, document, ast, hunk, options = {}) {
	const indentationRanges = indentationRangesForHunk(
		vscodeApi,
		document,
		hunk,
		options,
	);
	if (indentationRanges.length > 0) return indentationRanges;

	return [anchoredRangeForHunk(vscodeApi, document, ast, hunk)];
}

module.exports = {
	diffLineHunks,
	diagnosticRangeForFinding,
	diagnosticRangeForHunk,
	diagnosticRangesForHunk,
	ensureVisibleRange,
	findBestDiagnosticNode,
	isSemanticDiagnosticNode,
	nodeRange,
	rangeForHunk,
};

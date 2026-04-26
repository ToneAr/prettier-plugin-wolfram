// src/utils/offsets.js

/** Build a table mapping line index (0-based) → character offset of line start */
export function buildOffsetTable(source, tabWidth = 2) {
	const table = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") table.push(i + 1);
	}
	Object.defineProperties(table, {
		sourceText: {
			value: source,
			enumerable: false,
		},
		tabWidth: {
			value: tabWidth,
			enumerable: false,
		},
	});
	return table;
}

/** Convert 1-based line/col to 0-based character offset */
export function lineColToOffset(table, line, col) {
	const lineStart = table[line - 1];
	if (typeof lineStart !== "number") return 0;

	const sourceText =
		table &&
		typeof table === "object" &&
		typeof table.sourceText === "string"
			? table.sourceText
			: null;
	if (!sourceText) return lineStart + (col - 1);

	const width =
		table && typeof table === "object" && typeof table.tabWidth === "number"
			? table.tabWidth
			: 2;
	let offset = lineStart;
	let visualCol = 1;

	while (
		offset < sourceText.length &&
		sourceText[offset] !== "\n" &&
		visualCol < col
	) {
		if (sourceText[offset] === "\t") {
			visualCol += width - ((visualCol - 1) % width);
		} else {
			visualCol += 1;
		}
		offset += 1;
	}

	return offset;
}

function sourceToOffsets(source, table) {
	if (!Array.isArray(source) || source.length !== 2) return null;
	const [start, end] = source;
	if (!Array.isArray(start) || !Array.isArray(end)) return null;
	const [startLine, startCol] = start;
	const [endLine, endCol] = end;
	if (
		[startLine, startCol, endLine, endCol].some(
			(value) => typeof value !== "number" || Number.isNaN(value),
		)
	) {
		return null;
	}

	return {
		locStart: lineColToOffset(table, startLine, startCol),
		locEnd: lineColToOffset(table, endLine, endCol),
	};
}

function nodeOffsets(node) {
	if (
		!node ||
		typeof node !== "object" ||
		typeof node.locStart !== "number" ||
		typeof node.locEnd !== "number"
	) {
		return null;
	}

	return { locStart: node.locStart, locEnd: node.locEnd };
}

function combinedOffsets(nodes) {
	const ranges = nodes.map(nodeOffsets).filter(Boolean);
	if (ranges.length === 0) return null;

	return {
		locStart: Math.min(...ranges.map((range) => range.locStart)),
		locEnd: Math.max(...ranges.map((range) => range.locEnd)),
	};
}

/** Recursively attach locStart/locEnd to every node in the CST tree */
export function addOffsets(node, table, fallbackOffset = null) {
	if (!node || typeof node !== "object") return node;

	const ownOffsets = sourceToOffsets(node.source, table);
	const childFallback =
		ownOffsets?.locStart ??
		(typeof fallbackOffset === "number" ? fallbackOffset : null);

	if (node.children) {
		node.children.forEach((child) =>
			addOffsets(child, table, childFallback),
		);
	}
	if (node.head) {
		addOffsets(node.head, table, childFallback);
	}

	const derivedOffsets =
		ownOffsets ??
		combinedOffsets([node.head, ...(node.children ?? [])]) ??
		(typeof childFallback === "number"
			? { locStart: childFallback, locEnd: childFallback }
			: null);

	if (derivedOffsets) {
		node.locStart = derivedOffsets.locStart;
		node.locEnd = derivedOffsets.locEnd;
	}

	return node;
}

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

export function nodeStartLine(node, options) {
	const sourceStartLine = node?.source?.[0]?.[0];
	if (Number.isFinite(sourceStartLine)) return sourceStartLine;
	return lineNumberAtOffset(options?.originalText, node?.locStart);
}

export function nodeEndLine(node, options) {
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

export function sourceLineGap(leftNode, rightNode, options) {
	const leftEndLine = nodeEndLine(leftNode, options);
	const rightStartLine = nodeStartLine(rightNode, options);
	if (!Number.isFinite(leftEndLine) || !Number.isFinite(rightStartLine)) {
		return null;
	}

	return rightStartLine - leftEndLine;
}

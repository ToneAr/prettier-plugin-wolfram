// Convert tree-sitter char offsets to CodeParser 1-based [line,col] source.
export function makeLineIndex(source) {
	const starts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") starts.push(i + 1);
	}
	return starts;
}

export function offsetToLineCol(lineIndex, offset) {
	// Binary search for the greatest line start <= offset.
	let lo = 0, hi = lineIndex.length - 1, line = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (lineIndex[mid] <= offset) { line = mid; lo = mid + 1; }
		else hi = mid - 1;
	}
	return [line + 1, offset - lineIndex[line] + 1];
}

export function nodeSource(tsNode, lineIndex) {
	return [
		offsetToLineCol(lineIndex, tsNode.startIndex),
		offsetToLineCol(lineIndex, tsNode.endIndex),
	];
}

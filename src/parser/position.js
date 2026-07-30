// Convert tree-sitter character offsets to CodeParser 1-based [line,col] source.
//
// CodeParser (WL's official parser) uses a byte-based column model with two quirks:
//   1. Non-ASCII UTF-8 characters are counted by byte width, not character count.
//   2. Tab characters (\t, byte 0x09) are counted as 2 bytes/columns wide.
//
// web-tree-sitter uses JS character (UTF-16 code unit) offsets internally, so we
// pre-build a char→"WL byte" offset map here and use it in nodeSource().

export function makeLineIndex(source) {
	// charToWlOffset[i] = WL byte offset of the i-th JS code unit in source.
	const charToWlOffset = new Int32Array(source.length + 1);
	let wlOff = 0;
	for (let i = 0; i < source.length; i++) {
		charToWlOffset[i] = wlOff;
		const code = source.charCodeAt(i);
		if (code === 0x09) {
			// Tab: WL CodeParser counts it as 2 columns.
			wlOff += 2;
		} else if (code < 0x80) {
			wlOff += 1;
		} else if (code >= 0xd800 && code <= 0xdbff) {
			// High surrogate: part of a surrogate pair (4 UTF-8 bytes total).
			wlOff += 4;
			i++; // Skip the low surrogate (next code unit).
			charToWlOffset[i] = wlOff - 2; // low surrogate maps to same 4-byte run
		} else if (code < 0x800) {
			wlOff += 2;
		} else {
			wlOff += 3;
		}
	}
	charToWlOffset[source.length] = wlOff;

	// Build line start array in WL byte offsets.
	const lineStarts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") lineStarts.push(charToWlOffset[i + 1]);
	}

	return { charToWlOffset, lineStarts };
}

export function offsetToLineCol(lineIndex, charOffset) {
	const wlOffset = lineIndex.charToWlOffset[charOffset];
	const { lineStarts } = lineIndex;
	// Binary search for the greatest line start <= wlOffset.
	let lo = 0, hi = lineStarts.length - 1, line = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (lineStarts[mid] <= wlOffset) { line = mid; lo = mid + 1; }
		else hi = mid - 1;
	}
	return [line + 1, wlOffset - lineStarts[line] + 1];
}

export function sourceRange(lineIndex, startIndex, endIndex) {
	const source = [
		offsetToLineCol(lineIndex, startIndex),
		offsetToLineCol(lineIndex, endIndex),
	];
	// When a preprocessing offset map is available, record the exact original
	// character offsets (non-enumerably, so node.source stays a [[l,c],[l,c]]
	// pair for lint rules). These bypass the lossy WL-byte/visual-column line/col
	// round-trip in addOffsets, which otherwise mismaps offsets whenever the
	// preprocessed text differs from the original (collapsed spaces, tabs, or
	// non-ASCII characters earlier on the line).
	const map = lineIndex?.map;
	if (map) {
		const charStart = map[startIndex];
		const charEnd = map[endIndex];
		if (typeof charStart === "number" && typeof charEnd === "number") {
			Object.defineProperties(source, {
				charStart: { value: charStart, enumerable: false },
				charEnd: { value: charEnd, enumerable: false },
			});
		}
	}
	return source;
}

export function nodeSource(tsNode, lineIndex) {
	return sourceRange(lineIndex, tsNode.startIndex, tsNode.endIndex);
}

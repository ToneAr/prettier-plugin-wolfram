"use strict";

function finalLineEnding(text) {
	if (text.endsWith("\r\n")) return "\r\n";
	if (text.endsWith("\n")) return "\n";
	if (text.endsWith("\r")) return "\r";
	return "";
}

function differsOnlyByFinalNewline(original, formatted) {
	if (original === formatted) return false;
	const originalEnding = finalLineEnding(original);
	const formattedEnding = finalLineEnding(formatted);
	const originalBody = originalEnding
		? original.slice(0, -originalEnding.length)
		: original;
	const formattedBody = formattedEnding
		? formatted.slice(0, -formattedEnding.length)
		: formatted;

	return originalBody === formattedBody && originalEnding !== formattedEnding;
}

function classifyFormattingHunk(hunk, printWidth) {
	const oldText = hunk.a.slice(hunk.aStart, hunk.aEnd).join("\n");
	const newText = hunk.b.slice(hunk.bStart, hunk.bEnd).join("\n");
	const oldCompact = oldText.replace(/[ \t\n\r]+/g, "");
	const newCompact = newText.replace(/[ \t\n\r]+/g, "");

	if (oldCompact === newCompact) {
		if (oldText.replace(/,\s*/g, ",") === newText.replace(/,\s*/g, ",")) {
			return "Comma/argument spacing differs from configured style.";
		}
		if (
			oldText.replace(/\s*([+\-*/^=><!|&:@/.]+)\s*/g, "$1") ===
			newText.replace(/\s*([+\-*/^=><!|&:@/.]+)\s*/g, "$1")
		) {
			return "Operator spacing differs from configured style.";
		}
		return "Whitespace or indentation differs from configured style.";
	}

	if (hasLineOverflowIgnoringComments(oldText, printWidth ?? 80)) {
		return `Line exceeds printWidth (${printWidth ?? 80}) and will be wrapped.`;
	}

	if (
		(oldText.includes("\n") || newText.includes("\n")) &&
		oldText.replace(/\s+/g, " ") === newText.replace(/\s+/g, " ")
	) {
		return "Expression wrapping differs from configured style.";
	}

	return "Formatting differs from configured Prettier style.";
}

function hasLineOverflowIgnoringComments(sourceText, maxWidth) {
	return lineOverflowRangesIgnoringComments(sourceText, maxWidth).length > 0;
}

function lineOverflowRangesIgnoringComments(sourceText, maxWidth) {
	const overflows = [];
	let line = 1;
	let rawCol = 1;
	let commentDepth = 0;
	let inString = false;
	let escape = false;
	let keptChars = [];
	let keptCols = [];

	const flushLine = () => {
		let visibleLength = keptChars.length;
		while (
			visibleLength > 0 &&
			/[ \t]/.test(keptChars[visibleLength - 1])
		) {
			visibleLength--;
		}

		if (visibleLength > maxWidth) {
			overflows.push({
				line,
				startCol: keptCols[maxWidth],
				endCol: keptCols[visibleLength - 1] + 1,
			});
		}

		keptChars = [];
		keptCols = [];
		line++;
		rawCol = 1;
	};

	for (let i = 0; i < sourceText.length; i++) {
		const ch = sourceText[i];
		const next = sourceText[i + 1];

		if (ch === "\r") continue;
		if (ch === "\n") {
			flushLine();
			continue;
		}

		if (commentDepth > 0) {
			if (ch === "(" && next === "*") {
				commentDepth++;
				rawCol += 2;
				i++;
				continue;
			}
			if (ch === "*" && next === ")") {
				commentDepth--;
				rawCol += 2;
				i++;
				continue;
			}
			rawCol++;
			continue;
		}

		if (inString) {
			keptChars.push(ch);
			keptCols.push(rawCol);
			if (escape) {
				escape = false;
			} else if (ch === "\\") {
				escape = true;
			} else if (ch === '"') {
				inString = false;
			}
			rawCol++;
			continue;
		}

		if (ch === '"') {
			inString = true;
			keptChars.push(ch);
			keptCols.push(rawCol);
			rawCol++;
			continue;
		}

		if (ch === "(" && next === "*") {
			commentDepth++;
			rawCol += 2;
			i++;
			continue;
		}

		keptChars.push(ch);
		keptCols.push(rawCol);
		rawCol++;
	}

	flushLine();
	return overflows;
}

module.exports = {
	classifyFormattingHunk,
	differsOnlyByFinalNewline,
	__test__: {
		finalLineEnding,
		hasLineOverflowIgnoringComments,
		lineOverflowRangesIgnoringComments,
	},
};

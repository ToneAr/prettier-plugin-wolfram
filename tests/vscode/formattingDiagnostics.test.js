import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
	classifyFormattingHunk,
	differsOnlyByFinalNewline,
	__test__,
} = require("../../vscode-extension/src/formattingDiagnostics.js");

describe("formattingDiagnostics", () => {
	it("ignores formatter diffs caused only by a final newline", () => {
		expect(differsOnlyByFinalNewline("x = 1\n", "x = 1")).toBe(true);
		expect(differsOnlyByFinalNewline("x = 1\r\n", "x = 1")).toBe(true);
		expect(differsOnlyByFinalNewline("x = 1", "x = 1\n")).toBe(true);
	});

	it("does not ignore extra trailing blank lines or other edits", () => {
		expect(differsOnlyByFinalNewline("x = 1\n\n", "x = 1")).toBe(false);
		expect(differsOnlyByFinalNewline("x = 1\n\n", "x = 1\n")).toBe(false);
		expect(differsOnlyByFinalNewline("x = 1\n", "x=1")).toBe(false);
	});

	it("ignores comment-only width when classifying formatting hunks", () => {
		const hunk = {
			a: [
				"x ~f~ y (* this comment makes the raw line very long indeed *)",
			],
			b: [
				"f[x, y] (* this comment makes the raw line very long indeed *)",
			],
			aStart: 0,
			aEnd: 1,
			bStart: 0,
			bEnd: 1,
		};

		expect(classifyFormattingHunk(hunk, 20)).toBe(
			"Formatting differs from configured Prettier style.",
		);
	});

	it("does not treat trailing comment text as line-width overflow", () => {
		expect(
			__test__.hasLineOverflowIgnoringComments(
				"x = 1 (* this trailing comment is intentionally very long *)",
				10,
			),
		).toBe(false);
	});

	it("still detects code overflow before a trailing comment", () => {
		expect(
			__test__.lineOverflowRangesIgnoringComments(
				"abcdefghijkl (* note *)",
				10,
			),
		).toEqual([{ line: 1, startCol: 11, endCol: 13 }]);
	});
});

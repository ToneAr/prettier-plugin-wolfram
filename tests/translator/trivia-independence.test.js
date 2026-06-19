// tests/translator/trivia-independence.test.js
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import prettier from "prettier";
import * as plugin from "../../src/index.js";
import { buildOffsetTable, addOffsets } from "../../src/utils/offsets.js";

const require = createRequire(import.meta.url);
const TRIVIA = new Set(["Whitespace", "Token`Whitespace", "Newline", "Token`Newline"]);

function stripTrivia(node) {
	if (!node || typeof node !== "object") return node;
	const copy = { ...node };
	if (Array.isArray(copy.children)) {
		copy.children = copy.children
			.filter((c) => !(c?.type === "LeafNode" && TRIVIA.has(c.kind)))
			.map(stripTrivia);
	}
	if (copy.head) copy.head = stripTrivia(copy.head);
	return copy;
}

/** Reconstruct a minimal source text that satisfies the line/col positions in the fixture */
function syntheticSourceText(cst) {
	const lineWidths = new Map();
	function walk(node) {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node.source) && node.source.length === 2) {
			const [, end] = node.source;
			if (Array.isArray(end)) {
				const [line, col] = end;
				lineWidths.set(line, Math.max(lineWidths.get(line) ?? 1, col));
			}
		}
		for (const child of node.children ?? []) walk(child);
		if (node.head) walk(node.head);
	}
	walk(cst);
	const maxLine = Math.max(...lineWidths.keys());
	const lines = [];
	for (let i = 1; i <= maxLine; i++) {
		lines.push(" ".repeat(lineWidths.get(i) ?? 1));
	}
	return lines.join("\n");
}

async function printCst(cst) {
	// Feed a pre-built CST straight to the printer via a synthetic parser.
	// Mirror what src/index.js does: build offset table and add locStart/locEnd.
	const synthetic = {
		...plugin,
		parsers: {
			wolfram: {
				...plugin.parsers.wolfram,
				parse: async (text) => {
					const sourceText = syntheticSourceText(cst);
					const table = buildOffsetTable(sourceText, 2);
					return addOffsets(cst, table);
				},
			},
		},
	};
	return prettier.format("ignored", { parser: "wolfram", plugins: [synthetic] });
}

describe("translator ignores whitespace/newline leaves", () => {
	it("module-simple formats identically with trivia stripped", async () => {
		const full = require("../fixtures/module-simple.json");
		const stripped = stripTrivia(full);
		expect(await printCst(stripped)).toBe(await printCst(full));
	});
	it("call-nested formats identically with trivia stripped", async () => {
		const full = require("../fixtures/call-nested.json");
		const stripped = stripTrivia(full);
		expect(await printCst(stripped)).toBe(await printCst(full));
	});
});

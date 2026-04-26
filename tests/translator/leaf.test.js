// tests/translator/leaf.test.js
import { describe, it, expect } from "vitest";
import { printLeaf } from "../../src/translator/nodes/leaf.js";
import prettier from "prettier";

const opts = {
	wolframSpaceAroundOperators: true,
	wolframSpaceAfterComma: true,
};

function fmt(doc, width = 80) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth: width,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
}

describe("printLeaf", () => {
	it("prints a symbol", () => {
		const node = {
			type: "LeafNode",
			kind: "Symbol",
			value: "x",
			source: [
				[1, 1],
				[1, 2],
			],
		};
		expect(printLeaf(node, opts)).toBe("x");
	});

	it("prints an integer", () => {
		const node = {
			type: "LeafNode",
			kind: "Integer",
			value: 42,
			source: [
				[1, 1],
				[1, 3],
			],
		};
		expect(printLeaf(node, opts)).toBe("42");
	});

	it("prints a string literal", () => {
		const node = {
			type: "LeafNode",
			kind: "String",
			value: "hello",
			source: [
				[1, 1],
				[1, 7],
			],
		};
		expect(printLeaf(node, opts)).toBe('"hello"');
	});

	it("splits long quoted strings into multiline StringJoin expressions", () => {
		const node = {
			type: "LeafNode",
			kind: "String",
			value: '"a very long string that should wrap nicely"',
			source: [
				[1, 1],
				[1, 44],
			],
		};

		const result = fmt(printLeaf(node, { ...opts, printWidth: 30 }), 30);
		expect(result).toBe(
			'StringJoin[\n  "a very long string that ",\n  "should wrap nicely"\n]',
		);
	});

	it("splits quoted strings with Wolfram escapes without doubling them", () => {
		const node = {
			type: "LeafNode",
			kind: "String",
			value: '"Failed to retrieve log file \\`1\\`. Please ensure the file exists and you have read permissions."',
			source: [
				[1, 1],
				[1, 96],
			],
		};

		const result = fmt(printLeaf(node, { ...opts, printWidth: 80 }), 80);
		expect(result).toBe(
			"StringJoin[\n" +
				'  "Failed to retrieve log file \\`1\\`. Please ensure the file exists and you ",\n' +
				'  "have read permissions."\n' +
				"]",
		);
	});

	it("normalizes multiline comments relative to the opening indent", () => {
		const source = "foo[\n    (*\n      Some comment\n    *)\n]";
		const node = {
			type: "LeafNode",
			kind: "Token`Comment",
			value: "(*\n      Some comment\n    *)",
			locStart: source.indexOf("(*"),
		};

		const result = fmt(
			printLeaf(node, { ...opts, originalText: source, tabWidth: 2 }),
			80,
		);
		expect(result).toBe("(*\n  Some comment\n*)");
	});

	it("uses the original source range for multiline comment content when available", () => {
		const source = "foo[\n    (*\n      Full comment text\n    *)\n]";
		const node = {
			type: "LeafNode",
			kind: "Token`Comment",
			value: "(*\n      Truncated",
			locStart: source.indexOf("(*"),
			locEnd: source.indexOf("*)") + 2,
		};

		const result = fmt(
			printLeaf(node, { ...opts, originalText: source, tabWidth: 2 }),
			80,
		);
		expect(result).toBe("(*\n  Full comment text\n*)");
	});

	it("returns empty string for whitespace tokens", () => {
		const node = {
			type: "LeafNode",
			kind: "Token`Whitespace",
			value: " ",
			source: [
				[1, 1],
				[1, 2],
			],
		};
		expect(printLeaf(node, opts)).toBe("");
	});

	it("returns empty string for newline tokens", () => {
		const node = {
			type: "LeafNode",
			kind: "Token`Newline",
			value: "\n",
			source: [
				[1, 1],
				[1, 2],
			],
		};
		expect(printLeaf(node, opts)).toBe("");
	});
});

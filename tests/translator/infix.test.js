// tests/translator/infix.test.js
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { printInfix } from "../../src/translator/nodes/infix.js";
import { printBinary } from "../../src/translator/nodes/binary.js";
import prettier from "prettier";

const require = createRequire(import.meta.url);
const infixFixture = require("../fixtures/infix-plus.json");
const binaryFixture = require("../fixtures/binary-rule.json");

function fmt(doc) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth: 80,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
}

const opts = { wolframSpaceAroundOperators: true };

const leafPrint = (node) => {
	if (node.type === "LeafNode") return String(node.value);
	return "";
};

describe("printInfix", () => {
	it("formats a + b + c with spaces", () => {
		const infix = infixFixture.children[0];
		const doc = printInfix(infix, opts, leafPrint);
		expect(fmt(doc)).toBe("a + b + c");
	});
});

describe("printBinary", () => {
	it("formats a -> b", () => {
		const bin = binaryFixture.children[0];
		const doc = printBinary(bin, opts, leafPrint);
		expect(fmt(doc)).toBe("a -> b");
	});
});

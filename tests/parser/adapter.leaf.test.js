import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser();
	parser.setLanguage(lang);
});

describe("adapter leaves", () => {
	it("wraps a single symbol in a ContainerNode", () => {
		const cst = adapt(parser.parse("x"), "x");
		expect(cst.type).toBe("ContainerNode");
		expect(cst.kind).toBe("String");
		expect(cst.children[0]).toMatchObject({ type: "LeafNode", kind: "Symbol", value: "x", source: [[1, 1], [1, 2]] });
	});
	it("parses symbols with multiple leading dollar signs", () => {
		const cst = adapt(parser.parse("$$twikiResponseFmt"), "$$twikiResponseFmt");
		expect(cst.children[0]).toMatchObject({
			type: "LeafNode",
			kind: "Symbol",
			value: "$$twikiResponseFmt",
			source: [[1, 1], [1, 19]],
		});
	});
	it("maps integer/real/string leaves", () => {
		expect(adapt(parser.parse("42"), "42").children[0]).toMatchObject({ kind: "Integer", value: "42" });
		expect(adapt(parser.parse("3.5"), "3.5").children[0]).toMatchObject({ kind: "Real", value: "3.5" });
		expect(adapt(parser.parse('"hi"'), '"hi"').children[0]).toMatchObject({ kind: "String", value: '"hi"' });
	});
});

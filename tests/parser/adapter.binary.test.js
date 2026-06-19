import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

describe("adapter binary/prefix/postfix", () => {
	it("maps a = 1 to BinaryNode Set", () => {
		expect(adapt(parser.parse("a = 1"), "a = 1").children[0]).toMatchObject({ type: "BinaryNode", op: "Set" });
	});
	it("maps -x to PrefixNode Minus and x& to PostfixNode Function", () => {
		expect(adapt(parser.parse("-x"), "-x").children[0]).toMatchObject({ type: "PrefixNode", op: "Minus" });
		expect(adapt(parser.parse("x &"), "x &").children[0]).toMatchObject({ type: "PostfixNode", op: "Function" });
	});
	it("matches CodeParser CST for Module modulo trivia", () => {
		const src = "Module[{a = 1, b = 2}, a + b]";
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), require("../fixtures/module-simple.json"))).toBe(true);
	});
});

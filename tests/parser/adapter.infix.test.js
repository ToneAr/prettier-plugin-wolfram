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

describe("adapter infix flattening", () => {
	it("flattens a+b+c into one InfixNode op:Plus", () => {
		const cst = adapt(parser.parse("a + b + c"), "a + b + c");
		const infix = cst.children[0];
		expect(infix).toMatchObject({ type: "InfixNode", op: "Plus" });
		const operands = infix.children.filter((c) => c.kind === "Symbol");
		expect(operands.map((o) => o.value)).toEqual(["a", "b", "c"]);
	});
	it("matches CodeParser CST for the nested call (comma flattening) modulo trivia", () => {
		const src = "f[g[x], h[y, z]]";
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), require("../fixtures/call-nested.json"))).toBe(true);
	});
});

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
	parser = new Parser();
	parser.setLanguage(lang);
});

describe("adapter calls/groups", () => {
	// unskipped in Task 8 — requires comma flattening to match InfixNode structure
	it.skip("matches CodeParser CST for f[g[x], h[y, z]] modulo trivia", () => {
		const src = "f[g[x], h[y, z]]";
		const golden = require("../fixtures/call-nested.json");
		expect(cstEqualModuloTrivia(adapt(parser.parse(src), src), golden)).toBe(true);
	});
	it("emits GroupNode kind List for {1, 2}", () => {
		const cst = adapt(parser.parse("{1, 2}"), "{1, 2}");
		expect(cst.children[0]).toMatchObject({ type: "GroupNode", kind: "List" });
	});
});

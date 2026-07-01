import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";
import { preprocess } from "../../src/parser/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(here, "../../src/parser/tree-sitter-wolfram.wasm");

describe("grammar wasm", () => {
	let parser;
	beforeAll(async () => {
		await Parser.init();
		const lang = await Language.load(readFileSync(wasmPath));
		parser = new Parser();
		parser.setLanguage(lang);
	});
	it("parses a simple call without errors", () => {
		const tree = parser.parse("f[x, y]");
		expect(tree.rootNode.type).toBe("source_file");
		expect(tree.rootNode.hasError).toBe(false);
	});

	it("parses preprocessed trailing-semicolon subvalue definitions without errors", () => {
		const { text } = preprocess("f[x_][y_] := x+y;");
		const tree = parser.parse(text);
		expect(tree.rootNode.type).toBe("source_file");
		expect(tree.rootNode.hasError).toBe(false);
	});
});

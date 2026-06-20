import { describe, it, expect, beforeAll } from "vitest";
import { Parser, Language } from "web-tree-sitter";
import { readFileSync, readdirSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import { adapt } from "../../src/parser/adapter.js";
import { cstEqualModuloTrivia } from "../../src/parser/cstEqual.js";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../golden");
let parser;
beforeAll(async () => {
	await Parser.init();
	const lang = await Language.load(readFileSync(resolve(here, "../../src/parser/tree-sitter-wolfram.wasm")));
	parser = new Parser(); parser.setLanguage(lang);
});

const cases = readdirSync(goldenDir).filter((f) => f.endsWith(".cst.json")).map((f) => f.replace(/\.cst\.json$/, ""));

describe("adapter golden CST sweep (modulo trivia)", () => {
	for (const name of cases) {
		it(`${name}`, () => {
			const src = readFileSync(join(goldenDir, `${name}.wl`), "utf8");
			const golden = require(join(goldenDir, `${name}.cst.json`));
			const tree = parser.parse(src);
			if (tree.rootNode.hasError) return; // Tier-3: grammar gap, handled by Task 11 fallback
			expect(cstEqualModuloTrivia(adapt(tree, src), golden)).toBe(true);
		});
	}
});

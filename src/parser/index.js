import { Parser, Language } from "web-tree-sitter";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { adapt } from "./adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(here, "tree-sitter-wolfram.wasm");

let _langPromise = null;
async function getLanguage() {
	if (!_langPromise) {
		_langPromise = (async () => {
			await Parser.init();
			return Language.load(readFileSync(WASM_PATH));
		})();
	}
	return _langPromise;
}

export class WolframParser {
	async getCST(sourceText) {
		const lang = await getLanguage();
		const parser = new Parser();
		parser.setLanguage(lang);
		const tree = parser.parse(sourceText);
		return adapt(tree, sourceText);
	}
}

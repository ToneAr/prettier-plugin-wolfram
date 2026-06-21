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

// Replace space-based implicit multiplication (a  b) with U+2062 (InvisibleTimes)
// so the grammar can parse it. Skip content inside strings and nested comments.
export function preprocessInvisibleTimes(src) {
	let result = "";
	let i = 0;
	const n = src.length;
	while (i < n) {
		// Skip quoted string
		if (src[i] === '"') {
			const start = i++;
			while (i < n && src[i] !== '"') {
				if (src[i] === "\\") i++;
				i++;
			}
			if (i < n) i++;
			result += src.slice(start, i);
			continue;
		}
		// Skip nested WL comment (* ... *)
		if (src[i] === "(" && src[i + 1] === "*") {
			const start = i;
			i += 2;
			let depth = 1;
			while (i < n && depth > 0) {
				if (src[i] === "(" && src[i + 1] === "*") { depth++; i += 2; }
				else if (src[i] === "*" && src[i + 1] === ")") { depth--; i += 2; }
				else i++;
			}
			result += src.slice(start, i);
			continue;
		}
		// Two or more spaces between word chars on same line → InvisibleTimes
		if (src[i] === " " && src[i + 1] === " ") {
			// Check previous meaningful char is a word char
			const prevChar = result.length > 0 ? result[result.length - 1] : "";
			if (/\w/.test(prevChar)) {
				// Consume all spaces and peek at next non-space char
				let j = i;
				while (j < n && src[j] === " ") j++;
				if (j < n && /\w/.test(src[j])) {
					result += "⁢"; // InvisibleTimes, spaces stripped (they're extras)
					i = j;
					continue;
				}
			}
		}
		result += src[i++];
	}
	return result;
}

export class WolframParser {
	async getCST(sourceText) {
		const lang = await getLanguage();
		const parser = new Parser();
		parser.setLanguage(lang);
		const preprocessed = preprocessInvisibleTimes(sourceText);
		const tree = parser.parse(preprocessed);
		return adapt(tree, sourceText, preprocessed);
	}
}

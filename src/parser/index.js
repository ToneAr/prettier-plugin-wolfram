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
//
// Returns { text, map } where `text` is the preprocessed source and `map` is an
// index translation table: map[i] is the original-source character offset that
// corresponds to preprocessed-text offset i (map[text.length] === src.length).
// Because the only length-changing transform collapses a run of spaces into a
// single InvisibleTimes char, this map lets callers translate tree-sitter node
// positions (computed on the preprocessed text) back to exact offsets in the
// original source, without lossy line/col round-trips.
export function preprocess(src) {
	let result = "";
	const map = [];
	const n = src.length;
	// Copy src[start..end) verbatim, recording the source offset of each char.
	const copyVerbatim = (start, end) => {
		for (let k = start; k < end; k++) map.push(k);
		result += src.slice(start, end);
	};
	let i = 0;
	while (i < n) {
		// Skip quoted string
		if (src[i] === '"') {
			const start = i++;
			while (i < n && src[i] !== '"') {
				if (src[i] === "\\") i++;
				i++;
			}
			if (i < n) i++;
			copyVerbatim(start, i);
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
			copyVerbatim(start, i);
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
					map.push(i); // the single char maps to the start of the run
					i = j;
					continue;
				}
			}
		}
		map.push(i);
		result += src[i++];
	}
	map.push(n); // sentinel for end offsets (node endIndex === text.length)
	return { text: result, map };
}

// Backward-compatible wrapper returning only the preprocessed text.
export function preprocessInvisibleTimes(src) {
	return preprocess(src).text;
}

export class WolframParser {
	async getCST(sourceText) {
		const lang = await getLanguage();
		const parser = new Parser();
		parser.setLanguage(lang);
		const { text: preprocessed, map } = preprocess(sourceText);
		const tree = parser.parse(preprocessed);
		return adapt(tree, sourceText, preprocessed, map);
	}
}

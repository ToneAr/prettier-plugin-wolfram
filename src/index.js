// src/index.js
import { normalizeWolframOptions, options } from "./options.js";
import { KernelBridge } from "./bridge/index.js";
import { printNode } from "./translator/index.js";
import { buildOffsetTable, addOffsets } from "./utils/offsets.js";
import {
	containsCstErrors,
	createUnformattableNode,
} from "./utils/cstErrors.js";
import { preprocessRange } from "./range.js";

const bridge = new KernelBridge();

function extractLeadingShebang(text) {
	if (!text.startsWith("#!")) {
		return null;
	}

	const lineBreakMatch = /\r?\n/.exec(text);
	const lineEnd = lineBreakMatch?.index ?? text.length;
	const lineBreak = lineBreakMatch?.[0] ?? "";
	const bodyStart = lineEnd + lineBreak.length;

	return {
		line: text.slice(0, lineEnd),
		maskedText: " ".repeat(lineEnd) + lineBreak + text.slice(bodyStart),
	};
}

export const languages = [
	{
		name: "Wolfram Language",
		parsers: ["wolfram"],
		extensions: [".wl", ".wls", ".wlt", ".mt", ".m", ".vsnb", ".nb"],
		vscodeLanguageIds: ["wolfram", "wolframscript", "wolfram-notebook"],
	},
];

export const parsers = {
	wolfram: {
		parse: async (text, parsedOptions) => {
			const normalizedOptions = normalizeWolframOptions(parsedOptions);
			const shebang = extractLeadingShebang(text);
			const cstText = shebang?.maskedText ?? text;
			const cst = await bridge.getCST(cstText, normalizedOptions);
			if (!cst || containsCstErrors(cst)) {
				return createUnformattableNode(text);
			}
			const table = buildOffsetTable(
				text,
				normalizedOptions.tabWidth ?? 2,
			);
			const ast = addOffsets(cst, table);
			if (shebang) ast.wlsShebang = shebang.line;
			return ast;
		},
		preprocess: preprocessRange,
		astFormat: "wolfram-cst",
		locStart: (node) => node.locStart,
		locEnd: (node) => node.locEnd,
	},
};

export const printers = {
	"wolfram-cst": {
		print: (path, printOptions, print) =>
			printNode(path, normalizeWolframOptions(printOptions), print),
		/** Let Prettier traverse all non-whitespace nodes when walking the AST
		 *  to find nodes within the range. */
		canAttachComment: (node) =>
			node.type !== undefined &&
			node.type !== "UnformattableNode" &&
			!(
				node.type === "LeafNode" &&
				["Token`Whitespace", "Token`Newline"].includes(node.kind)
			),
	},
};

export { options };

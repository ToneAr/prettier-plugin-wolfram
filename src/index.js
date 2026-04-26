// src/index.js
import { options } from "./options.js";
import { KernelBridge } from "./bridge/index.js";
import { printNode } from "./translator/index.js";
import { buildOffsetTable, addOffsets } from "./utils/offsets.js";
import {
	containsCstErrors,
	createUnformattableNode,
} from "./utils/cstErrors.js";
import { preprocessRange } from "./range.js";

const bridge = new KernelBridge();

export const languages = [
	{
		name: "Wolfram Language",
		parsers: ["wolfram"],
		extensions: [".wl", ".wls", ".wlt", ".mt", ".m"],
		vscodeLanguageIds: ["wolfram"],
	},
];

export const parsers = {
	wolfram: {
		parse: async (text, parsedOptions) => {
			const cst = await bridge.getCST(text, parsedOptions);
			if (!cst || containsCstErrors(cst)) {
				return createUnformattableNode(text);
			}
			const table = buildOffsetTable(text, parsedOptions.tabWidth ?? 2);
			return addOffsets(cst, table);
		},
		preprocess: preprocessRange,
		astFormat: "wolfram-cst",
		locStart: (node) => node.locStart,
		locEnd: (node) => node.locEnd,
	},
};

export const printers = {
	"wolfram-cst": {
		print: printNode,
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

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
	buildFormattingEditPlan,
	__test__,
} = require("../../vscode-extension/src/formatting.js");

function makeAst(text, nodes) {
	return {
		type: "ContainerNode",
		children: nodes.map((value) => {
			const locStart = text.indexOf(value);
			return {
				type: "BinaryNode",
				locStart,
				locEnd: locStart + value.length,
				children: [],
			};
		}),
	};
}

describe("VS Code formatting helpers", () => {
	it("returns a full-document replacement for document formatting", async () => {
		const original = "a=1\n";
		const formatted = "a = 1\n";
		const prettier = {
			format: vi.fn().mockResolvedValue(formatted),
		};

		const plan = await buildFormattingEditPlan({
			text: original,
			filePath: "/tmp/test.wl",
			range: undefined,
			prettier,
			resolvedConfig: {},
			plugins: ["/tmp/plugin.js"],
			pluginModule: {},
			positionToOffset: (offset) => offset,
		});

		expect(prettier.format).toHaveBeenCalledWith(
			original,
			expect.objectContaining({
				filepath: "/tmp/test.wl",
				parser: "wolfram",
			}),
		);
		expect(plan).toEqual({
			replaceStart: 0,
			replaceEnd: original.length,
			replacementText: formatted,
		});
	});

	it("maps range formatting onto the same slice produced by full document formatting", async () => {
		const original = "a=1\n" + "\n" + "bb=cc[ d,e]\n" + "\n" + "z=3\n";
		const formatted = "a = 1\n" + "\n" + "bb = cc[d, e]\n" + "\n" + "z = 3\n";
		const parse = vi.fn(async (text) => {
			if (text === original) {
				return makeAst(original, ["a=1", "bb=cc[ d,e]", "z=3"]);
			}

			if (text === formatted) {
				return makeAst(formatted, ["a = 1", "bb = cc[d, e]", "z = 3"]);
			}

			throw new Error(`unexpected text: ${text}`);
		});

		const plan = await buildFormattingEditPlan({
			text: original,
			filePath: "/tmp/test.wl",
			range: {
				start: original.indexOf("cc"),
				end: original.indexOf("d,e") + 1,
			},
			prettier: {
				format: vi.fn().mockResolvedValue(formatted),
			},
			resolvedConfig: {},
			plugins: ["/tmp/plugin.js"],
			pluginModule: {
				parsers: {
					wolfram: { parse },
				},
			},
			positionToOffset: (offset) => offset,
		});

		expect(plan).toEqual({
			replaceStart: 3,
			replaceEnd: 18,
			replacementText: "\n\nbb = cc[d, e]\n\n",
		});
	});

	it("does not replace unselected regions that differ from document formatting", async () => {
		const original = "a=1\n" + "\n" + "bb = cc[d, e]\n" + "\n" + "z=3\n";
		const formatted = "a = 1\n" + "\n" + "bb = cc[d, e]\n" + "\n" + "z = 3\n";
		const parse = vi.fn(async (text) => {
			if (text === original) {
				return makeAst(original, ["a=1", "bb = cc[d, e]", "z=3"]);
			}

			if (text === formatted) {
				return makeAst(formatted, ["a = 1", "bb = cc[d, e]", "z = 3"]);
			}

			throw new Error(`unexpected text: ${text}`);
		});

		const plan = await buildFormattingEditPlan({
			text: original,
			filePath: "/tmp/test.wl",
			range: {
				start: original.indexOf("cc"),
				end: original.indexOf("e]") + 1,
			},
			prettier: {
				format: vi.fn().mockResolvedValue(formatted),
			},
			resolvedConfig: {},
			plugins: ["/tmp/plugin.js"],
			pluginModule: {
				parsers: {
					wolfram: { parse },
				},
			},
			positionToOffset: (offset) => offset,
		});

		expect(plan).toBeNull();
	});

	it("falls back to a full-document replacement when the formatted AST cannot be mapped", async () => {
		const original = "a=1\n\nb=2\n";
		const formatted = "a = 1\n\nb = 2\n";
		const parse = vi.fn(async (text) => {
			if (text === original) {
				return makeAst(original, ["a=1", "b=2"]);
			}

			return makeAst(formatted, ["a = 1"]);
		});

		const plan = await buildFormattingEditPlan({
			text: original,
			filePath: "/tmp/test.wl",
			range: {
				start: original.indexOf("b"),
				end: original.indexOf("2") + 1,
			},
			prettier: {
				format: vi.fn().mockResolvedValue(formatted),
			},
			resolvedConfig: {},
			plugins: ["/tmp/plugin.js"],
			pluginModule: {
				parsers: {
					wolfram: { parse },
				},
			},
			positionToOffset: (offset) => offset,
		});

		expect(plan).toEqual({
			replaceStart: 0,
			replaceEnd: original.length,
			replacementText: formatted,
		});
	});

	it("snaps range selections across enclosing top-level nodes", () => {
		const ast = makeAst("a=1\n\nbb=cc[ d,e]\n\nz=3\n", [
			"a=1",
			"bb=cc[ d,e]",
			"z=3",
		]);

		expect(__test__.snapRangeToTopLevelChildren(ast, 7, 11)).toMatchObject({
			startIndex: 1,
			endIndex: 1,
			rangeStart: 5,
			rangeEnd: 16,
		});
	});
});

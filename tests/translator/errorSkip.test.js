import { beforeEach, describe, expect, it, vi } from "vitest";
import prettier from "prettier";

const { getCST } = vi.hoisted(() => ({
	getCST: vi.fn(),
}));

vi.mock("../../src/bridge/index.js", () => ({
	KernelBridge: class KernelBridge {
		getCST(...args) {
			return getCST(...args);
		}
	},
}));

describe("formatter parse error handling", () => {
	beforeEach(() => {
		vi.resetModules();
		getCST.mockReset();
	});

	it("skips formatting when the CST contains parser error nodes", async () => {
		const source = "a +\n  f[";

		getCST.mockResolvedValue({
			type: "ContainerNode",
			kind: "File",
			source: [
				[1, 1],
				[2, 5],
			],
			children: [
				{
					type: "LeafNode",
					kind: "Symbol",
					value: "a",
					source: [
						[1, 1],
						[1, 2],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Whitespace",
					value: " ",
					source: [
						[1, 2],
						[1, 3],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Plus",
					value: "+",
					source: [
						[1, 3],
						[1, 4],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					value: "\n",
					source: [
						[1, 4],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Whitespace",
					value: "  ",
					source: [
						[2, 1],
						[2, 3],
					],
				},
				{
					type: "Unknown",
					wl: "CodeParser`GroupMissingCloserNode[CodeParser`CallNode[...]]",
				},
			],
		});

		const plugin = await import("../../src/index.js");
		const result = await prettier.format(source, {
			parser: "wolfram",
			plugins: [plugin],
		});

		expect(result).toBe(source);
		expect(result).not.toContain("GroupMissingCloserNode[");
	});
});

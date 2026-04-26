import { describe, expect, it } from "vitest";
import {
	containsCstErrors,
	createUnformattableNode,
	isCstErrorNode,
} from "../../src/utils/cstErrors.js";

describe("cstErrors", () => {
	it("detects unknown CodeParser error nodes", () => {
		expect(
			isCstErrorNode({
				type: "Unknown",
				wl: "CodeParser`GroupMissingCloserNode[CodeParser`CallNode[...]]",
			}),
		).toBe(true);

		expect(
			isCstErrorNode({
				type: "Unknown",
				wl: "CodeParser`ErrorNode[Token`Error`ExpectedOperand, ...]",
			}),
		).toBe(true);
	});

	it("ignores benign unknown placeholders", () => {
		expect(isCstErrorNode({ type: "Unknown", wl: "" })).toBe(false);
		expect(
			isCstErrorNode({
				type: "Unknown",
				wl: "CodeParser`OtherUnsupportedNode[foo, bar]",
			}),
		).toBe(false);
	});

	it("finds nested parser errors anywhere in the tree", () => {
		const tree = {
			type: "ContainerNode",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{
					type: "CallNode",
					head: { type: "LeafNode", kind: "Symbol", value: "g" },
					children: [
						{
							type: "Unknown",
							wl: "CodeParser`GroupMissingCloserNode[CodeParser`LeafNode[...]]",
						},
					],
				},
			],
		};

		expect(containsCstErrors(tree)).toBe(true);
	});

	it("creates a whole-file unformattable node", () => {
		expect(createUnformattableNode("f[")).toEqual({
			type: "UnformattableNode",
			children: [],
			locStart: 0,
			locEnd: 2,
			wl: "f[",
		});
	});
});

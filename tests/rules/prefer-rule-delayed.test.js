// tests/rules/prefer-rule-delayed.test.js
import { describe, it, expect } from "vitest";
import rule from "../../src/rules/prefer-rule-delayed.js";

function makeContext() {
	const reports = [];
	return { reports, report: (d) => reports.push(d) };
}

function makeSetNode(op = "Set") {
	return {
		type: "BinaryNode",
		op,
		children: [
			{
				type: "CallNode",
				head: { type: "LeafNode", kind: "Symbol", value: "f" },
				children: [
					{
						type: "CompoundNode",
						op: "PatternBlank",
						children: [
							{ type: "LeafNode", kind: "Symbol", value: "x" },
							{
								type: "LeafNode",
								kind: "Token`Blank",
								value: "_",
							},
						],
					},
				],
			},
			{
				type: "InfixNode",
				op: "Plus",
				children: [
					{ type: "LeafNode", kind: "Symbol", value: "x" },
					{ type: "LeafNode", kind: "Integer", value: 1 },
				],
			},
		],
	};
}

describe("prefer-rule-delayed", () => {
	it("warns on f[x_] = body when body uses x", () => {
		const ctx = makeContext();
		rule.visit(makeSetNode("Set"), ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/SetDelayed/);
	});

	it("does not warn on f[x_] := body", () => {
		const ctx = makeContext();
		rule.visit(makeSetNode("SetDelayed"), ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("does not warn on x = 1 (no pattern)", () => {
		const ctx = makeContext();
		const node = {
			type: "BinaryNode",
			op: "Set",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Integer", value: 1 },
			],
		};
		rule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});
});

import { describe, it, expect } from "vitest";
import newlinesRule from "../../src/rules/newlines-between-definitions.js";
import spacingRule from "../../src/rules/spacing-operators.js";
import commaRule from "../../src/rules/spacing-commas.js";
import lineWidthRule from "../../src/rules/line-width.js";
import noGeneralInfixFunctionRule from "../../src/rules/no-general-infix-function.js";

function makeContext(options = {}) {
	const reports = [];
	return {
		reports,
		options,
		report: (d) => reports.push(d),
	};
}

const sym = (value) => ({ type: "LeafNode", kind: "Symbol", value });
const token = (kind, value) => ({ type: "LeafNode", kind, value });

function call(head, args = []) {
	return {
		type: "CallNode",
		head: sym(head),
		children: args,
	};
}

function binary(op, lhs, rhs) {
	return {
		type: "BinaryNode",
		op,
		children: [
			lhs,
			op === "BinaryAt"
				? token("Token`At", "@")
				: token("Token`SlashSlash", "//"),
			rhs,
		],
	};
}

function messageName(symbol, name) {
	return {
		type: "InfixNode",
		op: "MessageName",
		children: [
			sym(symbol),
			token("Token`ColonColon", "::"),
			{ type: "LeafNode", kind: "String", value: name },
		],
	};
}

function definition(op, lhs, source) {
	return {
		type: "BinaryNode",
		op,
		source,
		children: [lhs, token("Token`Equal", "="), sym("rhs")],
	};
}

describe("newlines-between-definitions", () => {
	it("requires the blank line above a leading comment block, not between the comment and the definition", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "LeafNode",
					kind: "Token`Comment",
					source: [
						[1, 1],
						[1, 10],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 10],
						[2, 1],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[2, 1],
						[2, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 6],
						[3, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					source: [
						[3, 1],
						[3, 10],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[3, 10],
						[4, 1],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[4, 1],
						[4, 6],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected 1 blank line/);
	});

	it("does not count a leading comment block as the separating blank line when there is already a blank line above it", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 6],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 1],
						[3, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					source: [
						[3, 1],
						[3, 10],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[3, 10],
						[4, 1],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[4, 1],
						[4, 6],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("requires leading comments to sit directly on top of the following statement", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "LeafNode",
					kind: "Token`Comment",
					source: [
						[1, 1],
						[1, 10],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 10],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 1],
						[3, 1],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[3, 1],
						[3, 6],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(
			/Expected 0 blank lines between a leading comment block/,
		);
	});

	it("allows configured blank lines between non-declaration statements", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "CallNode",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 8],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 1],
						[3, 1],
					],
				},
				{
					type: "CallNode",
					source: [
						[3, 1],
						[3, 8],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("caps blank lines between non-declaration statements", () => {
		const ctx = makeContext({ wolframMaxBlankLinesBetweenCode: 1 });
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "CallNode",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 8],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 1],
						[3, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[3, 1],
						[4, 1],
					],
				},
				{
					type: "CallNode",
					source: [
						[4, 1],
						[4, 8],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected 1 blank line/);
	});

	it("supports top-level spacing mode all", () => {
		const ctx = makeContext({ wolframTopLevelSpacingMode: "all" });
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "CallNode",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 8],
						[2, 1],
					],
				},
				{
					type: "CallNode",
					source: [
						[2, 1],
						[2, 8],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected 1 blank line/);
	});

	it("treats same-line comments as trailing on the previous statement", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "CallNode",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "LeafNode",
					kind: "Whitespace",
					source: [
						[1, 8],
						[1, 9],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					source: [
						[1, 9],
						[1, 20],
					],
				},
				{
					type: "LeafNode",
					kind: "Newline",
					source: [
						[1, 20],
						[2, 1],
					],
				},
				{
					type: "CallNode",
					source: [
						[2, 1],
						[2, 8],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("uses the configured blank lines between adjacent definitions", () => {
		const ctx = makeContext({ wolframNewlinesBetweenDefinitions: 2 });
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 6],
						[2, 1],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[2, 1],
						[3, 1],
					],
				},
				{
					type: "BinaryNode",
					op: "SetDelayed",
					source: [
						[3, 1],
						[3, 7],
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected 2 blank lines/);
	});

	it("requires no blank lines between same-name function, option, and attribute definitions", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "CallNode",
					head: sym("SetAttributes"),
					source: [
						[1, 1],
						[1, 26],
					],
					children: [
						sym("f"),
						token("Token`Comma", ","),
						sym("HoldAll"),
					],
				},
				definition("Set", call("Options", [sym("f")]), [
					[3, 1],
					[3, 32],
				]),
				definition(
					"Set",
					binary("BinaryAt", sym("Options"), sym("f")),
					[
						[5, 1],
						[5, 17],
					],
				),
				definition(
					"Set",
					binary("BinarySlashSlash", sym("f"), sym("Options")),
					[
						[7, 1],
						[7, 18],
					],
				),
				definition("Set", call("Attributes", [sym("f")]), [
					[9, 1],
					[9, 26],
				]),
				definition(
					"Set",
					binary("BinaryAt", sym("Attributes"), sym("f")),
					[
						[11, 1],
						[11, 20],
					],
				),
				definition(
					"Set",
					binary("BinarySlashSlash", sym("f"), sym("Attributes")),
					[
						[13, 1],
						[13, 21],
					],
				),
				definition("Set", messageName("f", "usage"), [
					[15, 1],
					[15, 19],
				]),
				definition("Set", messageName("f", "bad"), [
					[17, 1],
					[17, 15],
				]),
				definition("SetDelayed", call("f", [sym("x")]), [
					[19, 1],
					[19, 11],
				]),
				definition(
					"SetDelayed",
					binary("BinaryAt", sym("f"), sym("x")),
					[
						[21, 1],
						[21, 12],
					],
				),
				definition(
					"SetDelayed",
					binary("BinarySlashSlash", sym("x"), sym("f")),
					[
						[23, 1],
						[23, 13],
					],
				),
				definition("SetDelayed", call("f", [sym("y")]), [
					[25, 1],
					[25, 11],
				]),
				definition("SetDelayed", call("g", [sym("x")]), [
					[27, 1],
					[27, 11],
				]),
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(12);
		for (const report of ctx.reports) {
			expect(report.message).toMatch(/Expected 0 blank lines/);
		}
	});

	it("treats semicolon-terminated top-level definitions as adjacent definitions", () => {
		const ctx = makeContext();
		const node = {
			type: "ContainerNode",
			children: [
				{
					type: "InfixNode",
					op: "CompoundExpression",
					source: [
						[1, 1],
						[1, 5],
					],
					children: [
						{
							type: "BinaryNode",
							op: "Set",
							source: [
								[1, 1],
								[1, 4],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Semi",
							source: [
								[1, 4],
								[1, 5],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Fake`ImplicitNull",
							source: [
								[1, 5],
								[1, 5],
							],
						},
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Newline",
					source: [
						[1, 5],
						[2, 1],
					],
				},
				{
					type: "InfixNode",
					op: "CompoundExpression",
					source: [
						[2, 1],
						[2, 5],
					],
					children: [
						{
							type: "BinaryNode",
							op: "SetDelayed",
							source: [
								[2, 1],
								[2, 4],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Semi",
							source: [
								[2, 4],
								[2, 5],
							],
						},
						{
							type: "LeafNode",
							kind: "Token`Fake`ImplicitNull",
							source: [
								[2, 5],
								[2, 5],
							],
						},
					],
				},
			],
		};

		newlinesRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected 1 blank line/);
	});
});

describe("spacing-operators", () => {
	it("does not warn when operator breaks across lines with newline trivia", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "BinaryNode",
			op: "SetDelayed",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Token`Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`ColonEqual", value: ":=" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "LeafNode", kind: "Symbol", value: "rhs" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("warns on truly missing operator spaces", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "InfixNode",
			op: "Plus",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Plus", value: "+" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(
			/Expected spaces around operator/,
		);
	});

	it("does not treat semicolons as spacing operators", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("does not require spaces around tight operators like ::", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "InfixNode",
			op: "MessageName",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Token`ColonColon", value: "::" },
				{ type: "LeafNode", kind: "String", value: "usage" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("does not require spaces around pattern blank tokens", () => {
		const blankTokens = [
			["Token`Under", "_"],
			["Token`Blank", "_"],
			["Token`UnderUnder", "__"],
			["Token`UnderUnderUnder", "___"],
		];

		for (const [kind, value] of blankTokens) {
			const ctx = makeContext({ wolframSpaceAroundOperators: true });
			const node = {
				type: "BinaryNode",
				op: "SetDelayed",
				children: [
					{ type: "LeafNode", kind: "Symbol", value: "x" },
					{ type: "LeafNode", kind, value },
					{ type: "LeafNode", kind: "Token`Whitespace", value: " " },
					{ type: "LeafNode", kind: "Token`ColonEqual", value: ":=" },
					{ type: "LeafNode", kind: "Token`Whitespace", value: " " },
					{ type: "LeafNode", kind: "Symbol", value: "rhs" },
				],
			};

			spacingRule.visit(node, ctx);
			expect(ctx.reports, value).toHaveLength(0);
		}
	});

	it("warns when tight binary operators are spaced out", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "BinaryNode",
			op: "PatternTest",
			children: [
				{ type: "LeafNode", kind: "CompoundNode", value: "x_" },
				{ type: "LeafNode", kind: "Token`Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`Question", value: "?" },
				{ type: "LeafNode", kind: "Token`Whitespace", value: " " },
				{ type: "LeafNode", kind: "Symbol", value: "NumericQ" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(
			/Expected no spaces around operator/,
		);
	});

	it("does not warn on compact span operators", () => {
		const cases = [
			[
				";;",
				[
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitOne",
						value: "",
					},
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitAll",
						value: "",
					},
				],
			],
			[
				";;3",
				[
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitOne",
						value: "",
					},
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{ type: "LeafNode", kind: "Integer", value: "3" },
				],
			],
			[
				"1;;",
				[
					{ type: "LeafNode", kind: "Integer", value: "1" },
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{
						type: "LeafNode",
						kind: "Token`Fake`ImplicitAll",
						value: "",
					},
				],
			],
			[
				"1;;3",
				[
					{ type: "LeafNode", kind: "Integer", value: "1" },
					{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
					{ type: "LeafNode", kind: "Integer", value: "3" },
				],
			],
		];

		for (const [label, children] of cases) {
			const ctx = makeContext({ wolframSpaceAroundOperators: true });
			spacingRule.visit(
				{ type: "BinaryNode", op: "Span", children },
				ctx,
			);
			expect(ctx.reports, label).toHaveLength(0);
		}
	});

	it("treats ;; as compact even if the enclosing node op is unexpected", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "BinaryNode",
			op: "Unknown",
			children: [
				{ type: "LeafNode", kind: "Integer", value: "1" },
				{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
				{ type: "LeafNode", kind: "Integer", value: "3" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("warns when span operators are spaced out", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "BinaryNode",
			op: "Span",
			children: [
				{ type: "LeafNode", kind: "Integer", value: "1" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Integer", value: "3" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(
			/Expected no spaces around operator ";;"/,
		);
	});

	it("does not report direct-comment operator nodes that the formatter preserves", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "BinaryNode",
			op: "Span",
			children: [
				{ type: "LeafNode", kind: "Integer", value: "1" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* keep *)",
				},
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`SemiSemi", value: ";;" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Integer", value: "3" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("checks ternary infix operator spacing", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(
			/Expected spaces around operator "~"/,
		);
	});

	it("ignores trailing comments inside compound expressions", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "InfixNode",
			op: "CompoundExpression",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "operation" },
				{ type: "LeafNode", kind: "Token`Semi", value: ";" },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* keep me *)",
				},
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("ignores slot hashes inside comma-separated pure function arguments", () => {
		const ctx = makeContext({ wolframSpaceAroundOperators: true });
		const node = {
			type: "InfixNode",
			op: "Comma",
			children: [
				{ type: "LeafNode", kind: "Token`Hash", value: "#" },
				{ type: "LeafNode", kind: "Integer", value: "1" },
				{ type: "LeafNode", kind: "Token`Comma", value: "," },
				{ type: "LeafNode", kind: "Whitespace", value: " " },
				{ type: "LeafNode", kind: "Token`Hash", value: "#" },
				{ type: "LeafNode", kind: "Integer", value: "2" },
			],
		};

		spacingRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});
});

describe("spacing-commas", () => {
	it("warns when a comma is not followed by a space", () => {
		const ctx = makeContext({ wolframSpaceAfterComma: true });
		const node = {
			type: "InfixNode",
			op: "Comma",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Comma", value: "," },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};

		commaRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/Expected a space after comma/);
	});

	it("does not warn when a comma is followed by a newline", () => {
		const ctx = makeContext({ wolframSpaceAfterComma: true });
		const node = {
			type: "InfixNode",
			op: "Comma",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "a" },
				{ type: "LeafNode", kind: "Token`Comma", value: "," },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "LeafNode", kind: "Symbol", value: "b" },
			],
		};

		commaRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});
});

describe("line-width", () => {
	it("warns on lines exceeding printWidth", () => {
		const ctx = makeContext({
			printWidth: 10,
			__sourceText: "short\nthis line is too long\n",
		});
		lineWidthRule.visit({ type: "ContainerNode" }, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/printWidth/);
	});

	it("does not warn when only a comment exceeds printWidth", () => {
		const ctx = makeContext({
			printWidth: 10,
			__sourceText:
				"short\n(* this comment line is intentionally very long *)\n",
		});
		lineWidthRule.visit({ type: "ContainerNode" }, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("does not warn when a trailing comment exceeds printWidth but the code does not", () => {
		const ctx = makeContext({
			printWidth: 10,
			__sourceText:
				"x = 1 (* this trailing comment is intentionally very long *)\n",
		});
		lineWidthRule.visit({ type: "ContainerNode" }, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("still warns when code exceeds printWidth before a trailing comment and highlights only the code overflow", () => {
		const ctx = makeContext({
			printWidth: 10,
			__sourceText: "abcdefghijkl (* note *)\n",
		});
		lineWidthRule.visit({ type: "ContainerNode" }, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].node.source).toEqual([
			[1, 11],
			[1, 13],
		]);
	});
});

describe("no-general-infix-function", () => {
	it("warns on general ~f~ infix syntax", () => {
		const ctx = makeContext();
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "f" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};

		noGeneralInfixFunctionRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(1);
		expect(ctx.reports[0].message).toMatch(/fully qualified call syntax/);
	});

	it("does not warn on preserved infix operators like ~Join~", () => {
		const ctx = makeContext();
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "Join" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};

		noGeneralInfixFunctionRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});

	it("respects configurable preserved ~f~ infix heads", () => {
		const ctx = makeContext({
			wolframPreserveTildeInfixFunctions: "Join,CustomOp",
		});
		const node = {
			type: "TernaryNode",
			op: "TernaryTilde",
			children: [
				{ type: "LeafNode", kind: "Symbol", value: "x" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "CustomOp" },
				{ type: "LeafNode", kind: "Token`Tilde", value: "~" },
				{ type: "LeafNode", kind: "Symbol", value: "y" },
			],
		};

		noGeneralInfixFunctionRule.visit(node, ctx);
		expect(ctx.reports).toHaveLength(0);
	});
});

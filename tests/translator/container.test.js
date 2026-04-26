import { describe, it, expect } from "vitest";
import prettier from "prettier";
import { printContainer } from "../../src/translator/nodes/container.js";
import { printInfix } from "../../src/translator/nodes/infix.js";
import { documentationCommentColumn } from "../../src/translator/docComments.js";

function fmt(doc) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth: 80,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
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

function definition(op, lhs, value, source) {
	return {
		type: "BinaryNode",
		op,
		value,
		source,
		children: [lhs, token("Token`Equal", "="), sym("rhs")],
	};
}

describe("printContainer", () => {
	it("keeps leading comments attached to the following declaration and inserts blank lines above the comment block", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{ type: "LeafNode", kind: "Token`Comment", value: "(* c1 *)" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "BinaryNode", op: "Set", value: "a = 1" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "LeafNode", kind: "Token`Comment", value: "(* c2 *)" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "BinaryNode", op: "SetDelayed", value: "b := 2" },
				{ type: "LeafNode", kind: "Token`Newline", value: "\n" },
				{ type: "CallNode", value: "Print[x]" },
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(printContainer(node, {}, print));

		expect(out).toBe("(* c1 *)\na = 1\n\n(* c2 *)\nb := 2\nPrint[x]");
	});

	it("removes blank lines between a leading comment block and the following definition", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{ type: "BinaryNode", op: "Set", value: "a = 1" },
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* docs *)",
				},
				{ type: "BinaryNode", op: "SetDelayed", value: "b := 2" },
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(printContainer(node, {}, print));

		expect(out).toBe("a = 1\n\n(* docs *)\nb := 2");
	});

	it("aligns trailing documentation comments in a contiguous block", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					value: "a = 1",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* first *)",
					source: [
						[1, 8],
						[1, 19],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					value: "longName = 2",
					source: [
						[2, 1],
						[2, 13],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* second *)",
					source: [
						[2, 15],
						[2, 27],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(printContainer(node, { printWidth: 10 }, print));

		expect(out).toBe(
			"a = 1         (* first *)\n\nlongName = 2  (* second *)",
		);
	});

	it("honors manual documentation comment columns below line width", () => {
		const entries = [{ doc: "a = 1", trailingCommentDoc: "(* c *)" }];
		expect(
			documentationCommentColumn(entries, {
				printWidth: 20,
				wolframDocumentationCommentColumn: 5,
			}),
		).toBe(5);
	});

	it("places same-line documentation comments at the configured column", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					value: "a = 1",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* first *)",
					source: [
						[1, 8],
						[1, 19],
					],
				},
				{
					type: "BinaryNode",
					op: "Set",
					value: "longName = 2",
					source: [
						[2, 1],
						[2, 13],
					],
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* second *)",
					source: [
						[2, 15],
						[2, 27],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(
			printContainer(
				node,
				{
					printWidth: 80,
					wolframDocumentationCommentColumn: 20,
				},
				print,
			),
		);

		expect(out).toBe(
			"a = 1               (* first *)\n\nlongName = 2        (* second *)",
		);
	});

	it("keeps offset-only same-line comments in the documentation comment column", () => {
		const source =
			"a = 1;(* doc *)\n" +
			"b = 2";
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					value: "a = 1;",
					locStart: 0,
					locEnd: 6,
				},
				{
					type: "LeafNode",
					kind: "Token`Comment",
					value: "(* doc *)",
					locStart: 6,
					locEnd: 15,
				},
				{
					type: "BinaryNode",
					op: "Set",
					value: "b = 2",
					locStart: 16,
					locEnd: 21,
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(
			printContainer(
				node,
				{
					originalText: source,
					wolframDocumentationCommentColumn: 12,
				},
				print,
			),
		);

		expect(out).toBe("a = 1;      (* doc *)\n\nb = 2");
	});

	it("supports top-level spacing mode none", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{ type: "BinaryNode", op: "Set", value: "a = 1" },
				{ type: "BinaryNode", op: "SetDelayed", value: "b := 2" },
			],
		};
		const print = (child) => String(child.value ?? "");
		const out = fmt(
			printContainer(node, { wolframTopLevelSpacingMode: "none" }, print),
		);
		expect(out).toBe("a = 1\nb := 2");
	});

	it("preserves configured blank lines between non-definition top-level code", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "CallNode",
					value: "Print[a]",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "CallNode",
					value: "Print[b]",
					source: [
						[3, 1],
						[3, 8],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(printContainer(node, {}, print));

		expect(out).toBe("Print[a]\n\nPrint[b]");
	});

	it("caps blank lines between non-definition top-level code", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "CallNode",
					value: "Print[a]",
					source: [
						[1, 1],
						[1, 8],
					],
				},
				{
					type: "CallNode",
					value: "Print[b]",
					source: [
						[5, 1],
						[5, 8],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(
			printContainer(node, { wolframMaxBlankLinesBetweenCode: 2 }, print),
		);

		expect(out).toBe("Print[a]\n\n\nPrint[b]");
	});

	it("uses the definition spacing option between adjacent definitions", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "BinaryNode",
					op: "Set",
					value: "a = 1",
					source: [
						[1, 1],
						[1, 6],
					],
				},
				{
					type: "BinaryNode",
					op: "SetDelayed",
					value: "b := 2",
					source: [
						[2, 1],
						[2, 7],
					],
				},
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(
			printContainer(
				node,
				{ wolframNewlinesBetweenDefinitions: 2 },
				print,
			),
		);

		expect(out).toBe("a = 1\n\n\nb := 2");
	});

	it("does not insert blank lines between same-name function, option, and attribute definitions", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "CallNode",
					head: sym("SetAttributes"),
					value: "SetAttributes[f, HoldAll]",
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
				definition(
					"Set",
					call("Options", [sym("f")]),
					"Options[f] = {opt -> Automatic}",
					[
						[4, 1],
						[4, 32],
					],
				),
				definition(
					"Set",
					call("Attributes", [sym("f")]),
					"Attributes[f] = {HoldAll}",
					[
						[7, 1],
						[7, 26],
					],
				),
				definition("SetDelayed", call("f", [sym("x")]), "f[x_] := x", [
					[10, 1],
					[10, 11],
				]),
				definition("SetDelayed", call("f", [sym("y")]), "f[y_] := y", [
					[13, 1],
					[13, 11],
				]),
				definition("SetDelayed", call("g", [sym("x")]), "g[x_] := x", [
					[14, 1],
					[14, 11],
				]),
			],
		};

		const print = (child) => String(child.value ?? "");
		const out = fmt(printContainer(node, {}, print));

		expect(out).toBe(
			"SetAttributes[f, HoldAll]\n" +
				"Options[f] = {opt -> Automatic}\n" +
				"Attributes[f] = {HoldAll}\n" +
				"f[x_] := x\n" +
				"f[y_] := y\n\n" +
				"g[x_] := x",
		);
	});

	it("treats semicolon-terminated top-level definitions as definitions for spacing", () => {
		const node = {
			type: "ContainerNode",
			kind: "String",
			children: [
				{
					type: "InfixNode",
					op: "CompoundExpression",
					value: "a = 1",
					source: [
						[1, 1],
						[1, 5],
					],
					children: [
						{ type: "BinaryNode", op: "Set", value: "a = 1" },
						{ type: "LeafNode", kind: "Token`Semi", value: ";" },
						{
							type: "LeafNode",
							kind: "Token`Fake`ImplicitNull",
							value: "",
						},
					],
				},
				{
					type: "InfixNode",
					op: "CompoundExpression",
					value: "b := 2",
					source: [
						[2, 1],
						[2, 6],
					],
					children: [
						{
							type: "BinaryNode",
							op: "SetDelayed",
							value: "b := 2",
						},
						{ type: "LeafNode", kind: "Token`Semi", value: ";" },
						{
							type: "LeafNode",
							kind: "Token`Fake`ImplicitNull",
							value: "",
						},
					],
				},
			],
		};

		const print = (child) => {
			if (child.type === "InfixNode") return printInfix(child, {}, print);
			return String(child.value ?? "");
		};
		const out = fmt(printContainer(node, {}, print));

		expect(out).toBe("a = 1;\n\nb := 2;");
	});
});

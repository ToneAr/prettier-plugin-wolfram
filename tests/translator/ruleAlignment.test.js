import { describe, expect, it } from "vitest";
import prettier from "prettier";
import { printNode } from "../../src/translator/index.js";
import { printCall } from "../../src/translator/nodes/call.js";
import { printGroup } from "../../src/translator/nodes/group.js";

const baseOptions = {
	wolframAlignRuleValues: true,
	wolframSpaceAfterComma: true,
	wolframSpaceAroundOperators: true,
	printWidth: 80,
	tabWidth: 2,
};

function fmt(doc, printWidth = 80) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
}

function makePath(root, options) {
	function at(node) {
		return {
			getValue: () => node,
			call: (print, ...keys) => {
				let cur = node;
				for (const key of keys) cur = cur[key];
				return print(at(cur), options, print);
			},
		};
	}
	return at(root);
}

function leaf(kind, value) {
	return { type: "LeafNode", kind, value };
}

function comma() {
	return leaf("Token`Comma", ",");
}

function rule(lhs, rhs, op = "Rule") {
	return {
		type: "BinaryNode",
		op,
		children: [
			lhs,
			leaf(
				op === "RuleDelayed"
					? "Token`ColonGreater"
					: "Token`MinusGreater",
				op === "RuleDelayed" ? ":>" : "->",
			),
			rhs,
		],
	};
}

function commaSequence(entries) {
	return {
		type: "InfixNode",
		op: "Comma",
		children: entries.flatMap((entry, index) =>
			index === 0 ? [entry] : [comma(), entry],
		),
	};
}

function association(entries) {
	return {
		type: "GroupNode",
		kind: "Association",
		children: [
			leaf("Token`LessBar", "<|"),
			commaSequence(entries),
			leaf("Token`BarGreater", "|>"),
		],
	};
}

function call(entries) {
	return {
		type: "CallNode",
		head: leaf("Symbol", "f"),
		children: [
			leaf("Token`OpenSquare", "["),
			commaSequence(entries),
			leaf("Token`CloseSquare", "]"),
		],
	};
}

describe("rule value alignment", () => {
	it("aligns association rule values only when the group breaks", () => {
		const node = association([
			rule(leaf("String", '"URL"'), leaf("Integer", "1")),
			rule(leaf("String", '"Title"'), leaf("Integer", "2")),
			rule(leaf("String", '"Content"'), leaf("Integer", "3")),
		]);
		const path = makePath(node, baseOptions);
		const doc = printGroup(path, baseOptions, printNode, node);

		expect(fmt(doc, 80)).toBe(
			'<|"URL" -> 1, "Title" -> 2, "Content" -> 3|>',
		);
		expect(fmt(doc, 24)).toBe(
			"<|\n" +
				'  "URL"     -> 1,\n' +
				'  "Title"   -> 2,\n' +
				'  "Content" -> 3\n' +
				"|>",
		);
	});

	it("aligns rule values in multiline calls", () => {
		const node = call([
			rule(leaf("Symbol", "short"), leaf("Integer", "1")),
			rule(leaf("Symbol", "longer"), leaf("Integer", "2"), "RuleDelayed"),
			rule(leaf("Symbol", "longest"), leaf("Integer", "3")),
		]);
		const path = makePath(node, baseOptions);
		const doc = printCall(path, baseOptions, printNode, node);

		expect(fmt(doc, 20)).toBe(
			"f[\n" +
				"  short   -> 1,\n" +
				"  longer  :> 2,\n" +
				"  longest -> 3\n" +
				"]",
		);
	});
});

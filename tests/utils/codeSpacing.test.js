import { describe, expect, it } from "vitest";
import { blankLinesForCodeGap } from "../../src/utils/codeSpacing.js";

const sym = (value) => ({ type: "LeafNode", kind: "Symbol", value });
const token = (kind, value) => ({ type: "LeafNode", kind, value });

function call(head, args = []) {
	return {
		type: "CallNode",
		head: sym(head),
		children: args,
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

function definition(op, lhs = sym("lhs")) {
	return {
		type: "BinaryNode",
		op,
		children: [lhs, token("Token`Equal", "="), sym("rhs")],
	};
}

describe("definition spacing options", () => {
	it("inherits the general definition spacing when specific options are unset", () => {
		const options = { wolframNewlinesBetweenDefinitions: 2 };

		expect(
			blankLinesForCodeGap(
				definition("Set"),
				definition("Set"),
				0,
				options,
			),
		).toBe(2);
		expect(
			blankLinesForCodeGap(
				definition("SetDelayed"),
				definition("SetDelayed"),
				0,
				options,
			),
		).toBe(2);
		expect(
			blankLinesForCodeGap(
				definition("Set"),
				definition("SetDelayed"),
				0,
				options,
			),
		).toBe(2);
	});

	it("uses pair-specific spacing for Set and SetDelayed definitions", () => {
		const options = {
			wolfram: {
				newlinesBetweenDefinitions: 3,
				newlinesBetweenSetDefinitions: 0,
				newlinesBetweenSetDelayedDefinitions: 1,
				newlinesBetweenSetAndSetDelayedDefinitions: 2,
			},
		};

		expect(
			blankLinesForCodeGap(
				definition("Set"),
				definition("Set"),
				0,
				options,
			),
		).toBe(0);
		expect(
			blankLinesForCodeGap(
				definition("SetDelayed"),
				definition("SetDelayed"),
				0,
				options,
			),
		).toBe(1);
		expect(
			blankLinesForCodeGap(
				definition("Set"),
				definition("SetDelayed"),
				0,
				options,
			),
		).toBe(2);
		expect(
			blankLinesForCodeGap(
				definition("SetDelayed"),
				definition("Set"),
				0,
				options,
			),
		).toBe(2);
	});

	it("applies Set-family options to TagSet, UpSet, and delayed variants", () => {
		const options = {
			wolframNewlinesBetweenDefinitions: 3,
			wolframNewlinesBetweenSetDefinitions: 0,
			wolframNewlinesBetweenSetDelayedDefinitions: 1,
			wolframNewlinesBetweenSetAndSetDelayedDefinitions: 2,
		};

		expect(
			blankLinesForCodeGap(
				definition("TagSet"),
				definition("UpSet"),
				0,
				options,
			),
		).toBe(0);
		expect(
			blankLinesForCodeGap(
				definition("TagSetDelayed"),
				definition("UpSetDelayed"),
				0,
				options,
			),
		).toBe(1);
		expect(
			blankLinesForCodeGap(
				definition("TagSet"),
				definition("UpSetDelayed"),
				0,
				options,
			),
		).toBe(2);
	});

	it("uses same-name definition spacing independently of Set/SetDelayed overrides", () => {
		const usage = definition("Set", messageName("f", "usage"));
		const overload = definition("SetDelayed", call("f", [sym("x")]));

		expect(blankLinesForCodeGap(usage, overload, 3, {})).toBe(0);
		expect(
			blankLinesForCodeGap(usage, overload, 3, {
				wolframNewlinesBetweenSetAndSetDelayedDefinitions: 1,
			}),
		).toBe(0);
		expect(
			blankLinesForCodeGap(usage, overload, 3, {
				wolfram: { newlinesBetweenSameNameDefinitions: 2 },
			}),
		).toBe(2);
	});
});

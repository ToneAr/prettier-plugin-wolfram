// tests/translator/specialForms.test.js
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import prettier from "prettier";
import {
	getSpecialPrinter,
	buildDispatchSets,
} from "../../src/translator/specialForms.js";

const require = createRequire(import.meta.url);
const ifFixture = require("../fixtures/if-simple.json");

function fmt(doc, width = 80) {
	return prettier.doc.printer.printDocToString(doc, {
		printWidth: width,
		tabWidth: 2,
		useTabs: false,
	}).formatted;
}

const opts = {
	wolframSpaceAfterComma: true,
	tabWidth: 2,
	wolframModuleVarsBreakThreshold: 40,
	wolframConditionFirstFunctions: "If,Switch",
	wolframBlockStructureFunctions: "Module,With,Block,DynamicModule",
	wolframCaseStructureFunctions: "Which",
};

/** Create a mock prettier path rooted at `root` that supports path.call(print, ...keys). */
function makePath(root, options = opts) {
	function makePathAt(node) {
		return {
			getValue: () => node,
			call: (print, ...keys) => {
				let cur = node;
				for (const key of keys) cur = cur[key];
				return print(makePathAt(cur), options, print);
			},
		};
	}
	return makePathAt(root);
}

const mockPrint = (path, options, _print) => {
	const node = path.getValue();
	if (node.type === "LeafNode") return String(node.value);
	if (node.type === "InfixNode") return "x > 0";
	if (node.type === "PrefixNode") return "-x";
	if (node.type === "CallNode") {
		const printer = getSpecialPrinter(node, options);
		if (printer) return printer(path, options, mockPrint, node);
	}
	return "EXPR";
};

describe("getSpecialPrinter", () => {
	it("uses documented special-form defaults when options are missing", () => {
		const sets = buildDispatchSets({});

		expect(sets.conditionFirst).toEqual(new Set(["If", "Switch"]));
		expect(sets.blockStructure).toEqual(
			new Set(["Module", "With", "Block", "DynamicModule"]),
		);
		expect(sets.caseStructure).toEqual(new Set(["Which"]));
	});

	it("returns printConditionFirst for If", () => {
		const callNode = ifFixture.children[0];
		expect(getSpecialPrinter(callNode, opts)).toBeTruthy();
	});

	it("respects explicit special-form option overrides", () => {
		const callNode = ifFixture.children[0];
		expect(
			getSpecialPrinter(callNode, {
				...opts,
				wolframConditionFirstFunctions: "",
			}),
		).toBeNull();
	});

	it("returns null for unknown function", () => {
		const node = {
			type: "CallNode",
			head: { type: "LeafNode", kind: "Symbol", value: "MyFn" },
			children: [],
		};
		expect(getSpecialPrinter(node, opts)).toBeNull();
	});
});

describe("printConditionFirst (If)", () => {
	it("stays inline when it fits within printWidth", () => {
		const ifNode = ifFixture.children[0];
		const printer = getSpecialPrinter(ifNode, opts);
		const path = makePath(ifNode);
		const doc = printer(path, opts, mockPrint, ifNode);
		const result = fmt(doc, 80);
		expect(result.trim()).toBe("If[x > 0, x, -x]");
	});

	it("keeps condition on same line, breaks remaining args", () => {
		const ifNode = ifFixture.children[0];
		const printer = getSpecialPrinter(ifNode, opts);
		const path = makePath(ifNode);
		const doc = printer(path, opts, mockPrint, ifNode);
		const result = fmt(doc, 10); // force break
		expect(result).toBe("If[x > 0,\n  x,\n  -x\n]");
	});
});

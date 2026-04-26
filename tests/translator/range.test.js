// tests/translator/range.test.js
import { describe, it, expect } from "vitest";
import { preprocessRange } from "../../src/range.js";

// ---------------------------------------------------------------------------
// Build a mock ContainerNode AST from a source string and a list of
// {start, end} byte-offset spans representing top-level children.
// ---------------------------------------------------------------------------
function makeAST(childSpans) {
	return {
		type: "ContainerNode",
		kind: "String",
		source: [
			[1, 1],
			[1, 1],
		],
		locStart: 0,
		locEnd: 999,
		children: childSpans.map(({ start, end }, i) => ({
			type: "BinaryNode",
			op: "SetDelayed",
			source: [
				[1, 1],
				[1, 1],
			],
			locStart: start,
			locEnd: end,
			children: [],
		})),
	};
}

describe("preprocessRange", () => {
	const spans = [
		{ start: 0, end: 20 }, // definition 0
		{ start: 22, end: 45 }, // definition 1
		{ start: 47, end: 70 }, // definition 2
		{ start: 72, end: 100 }, // definition 3
	];
	const ast = makeAST(spans);

	it("does nothing when range covers whole file", () => {
		const opts = { rangeStart: 0, rangeEnd: Infinity };
		preprocessRange(ast, opts);
		expect(opts.rangeStart).toBe(0);
		expect(opts.rangeEnd).toBe(Infinity);
	});

	it("snaps a mid-definition selection to the enclosing definition", () => {
		// Selection lands in the middle of definition 1 (bytes 22–45)
		const opts = { rangeStart: 30, rangeEnd: 40 };
		preprocessRange(ast, opts);
		expect(opts.rangeStart).toBe(22);
		expect(opts.rangeEnd).toBe(45);
	});

	it("snaps a multi-definition selection to the outermost boundaries", () => {
		// Selection spans from inside def 1 to inside def 2
		const opts = { rangeStart: 30, rangeEnd: 60 };
		preprocessRange(ast, opts);
		expect(opts.rangeStart).toBe(22); // start of def 1
		expect(opts.rangeEnd).toBe(70); // end of def 2
	});

	it("snaps a selection at the very start to the first definition", () => {
		const opts = { rangeStart: 0, rangeEnd: 10 };
		preprocessRange(ast, opts);
		expect(opts.rangeStart).toBe(0);
		expect(opts.rangeEnd).toBe(20);
	});

	it("snaps a selection at the very end to the last definition", () => {
		const opts = { rangeStart: 80, rangeEnd: 100 };
		preprocessRange(ast, opts);
		expect(opts.rangeStart).toBe(72);
		expect(opts.rangeEnd).toBe(100);
	});

	it("handles an empty children list without throwing", () => {
		const emptyAST = {
			type: "ContainerNode",
			children: [],
			locStart: 0,
			locEnd: 0,
		};
		const opts = { rangeStart: 5, rangeEnd: 15 };
		expect(() => preprocessRange(emptyAST, opts)).not.toThrow();
		// opts unchanged since no children
		expect(opts.rangeStart).toBe(5);
		expect(opts.rangeEnd).toBe(15);
	});

	it("ignores whitespace/newline LeafNodes when snapping", () => {
		const astWithWS = {
			type: "ContainerNode",
			children: [
				{
					type: "LeafNode",
					kind: "Token`Newline",
					locStart: 20,
					locEnd: 21,
				},
				{
					type: "BinaryNode",
					op: "SetDelayed",
					locStart: 22,
					locEnd: 45,
					children: [],
				},
				{
					type: "LeafNode",
					kind: "Token`Whitespace",
					locStart: 45,
					locEnd: 47,
				},
				{
					type: "BinaryNode",
					op: "SetDelayed",
					locStart: 47,
					locEnd: 70,
					children: [],
				},
			],
		};
		const opts = { rangeStart: 30, rangeEnd: 60 };
		preprocessRange(astWithWS, opts);
		expect(opts.rangeStart).toBe(22);
		expect(opts.rangeEnd).toBe(70);
	});
});

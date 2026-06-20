import { describe, it, expect } from "vitest";
import { makeLineIndex, offsetToLineCol, nodeSource } from "../../src/parser/position.js";

describe("position", () => {
	it("maps offsets to 1-based line/col", () => {
		const idx = makeLineIndex("ab\ncde");
		expect(offsetToLineCol(idx, 0)).toEqual([1, 1]);
		expect(offsetToLineCol(idx, 2)).toEqual([1, 3]);
		expect(offsetToLineCol(idx, 3)).toEqual([2, 1]);
		expect(offsetToLineCol(idx, 5)).toEqual([2, 3]);
	});
	it("builds CodeParser source from a node-like object", () => {
		const idx = makeLineIndex("f[x]");
		expect(nodeSource({ startIndex: 0, endIndex: 1 }, idx)).toEqual([[1, 1], [1, 2]]);
	});
});

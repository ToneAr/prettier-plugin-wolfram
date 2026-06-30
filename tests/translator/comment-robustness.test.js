// tests/translator/comment-robustness.test.js
//
// A comment placed anywhere inside a wrapping expression must not break the
// surrounding formatting: it must survive the round-trip and the output must be
// idempotent (formatting an already-formatted document is a no-op). This guards
// against the class of bug where code filters a node's children and assumes a
// fixed structure (e.g. "the sole content is one InfixNode[Comma]") that a
// sibling comment violates.
import { describe, it, expect } from "vitest";
import prettier from "prettier";
import * as plugin from "../../src/index.js";

function format(source, printWidth = 30) {
	return prettier.format(source, {
		parser: "wolfram",
		plugins: [plugin],
		wolframAlignRuleValues: true,
		wolframSpaceAfterComma: true,
		wolframSpaceAroundOperators: true,
		printWidth,
		tabWidth: 2,
		useTabs: false,
	});
}

function commentCount(text) {
	return (text.match(/\(\*/g) ?? []).length;
}

// [label, source, expectedComments, printWidth]
const cases = [
	["list, leading comment", "{\n(* c *)\na -> 1,\nbb -> 2\n}", 1, 30],
	["list, trailing comment", "{\na -> 1,\nbb -> 2\n(* c *)\n}", 1, 30],
	["list, two leading comments", "{\n(* a *)\n(* b *)\nx -> 1,\ny -> 2\n}", 2, 30],
	["association, leading comment", '<|\n(* c *)\n"a" -> 1,\n"bb" -> 2\n|>', 1, 30],
	["association, mid comment", '<|\n"a" -> 1,\n(* c *)\n"bb" -> 2\n|>', 1, 30],
	["association, trailing comment", '<|"a" -> 1,\n"bb" -> 2\n(* c *)\n|>', 1, 30],
	["call, leading comment", "f[\n(* c *)\na,\nb\n]", 1, 20],
	["call, leading and trailing comments", "f[\n(* a *)\nx,\ny\n(* b *)\n]", 2, 20],
	["Module var list, leading comment", "Module[{\n(* c *)\nxxxx = 1,\ny = 2\n}, x + y]", 1, 40],
	["With var list, mid comment", "With[{aaaa = 1,\n(* c *)\nb = 2}, body]", 1, 40],
	["If, comments on both branches", "If[cond,\n(* then *)\na,\n(* else *)\nb]", 2, 30],
	["Which, leading comment", "Which[\n(* c *)\naaa, 1,\nb, 2]", 1, 30],
	["nested list in call, leading comment", "g[<|\n(* c *)\n\"a\" -> 1,\n\"bb\" -> 2\n|>]", 1, 30],
	["binary rhs comment", "x =\n(* c *)\n5", 1, 20],
	["compound expression comment", "a;\n(* c *)\nb;\nc", 1, 20],
	["part, leading comment", "m[[(* c *) 1, 2]]", 1, 30],
	["part, trailing comment", "m[[1, 2 (* c *)]]", 1, 30],
	["span, interior comment", "a ;; (* c *) b", 1, 30],
	["nested span, interior comment", "a ;; b ;; (* c *) d", 1, 30],
	["span inside part, interior comment", "x[[2 ;; (* end *) 5]]", 1, 30],
	["get, interior comment", "<< (* c *) pkg", 1, 40],
	["put, interior comment", 'expr >> (* c *) "f.txt"', 1, 40],
	["putappend, interior comment", 'expr >>> (* c *) "f.txt"', 1, 40],
	["message name, interior comment", "f (* c *) ::usage", 1, 40],
];

describe("comments do not break wrapping-expression formatting", () => {
	it.each(cases)(
		"preserves the comment and is idempotent: %s",
		async (_label, source, expectedComments, printWidth) => {
			const once = await format(source, printWidth);
			const twice = await format(once, printWidth);

			expect(commentCount(once)).toBe(expectedComments);
			expect(twice).toBe(once);
		},
	);
});

// A comment between a span's `;;` and an operand previously collapsed the whole
// span to the implicit `1 ;; All` default, silently deleting both operands. A
// comment inside `[[...]]` was likewise dropped. These assert the operands
// survive intact.
const operandCases = [
	["span interior comment keeps operands", "a ;; (* c *) b", ["a", "b"]],
	["nested span comment keeps operands", "a ;; b ;; (* c *) d", ["a", "b", "d"]],
	["part comment keeps operands", "m[[(* c *) 1, 2]]", ["1", "2"]],
	["span-in-part comment keeps operands", "x[[2 ;; (* end *) 5]]", ["2", "5"]],
];

describe("comments do not corrupt span/part operands", () => {
	it.each(operandCases)("%s", async (_label, source, operands) => {
		const out = await format(source, 80);
		for (const operand of operands) {
			expect(out).toContain(operand);
		}
		// The implicit-default corruption replaced operands with `1 ;; All`.
		expect(out).not.toBe("1;;All");
	});
});

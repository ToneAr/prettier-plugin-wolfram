import { describe, expect, it } from "vitest";
import prettier from "prettier";
import * as plugin from "../../src/index.js";

function format(source, options = {}) {
	return prettier.format(source, {
		parser: "wolfram",
		plugins: [plugin],
		filepath: "test.wl",
		...options,
	});
}

describe("top-level semicolon formatting", () => {
	it("inserts definition spacing in semicolon chains without a final semicolon", async () => {
		const out = await format("a=1;\nb:=2");

		expect(out).toBe("a = 1;\n\nb := 2");
	});

	it("keeps standalone inter-definition comments attached to the next definition", async () => {
		const out = await format(
			"$SQLSnippets:=1;\n" +
				"(* getSQLSnippet *)\n" +
				'getSQLSnippet::unk="x";\n' +
				"getSQLSnippet[x_]:=x",
		);

		expect(out).toBe(
			"$SQLSnippets := 1;\n\n" +
				"(* getSQLSnippet *)\n" +
				'getSQLSnippet::unk = "x";\n' +
				"getSQLSnippet[x_] := x",
		);
	});

	it("preserves trailing, leading, and prefix comment positions", async () => {
		const out = await format(
			"a=1; (* trailing a *)\n" +
				"(* leading b *)\n" +
				"b=2;\n" +
				"(* prefix c *) c=3",
		);

		expect(out).toBe(
			"a = 1; (* trailing a *)\n\n" +
				"(* leading b *)\n" +
				"b = 2;\n\n" +
				"(* prefix c *) c = 3",
		);
	});
});

import { describe, it, expect } from "vitest";
import { WolframParser } from "../../src/parser/index.js";

describe("WolframParser", () => {
	it("returns a CodeParser-shaped CST for valid input", async () => {
		const cst = await new WolframParser().getCST("f[x]", { tabWidth: 2 });
		expect(cst.type).toBe("ContainerNode");
		expect(cst.children[0].type).toBe("CallNode");
	});
	it("returns an error-bearing CST for unparseable input", async () => {
		const cst = await new WolframParser().getCST("f[", { tabWidth: 2 });
		expect(JSON.stringify(cst)).toMatch(/Unknown|SyntaxErrorNode/);
	});
});

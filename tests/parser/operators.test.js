import { describe, it, expect } from "vitest";
import { INFIX_OPS, BINARY_OPS, PREFIX_OPS, POSTFIX_OPS, opName } from "../../src/parser/operators.js";

describe("operator tables", () => {
	it("maps the common operators seen in fixtures", () => {
		expect(INFIX_OPS[","]).toBe("Comma");
		expect(INFIX_OPS["+"]).toBe("Plus");
		expect(INFIX_OPS["*"]).toBe("Times");
		expect(INFIX_OPS[";"]).toBe("CompoundExpression");
		expect(BINARY_OPS["="]).toBe("Set");
		expect(PREFIX_OPS["-"]).toBe("Minus");
		expect(POSTFIX_OPS["&"]).toBe("Function");
	});
	it("opName throws on an unmapped operator", () => {
		expect(() => opName(INFIX_OPS, "@@@@")).toThrow(/unmapped/i);
	});
});

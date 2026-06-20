import { describe, expect, it } from "vitest";
import {
	normalizeWolframOptions,
	options,
	wolframOptions,
} from "../src/options.js";

describe("Wolfram option normalization", () => {
	it("maps nested wolfram options to the formatter's internal option names", () => {
		expect(
			normalizeWolframOptions({
				wolfram: {
					spaceAfterComma: false,
					trailingNewline: true,
				},
			}),
		).toMatchObject({
			wolframSpaceAfterComma: false,
			wolframTrailingNewline: true,
		});
	});

	it("lets nested options override legacy flat options", () => {
		expect(
			normalizeWolframOptions({
				wolframSpaceAfterComma: true,
				wolfram: { spaceAfterComma: false },
			}).wolframSpaceAfterComma,
		).toBe(false);
	});

	it("keeps legacy flat options available but deprecated", () => {
		for (const [name, definition] of Object.entries(wolframOptions)) {
			expect(options[definition.legacyName].deprecated).toBe(
				`Use wolfram.${name} instead.`,
			);
		}
	});
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { wolframOptions } from "../../src/options.js";

const schema = JSON.parse(
	readFileSync(
		path.resolve("vscode-extension/schemas/prettierrc.schema.json"),
		"utf8",
	),
);
const extensionPackage = JSON.parse(
	readFileSync(path.resolve("vscode-extension/package.json"), "utf8"),
);

const schemaTypeForOptionType = {
	boolean: "boolean",
	int: "integer",
	path: "string",
	string: "string",
};

describe("VS Code .prettierrc schema", () => {
	it("is contributed for JSON Prettier config files", () => {
		const validation = extensionPackage.contributes.jsonValidation.find(
			(entry) => entry.url === "./schemas/prettierrc.schema.json",
		);

		expect(validation).toBeTruthy();
		expect(validation.fileMatch).toEqual(
			expect.arrayContaining([
				".prettierrc",
				".prettierrc.json",
				".prettierrc.json5",
			]),
		);
	});

	it("documents every Wolfram Prettier option", () => {
		expect(schema.properties.wolfram).toMatchObject({
			type: "object",
			default: {},
		});

		for (const [name, option] of Object.entries(wolframOptions)) {
			expect(schema.properties.wolfram.properties[name]).toMatchObject({
				type: schemaTypeForOptionType[option.type],
			});
			if (option.default !== undefined) {
				expect(schema.properties.wolfram.properties[name].default).toBe(
					option.default,
				);
			} else {
				expect(
					schema.properties.wolfram.properties[name],
				).not.toHaveProperty("default");
			}
			expect(
				schema.properties.wolfram.properties[name]
					.markdownDescription,
			).toBeTruthy();
			expect(schema.properties[option.legacyName]).toBeUndefined();
		}
	});

	it("provides value completions for top-level spacing mode", () => {
		expect(
			schema.properties.wolfram.properties.topLevelSpacingMode.enum,
		).toEqual(["declarations", "all", "none"]);
	});
});

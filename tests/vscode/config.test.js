import { afterEach, describe, expect, it } from "vitest";
import prettier from "prettier";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

const {
	mergeConfiguredPlugins,
	normalizeResolvedConfig,
	resolveProjectConfig,
} = await import("../../vscode-extension/src/config.js");

describe("VS Code config helpers", () => {
	it("preserves Prettier core width and indent settings without Wolfram aliases", () => {
		expect(
			normalizeResolvedConfig({
				printWidth: 40,
				tabWidth: 6,
			}),
		).toMatchObject({
			printWidth: 40,
			tabWidth: 6,
		});
	});

	it("preserves configured plugins and appends the Wolfram plugin once", () => {
		const configuredPlugin = "/tmp/configured-plugin.js";
		const wolframPlugin = "/tmp/wolfram-plugin.js";

		expect(
			mergeConfiguredPlugins(
				{
					plugins: [configuredPlugin, wolframPlugin],
				},
				wolframPlugin,
			),
		).toEqual([configuredPlugin, wolframPlugin]);
	});

	it("replaces configured Wolfram plugin package names with the resolved plugin path", () => {
		const configuredPlugin = "/tmp/configured-plugin.js";
		const wolframPlugin = "/tmp/wolfram-plugin.js";

		expect(
			mergeConfiguredPlugins(
				{
					plugins: [
						"prettier-plugin-wolfram",
						configuredPlugin,
						"prettier-plugin-wolfram",
					],
				},
				wolframPlugin,
			),
		).toEqual([configuredPlugin, wolframPlugin]);
	});

	describe("resolveProjectConfig", () => {
		let tempDir = "";

		afterEach(() => {
			if (tempDir) rmSync(tempDir, { recursive: true, force: true });
			tempDir = "";
		});

		it("bypasses Prettier config cache so .prettierrc edits are picked up immediately", async () => {
			tempDir = mkdtempSync(
				path.join(os.tmpdir(), "prettier-wl-config-"),
			);
			const filePath = path.join(tempDir, "test.wl");
			const configPath = path.join(tempDir, ".prettierrc");

			writeFileSync(filePath, "foo[longArgumentOne, longArgumentTwo]\n");
			writeFileSync(
				configPath,
				JSON.stringify({ useTabs: false, tabWidth: 2 }),
			);

			const first = await resolveProjectConfig(prettier, filePath);
			expect(first).toMatchObject({ useTabs: false, tabWidth: 2 });

			writeFileSync(
				configPath,
				JSON.stringify({ useTabs: true, tabWidth: 7 }),
			);

			const second = await resolveProjectConfig(prettier, filePath);
			expect(second).toMatchObject({ useTabs: true, tabWidth: 7 });
		});

		it("preserves nested Wolfram formatter options from .prettierrc", async () => {
			tempDir = mkdtempSync(
				path.join(os.tmpdir(), "prettier-wl-config-"),
			);
			const filePath = path.join(tempDir, "test.wl");
			const configPath = path.join(tempDir, ".prettierrc");

			writeFileSync(filePath, "If[x > 0, x, -x]\n");
			writeFileSync(
				configPath,
				JSON.stringify({
					wolfram: {
						conditionFirstFunctions: "",
						spaceAfterComma: false,
					},
				}),
			);

			await expect(
				resolveProjectConfig(prettier, filePath),
			).resolves.toMatchObject({
				wolfram: {
					conditionFirstFunctions: "",
					spaceAfterComma: false,
				},
			});
		});

		it("returns an empty config for a pathless (unsaved) document without probing the filesystem", async () => {
			const prettierStub = {
				resolveConfig() {
					throw new Error("resolveConfig should not be called");
				},
			};

			await expect(
				resolveProjectConfig(prettierStub, null),
			).resolves.toEqual({});
		});
	});
});

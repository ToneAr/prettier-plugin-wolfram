import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";

function resolveDirectDependency(packageName, workspaceFolder) {
	const packageJsonPath = path.join(
		workspaceFolder,
		"node_modules",
		packageName,
		"package.json",
	);
	if (!existsSync(packageJsonPath)) return null;

	try {
		const pkg = JSON.parse(
			require("fs").readFileSync(packageJsonPath, "utf8"),
		);
		const entry = pkg.main ?? "index.js";
		const resolved = path.join(path.dirname(packageJsonPath), entry);
		return existsSync(resolved) ? resolved : null;
	} catch {
		return null;
	}
}

describe("direct dependency resolution", () => {
	const workspaceRoot = "/tmp/prettier-wl-resolution-test";

	it("only resolves dependencies directly under the workspace node_modules", () => {
		rmSync(workspaceRoot, { recursive: true, force: true });
		mkdirSync(
			path.join(
				workspaceRoot,
				"node_modules",
				"@wrel",
				"prettier-plugin-wolfram",
				"src",
			),
			{ recursive: true },
		);
		writeFileSync(
			path.join(
				workspaceRoot,
				"node_modules",
				"@wrel",
				"prettier-plugin-wolfram",
				"package.json",
			),
			JSON.stringify({
				name: "@wrel/prettier-plugin-wolfram",
				main: "src/index.js",
			}),
		);
		writeFileSync(
			path.join(
				workspaceRoot,
				"node_modules",
				"@wrel",
				"prettier-plugin-wolfram",
				"src",
				"index.js",
			),
			"export default {}\n",
		);

		expect(
			resolveDirectDependency(
				"@wrel/prettier-plugin-wolfram",
				workspaceRoot,
			),
		).toBe(
			path.join(
				workspaceRoot,
				"node_modules",
				"@wrel",
				"prettier-plugin-wolfram",
				"src",
				"index.js",
			),
		);

		rmSync(workspaceRoot, { recursive: true, force: true });
		mkdirSync(workspaceRoot, { recursive: true });
		expect(
			resolveDirectDependency(
				"@wrel/prettier-plugin-wolfram",
				workspaceRoot,
			),
		).toBeNull();
	});
});

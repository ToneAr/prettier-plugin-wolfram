import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const rootPackage = JSON.parse(
	readFileSync(path.resolve("package.json"), "utf8"),
);
const extensionPackage = JSON.parse(
	readFileSync(path.resolve("vscode-extension/package.json"), "utf8"),
);

function packageDependencySpecs(packageJson) {
	return Object.values({
		...(packageJson.dependencies ?? {}),
		...(packageJson.peerDependencies ?? {}),
		...(packageJson.optionalDependencies ?? {}),
	});
}

function isPortableDependencySpec(spec) {
	return (
		typeof spec === "string" &&
		!spec.startsWith("file:") &&
		!path.isAbsolute(spec)
	);
}

describe("VS Code package metadata", () => {
	it("keeps the extension and bundled plugin versions in sync", () => {
		expect(extensionPackage.version).toBe(rootPackage.version);
		expect(extensionPackage.dependencies[rootPackage.name]).toBe(
			`^${rootPackage.version}`,
		);
	});

	it("uses portable dependency specs in published package metadata", () => {
		expect(
			packageDependencySpecs(rootPackage).every(isPortableDependencySpec),
		).toBe(true);
		expect(
			packageDependencySpecs(extensionPackage).every(
				isPortableDependencySpec,
			),
		).toBe(true);
	});
});

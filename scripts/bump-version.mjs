import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const packagePaths = [
	resolve(repoRoot, "package.json"),
	resolve(repoRoot, "vscode-extension", "package.json"),
];
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)$/;
const bumpTypes = new Set(["major", "minor", "patch"]);

function usage() {
	return [
		"Usage: npm run bump:version -- [major|minor|patch|x.y.z]",
		"",
		"Defaults to patch when no argument is provided.",
	].join("\n");
}

function parseVersion(version) {
	const match = versionPattern.exec(String(version));
	if (!match) {
		throw new Error(`Expected a version like x.y.z, got ${version}`);
	}

	return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function formatVersion(parts) {
	return parts.join(".");
}

function incrementVersion(version, bumpType) {
	const [major, minor, patch] = parseVersion(version);

	if (bumpType === "major") return formatVersion([major + 1, 0, 0]);
	if (bumpType === "minor") return formatVersion([major, minor + 1, 0]);
	return formatVersion([major, minor, patch + 1]);
}

function readPackage(packagePath) {
	return JSON.parse(readFileSync(packagePath, "utf8"));
}

function writePackage(packagePath, packageJson) {
	writeFileSync(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`);
}

const args = process.argv.slice(2);
if (args.length > 1 || args.includes("--help") || args.includes("-h")) {
	console.log(usage());
	process.exit(args.length > 1 ? 1 : 0);
}

const packages = packagePaths.map((packagePath) => ({
	path: packagePath,
	json: readPackage(packagePath),
}));
const currentVersion = packages[0].json.version;
const requested = args[0] ?? "patch";
const nextVersion = bumpTypes.has(requested)
	? incrementVersion(currentVersion, requested)
	: formatVersion(parseVersion(requested));

for (const packageInfo of packages) {
	packageInfo.json.version = nextVersion;
	writePackage(packageInfo.path, packageInfo.json);
}

console.log(`${currentVersion} -> ${nextVersion}`);

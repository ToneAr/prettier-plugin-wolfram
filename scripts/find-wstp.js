// scripts/find-wstp.js
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const arg = process.argv[2]; // '--include' or '--lib'

function findWolframBase() {
	const envPath = process.env.WOLFRAM_ENGINE_PATH;
	if (envPath && existsSync(envPath)) return envPath;

	const candidates =
		{
			linux: [
				"/usr/local/Wolfram/Mathematica",
				"/usr/local/Wolfram/WolframEngine",
			],
			darwin: [
				"/Applications/Mathematica.app/Contents",
				"/Applications/Wolfram Engine.app/Contents",
			],
			win32: [
				"C:\\Program Files\\Wolfram Research\\Mathematica",
				"C:\\Program Files\\Wolfram Research\\Wolfram Engine",
			],
		}[process.platform] ?? [];

	for (const base of candidates) {
		if (!existsSync(base)) continue;
		// Handle versioned subdirs like Mathematica/13.3
		try {
			const entries = readdirSync(base);
			const versioned = entries.find((e) => /^\d+\.\d+/.test(e));
			if (versioned) return join(base, versioned);
		} catch {}
		return base;
	}
	throw new Error(
		"Wolfram Engine not found. Set WOLFRAM_ENGINE_PATH environment variable.",
	);
}

function getWstpDir(base) {
	const sysId = {
		linux: "Linux-x86-64",
		darwin: "MacOSX-x86-64",
		win32: "Windows-x86-64",
	}[process.platform];
	return join(
		base,
		"SystemFiles",
		"Links",
		"WSTP",
		"DeveloperKit",
		sysId,
		"CompilerAdditions",
	);
}

const base = findWolframBase();
const dir = getWstpDir(base);

if (arg === "--include") {
	process.stdout.write(dir);
} else if (arg === "--lib") {
	const libFlag = {
		linux: `-L${dir} -lWSTP64i4`,
		darwin: `-L${dir} -lWSTPi4`,
		win32: `${join(dir, "wstp64i4.lib")}`,
	}[process.platform];
	process.stdout.write(libFlag);
}

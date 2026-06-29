#!/usr/bin/env node
// bin/prettier-wolfram.js
// Usage: prettier-wolfram lint [options] <glob...>

import { readFileSync, statSync } from "fs";
import { globSync } from "fs";
import { extname } from "path";
import { WolframParser } from "../src/parser/index.js";
import { runRules } from "../src/rules/index.js";
import { buildOffsetTable, addOffsets } from "../src/utils/offsets.js";

const WOLFRAM_EXTENSIONS = new Set([
	".wl",
	".wls",
	".wlt",
	".mt",
	".m",
	".vsnb",
	".nb",
]);

const [, , command, ...args] = process.argv;

if (command !== "lint") {
	console.error("Usage: prettier-wolfram lint <glob...>");
	process.exit(1);
}

if (args.length === 0) {
	console.error("Error: provide at least one glob pattern");
	process.exit(1);
}

let lintRules = {};
try {
	lintRules = JSON.parse(process.env.WOLFRAM_LINT_RULES ?? "{}");
} catch {}

const parser = new WolframParser();
let totalDiagnostics = 0;

for (const pattern of args) {
	const files = globSync(pattern, { absolute: true });
	for (const file of files) {
		try {
			if (
				!statSync(file).isFile() ||
				!WOLFRAM_EXTENSIONS.has(extname(file).toLowerCase())
			) {
				continue;
			}
			const source = readFileSync(file, "utf8");
			const cst = await parser.getCST(source);
			const table = buildOffsetTable(source);
			addOffsets(cst, table);
			const diagnostics = await runRules(cst, lintRules);

			for (const d of diagnostics) {
				const line = d.node?.source?.[0]?.[0] ?? "?";
				const col = d.node?.source?.[0]?.[1] ?? "?";
				console.log(
					`${file}:${line}:${col}: ${d.level.toUpperCase()} [${d.rule}] ${d.message}`,
				);
				totalDiagnostics++;
			}
		} catch (err) {
			console.error(`${file}: ERROR — ${err.message}`);
		}
	}
}

process.exit(totalDiagnostics > 0 ? 1 : 0);

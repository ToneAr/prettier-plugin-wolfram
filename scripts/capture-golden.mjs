// DEV-ONLY. Regenerates the golden corpus from a real Wolfram kernel.
// Not shipped (excluded from package.json "files"). Run: node scripts/capture-golden.mjs
import { execFileSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { tmpdir } from "os";
import prettier from "prettier";
import * as plugin from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../tests/golden");
const initM = resolve(here, "../src/bridge/init.m");

// Build a temporary WL script that uses the same cstToJSON serializer as init.m
function makeCaptureScript(source) {
	// Escape the source for embedding in a WL string literal
	const escaped = source
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');
	return `Get["${initM.replace(/\\/g, "\\\\")}"];
src = "${escaped}";
result = getCSTJSON[src, 2];
WriteString[$Output, result];
`;
}

function captureCst(source) {
	// Write the WL script to a temp file and invoke wolframscript -file
	const tmp = join(tmpdir(), `capture-golden-${process.pid}.wls`);
	try {
		writeFileSync(tmp, makeCaptureScript(source), "utf8");
		const output = execFileSync("wolframscript", ["-file", tmp], {
			encoding: "utf8",
			timeout: 120000,
		});
		// wolframscript may emit warning messages before the JSON.
		// Find the start of the JSON object: look for the pattern that begins
		// the ContainerNode JSON (a '{' on its own line or followed by a tab
		// and "type"). Warning lines may also contain '{', so we search for the
		// last occurrence of the pattern '{\n\t"type"' which uniquely identifies
		// the start of our serialized JSON.
		const jsonMarker = '{\n\t"type"';
		const markerIdx = output.lastIndexOf(jsonMarker);
		if (markerIdx === -1) {
			throw new Error(`No JSON object found in wolframscript output:\n${output.slice(0, 500)}`);
		}
		return output.slice(markerIdx).trim();
	} finally {
		try { unlinkSync(tmp); } catch {}
	}
}

mkdirSync(dir, { recursive: true });

for (const file of readdirSync(dir).filter(
	(f) => f.endsWith(".wl") && !f.endsWith(".formatted.wl"),
)) {
	const name = file.replace(/\.wl$/, "");
	const source = readFileSync(join(dir, file), "utf8");

	console.log(`Capturing CST for ${name}...`);
	const cstJson = captureCst(source);

	// Validate it parses as JSON before saving
	let parsed;
	try {
		parsed = JSON.parse(cstJson);
	} catch (err) {
		console.error(`ERROR: CST for ${name} is not valid JSON:`);
		console.error(cstJson.slice(0, 500));
		process.exit(1);
	}

	writeFileSync(
		join(dir, `${name}.cst.json`),
		JSON.stringify(parsed, null, "\t"),
	);

	console.log(`Capturing formatted output for ${name}...`);
	// Formatted output = current translator on that CST (pure JS, no kernel).
	const formatted = await prettier.format(source, {
		parser: "wolfram",
		plugins: [plugin],
		filepath: join(dir, file),
	});
	writeFileSync(join(dir, `${name}.formatted.wl`), formatted);

	console.log(`captured ${name}`);
}

console.log("Done.");

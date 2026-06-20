// Regenerates the committed wasm from the grammar submodule.
// Uses tree-sitter-cli; falls back to Docker-based emscripten when emcc is absent.
// Note: the grammar submodule ships a pre-generated src/parser.c, so we skip
// `tree-sitter generate` (grammar.js uses implicit globals incompatible with
// Node.js 24 ESM strict mode). We go straight to `tree-sitter build --wasm`.
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { copyFileSync, existsSync, chmodSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const grammarDir = resolve(here, "../grammar");
const outWasm = resolve(here, "../src/parser/tree-sitter-wolfram.wasm");
const cli = resolve(here, "../node_modules/.bin/tree-sitter");

const run = (args, cwd) =>
	execFileSync(cli, args, { cwd, stdio: "inherit" });

console.warn(
	"[build-grammar] NOTE: tree-sitter generate skipped (grammar.js uses implicit globals incompatible with Node 24). " +
	"Using pre-generated src/parser.c from submodule. " +
	"If grammar.js changed upstream, regenerate with an older Node or fix grammar.js first."
);
run(["build", "--wasm", "."], grammarDir);
// tree-sitter writes tree-sitter-wolfram.wasm into the grammar dir.
const builtWasm = resolve(grammarDir, "tree-sitter-wolfram.wasm");
if (!existsSync(builtWasm)) {
	throw new Error(
		"Expected grammar/tree-sitter-wolfram.wasm after build. Did 'tree-sitter build --wasm' succeed?"
	);
}
copyFileSync(builtWasm, outWasm);
chmodSync(outWasm, 0o644);
console.log("Wrote", outWasm);

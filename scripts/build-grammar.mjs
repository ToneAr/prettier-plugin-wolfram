// Regenerates the committed wasm from the grammar submodule.
// Uses tree-sitter-cli; falls back to Docker-based emscripten when emcc is absent.
// Note: the grammar submodule ships a pre-generated src/parser.c, so we skip
// `tree-sitter generate` (grammar.js uses implicit globals incompatible with
// Node.js 24 ESM strict mode). We go straight to `tree-sitter build --wasm`.
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { copyFileSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const grammarDir = resolve(here, "../grammar");
const outWasm = resolve(here, "../src/parser/tree-sitter-wolfram.wasm");
const cli = resolve(here, "../node_modules/.bin/tree-sitter");

const run = (args, cwd) =>
	execFileSync(cli, args, { cwd, stdio: "inherit" });

run(["build", "--wasm", "."], grammarDir);
// tree-sitter writes tree-sitter-wolfram.wasm into the grammar dir.
copyFileSync(resolve(grammarDir, "tree-sitter-wolfram.wasm"), outWasm);
console.log("Wrote", outWasm);

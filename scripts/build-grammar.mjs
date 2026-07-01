// Regenerates the committed parser artifacts and wasm from the grammar submodule.
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

run(["generate"], grammarDir);
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
